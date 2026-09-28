import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const files = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.release', '.git'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) files.push(full);
  }
}
walk(path.join(root, 'src'));
walk(path.join(root, 'app'));
const corpus = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

const checks = [];
const check = (name, ok, detail='') => { checks.push({name, ok, detail}); if (!ok) process.exitCode = 1; };

check('No dangerouslySetInnerHTML', !/dangerouslySetInnerHTML/.test(corpus));
check('No eval/new Function in app source', !/\beval\s*\(|new\s+Function\s*\(/.test(corpus));
check('No direct mail send API route', !fs.existsSync(path.join(root, 'app/api/mail/send')));

const draft = read('app/api/mail/draft/route.ts');
check('Draft route enforces same-origin', /sameOrigin\(origin, host\)/.test(draft));
check('Draft route rejects missing/cross origin', /Origin validation failed/.test(draft));
check('Draft route limits request size', /MAX_JSON_BYTES/.test(draft) && /status:\s*413/.test(draft));
check('Draft route validates email/header input', /SIMPLE_EMAIL/.test(draft) && /safeHeaderValue/.test(draft));
check('Draft route limits attachments', /MAX_TOTAL_ATTACHMENT_BASE64_BYTES/.test(draft));

const disconnect = read('app/api/mail/disconnect/route.ts');
check('Disconnect enforces same-origin', /Origin validation failed/.test(disconnect));

const mail = read('src/core/mail/server.ts');
check('OAuth uses cryptographic state', /randomBytes\(24\)/.test(mail));
check('Google OAuth uses PKCE S256', /code_challenge_method', 'S256'/.test(mail));
check('OAuth token files mode 0600', /mode:\s*0o600/.test(mail));
check('OAuth runtime directory mode 0700', /mode:\s*0o700/.test(mail));
check('RFC822 header controls stripped', /stripHeaderControls/.test(mail));

const config = read('next.config.ts');
check('CSP present', /Content-Security-Policy/.test(config));
check('Clickjacking defense present', /X-Frame-Options/.test(config) && /frame-ancestors 'none'/.test(config));
check('MIME sniffing defense present', /X-Content-Type-Options/.test(config));
check('No LAN dev origin allowlist', !/allowedDevOrigins/.test(config));

console.log('Modular Resume Security Gate');
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'} - ${c.name}${c.detail ? `: ${c.detail}` : ''}`);
console.log(`\n${checks.filter(c=>c.ok).length}/${checks.length} checks passed.`);
