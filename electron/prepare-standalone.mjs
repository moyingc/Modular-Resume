import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');
const nested = path.join(standalone, path.basename(root));
const target = await (async () => {
  try { await cp(path.join(nested, 'server.js'), path.join(nested, '.server-check'), { force: true }); await rm(path.join(nested, '.server-check')); return nested; }
  catch { return standalone; }
})();
await mkdir(path.join(target, '.next'), { recursive: true });
await cp(path.join(root, '.next', 'static'), path.join(target, '.next', 'static'), { recursive: true, force: true });
try { await cp(path.join(root, 'public'), path.join(target, 'public'), { recursive: true, force: true }); } catch {}
console.log(`Electron standalone server prepared at ${target}`);
