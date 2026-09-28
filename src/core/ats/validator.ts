import type { ResumeDocument } from '../resume/types';
import type { PageSettings, SectionLayoutMode } from '../../types/editor-ui.types';
import type { AtsCheck, AtsReport, PdfIntegrityReport } from './types';

export function validateAtsFormat(resume: ResumeDocument, settings: PageSettings, sectionLayouts: Record<string, SectionLayoutMode>, pdfIntegrity?: PdfIntegrityReport): AtsReport {
  const checks: AtsCheck[] = [];
  const push = (id: string, label: string, severity: AtsCheck['severity'], message: string) => checks.push({ id, label, severity, message });
  const integrity = pdfIntegrity ?? { status: 'not-run' as const, pageCount: 0, textLength: 0, expectedTextLength: 0, coverage: null, message: 'Generate PDF and run Text Integrity before final submission.' };

  if (integrity.status === 'not-run') {
    push('text-pdf', 'Text-based PDF', 'info', 'NOT RUN — generate the PDF and run Text Integrity before treating extraction as verified.');
  } else if (integrity.status === 'unavailable') {
    push('text-pdf', 'Text-based PDF', 'warning', 'UNAVAILABLE — PDF extraction could not be verified in this environment.');
  } else {
    push('text-pdf', 'Text-based PDF', integrity.status === 'pass' ? 'pass' : integrity.status === 'fail' ? 'fail' : 'warning', integrity.message);
  }

  push('font-size', 'Body font size', settings.bodyFontSize < 9 ? 'warning' : 'pass', settings.bodyFontSize < 9 ? `Body font is ${settings.bodyFontSize} pt; 9 pt or larger is safer.` : `${settings.bodyFontSize} pt is within the conservative range.`);
  const multiColumn = Object.values(sectionLayouts).some((layout) => layout !== 'list');
  push('columns', 'Reading order', multiColumn ? 'warning' : 'pass', multiColumn ? 'One or more sections use a multi-column layout. Confirm extracted text order before submission.' : 'Selected sections use a single-column reading order.');
  const standard = new Set(['summary','experience','work experience','education','skills','projects','certifications','professional experience']);
  const customHeadings = resume.sections.filter((section) => section.selected && ![...standard].some((name) => section.title.toLowerCase().includes(name)));
  push('headings', 'Section headings', customHeadings.length > Math.max(2, resume.sections.length / 2) ? 'warning' : 'pass', customHeadings.length ? `Custom headings detected: ${customHeadings.slice(0, 3).map((item) => item.title).join(', ')}.` : 'Headings are conventional.');
  push('contact', 'Contact information', resume.contactLine.trim().length < 8 ? 'warning' : 'pass', resume.contactLine.trim().length < 8 ? 'Contact line looks unusually short.' : 'Contact line is present in the main document body.');
  push('page-size', 'Page size', 'pass', settings.paperSize === 'letter' ? 'Letter selected.' : 'A4 selected. Both are supported; use the employer-region convention.');

  if (integrity.status !== 'not-run') {
    push('pdf-integrity', 'PDF text integrity', integrity.status === 'pass' ? 'pass' : integrity.status === 'fail' ? 'fail' : 'warning', integrity.message);
  }

  const penalties = checks.reduce((sum, item) => sum + (item.severity === 'fail' ? 35 : item.severity === 'warning' ? 12 : 0), 0);
  const score = Math.max(0, 100 - penalties);
  return { score, risk: score >= 85 ? 'low' : score >= 65 ? 'medium' : 'high', checks, pdfIntegrity: integrity };
}
