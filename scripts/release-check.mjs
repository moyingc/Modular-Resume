import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const root = process.cwd();
const errors = [];
const warnings = [];

const ignoreDirs = new Set([
  'node_modules', '.next', '.git', '.release', 'coverage', 'out', 'build',
  'srcV7', 'src1', '__MACOSX',
]);

const forbiddenBasenames = new Set([
  '.env', '.env.local', '.env.development.local', '.env.production.local',
  'mail-connections.json', 'pending-oauth.json', 'google-oauth-client.json',
]);

const forbiddenDirNames = new Set([
  '.runtime',
]);

const allowedEnvExamples = new Set([
  '.env.example',
]);

const placeholderEmailDomains = new Set([
  'example.com', 'example.org', 'example.net',
]);

const explicitPrivateMarkers = (process.env.RELEASE_PRIVATE_MARKERS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function relative(file) {
  return path.relative(root, file) || '.';
}

function walk(dir) {
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoreDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (forbiddenDirNames.has(entry.name)) {
        errors.push(`Forbidden local-runtime directory present: ${relative(full)}`);
        continue;
      }
      output.push(...walk(full));
    } else if (entry.isFile()) {
      output.push(full);
    }
  }
  return output;
}

function looksBinary(buffer) {
  const probe = buffer.subarray(0, Math.min(buffer.length, 4096));
  return probe.includes(0);
}

function hasAssignedSecret(text, key) {
  // Env / shell assignment with a non-empty concrete value.
  const expression = new RegExp(
    String.raw`(?:^|\n)\s*${key}\s*=\s*(?!["']?\s*(?:$|\n))["']?([^\n"'#]{6,}|[^"'#\n]{12,})`,
    'i',
  );
  return expression.test(text);
}

function scanText(file, text) {
  const rel = relative(file);

  // Real OAuth/token material should never be in a release source package.
  const tokenJsonPatterns = [
    /"accessToken"\s*:\s*"(?!<|REDACTED|example)[^"]{12,}"/i,
    /"refreshToken"\s*:\s*"(?!<|REDACTED|example)[^"]{12,}"/i,
    /"access_token"\s*:\s*"(?!<|REDACTED|example)[^"]{12,}"/i,
    /"refresh_token"\s*:\s*"(?!<|REDACTED|example)[^"]{12,}"/i,
    /mr_mail_connection\s*=\s*[A-Za-z0-9_-]{12,}/i,
    /mr_mail_oauth_state_(?:google|microsoft)\s*=\s*[A-Za-z0-9_%.-]{12,}/i,
  ];
  for (const pattern of tokenJsonPatterns) {
    if (pattern.test(text)) {
      errors.push(`Credential/token-like material detected in ${rel}`);
      break;
    }
  }

  // We allow source code to mention variable NAMES; we block concrete assignments.
  for (const key of ['GOOGLE_CLIENT_SECRET', 'MICROSOFT_CLIENT_SECRET']) {
    if (hasAssignedSecret(text, key)) {
      errors.push(`Concrete ${key} value detected in ${rel}`);
    }
  }

  // PEM/private-key payloads.
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) {
    errors.push(`Private key material detected in ${rel}`);
  }

  // Optional developer-supplied markers, e.g. personal email/account IDs.
  for (const marker of explicitPrivateMarkers) {
    if (marker && text.includes(marker)) {
      errors.push(`Private marker "${marker}" detected in ${rel}`);
    }
  }

  // Warn about non-placeholder emails in env/config-ish files.
  if (/(?:^|\/)(?:\.env|.*config.*|.*settings.*)$/i.test(rel)) {
    const emails = text.match(/\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi) ?? [];
    for (const email of emails) {
      const domain = email.split('@')[1]?.toLowerCase() ?? '';
      if (!placeholderEmailDomains.has(domain)) {
        warnings.push(`Review email address in ${rel}: ${email}`);
      }
    }
  }
}

for (const name of forbiddenBasenames) {
  const file = path.join(root, name);
  if (fs.existsSync(file) && !allowedEnvExamples.has(name)) {
    errors.push(`Forbidden release file present: ${name}`);
  }
}

const files = walk(root);
for (const file of files) {
  const base = path.basename(file);
  if (/^client_secret_.*\.json$/i.test(base)) {
    errors.push(`Forbidden Google OAuth credential file present: ${relative(file)}`);
    continue;
  }
  if (forbiddenBasenames.has(base) && !allowedEnvExamples.has(base)) {
    errors.push(`Forbidden release file present: ${relative(file)}`);
    continue;
  }

  const buffer = fs.readFileSync(file);
  if (looksBinary(buffer)) continue;
  scanText(file, buffer.toString('utf8'));
}

// The real local OAuth store must be outside the project tree.
const expectedDefaultStore = path.join(os.homedir(), '.modular-resume', 'runtime', 'mail-connections.json');
const projectRuntimeStore = path.join(root, '.runtime', 'mail-connections.json');
if (fs.existsSync(projectRuntimeStore)) {
  errors.push('Legacy project-local OAuth store exists: .runtime/mail-connections.json');
}

console.log('Modular Resume Release Sanitizer');
console.log(`Project: ${root}`);
console.log(`Default user-local OAuth store: ${expectedDefaultStore}`);
console.log(`Scanned files: ${files.length}`);

for (const warning of [...new Set(warnings)]) {
  console.warn(`WARN: ${warning}`);
}

if (errors.length) {
  console.error('\nRELEASE BLOCKED');
  for (const error of [...new Set(errors)]) console.error(`- ${error}`);
  console.error('\nRemove local credentials/runtime data before packaging.');
  process.exit(1);
}

console.log('\nRELEASE SAFE');
console.log('- no project-local OAuth runtime store');
console.log('- no real .env/.env.local files');
console.log('- no detected OAuth tokens/cookies/private keys');
console.log('- no concrete Google/Microsoft client secrets');
if (explicitPrivateMarkers.length) {
  console.log(`- private marker check enabled (${explicitPrivateMarkers.length})`);
}
