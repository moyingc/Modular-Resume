import { PDFDocument } from 'pdf-lib';
import type { PageSettings, SectionLayoutMode } from '../../types/editor-ui.types';
import type { ResumeTemplate, TemplateImportResult } from './types';

const PAPER = new Set<PageSettings['paperSize']>(['a4', 'letter']);
const FONT = new Set<PageSettings['fontFamily']>(['Arial', 'Georgia', 'Times New Roman', 'Helvetica']);
const DENSITY = new Set<PageSettings['density']>(['compact', 'standard', 'relaxed']);
const MARGIN = new Set<PageSettings['marginPreset']>(['compact', 'standard', 'wide']);
const LAYOUT = new Set<SectionLayoutMode>(['list', 'row-first-2col', 'grid-2x2', 'grid-2x3', 'grid-3x3']);

function safeId(name: string) {
  return `tpl-${Date.now()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`;
}

function cleanPageSettings(value: unknown): ResumeTemplate['pageSettings'] {
  if (!value || typeof value !== 'object') throw new Error('Invalid myC template: pageSettings must be an object.');
  const raw = value as Record<string, unknown>;
  const next: ResumeTemplate['pageSettings'] = {};
  if (raw.paperSize !== undefined) {
    if (!PAPER.has(raw.paperSize as PageSettings['paperSize'])) throw new Error('Invalid template paperSize.');
    next.paperSize = raw.paperSize as PageSettings['paperSize'];
  }
  if (raw.fontFamily !== undefined) {
    if (!FONT.has(raw.fontFamily as PageSettings['fontFamily'])) throw new Error('Invalid template fontFamily.');
    next.fontFamily = raw.fontFamily as PageSettings['fontFamily'];
  }
  if (raw.bodyFontSize !== undefined) {
    const size = Number(raw.bodyFontSize);
    if (!Number.isFinite(size) || size < 7 || size > 20) throw new Error('Invalid template bodyFontSize; expected 7–20 pt.');
    next.bodyFontSize = size;
  }
  if (raw.density !== undefined) {
    if (!DENSITY.has(raw.density as PageSettings['density'])) throw new Error('Invalid template density.');
    next.density = raw.density as PageSettings['density'];
  }
  if (raw.marginPreset !== undefined) {
    if (!MARGIN.has(raw.marginPreset as PageSettings['marginPreset'])) throw new Error('Invalid template marginPreset.');
    next.marginPreset = raw.marginPreset as PageSettings['marginPreset'];
  }
  return next;
}

function cleanLayouts(value: unknown) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid template sectionLayouts.');
  const next: Record<string, SectionLayoutMode> = {};
  for (const [key, layout] of Object.entries(value as Record<string, unknown>)) {
    if (!key.trim() || !LAYOUT.has(layout as SectionLayoutMode)) throw new Error(`Invalid section layout for ${key || 'unknown section'}.`);
    next[key] = layout as SectionLayoutMode;
  }
  return next;
}

function cleanJsonTemplate(value: unknown, fileName: string): ResumeTemplate {
  if (!value || typeof value !== 'object') throw new Error('Invalid myC template JSON.');
  const raw = value as Record<string, unknown>;
  const defaultLayout = raw.defaultSectionLayout === undefined ? undefined : raw.defaultSectionLayout as SectionLayoutMode;
  if (defaultLayout && !LAYOUT.has(defaultLayout)) throw new Error('Invalid template defaultSectionLayout.');
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : safeId(fileName),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : fileName.replace(/\.json$/i, ''),
    source: 'json',
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt.trim() ? raw.createdAt : new Date().toISOString(),
    pageSettings: cleanPageSettings(raw.pageSettings),
    defaultSectionLayout: defaultLayout,
    sectionLayouts: cleanLayouts(raw.sectionLayouts),
    badge: typeof raw.badge === 'string' && raw.badge.trim() ? raw.badge.trim().slice(0, 40) : undefined,
    description: typeof raw.description === 'string' && raw.description.trim() ? raw.description.trim().slice(0, 240) : undefined,
    notes: Array.isArray(raw.notes) ? raw.notes.filter((item): item is string => typeof item === 'string').slice(0, 12) : undefined,
  };
}

export async function importTemplateFile(file: File): Promise<TemplateImportResult> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.json')) {
    const template = cleanJsonTemplate(JSON.parse(await file.text()) as unknown, file.name);
    return { template, warnings: [] };
  }
  if (lower.endsWith('.pdf')) {
    const pdf = await PDFDocument.load(await file.arrayBuffer());
    const first = pdf.getPages()[0];
    if (!first) throw new Error('PDF template has no pages.');
    const { width, height } = first.getSize();
    const isLetter = Math.abs(width - 612) < 20 && Math.abs(height - 792) < 20;
    const isA4 = Math.abs(width - 595) < 20 && Math.abs(height - 842) < 20;
    return {
      template: {
        id: safeId(file.name),
        name: file.name.replace(/\.pdf$/i, ''),
        source: 'pdf',
        createdAt: new Date().toISOString(),
        pageSettings: { paperSize: isLetter ? 'letter' : 'a4' },
        notes: ['PDF import intentionally reads page geometry only. Resume text is ignored.'],
      },
      warnings: [isLetter || isA4 ? 'Imported page size. Font, spacing and visual style require a myC JSON template for deterministic reproduction.' : 'Non-standard PDF page size detected; mapped to A4 because current renderer supports A4/Letter only.'],
    };
  }
  throw new Error('Supported template formats: .myc-template.json / .json and .pdf. PDF import reads formatting geometry only and never imports resume text.');
}
