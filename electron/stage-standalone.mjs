import { cp, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const source = path.join(root, '.next', 'standalone');
const target = path.join(root, '.desktop-stage');

try {
  await stat(source);
} catch {
  console.error('ERROR: .next/standalone does not exist. Run npm run build first.');
  process.exit(1);
}

await rm(target, { recursive: true, force: true });

await cp(source, target, {
  recursive: true,
  force: true,
  dereference: true,
});

console.log(`Desktop staging complete: ${target}`);
