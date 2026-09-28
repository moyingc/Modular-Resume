import { access, cp, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');
const nested = path.join(standalone, path.basename(root));
const target = path.join(root, '.desktop-stage');

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

let source;

if (await exists(path.join(nested, 'server.js'))) {
  source = nested;
} else if (await exists(path.join(standalone, 'server.js'))) {
  source = standalone;
} else {
  console.error('ERROR: Cannot locate Next.js standalone server.js.');
  console.error(`Checked: ${path.join(nested, 'server.js')}`);
  console.error(`Checked: ${path.join(standalone, 'server.js')}`);
  process.exit(1);
}

await rm(target, { recursive: true, force: true });

await cp(source, target, {
  recursive: true,
  force: true,
  dereference: true,
});

if (!(await exists(path.join(target, 'server.js')))) {
  console.error('ERROR: Staged server.js is missing.');
  process.exit(1);
}

if (!(await exists(path.join(target, 'node_modules', 'next')))) {
  console.error('ERROR: Staged Next.js runtime dependency is missing: node_modules/next');
  process.exit(1);
}

console.log(`Next standalone source: ${source}`);
console.log(`Desktop staging complete: ${target}`);
console.log('Verified: server.js');
console.log('Verified: node_modules/next');
