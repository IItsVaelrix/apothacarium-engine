/**
 * QA Generation & Export Validation Runner
 *
 * Comprehensive validation script for all generation and export functionality:
 * - School styles generation
 * - Corpus generation
 * - PixelBrain Aseprite export
 *
 * Usage:
 *   node scripts/qa-generation-validation.js [--report] [--fix]
 *
 * Options:
 *   --report  Generate detailed HTML report
 *   --fix     Attempt to fix common issues
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Configuration
const CONFIG = {
  tests: {
    schoolStyles: 'tests/qa/generation/school-styles-generation.test.js',
    corpus: 'tests/qa/generation/corpus-generation.test.js',
    pixelBrain: 'tests/qa/generation/pixelbrain-aseprite-export.test.js',
  },
  outputs: {
    schoolStyles: 'src/lib/css/generated/school-styles.css',
    corpus: 'public/corpus.json',
  },
  scripts: {
    schoolStyles: 'scripts/generate-school-styles.js',
    corpus: 'scripts/generate_corpus.js',
  }
};

// Colors for terminal output
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

/**
 * Main validation runner
 */
async function runValidation(options = {}) {
  const { report = false, fix: _fix = false } = options;

  console.log(`${COLORS.cyan}╔════════════════════════════════════════════╗`);
  console.log(`║   QA Generation & Export Validation      ║`);
  console.log(`╚════════════════════════════════════════════╝${COLORS.reset}\n`);

  const results = {
    timestamp: new Date().toISOString(),
    tests: {},
    outputs: {},
    scripts: {},
    summary: {
      passed: 0,
      failed: 0,
      warnings: 0,
    }
  };

  // 1. Validate test files exist
  console.log(`${COLORS.blue}[1/4]${COLORS.reset} Validating test files...`);
  for (const [name, testPath] of Object.entries(CONFIG.tests)) {
    const fullPath = path.join(ROOT, testPath);
    const exists = fs.existsSync(fullPath);

    results.tests[name] = {
      path: testPath,
      exists,
      valid: exists,
    };

    console.log(`  ${exists ? '✅' : '❌'} ${name}: ${testPath}`);

    if (exists) {
      results.summary.passed++;
    } else {
      results.summary.failed++;
    }
  }

  // 2. Validate script files exist
  console.log(`\n${COLORS.blue}[2/4]${COLORS.reset} Validating generation scripts...`);
  for (const [name, scriptPath] of Object.entries(CONFIG.scripts)) {
    const fullPath = path.join(ROOT, scriptPath);
    const exists = fs.existsSync(fullPath);

    results.scripts[name] = {
      path: scriptPath,
      exists,
      valid: exists,
    };

    console.log(`  ${exists ? '✅' : '❌'} ${name}: ${scriptPath}`);

    if (exists) {
      results.summary.passed++;
    } else {
      results.summary.failed++;
    }
  }

  // 3. Run generation scripts (dry run)
  console.log(`\n${COLORS.blue}[3/4]${COLORS.reset} Running generation scripts...`);

  // School styles generation
  try {
    console.log(`  Running school styles generation...`);
    execSync(`node ${CONFIG.scripts.schoolStyles}`, {
      cwd: ROOT,
      stdio: 'pipe',
      timeout: 30000,
    });

    const schoolStylesExists = fs.existsSync(path.join(ROOT, CONFIG.outputs.schoolStyles));
    results.outputs.schoolStyles = {
      path: CONFIG.outputs.schoolStyles,
      exists: schoolStylesExists,
      valid: schoolStylesExists,
    };

    console.log(`  ${schoolStylesExists ? '✅' : '❌'} School styles generated`);

    if (schoolStylesExists) {
      results.summary.passed++;
    } else {
      results.summary.failed++;
    }
  } catch (error) {
    console.log(`  ${COLORS.red}❌${COLORS.reset} School styles generation failed: ${error.message}`);
    results.outputs.schoolStyles = {
      path: CONFIG.outputs.schoolStyles,
      exists: false,
      valid: false,
      error: error.message,
    };
    results.summary.failed++;
  }

  // Corpus generation (skip if corpus DB not found)
  try {
    console.log(`  Running corpus generation...`);

    // Check if corpus DB exists
    const corpusDbPath = process.env.SCHOLOMANCE_CORPUS_PATH ||
      path.join(ROOT, 'scholomance_corpus.sqlite');
    const fallbackPath = path.join(ROOT, 'docs', 'references', 'DATA-SET 1.md');

    const hasCorpusDb = fs.existsSync(corpusDbPath);
    const hasFallback = fs.existsSync(fallbackPath);

    if (!hasCorpusDb && !hasFallback) {
      console.log(`  ${COLORS.yellow}⚠${COLORS.reset} Corpus source not found, skipping...`);
      results.outputs.corpus = {
        path: CONFIG.outputs.corpus,
        exists: false,
        valid: false,
        skipped: true,
        reason: 'Corpus database and fallback not found',
      };
      results.summary.warnings++;
    } else {
      execSync(`node ${CONFIG.scripts.corpus}`, {
        cwd: ROOT,
        stdio: 'pipe',
        timeout: 60000,
      });

      const corpusExists = fs.existsSync(path.join(ROOT, CONFIG.outputs.corpus));
      results.outputs.corpus = {
        path: CONFIG.outputs.corpus,
        exists: corpusExists,
        valid: corpusExists,
      };

      console.log(`  ${corpusExists ? '✅' : '❌'} Corpus generated`);

      if (corpusExists) {
        results.summary.passed++;
      } else {
        results.summary.failed++;
      }
    }
  } catch (error) {
    console.log(`  ${COLORS.red}❌${COLORS.reset} Corpus generation failed: ${error.message}`);
    results.outputs.corpus = {
      path: CONFIG.outputs.corpus,
      exists: false,
      valid: false,
      error: error.message,
    };
    results.summary.failed++;
  }

  // 4. Run Vitest tests
  console.log(`\n${COLORS.blue}[4/4]${COLORS.reset} Running Vitest test suites...`);

  try {
    const testPattern = 'tests/qa/generation/*.test.js';
    console.log(`  Running: ${testPattern}`);

    execSync(`npm run test -- ${testPattern} --reporter=verbose`, {
      cwd: ROOT,
      stdio: 'inherit',
      timeout: 120000,
    });

    console.log(`  ✅ All generation tests passed`);
    results.summary.passed++;
  } catch (error) {
    console.log(`  ${COLORS.red}❌${COLORS.reset} Some tests failed`);
    results.summary.failed++;
  }

  // Generate report
  if (report) {
    generateReport(results);
  }

  // Print summary
  printSummary(results);

  return results;
}

/**
 * Generate HTML report
 */
function generateReport(results) {
  const reportPath = path.join(ROOT, 'reports', 'qa-generation-validation.html');

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QA Generation & Export Validation Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #1a1a2e;
      color: #e0e0e0;
    }
    h1 { color: #00d9ff; }
    h2 { color: #ff6b6b; margin-top: 30px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin: 20px 0;
    }
    .summary-card {
      background: #16213e;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
    .summary-card h3 { margin: 0; color: #00d9ff; }
    .summary-card .value { font-size: 48px; font-weight: bold; }
    .passed { color: #4caf50; }
    .failed { color: #f44336; }
    .warnings { color: #ff9800; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #0f3460;
    }
    th { background: #0f3460; color: #00d9ff; }
    .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
    .status.pass { background: #4caf50; color: white; }
    .status.fail { background: #f44336; color: white; }
    .status.warn { background: #ff9800; color: white; }
    .timestamp { color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <h1>🔬 QA Generation & Export Validation Report</h1>
  <p class="timestamp">Generated: ${results.timestamp}</p>

  <div class="summary">
    <div class="summary-card">
      <h3>Passed</h3>
      <div class="value passed">${results.summary.passed}</div>
    </div>
    <div class="summary-card">
      <h3>Failed</h3>
      <div class="value failed">${results.summary.failed}</div>
    </div>
    <div class="summary-card">
      <h3>Warnings</h3>
      <div class="value warnings">${results.summary.warnings}</div>
    </div>
  </div>

  <h2>Test Files</h2>
  <table>
    <tr><th>Name</th><th>Path</th><th>Status</th></tr>
    ${Object.entries(results.tests).map(([name, test]) => `
      <tr>
        <td>${name}</td>
        <td>${test.path}</td>
        <td><span class="status ${test.valid ? 'pass' : 'fail'}">${test.valid ? 'PASS' : 'FAIL'}</span></td>
      </tr>
    `).join('')}
  </table>

  <h2>Generation Scripts</h2>
  <table>
    <tr><th>Name</th><th>Path</th><th>Status</th></tr>
    ${Object.entries(results.scripts).map(([name, script]) => `
      <tr>
        <td>${name}</td>
        <td>${script.path}</td>
        <td><span class="status ${script.valid ? 'pass' : 'fail'}">${script.valid ? 'PASS' : 'FAIL'}</span></td>
      </tr>
    `).join('')}
  </table>

  <h2>Generated Outputs</h2>
  <table>
    <tr><th>Name</th><th>Path</th><th>Exists</th><th>Status</th></tr>
    ${Object.entries(results.outputs).map(([name, output]) => `
      <tr>
        <td>${name}</td>
        <td>${output.path}</td>
        <td>${output.exists ? 'Yes' : 'No'}</td>
        <td>
          ${output.skipped ?
            `<span class="status warn">SKIPPED</span><br><small>${output.reason}</small>` :
            `<span class="status ${output.valid ? 'pass' : 'fail'}">${output.valid ? 'PASS' : 'FAIL'}</span>`
          }
        </td>
      </tr>
    `).join('')}
  </table>

  <h2>Errors</h2>
  <table>
    <tr><th>Component</th><th>Error</th></tr>
    ${Object.entries(results.outputs)
      .filter(([_, output]) => output.error)
      .map(([name, output]) => `
        <tr>
          <td>${name}</td>
          <td><code>${output.error}</code></td>
        </tr>
      `).join('<tr><td colspan="2">No errors</td></tr>')}
  </table>
</body>
</html>
  `;

  fs.writeFileSync(reportPath, html);
  console.log(`\n${COLORS.green}✓${COLORS.reset} Report generated: ${reportPath}`);
}

/**
 * Print summary to console
 */
function printSummary(results) {
  console.log(`\n${COLORS.cyan}╔════════════════════════════════════════════╗`);
  console.log(`║              VALIDATION SUMMARY            ║`);
  console.log(`╚════════════════════════════════════════════╝${COLORS.reset}`);

  console.log(`\n  ${COLORS.green}Passed:${COLORS.reset}   ${results.summary.passed}`);
  console.log(`  ${COLORS.red}Failed:${COLORS.reset}   ${results.summary.failed}`);
  console.log(`  ${COLORS.yellow}Warnings:${COLORS.reset} ${results.summary.warnings}`);

  const total = results.summary.passed + results.summary.failed + results.summary.warnings;
  const passRate = total > 0 ? ((results.summary.passed / total) * 100).toFixed(1) : 0;

  console.log(`\n  ${COLORS.blue}Pass Rate:${COLORS.reset} ${passRate}%`);

  if (results.summary.failed > 0) {
    console.log(`\n  ${COLORS.red}⚠ Some validations failed. Review the output above.${COLORS.reset}`);
  } else if (results.summary.warnings > 0) {
    console.log(`\n  ${COLORS.yellow}⚠ Some warnings were raised. No action required.${COLORS.reset}`);
  } else {
    console.log(`\n  ${COLORS.green}✓ All validations passed!${COLORS.reset}`);
  }
}

// CLI argument parsing
const args = process.argv.slice(2);
const options = {
  report: args.includes('--report'),
  fix: args.includes('--fix'),
};

// Run validation
runValidation(options).catch(error => {
  console.error(`${COLORS.red}Fatal error:${COLORS.reset}`, error);
  process.exit(1);
});
