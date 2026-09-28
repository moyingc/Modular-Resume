import type { ResumeTemplate } from './types';
import { BUILTIN_TEMPLATES, isBuiltinTemplateId } from './builtins';

const STORAGE_KEY = 'myc.resume.templates.v2';

function loadUserTemplates(): ResumeTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as ResumeTemplate[] : [];
    return parsed.filter((template) => !isBuiltinTemplateId(template.id));
  } catch { return []; }
}

export function loadTemplates(): ResumeTemplate[] {
  return [...BUILTIN_TEMPLATES, ...loadUserTemplates()];
}

export function saveTemplate(template: ResumeTemplate) {
  if (typeof window === 'undefined' || isBuiltinTemplateId(template.id)) return;
  const current = loadUserTemplates().filter((item) => item.id !== template.id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, template]));
}

export function deleteTemplate(templateId: string) {
  if (typeof window === 'undefined' || isBuiltinTemplateId(templateId)) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loadUserTemplates().filter((item) => item.id !== templateId)));
}

export function downloadTemplate(template: ResumeTemplate) {
  const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${template.name.replace(/[^a-z0-9_-]+/gi, '_') || 'resume-template'}.myc-template.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
