import type { ResumeDocument, ResumeModule } from '../resume/types';
import type { PageSettings, SectionLayoutMode } from '../../types/editor-ui.types';

export type RenderMetricSettings = Pick<PageSettings, 'paperSize' | 'bodyFontSize' | 'density' | 'marginPreset'>;

function marginPoints(preset: RenderMetricSettings['marginPreset']) {
  if (preset === 'compact') return { vertical: 30, horizontal: 36 };
  if (preset === 'wide') return { vertical: 46, horizontal: 50 };
  return { vertical: 36, horizontal: 40 };
}

function densityLineHeight(density: RenderMetricSettings['density']) {
  if (density === 'compact') return 1.12;
  if (density === 'relaxed') return 1.30;
  return 1.18;
}

function pageWidth(settings: RenderMetricSettings) {
  return settings.paperSize === 'letter' ? 612 : 595.28;
}

function textOf(module: ResumeModule) {
  return (module.useCompactContent && module.compactContent?.trim()
    ? module.compactContent
    : module.content ?? module.title ?? '').trim();
}

function visibleChildren(module: ResumeModule) {
  return (module.children ?? []).filter((child) => child.selected);
}

/**
 * Deterministic line estimator derived from the same physical page geometry,
 * font-size and density inputs used by ResumePdfDocument.
 *
 * Units are PDF points, not abstract "item counts". The preview still provides
 * authoritative calibration, but this keeps the optimizer and renderer on the
 * same geometric model before preview feedback arrives.
 */
function wrappedHeight(text: string, width: number, fontSize: number, lineHeight: number, bold = false) {
  if (!text.trim()) return 0;
  // Conservative average glyph advance. Bold headings are slightly wider.
  const avgGlyph = fontSize * (bold ? 0.56 : 0.52);
  const charsPerLine = Math.max(8, Math.floor(width / avgGlyph));
  const logicalLines = text.split(/\r?\n/).reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
  return logicalLines * fontSize * lineHeight;
}

function entryHeight(entry: ResumeModule, width: number, settings: RenderMetricSettings) {
  const body = settings.bodyFontSize;
  const lineHeight = densityLineHeight(settings.density);
  let h = wrappedHeight(entry.title, width, body, 1.15, true);
  if (entry.subtitle?.trim()) h += 1 + wrappedHeight(entry.subtitle, width, Math.max(7.5, body * 0.9), 1.15);
  for (const child of visibleChildren(entry)) {
    const text = textOf(child);
    if (!text) continue;
    h += 0.8 + wrappedHeight(text, Math.max(40, width - 17), body, lineHeight);
  }
  return h + 4.5;
}

function directHeight(module: ResumeModule, width: number, settings: RenderMetricSettings) {
  const body = settings.bodyFontSize;
  return wrappedHeight(textOf(module), width, body, densityLineHeight(settings.density));
}

function sectionBodyHeight(section: ResumeModule, layout: SectionLayoutMode, width: number, settings: RenderMetricSettings) {
  const children = visibleChildren(section);
  if (!children.length) return 0;

  const childHeight = (child: ResumeModule, childWidth: number) =>
    child.kind === 'entry' ? entryHeight(child, childWidth, settings) : directHeight(child, childWidth, settings);

  if (layout === 'row-first-2col') {
    let h = 0;
    const half = Math.max(40, (width - 9) / 2);
    const pairedCount = children.length - (children.length % 2);
    for (let i = 0; i < pairedCount; i += 2) {
      h += Math.max(childHeight(children[i], half), childHeight(children[i + 1], half));
    }
    if (children.length % 2) h += childHeight(children[children.length - 1], width);
    return h;
  }

  const columns = layout === 'grid-3x3' ? 3 : layout === 'grid-2x2' || layout === 'grid-2x3' ? 2 : 1;
  if (columns === 1) return children.reduce((sum, child) => sum + childHeight(child, width), 0);
  const colWidth = width / columns;
  let h = 0;
  for (let i = 0; i < children.length; i += columns) {
    h += Math.max(...children.slice(i, i + columns).map((child) => childHeight(child, colWidth)));
  }
  return h;
}

export function estimateRenderedHeightPoints(
  resume: ResumeDocument,
  sectionLayouts: Record<string, SectionLayoutMode>,
  settings: RenderMetricSettings,
) {
  const margin = marginPoints(settings.marginPreset);
  const width = pageWidth(settings) - margin.horizontal * 2;
  const body = settings.bodyFontSize;

  // Matches ResumePdfDocument header spacing closely.
  let total = 0;
  total += body * 1.72 + 3;
  if (resume.contactLine?.trim()) total += Math.max(7.5, body * 0.82) * 1.15;
  total += 4 + 6;

  for (const section of resume.sections.filter((item) => item.selected)) {
    const children = visibleChildren(section);
    if (!children.length && !textOf(section)) continue;
    total += 6; // section marginTop
    total += body * 1.08 * 1.1 + 2 + 4; // section title + padding/margin
    total += sectionBodyHeight(section, sectionLayouts[section.id] ?? 'list', width, settings);
  }
  return Number(total.toFixed(2));
}

export function availablePageHeightPoints(settings: RenderMetricSettings) {
  const pageHeight = settings.paperSize === 'letter' ? 792 : 841.89;
  const margin = marginPoints(settings.marginPreset);
  return pageHeight - margin.vertical * 2;
}

export function estimateRenderedPageUsage(
  resume: ResumeDocument,
  sectionLayouts: Record<string, SectionLayoutMode>,
  settings: RenderMetricSettings,
) {
  const used = estimateRenderedHeightPoints(resume, sectionLayouts, settings);
  const available = availablePageHeightPoints(settings);
  return { used, available, pages: Math.max(1, Math.ceil(used / available)), utilization: used / available };
}
