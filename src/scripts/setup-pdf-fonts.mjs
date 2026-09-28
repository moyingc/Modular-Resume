import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const sourceDir = path.join(
  projectRoot,
  'node_modules',
  '@fontsource',
  'noto-sans-sc',
  'files',
);
const targetDir = path.join(projectRoot, 'public', 'pdf-fonts');

function findFont(files, weight) {
  const preferred = files.find(
    (name) =>
      name.includes('chinese-simplified') &&
      name.includes(`-${weight}-normal`) &&
      name.endsWith('.woff'),
  );

  if (preferred) return preferred;

  return files.find(
    (name) =>
      name.includes(`-${weight}-normal`) &&
      name.endsWith('.woff'),
  );
}

try {
  const files = await fs.readdir(sourceDir);
  const regular = findFont(files, 400);
  const bold = findFont(files, 700);

  if (!regular || !bold) {
    throw new Error(
      '没有在 @fontsource/noto-sans-sc 中找到 400/700 WOFF 字体。',
    );
  }

  await fs.mkdir(targetDir, { recursive: true });

  await fs.copyFile(
    path.join(sourceDir, regular),
    path.join(targetDir, 'NotoSansSC-Regular.woff'),
  );

  await fs.copyFile(
    path.join(sourceDir, bold),
    path.join(targetDir, 'NotoSansSC-Bold.woff'),
  );

  console.log('PDF fonts ready:');
  console.log('  public/pdf-fonts/NotoSansSC-Regular.woff');
  console.log('  public/pdf-fonts/NotoSansSC-Bold.woff');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error('');
  console.error('先运行：');
  console.error('  npm install @fontsource/noto-sans-sc');
  process.exitCode = 1;
}
