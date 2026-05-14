
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const SRC_DIR = path.join(ROOT, 'src');
const CODEX_DIR = path.join(ROOT, 'codex');
const ENTRY_POINTS = [
    path.join(SRC_DIR, 'main.jsx'),
    path.join(CODEX_DIR, 'server/index.js'),
];

const IGNORE_PATTERNS = [
    'node_modules',
    '.git',
    'dist',
    'test-results',
    'tests',
];

function getAllFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        if (IGNORE_PATTERNS.some(p => filePath.includes(p))) return;
        
        if (fs.statSync(filePath).isDirectory()) {
            getAllFiles(filePath, fileList);
        } else if (/\.(js|jsx|ts|tsx)$/.test(file)) {
            fileList.push(filePath);
        }
    });
    return fileList;
}

function resolveImportPath(sourceFile, importPath) {
    if (!importPath.startsWith('.')) return null; // Ignore node_modules for now
    
    const sourceDir = path.dirname(sourceFile);
    let resolved = path.resolve(sourceDir, importPath);
    
    const extensions = ['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];
    for (const ext of extensions) {
        if (fs.existsSync(resolved + ext) && !fs.statSync(resolved + ext).isDirectory()) {
            return resolved + ext;
        }
    }
    return null;
}

function getImports(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const imports = [];
    
    // Static imports (using [\s\S] to match newlines)
    const importRegex = /import\s+[\s\S]*?\s+from\s+['"](.*?)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
        const resolved = resolveImportPath(filePath, match[1]);
        if (resolved) imports.push(resolved);
    }

    // Side-effect imports: import './style.css'
    const sideEffectImportRegex = /import\s+['"](.*?)['"]/g;
    while ((match = sideEffectImportRegex.exec(content)) !== null) {
        if (match[0].includes(' from ')) continue; // Already handled
        const resolved = resolveImportPath(filePath, match[1]);
        if (resolved) imports.push(resolved);
    }

    // Export ... from
    const exportFromRegex = /export\s+[\s\S]*?\s+from\s+['"](.*?)['"]/g;
    while ((match = exportFromRegex.exec(content)) !== null) {
        const resolved = resolveImportPath(filePath, match[1]);
        if (resolved) imports.push(resolved);
    }
    
    // Dynamic imports
    const dynamicImportRegex = /import\(['"](.*?)['"]\)/g;
    while ((match = dynamicImportRegex.exec(content)) !== null) {
        const resolved = resolveImportPath(filePath, match[1]);
        if (resolved) imports.push(resolved);
    }
    
    // Require
    const requireRegex = /require\(['"](.*?)['"]\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
        const resolved = resolveImportPath(filePath, match[1]);
        if (resolved) imports.push(resolved);
    }
    
    return imports;
}

function findDeadFiles() {
    const allFiles = [...getAllFiles(SRC_DIR), ...getAllFiles(CODEX_DIR)];
    const reachable = new Set();
    const queue = [...ENTRY_POINTS];
    
    while (queue.length > 0) {
        const current = queue.shift();
        if (reachable.has(current)) continue;
        
        reachable.add(current);
        const imports = getImports(current);
        imports.forEach(imp => {
            if (!reachable.has(imp)) {
                queue.push(imp);
            }
        });
    }
    
    const deadFiles = allFiles.filter(f => !reachable.has(f));
    return { allFiles, reachable, deadFiles };
}

function findUnusedExports(allFiles) {
    const exportMap = new Map(); // Symbol -> { file, usedCount }
    
    allFiles.forEach(file => {
        const content = fs.readFileSync(file, 'utf8');
        const exportRegex = /export\s+(const|function|class|let|var|type|interface)\s+([a-zA-Z0-9_]+)/g;
        let match;
        while ((match = exportRegex.exec(content)) !== null) {
            const symbol = match[2];
            exportMap.set(`${file}:${symbol}`, { file, symbol, usedCount: 0 });
        }
        
        // Named exports: export { a, b as c }
        const namedExportRegex = /export\s+\{(.*?)\}/g;
        while ((match = namedExportRegex.exec(content)) !== null) {
            const symbols = match[1].split(',').map(s => s.trim().split(/\s+as\s+/).pop());
            symbols.forEach(symbol => {
                if (symbol) exportMap.set(`${file}:${symbol}`, { file, symbol, usedCount: 0 });
            });
        }
    });
    
    // Count usages
    allFiles.forEach(file => {
        const content = fs.readFileSync(file, 'utf8');
        for (const [key, data] of exportMap.entries()) {
            if (data.file === file) continue; // Don't count usage in same file
            
            // Simple check: is the symbol mentioned?
            // This is a bit naive but good for a start. 
            // Better would be checking if it's imported.
            const symbolRegex = new RegExp(`\\b${data.symbol}\\b`, 'g');
            if (symbolRegex.test(content)) {
                data.usedCount++;
            }
        }
    });
    
    const unusedExports = Array.from(exportMap.values()).filter(e => e.usedCount === 0);
    return unusedExports;
}

function main() {
    console.log('Scouring codebase for dead code...');
    const { allFiles, reachable, deadFiles } = findDeadFiles();
    const unusedExports = findUnusedExports(allFiles);
    
    let report = '# Dead Code Report\n\n';
    report += `Generated at: ${new Date().toISOString()}\n\n`;
    
    report += '## Unreachable Files\n';
    report += 'Files in `src/` or `codex/` that are not imported by any entry point or reachable file.\n\n';
    if (deadFiles.length === 0) {
        report += 'No unreachable files found. 🎉\n';
    } else {
        deadFiles.forEach(f => {
            report += `- [ ] ${path.relative(ROOT, f)}\n`;
        });
    }
    
    report += '\n## Potentially Unused Exports\n';
    report += 'Symbols that are exported but not referenced in any other file. (Note: May include false positives for dynamic usage or entry point exports).\n\n';
    if (unusedExports.length === 0) {
        report += 'No unused exports found. 🎉\n';
    } else {
        unusedExports.forEach(e => {
            report += `- [ ] \`${e.symbol}\` in \`${path.relative(ROOT, e.file)}\`\n`;
        });
    }
    
    fs.writeFileSync(path.join(ROOT, 'dead-code.md'), report);
    console.log(`\nReport generated: dead-code.md`);
    console.log(`Unreachable files: ${deadFiles.length}`);
    console.log(`Unused exports: ${unusedExports.length}`);
}

main();
