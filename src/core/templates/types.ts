import type { PageSettings, SectionLayoutMode } from '../../types/editor-ui.types';

export type TemplatePageSettings = Pick<
  PageSettings,
  'paperSize' | 'fontFamily' | 'bodyFontSize' | 'density' | 'marginPreset'
>;

export interface ResumeTemplate {
  id: string;
  name: string;
  source: 'builtin' | 'json' | 'pdf';
  createdAt: string;
  pageSettings: Partial<TemplatePageSettings>;
  defaultSectionLayout?: SectionLayoutMode;
  /** Portable section-layout keys such as work-experience / skills / education. */
  sectionLayouts?: Record<string, SectionLayoutMode>;
  badge?: string;
  description?: string;
  localized?: { zh: { name: string; description?: string }; en: { name: string; description?: string } };
  notes?: string[];
}

export interface TemplateImportResult {
  template: ResumeTemplate;
  warnings: string[];
}
