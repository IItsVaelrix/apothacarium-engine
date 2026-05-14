
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

console.log('--- SCHOLOMANCE SYSTEM AUDIT ---');

const checkFile = (p, label) => {
    const exists = fs.existsSync(path.join(ROOT, p));
    console.log(`${exists ? '✅' : '❌'} ${label}: ${p}`);
    return exists;
};

// 1. Critical Infrastructure
checkFile('codex/server/index.js', 'Server Entry');
checkFile('codex/server/user.persistence.js', 'User Persistence Layer');
checkFile('codex/server/routes/auth.routes.js', 'Auth Routes');

// 2. Security Vitals Scan
const serverContent = fs.readFileSync(path.join(ROOT, 'codex/server/index.js'), 'utf8');
const securityChecks = [
    { pattern: /@fastify\/helmet/, label: 'Helmet (Security Headers)' },
    { pattern: /@fastify\/rate-limit/, label: 'Rate Limiting' },
    { pattern: /@fastify\/csrf-protection/, label: 'CSRF Protection' },
    { pattern: /@fastify\/session/, label: 'Session Management' }
];

console.log('\n--- SECURITY FEATURE SCAN ---');
securityChecks.forEach(check => {
    const passed = check.pattern.test(serverContent);
    console.log(`${passed ? '✅' : '❌'} ${check.label}`);
});

// 3. Auth Integrity
const authContent = fs.readFileSync(path.join(ROOT, 'codex/server/routes/auth.routes.js'), 'utf8');
const authChecks = [
    { pattern: /captchaService\.validate/, label: 'CAPTCHA Validation' },
    { pattern: /bcrypt\.hash/, label: 'Password Hashing' },
    { pattern: /!user\.verified|verifyUser/, label: 'Email Verification Logic' },
    { pattern: /passwordSchema/, label: 'Strong Password Policy' }
];

console.log('\n--- AUTH INTEGRITY SCAN ---');
authChecks.forEach(check => {
    const passed = check.pattern.test(authContent);
    console.log(`${passed ? '✅' : '❌'} ${check.label}`);
});

console.log('\n--- AUDIT COMPLETE ---');
