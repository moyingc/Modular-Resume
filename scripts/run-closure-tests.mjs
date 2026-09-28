import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = mkdtempSync(join(tmpdir(), 'modular-resume-closure-'));
const tsc = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');

try {
  execFileSync(tsc, [
    'src/integration-tests/real_resume_closure.ts',
    'src/integration-tests/v973_jd_email_cc.ts',
    'src/integration-tests/v1_freeze_composer_quality.ts',
    '--outDir', outDir,
    '--module', 'commonjs',
    '--moduleResolution', 'node',
    '--target', 'ES2020',
    '--esModuleInterop',
    '--skipLibCheck',
    '--strict',
    '--noEmit', 'false',
  ], { cwd: root, stdio: 'inherit' });

  for (const test of ['real_resume_closure.js', 'v973_jd_email_cc.js', 'v1_freeze_composer_quality.js']) {
    const path = join(outDir, 'integration-tests', test);
    console.log(`\n=== ${test} ===`);
    execFileSync(process.execPath, [path], { cwd: root, stdio: 'inherit' });
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
