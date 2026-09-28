import type { ResumeTemplate } from './types';

/**
 * Built-in presentation templates only.
 * They never carry targetPages, exportFileName, resume content, or Targeting state.
 */
export const BUILTIN_TEMPLATES: ResumeTemplate[] = [
  {
    id: 'ats-standard',
    name: 'Original',
    localized: { zh: { name: '原始模板', description: 'myC 原始默认排版；保留现有基础视觉与行为。' }, en: { name: 'Original', description: 'Original myC layout preserving the existing base visual design and behavior.' } },
    badge: 'ORIGINAL',
    description: 'Original myC layout preserving the existing base visual design and behavior.',
    source: 'builtin',
    createdAt: '2026-09-10T00:00:00.000Z',
    pageSettings: {
      paperSize: 'a4',
      fontFamily: 'Arial',
      bodyFontSize: 10.5,
      density: 'standard',
      marginPreset: 'standard',
    },
    defaultSectionLayout: 'grid-2x2',
    sectionLayouts: {},
    notes: ['Built-in original myC presentation preset.'],
  },
  {
    id: 'canada-ats-standard',
    name: 'Canada ATS Standard',
    localized: { zh: { name: '加拿大 ATS 标准', description: '保守的加拿大投递版式；主体单栏，技能使用紧凑顺序双列。' }, en: { name: 'Canada ATS Standard', description: 'Conservative Canadian application layout with a single-column body and compact row-first two-column Skills.' } },
    badge: 'ATS SAFE · RECOMMENDED',
    description: 'Conservative Canadian application layout with a single-column body and compact row-first two-column Skills.',
    source: 'builtin',
    createdAt: '2026-09-10T00:00:00.000Z',
    pageSettings: {
      paperSize: 'letter',
      fontFamily: 'Arial',
      bodyFontSize: 10.5,
      density: 'standard',
      marginPreset: 'standard',
    },
    defaultSectionLayout: 'list',
    sectionLayouts: {
      summary: 'list',
      'work-experience': 'list',
      projects: 'list',
      skills: 'row-first-2col',
      education: 'list',
      training: 'list',
      certifications: 'list',
      volunteer: 'list',
      'additional-experience': 'list',
      'additional-capabilities': 'list',
    },
    notes: ['Presentation-only ATS-oriented preset. Skills remain text and preserve row-first reading order.'],
  },
  {
    id: 'canada-compact-professional',
    name: 'Canada Compact Professional',
    localized: { zh: { name: '加拿大紧凑专业版', description: '更紧凑的专业版式，适合内容较多或希望接近 1 页的简历。' }, en: { name: 'Canada Compact Professional', description: 'A more compact professional layout for content-heavy resumes or resumes targeting approximately one page.' } },
    badge: 'COMPACT · ATS FRIENDLY',
    description: 'A more compact professional layout for content-heavy resumes or resumes targeting approximately one page.',
    source: 'builtin',
    createdAt: '2026-09-10T00:00:00.000Z',
    pageSettings: {
      paperSize: 'letter',
      fontFamily: 'Arial',
      bodyFontSize: 10,
      density: 'compact',
      marginPreset: 'compact',
    },
    defaultSectionLayout: 'list',
    sectionLayouts: {
      summary: 'list',
      'work-experience': 'list',
      projects: 'list',
      skills: 'row-first-2col',
      education: 'list',
      training: 'list',
      certifications: 'list',
      volunteer: 'list',
      'additional-experience': 'list',
      'additional-capabilities': 'list',
    },
    notes: ['Presentation-only compact preset. It does not alter selection, recommendation, or page-fit semantics.'],
  },
];

export function isBuiltinTemplateId(templateId: string) {
  return BUILTIN_TEMPLATES.some((template) => template.id === templateId);
}
