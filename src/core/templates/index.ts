import type { ResumeDocument } from '../resume/types';
import type { PageSettings, SectionLayoutMode } from '../../types/editor-ui.types';
import type { ResumeTemplate, TemplatePageSettings } from './types';

export * from './types';
export * from './templateStore';
export * from './templateImporter';
export * from './builtins';

function normalizeSectionTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function sectionTemplateKey(title: string) {
  const value = normalizeSectionTitle(title);
  if (/\b(summary|profile|objective)\b/.test(value)) return 'summary';
  if (/\b(work|professional|employment).*\b(experience|history)\b|\bexperience\b/.test(value)) return 'work-experience';
  if (/\b(project|projects)\b/.test(value)) return 'projects';
  if (/\b(skill|skills|technical skills|core competencies)\b/.test(value)) return 'skills';
  if (/\b(education|academic)\b/.test(value)) return 'education';
  if (/\b(training|coursework|courses)\b/.test(value)) return 'training';
  if (/\b(certification|certifications|certificate|licenses?)\b/.test(value)) return 'certifications';
  if (/\b(volunteer|community)\b/.test(value)) return 'volunteer';
  if (/\badditional experience\b/.test(value)) return 'additional-experience';
  if (/\badditional capabilities\b/.test(value)) return 'additional-capabilities';
  return `title:${value || 'section'}`;
}

function presentationSettings(settings: PageSettings): TemplatePageSettings {
  return {
    paperSize: settings.paperSize,
    fontFamily: settings.fontFamily,
    bodyFontSize: settings.bodyFontSize,
    density: settings.density,
    marginPreset: settings.marginPreset,
  };
}

function portableLayouts(resume: ResumeDocument, sectionLayouts: Record<string, SectionLayoutMode>) {
  const result: Record<string, SectionLayoutMode> = {};
  for (const section of resume.sections) {
    const layout = sectionLayouts[section.id];
    if (layout) result[sectionTemplateKey(section.title)] = layout;
  }
  return result;
}

export function createTemplateFromCurrent(
  name: string,
  settings: PageSettings,
  sectionLayouts: Record<string, SectionLayoutMode>,
  defaultSectionLayout: SectionLayoutMode,
  resume: ResumeDocument,
): ResumeTemplate {
  return {
    id: `tpl-${Date.now()}`,
    name: name.trim() || 'My Template',
    source: 'json',
    createdAt: new Date().toISOString(),
    pageSettings: presentationSettings(settings),
    defaultSectionLayout,
    sectionLayouts: portableLayouts(resume, sectionLayouts),
  };
}

export function resolveTemplate(
  template: ResumeTemplate,
  currentSettings: PageSettings,
  resume: ResumeDocument,
) {
  const settings: PageSettings = {
    ...currentSettings,
    ...template.pageSettings,
    // Delivery settings are always owned by the current application resume.
    targetPages: currentSettings.targetPages,
    exportFileName: currentSettings.exportFileName,
    templateId: template.id,
  };

  const sectionLayouts: Record<string, SectionLayoutMode> = {};
  const stored = template.sectionLayouts ?? {};
  for (const section of resume.sections) {
    const portable = stored[sectionTemplateKey(section.title)];
    // Legacy templates may contain raw module IDs. Preserve same-document compatibility
    // without exporting new templates in that non-portable form.
    const legacy = stored[section.id];
    const layout = portable ?? legacy;
    if (layout) sectionLayouts[section.id] = layout;
  }

  return { settings, sectionLayouts };
}
