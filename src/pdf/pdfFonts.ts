import { Font } from '@react-pdf/renderer';
import type { ResumeDocument } from '../core/resume/types';

const CJK_FAMILY = 'ResumeNotoSansSC';

let registered = false;

export function containsCjk(text: string) {
  return /[\u3400-\u9FFF\uF900-\uFAFF]/u.test(text);
}

function flattenResumeText(resume: ResumeDocument) {
  const parts: string[] = [resume.name, resume.contactLine];

  const walk = (nodes: ResumeDocument['sections']) => {
    for (const node of nodes) {
      parts.push(node.title, node.subtitle ?? '', node.content ?? '');
      if (node.children) walk(node.children);
    }
  };

  walk(resume.sections);
  return parts.join('\n');
}

export function resumeNeedsCjkFont(resume: ResumeDocument) {
  return containsCjk(flattenResumeText(resume));
}

export function registerPdfFonts() {
  if (registered) return;
  registered = true;

  /*
   * These files are intentionally NOT bundled in this source package.
   * Run:
   *   npm install @fontsource/noto-sans-sc
   *   node scripts/setup-pdf-fonts.mjs
   *
   * The setup script copies the npm-installed WOFF files into /public/pdf-fonts.
   */
  Font.register({
    family: CJK_FAMILY,
    fonts: [
      {
        src: '/pdf-fonts/NotoSansSC-Regular.woff',
        fontWeight: 400,
      },
      {
        src: '/pdf-fonts/NotoSansSC-Bold.woff',
        fontWeight: 700,
      },
    ],
  });

  // Resume text should not be hyphenated differently across runs.
  Font.registerHyphenationCallback((word) => [word]);
}

export function resolvePdfFontFamily(
  requested: string,
  needsCjk: boolean,
) {
  if (needsCjk) return CJK_FAMILY;

  switch (requested) {
    case 'Times New Roman':
    case 'Georgia':
      return 'Times-Roman';
    case 'Arial':
    case 'Helvetica':
    default:
      return 'Helvetica';
  }
}
