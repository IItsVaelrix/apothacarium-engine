/**
 * PixelBrain QA — Discovery Engine
 *
 * Builds a symbol graph across the codebase:
 *   - exports / imports
 *   - call sites
 *   - runtime registrations (extension registry, hooks, etc.)
 *   - test references
 *   - config references
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

// ─── File Discovery ──────────────────────────────────────────────────────────

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage',
  '.tmp', 'tmp', 'archive', 'ARCHIVE', 'ARCHIVE REFERENCE DOCS',
  'tests/visual', '.qwen', '.codex', '.claude',
]);

function* walkDir(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      yield* walkDir(full);
    } else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
      yield full;
    }
  }
}

function discoverSourceFiles(rootDir) {
  return [...walkDir(rootDir)];
}

// ─── Source Parsing ──────────────────────────────────────────────────────────

const IMPORT_FROM_RE = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
const IMPORT_SIDE_EFFECT_RE = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
const REQUIRE_RE = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
const DYNAMIC_IMPORT_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
const EXPORT_FROM_RE = /export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
const EXPORT_ALL_FROM_RE = /export\s+\*\s+from\s+['"]([^'"]+)['"]/g;
const EXPORT_NAMED_RE = /export\s+(async\s+)?(function|class|const|let|var|interface|type|enum)\s+(\w+)/g;
const EXPORT_DEFAULT_RE = /export\s+default\s+(?:(?:async\s+)?(?:function|class)\s+(\w+)|(\w+))/g;
const EXPORT_CONST_OBJ_RE = /export\s+(?:const|let|var)\s+(\w+)\s*=\s*(?:\{|Object\.freeze)/g;
const CALL_SITE_RE = /\b([A-Za-z_$][\w$]*)\s*\(/g;
const JSX_COMPONENT_RE = /<(?!\/)([A-Z][A-Za-z0-9_]*)\b/g;
const MEMBER_CALL_RE = /([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g;
const REGISTRY_REGISTER_RE = /(?:register|add|attach|subscribe|define|use|plugin)\s*\(\s*['"]?(\w+)['"]?\s*[,)]/g;

function stripComments(code) {
  return code
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

function resolveImportPath(importerPath, importSpecifier, rootDir) {
  if (importSpecifier.startsWith('.') || importSpecifier.startsWith('/')) {
    let resolved = importSpecifier.startsWith('.')
      ? join(importerPath, '..', importSpecifier)
      : join(rootDir, importSpecifier);
    for (const ext of ['.js', '.ts', '.jsx', '.tsx', '.mjs', '/index.js', '/index.ts']) {
      if (existsSync(resolved + ext) || (ext.startsWith('/') && existsSync(resolved + ext))) {
        return relative(rootDir, resolved + ext).replace(/\\/g, '/');
      }
    }
    // Maybe already has extension
    if (existsSync(resolved)) return relative(rootDir, resolved).replace(/\\/g, '/');
    return relative(rootDir, resolved).replace(/\\/g, '/');
  }
  // bare specifier (npm package)
  return importSpecifier;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countIdentifierOccurrences(code, identifier) {
  const matches = code.match(new RegExp(`\\b${escapeRegex(identifier)}\\b`, 'g'));
  return matches ? matches.length : 0;
}

function createSymbolRecord(name, type, extra = {}) {
  return {
    name,
    type,
    exported: true,
    calls: [],
    calledBy: [],
    importedBy: [],
    registeredIn: [],
    testedIn: [],
    configRefs: [],
    localRefs: [],
    referencedBy: [],
    ...extra,
  };
}

function normalizeSymbolType(keyword) {
  if (keyword === 'const' || keyword === 'let' || keyword === 'var') {
    return 'const';
  }
  return keyword;
}

function parseNamedBindings(rawClause) {
  return String(rawClause || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^type\s+/, '').trim())
    .filter(Boolean)
    .map((part) => {
      const [sourceRaw, localRaw] = part.split(/\s+as\s+/i).map((value) => value.trim());
      const sourceName = sourceRaw;
      const localName = localRaw || sourceRaw;
      return {
        kind: 'named',
        sourceName,
        localName,
      };
    });
}

function parseImportClause(rawClause) {
  let clause = String(rawClause || '').trim().replace(/^type\s+/, '');
  const bindings = [];

  const namedMatch = clause.match(/\{([^}]*)\}/);
  if (namedMatch) {
    bindings.push(...parseNamedBindings(namedMatch[1]));
    clause = clause.replace(namedMatch[0], ' ').trim();
  }

  const namespaceMatch = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
  if (namespaceMatch) {
    bindings.push({
      kind: 'namespace',
      sourceName: '*',
      localName: namespaceMatch[1],
    });
    clause = clause.replace(namespaceMatch[0], ' ').trim();
  }

  const defaultMatch = clause
    .replace(/,/g, ' ')
    .trim()
    .match(/^([A-Za-z_$][\w$]*)$/);
  if (defaultMatch) {
    bindings.unshift({
      kind: 'default',
      sourceName: 'default',
      localName: defaultMatch[1],
    });
  }

  return bindings;
}

function extractSymbols(filePath, code, rootDir) {
  const stripped = stripComments(code);
  const relPath = relative(rootDir, filePath).replace(/\\/g, '/');
  const symbols = {};
  const imports = [];
  const callSites = new Set();
  const memberCalls = [];
  const registrations = [];

  // Imports
  let m;
  IMPORT_FROM_RE.lastIndex = 0;
  while ((m = IMPORT_FROM_RE.exec(stripped)) !== null) {
    const clause = m[1];
    const specifier = m[2];
    const resolved = resolveImportPath(filePath, specifier, rootDir);
    imports.push({
      specifier,
      resolved,
      bindings: parseImportClause(clause),
      mode: 'import',
    });
  }

  IMPORT_SIDE_EFFECT_RE.lastIndex = 0;
  while ((m = IMPORT_SIDE_EFFECT_RE.exec(stripped)) !== null) {
    const specifier = m[1];
    const resolved = resolveImportPath(filePath, specifier, rootDir);
    imports.push({
      specifier,
      resolved,
      bindings: [],
      mode: 'side-effect',
    });
  }

  REQUIRE_RE.lastIndex = 0;
  while ((m = REQUIRE_RE.exec(stripped)) !== null) {
    const specifier = m[1];
    const resolved = resolveImportPath(filePath, specifier, rootDir);
    imports.push({
      specifier,
      resolved,
      bindings: [],
      mode: 'require',
    });
  }

  DYNAMIC_IMPORT_RE.lastIndex = 0;
  while ((m = DYNAMIC_IMPORT_RE.exec(stripped)) !== null) {
    const specifier = m[1];
    const resolved = resolveImportPath(filePath, specifier, rootDir);
    imports.push({
      specifier,
      resolved,
      bindings: [],
      mode: 'dynamic',
    });
  }

  EXPORT_FROM_RE.lastIndex = 0;
  while ((m = EXPORT_FROM_RE.exec(stripped)) !== null) {
    const bindings = parseNamedBindings(m[1]).map((binding) => ({
      ...binding,
      kind: 're-export',
    }));
    const specifier = m[2];
    const resolved = resolveImportPath(filePath, specifier, rootDir);
    imports.push({
      specifier,
      resolved,
      bindings,
      mode: 're-export',
    });
  }

  EXPORT_ALL_FROM_RE.lastIndex = 0;
  while ((m = EXPORT_ALL_FROM_RE.exec(stripped)) !== null) {
    const specifier = m[1];
    const resolved = resolveImportPath(filePath, specifier, rootDir);
    imports.push({
      specifier,
      resolved,
      bindings: [{
        kind: 'namespace',
        sourceName: '*',
        localName: '*',
      }],
      mode: 'export-all',
    });
  }

  imports.forEach((entry) => {
    entry.bindings.forEach((binding) => {
      if (binding.localName === '*') {
        binding.referencedLocally = false;
        return;
      }
      binding.referencedLocally = countIdentifierOccurrences(stripped, binding.localName) > 1;
    });
  });

  // Exported functions
  EXPORT_NAMED_RE.lastIndex = 0;
  while ((m = EXPORT_NAMED_RE.exec(stripped)) !== null) {
    const type = normalizeSymbolType(m[2]);
    const name = m[3];
    symbols[name] = createSymbolRecord(name, type);
  }

  // Export default
  EXPORT_DEFAULT_RE.lastIndex = 0;
  while ((m = EXPORT_DEFAULT_RE.exec(stripped)) !== null) {
    const name = m[1] || m[2] || 'default';
    symbols[name] = createSymbolRecord(name, 'function', { defaultExport: true });
  }

  // Const/let/var exports that are objects or frozen (modules, configs, APIs)
  EXPORT_CONST_OBJ_RE.lastIndex = 0;
  while ((m = EXPORT_CONST_OBJ_RE.exec(stripped)) !== null) {
    if (!symbols[m[1]]) {
      symbols[m[1]] = createSymbolRecord(m[1], 'const');
    }
  }

  // Call sites (all function calls in the file)
  CALL_SITE_RE.lastIndex = 0;
  while ((m = CALL_SITE_RE.exec(stripped)) !== null) {
    const name = m[1];
    if (name && !isBuiltin(name)) {
      callSites.add(name);
    }
  }

  // JSX component usage is an execution path for React components even though
  // it does not appear as a direct function call in source text.
  JSX_COMPONENT_RE.lastIndex = 0;
  while ((m = JSX_COMPONENT_RE.exec(stripped)) !== null) {
    const name = m[1];
    if (name && !isBuiltin(name)) {
      callSites.add(name);
    }
  }

  MEMBER_CALL_RE.lastIndex = 0;
  while ((m = MEMBER_CALL_RE.exec(stripped)) !== null) {
    const objectName = m[1];
    const memberName = m[2];
    if (objectName && memberName && !isBuiltin(objectName) && !isBuiltin(memberName)) {
      memberCalls.push({ objectName, memberName });
    }
  }

  // Registry registrations
  REGISTRY_REGISTER_RE.lastIndex = 0;
  while ((m = REGISTRY_REGISTER_RE.exec(stripped)) !== null) {
    registrations.push(m[1]);
  }

  Object.values(symbols).forEach((symbol) => {
    if (countIdentifierOccurrences(stripped, symbol.name) > 1) {
      symbol.localRefs.push(relPath);
    }
  });

  return { relPath, symbols, imports, callSites: [...callSites], memberCalls, registrations };
}

const BUILTINS = new Set([
  'console', 'require', 'process', 'Buffer', 'globalThis',
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Map', 'Set',
  'Promise', 'Error', 'TypeError', 'SyntaxError', 'Math', 'Date',
  'JSON', 'parseInt', 'parseFloat', 'setTimeout', 'clearTimeout',
  'setInterval', 'clearInterval', 'fetch', 'AbortController',
  'describe', 'it', 'test', 'expect', 'beforeEach', 'afterEach',
  'beforeAll', 'afterAll', 'vi', 'jest',
  'log', 'warn', 'error', 'info', 'debug', 'trace',
  'push', 'pop', 'shift', 'unshift', 'map', 'filter', 'reduce',
  'forEach', 'find', 'findIndex', 'some', 'every', 'includes',
  'slice', 'splice', 'join', 'split', 'replace', 'match', 'test',
  'toString', 'valueOf', 'hasOwnProperty', 'keys', 'values', 'entries',
  'freeze', 'seal', 'assign', 'create', 'defineProperty',
  'then', 'catch', 'finally', 'resolve', 'reject',
  'useEffect', 'useState', 'useMemo', 'useCallback', 'useRef', 'useContext',
  'useReducer', 'useLayoutEffect', 'useImperativeHandle', 'useDebugValue',
  'createElement', 'Fragment', 'createContext', 'forwardRef', 'memo',
  'defineProperty', 'getOwnPropertyDescriptor',
  'addEventListener', 'removeEventListener',
  'getElementById', 'querySelector', 'querySelectorAll',
  'preventDefault', 'stopPropagation',
  'if', 'for', 'while', 'switch', 'catch',
]);

function isBuiltin(name) {
  return BUILTINS.has(name) || /^[a-z]$/.test(name);
}

// ─── Graph Assembly ──────────────────────────────────────────────────────────

export function buildSymbolGraph(rootDir) {
  const files = discoverSourceFiles(rootDir);
  const fileData = new Map(); // relPath → { symbols, imports, callSites, memberCalls, registrations }
  const allExports = new Map(); // "relPath::symbolName" → symbol info
  const exportsByFile = new Map(); // relPath → symbol info[]

  // Pass 1: Extract symbols from every file
  for (const filePath of files) {
    try {
      const code = readFileSync(filePath, 'utf-8');
      const { relPath, symbols, imports, callSites, memberCalls, registrations } = extractSymbols(filePath, code, rootDir);
      const exportedSymbols = Object.entries(symbols).map(([name, info]) => ({ ...info, file: relPath }));
      fileData.set(relPath, { symbols, imports, callSites, memberCalls, registrations });
      exportsByFile.set(relPath, exportedSymbols);
      for (const [name, info] of Object.entries(symbols)) {
        allExports.set(`${relPath}::${name}`, { ...info, file: relPath });
      }
    } catch {
      // skip unreadable files
    }
  }

  function pushUnique(list, value) {
    if (!list.includes(value)) {
      list.push(value);
    }
  }

  function getModuleSymbols(relPath) {
    return exportsByFile.get(relPath) || [];
  }

  function resolveBindingTargets(relPath, binding) {
    const moduleSymbols = getModuleSymbols(relPath);
    if (binding.kind === 'default') {
      return moduleSymbols.filter((symbol) => symbol.defaultExport);
    }
    if (binding.sourceName === '*') {
      return moduleSymbols;
    }
    return moduleSymbols.filter((symbol) => symbol.name === binding.sourceName);
  }

  // Pass 2: Wire up cross-references
  for (const [relPath, data] of fileData) {
    const callSiteSet = new Set(data.callSites);
    const memberCalls = Array.isArray(data.memberCalls) ? data.memberCalls : [];

    // For each import, mark the specifically imported symbol as "importedBy" this file.
    for (const imp of data.imports) {
      if (!imp.resolved || getModuleSymbols(imp.resolved).length === 0) continue;

      if (imp.bindings.length === 0) {
        const implicitTargets = getModuleSymbols(imp.resolved).filter((symbol) => symbol.defaultExport);
        for (const symbol of implicitTargets) {
          pushUnique(symbol.importedBy, relPath);
          pushUnique(allExports.get(`${symbol.file}::${symbol.name}`).importedBy, relPath);
        }
        continue;
      }

      for (const binding of imp.bindings) {
        const targets = resolveBindingTargets(imp.resolved, binding);
        for (const symbol of targets) {
          pushUnique(symbol.importedBy, relPath);
          pushUnique(allExports.get(`${symbol.file}::${symbol.name}`).importedBy, relPath);

          if (binding.kind !== 'namespace' && callSiteSet.has(binding.localName)) {
            pushUnique(symbol.calledBy, relPath);
            pushUnique(allExports.get(`${symbol.file}::${symbol.name}`).calledBy, relPath);
          } else if (binding.kind !== 'namespace' && binding.referencedLocally) {
            pushUnique(symbol.referencedBy, relPath);
            pushUnique(allExports.get(`${symbol.file}::${symbol.name}`).referencedBy, relPath);
          }
        }
      }

      for (const memberCall of memberCalls) {
        const namespaceBindings = imp.bindings.filter((binding) =>
          binding.kind === 'namespace' && binding.localName === memberCall.objectName
        );

        for (const binding of namespaceBindings) {
          const targets = resolveBindingTargets(imp.resolved, {
            ...binding,
            sourceName: memberCall.memberName,
          });
          for (const symbol of targets) {
            pushUnique(symbol.calledBy, relPath);
            pushUnique(allExports.get(`${symbol.file}::${symbol.name}`).calledBy, relPath);
          }
        }
      }
    }

    // For each registration, mark the registered symbol.
    for (const regName of data.registrations) {
      for (const [exportKey, symbol] of allExports) {
        if (symbol.name === regName) {
          pushUnique(symbol.registeredIn, relPath);
        }
      }
    }
  }

  // Pass 3: Find test references
  const testFiles = [...fileData.keys()].filter(p =>
    p.includes('.test.') || p.includes('.spec.') || p.startsWith('tests/')
  );
  for (const testPath of testFiles) {
    const testData = fileData.get(testPath);
    if (!testData) continue;
    const testCallSites = new Set(testData.callSites);
    const memberCalls = Array.isArray(testData.memberCalls) ? testData.memberCalls : [];

    for (const imp of testData.imports) {
      if (!imp.resolved || getModuleSymbols(imp.resolved).length === 0) continue;

      for (const binding of imp.bindings) {
        const targets = resolveBindingTargets(imp.resolved, binding);
          const shouldMark = binding.kind === 'namespace'
            ? false
          : testCallSites.has(binding.localName) || binding.referencedLocally;
        if (!shouldMark) continue;

        for (const symbol of targets) {
          pushUnique(symbol.testedIn, testPath);
          pushUnique(allExports.get(`${symbol.file}::${symbol.name}`).testedIn, testPath);
        }
      }

      for (const memberCall of memberCalls) {
        const namespaceBindings = imp.bindings.filter((binding) =>
          binding.kind === 'namespace' && binding.localName === memberCall.objectName
        );
        for (const binding of namespaceBindings) {
          const targets = resolveBindingTargets(imp.resolved, {
            ...binding,
            sourceName: memberCall.memberName,
          });
          for (const symbol of targets) {
            pushUnique(symbol.testedIn, testPath);
            pushUnique(allExports.get(`${symbol.file}::${symbol.name}`).testedIn, testPath);
          }
        }
      }
    }
  }

  return { allExports, fileData };
}
