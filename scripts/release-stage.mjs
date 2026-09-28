import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const result = spawnSync(process.execPath, ['scripts/release-check.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
if (result.status !== 0) process.exit(result.status ?? 1);

const destination = path.join(root, '.release', 'modular-resume');
fs.rmSync(path.join(root, '.release'), { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });

const excluded = new Set([
  'node_modules', '.next', '.git', '.release', '.runtime',
  'coverage', 'out', 'build', 'srcV7', 'src1', '__MACOSX',
  '.env', '.env.local', '.env.development.local', '.env.production.local',
  'google-oauth-client.json',
]);

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (excluded.has(entry.name) || /^client_secret_.*\.json$/i.test(entry.name)) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(source, target);
    else if (entry.isFile()) fs.copyFileSync(source, target);
  }
}

copyDir(root, destination);

console.log(`\nSanitized release staging directory:\n${destination}`);
console.log('Local OAuth tokens, runtime data, env secrets, build caches and dependencies were excluded.');
