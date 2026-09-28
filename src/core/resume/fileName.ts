import type { ResumeDocument } from './types';

export function candidateNameOf(resume: ResumeDocument) {
  return resume.candidateName?.trim() || resume.name.trim() || 'Resume';
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function sanitizeBaseName(value: string) {
  const withoutUnsafeUnicode = value
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, '')
    .replace(/[\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[. _]+|[. _]+$/g, '');
  const safe = withoutUnsafeUnicode || 'Resume';
  return WINDOWS_RESERVED.test(safe) ? `_${safe}` : safe;
}

export function buildResumeExportFileName(resume: ResumeDocument, configuredName = '') {
  const candidate = candidateNameOf(resume);
  const defaultName = `${candidate.replace(/\s+/g, '_')}_Resume`;
  const configured = configuredName.trim();
  const source = configured && configured.toLowerCase() !== 'resume' ? configured : defaultName;
  const withoutPdf = source.replace(/\.pdf$/i, '');
  return `${sanitizeBaseName(withoutPdf)}.pdf`;
}
