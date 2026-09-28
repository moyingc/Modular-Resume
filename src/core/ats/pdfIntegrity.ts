import type { ResumeDocument, ResumeModule } from '../resume/types';
import type { PdfIntegrityReport } from './types';

function normalized(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function renderedText(module: ResumeModule) {
  return module.useCompactContent && module.compactContent?.trim()
    ? module.compactContent.trim()
    : (module.content ?? module.title).trim();
}

function hasRenderableContent(module: ResumeModule): boolean {
  if (!module.selected) return false;
  if (module.kind === 'bullet') return Boolean(renderedText(module));
  if (module.kind === 'skill') return Boolean(module.title.trim());
  const children = (module.children ?? []).filter(hasRenderableContent);
  if (children.length) return true;
  if (module.kind === 'entry') return Boolean(module.title.trim() || module.subtitle?.trim() || module.content?.trim());
  return Boolean(module.content?.trim());
}

function expectedText(resume: ResumeDocument) {
  const parts = [resume.candidateName ?? resume.name, resume.contactLine];
  for (const section of resume.sections) {
    if (!section.selected) continue;
    const children = (section.children ?? []).filter(hasRenderableContent);
    if (!children.length) continue;
    parts.push(section.title);
    for (const child of children) {
      if (child.kind === 'entry') {
        parts.push(child.title, child.subtitle ?? '');
        for (const leaf of (child.children ?? []).filter(hasRenderableContent)) {
          parts.push(leaf.kind === 'skill' ? leaf.title : renderedText(leaf));
        }
      } else {
        parts.push(child.kind === 'skill' ? child.title : renderedText(child));
      }
    }
  }
  return normalized(parts.join(' '));
}

function orderedSentinels(resume: ResumeDocument) {
  return [
    resume.candidateName ?? resume.name,
    resume.contactLine,
    ...resume.sections.filter((section) => section.selected && (section.children ?? []).some(hasRenderableContent)).map((section) => section.title),
  ].map(normalized).filter(Boolean);
}

function sentinelsInOrder(extracted: string, sentinels: string[]) {
  const haystack = extracted.toLowerCase();
  let cursor = 0;
  for (const sentinel of sentinels) {
    const needle = sentinel.toLowerCase();
    const found = haystack.indexOf(needle, cursor);
    if (found < 0) return false;
    cursor = found + needle.length;
  }
  return true;
}

export async function inspectPdfTextIntegrity(blob: Blob, resume: ResumeDocument): Promise<PdfIntegrityReport> {
  const expected = expectedText(resume);
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/legacy/build/pdf.worker.mjs',
        import.meta.url,
      ).toString();
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const pageTexts: string[] = [];
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();
      pageTexts.push(content.items.map((item) => ('str' in item ? (item as { str: string }).str : '')).join(' '));
    }
    const extracted = normalized(pageTexts.join(' '));
    const expectedTokens = new Set(expected.toLowerCase().split(/\s+/).filter((token) => token.length > 2));
    const extractedLower = extracted.toLowerCase();
    const found = [...expectedTokens].filter((token) => extractedLower.includes(token)).length;
    const coverage = expectedTokens.size ? Math.round(found / expectedTokens.size * 100) : 100;
    const orderOk = sentinelsInOrder(extracted, orderedSentinels(resume));
    const status = coverage >= 92 && orderOk ? 'pass' : coverage >= 75 ? 'warning' : 'fail';
    const orderMessage = orderOk ? ' Key document sentinels remain in reading order.' : ' Section/header reading order needs review.';
    return {
      status,
      pageCount: doc.numPages,
      textLength: extracted.length,
      expectedTextLength: expected.length,
      coverage,
      message: `Extracted text coverage: ${coverage}%.${orderMessage} ${status === 'pass' ? 'Content survived PDF generation.' : 'Review reading order or missing text before submission.'}`,
    };
  } catch (error) {
    return {
      status: 'unavailable',
      pageCount: 0,
      textLength: 0,
      expectedTextLength: expected.length,
      coverage: null,
      message: `PDF text extraction is unavailable: ${error instanceof Error ? error.message : 'unknown error'}. Install the pinned pdfjs-dist dependency before release.`,
    };
  }
}
