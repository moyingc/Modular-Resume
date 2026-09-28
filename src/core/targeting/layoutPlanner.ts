import type { ResumeDocument, ResumeModule } from '../resume/types';
import type { SectionLayoutMode } from '../../types/editor-ui.types';
import type { ModuleRecommendation } from './types';

export type SkillRenderMode = 'native' | 'inline-groups' | 'compact-categories';

export interface SectionLayoutRecommendation {
  sectionId: string;
  layout: SectionLayoutMode;
  renderMode: SkillRenderMode;
  groupCount: number;
  selectedCount: number;
  averageLabelLength: number;
  balanceScore: number;
  reason: string;
}

export interface ResumeLayoutPlan {
  sections: Record<string, SectionLayoutRecommendation>;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isSkillSection(section: ResumeModule) {
  return /(^|\b)(skills?|technical skills?|core competencies|competencies|技能|专业技能|能力)(\b|$)/.test(normalize(section.title));
}

function directSelectedChildren(section: ResumeModule) {
  return (section.children ?? []).filter((child) => child.selected);
}

function displayText(module: ResumeModule) {
  return (module.title || module.content || '').trim();
}

function isCompactableSkill(module: ResumeModule) {
  if (!module.selected) return false;
  if (module.children?.some((child) => child.selected)) return false;
  const text = displayText(module);
  if (!text || text.length > 42) return false;
  if (/[.!?]\s*$/.test(text) && text.length > 28) return false;
  return module.kind === 'skill' || module.kind === 'entry' || module.kind === 'bullet';
}

const COMPACT_TERM_PATTERNS: Array<[string, RegExp]> = [
  ['Excel', /\bexcel\b/i], ['Word', /\bword\b/i], ['Outlook', /\boutlook\b/i], ['PowerPoint', /\bpowerpoint\b/i],
  ['Spreadsheets', /\bspreadsheets?\b/i], ['Data Entry', /\bdata entry\b/i], ['Database Records', /\b(database|databases)\b/i],
  ['Records Management', /\brecords? management\b/i], ['Confidential Records', /\bconfidential|sensitive information\b/i],
  ['Calendar Management', /\b(shared )?calendars?|calendar management\b/i], ['Scheduling', /\bschedul|appointments?\b/i],
  ['Meeting Coordination', /\bmeetings?|meeting coordination\b/i], ['Document Preparation', /\bdocument preparation|documents?|forms?\b/i],
  ['Filing', /\bfiling|file naming|archiv/i], ['Correspondence', /\bcorrespondence\b/i], ['Reception', /\breception|front desk\b/i],
  ['Mail / Courier', /\bmail\b|\bcourier\b/i], ['Customer Service', /\bcustomer service\b/i], ['Telephone', /\btelephone|phone\b/i],
  ['Email', /\bemail\b/i], ['Inventory Records', /\binventory records?\b/i], ['Purchasing', /\bpurchas/i],
  ['Reporting', /\breporting|reports?\b/i], ['Data Quality', /\bdata quality|missing fields|inconsisten|duplicate records?\b/i],
  ['Onboarding', /\bonboarding|new employee\b/i], ['Employee Records', /\bemployee records?|employee files?\b/i],
  ['Training', /\btraining\b/i], ['Event Support', /\bevent registration|events?\b/i], ['Visitor Service', /\bvisitors?|guest\b/i],
  ['Prioritization', /\bprioriti[sz](?:e|ing|ation)|competing requests?\b/i],
  ['Schedule Coordination', /\bcoordinating schedules?|schedule coordination\b/i],
  ['Follow-up Tracking', /\bfollow[- ]?up|tracking follow[- ]?up\b/i],
  ['Deadline Support', /\bdeadlines?|supporting deadlines?\b/i],
  ['Adaptability', /\badapt(?:ing|ability)|operational priorities change\b/i],
];

function selectedDescendantText(module: ResumeModule): string {
  const own = [module.title, module.subtitle, module.content].filter(Boolean).join(' ');
  const child = (module.children ?? []).filter((item) => item.selected).map(selectedDescendantText).join(' ');
  return `${own} ${child}`.trim();
}

function extractCompactTerms(module: ResumeModule, byId: Map<string, ModuleRecommendation>) {
  const text = selectedDescendantText(module);
  const terms: string[] = [];
  for (const [label, pattern] of COMPACT_TERM_PATTERNS) {
    if (pattern.test(text) && !terms.includes(label)) terms.push(label);
  }
  const stack = [module, ...(module.children ?? []).filter((item) => item.selected)];
  for (const item of stack) {
    const rec = byId.get(item.id);
    if (!rec) continue;
    for (const evidence of rec.evidence) {
      if ((evidence.strength === 'direct' || evidence.strength === 'strong' || evidence.strength === 'supporting') && text.toLowerCase().includes(evidence.matchedTerms[0] ?? '__never__')) {
        if (evidence.requirementLabel.length <= 34 && !terms.includes(evidence.requirementLabel)) terms.push(evidence.requirementLabel);
      }
    }
  }
  return terms.slice(0, 8);
}

function categoryEntries(section: ResumeModule) {
  return directSelectedChildren(section).filter((item) => (item.children ?? []).some((child) => child.selected));
}

function categoryAffinity(categoryTitle: string, term: string) {
  const c = normalize(categoryTitle);
  const t = normalize(term);
  if (/microsoft|office tools/.test(c) && /excel|word|outlook|powerpoint/.test(t)) return 10;
  if (/record|data/.test(c) && /data|database|record|confidential|quality|filing/.test(t)) return 10;
  if (/communication|customer/.test(c) && /customer|telephone|email|correspondence|visitor|communication/.test(t)) return 10;
  if (/administration|office administration/.test(c) && /scheduling|meeting|reception|mail|courier|document|filing|calendar/.test(t)) return 9;
  if (/organization|coordination/.test(c) && /scheduling|meeting|organization|priorities/.test(t)) return 9;
  return 1;
}

function semanticSkillKey(term: string) {
  const value = normalize(term).replace(/\s*&\s*/g, ' and ');
  if (/confidential/.test(value) && /(record|information|document)/.test(value)) return 'confidentiality';
  if (/calendar/.test(value)) return 'calendar-management';
  if (/meeting coordination|coordinate meeting/.test(value)) return 'meeting-coordination';
  if (/customer \/ student service|customer service|student service/.test(value)) return 'customer-service';
  if (/database record|database administration/.test(value)) return 'database-records';
  if (/document preparation|correspondence preparation/.test(value)) return 'document-preparation';
  return value;
}

function dedupeCategoryTerms(categories: ResumeModule[], byId: Map<string, ModuleRecommendation>) {
  const raw = categories.map((item) => {
    const unique = new Map<string, string>();
    for (const term of extractCompactTerms(item, byId)) {
      const key = semanticSkillKey(term);
      const current = unique.get(key);
      // Prefer the shorter, cleaner label for semantically identical terms.
      if (!current || term.length < current.length) unique.set(key, term);
    }
    return { item, terms: [...unique.values()] };
  });
  const winner = new Map<string, { index: number; score: number }>();
  raw.forEach(({ item, terms }, index) => {
    terms.forEach((term) => {
      const score = categoryAffinity(item.title, term);
      const key = semanticSkillKey(term);
      const current = winner.get(key);
      if (!current || score > current.score) winner.set(key, { index, score });
    });
  });
  return raw.map(({ item, terms }, index) => ({ item, terms: terms.filter((term) => winner.get(semanticSkillKey(term))?.index === index) }));
}

function targetGroupCount(itemCount: number, averageLength: number) {
  if (itemCount <= 3) return 1;
  if (itemCount <= 6) return averageLength <= 18 ? 2 : 3;
  if (itemCount <= 10) return averageLength <= 16 ? 3 : 4;
  if (itemCount <= 15) return averageLength <= 15 ? 4 : 6;
  return 6;
}

function layoutForGroups(groupCount: number, averageLength: number): SectionLayoutMode {
  if (groupCount <= 1) return 'list';
  if (groupCount <= 4) return 'grid-2x2';
  if (groupCount <= 6) return 'grid-2x3';
  if (averageLength <= 12 && groupCount >= 7) return 'grid-3x3';
  return 'grid-2x3';
}

function approximateBalanceScoreLengths(lengths: number[], groupCount: number) {
  if (groupCount <= 1 || lengths.length <= 1) return 100;
  const buckets = Array.from({ length: groupCount }, () => 0);
  for (const length of [...lengths].sort((a, b) => b - a)) {
    let target = 0;
    for (let i = 1; i < buckets.length; i += 1) if (buckets[i] < buckets[target]) target = i;
    buckets[target] += length + (buckets[target] ? 3 : 0);
  }
  const max = Math.max(...buckets, 1);
  const min = Math.min(...buckets);
  return Math.max(0, Math.round(100 - ((max - min) / max) * 100));
}

export function buildResumeLayoutPlan(resume: ResumeDocument, recommendations: ModuleRecommendation[] = []): ResumeLayoutPlan {
  const byId = new Map(recommendations.map((item) => [item.moduleId, item]));
  const sections: Record<string, SectionLayoutRecommendation> = {};

  for (const section of resume.sections) {
    if (!section.selected || !isSkillSection(section)) continue;
    const selected = directSelectedChildren(section);
    if (!selected.length) continue;

    const categories = categoryEntries(section);
    if (categories.length >= 2) {
      const extracted = dedupeCategoryTerms(categories, byId).filter((item) => item.terms.length >= 2);
      if (extracted.length >= Math.ceil(categories.length * 0.6)) {
        const lengths = extracted.map(({ item, terms }) => item.title.length + terms.join(' · ').length);
        const average = lengths.reduce((a, b) => a + b, 0) / lengths.length;
        const layout: SectionLayoutMode = extracted.length >= 3 ? 'row-first-2col' : 'list';
        sections[section.id] = {
          sectionId: section.id, layout, renderMode: 'native', groupCount: extracted.length,
          selectedCount: selected.length, averageLabelLength: Number(average.toFixed(1)),
          balanceScore: 100,
          reason: '技能组使用稳定的 Row-First 双列；保留每个 Skill 与每个 bullet 的独立显示，不自动拼接文本。',
        };
        continue;
      }
    }

    const compactable = selected.filter(isCompactableSkill);
    const averageLabelLength = compactable.length ? compactable.reduce((sum, item) => sum + displayText(item).length, 0) / compactable.length : 0;
    const compactRatio = compactable.length / selected.length;
    const strongOrRelated = compactable.filter((item) => {
      const rec = byId.get(item.id);
      return rec?.strongestEvidence === 'direct' || rec?.strongestEvidence === 'strong' || rec?.strongestEvidence === 'supporting';
    }).length;

    if (compactRatio >= 0.8 && compactable.length >= 4 && averageLabelLength <= 30) {
      const groups = targetGroupCount(compactable.length, averageLabelLength);
      const layout = layoutForGroups(groups, averageLabelLength);
      sections[section.id] = {
        sectionId: section.id, layout, renderMode: 'native', groupCount: groups, selectedCount: selected.length,
        averageLabelLength: Number(averageLabelLength.toFixed(1)),
        balanceScore: approximateBalanceScoreLengths(compactable.map((i) => displayText(i).length), groups),
        reason: strongOrRelated >= Math.ceil(compactable.length / 2) ? '短技能较多且多数与 JD 有关，建议仅调整网格位置；保持每个技能独立。' : '短技能较多，建议仅调整空间布局；是否启用组内短词双列仍由用户控制。',
      };
      continue;
    }

    sections[section.id] = { sectionId: section.id, layout: 'list', renderMode: 'native', groupCount: 0, selectedCount: selected.length, averageLabelLength: Number(averageLabelLength.toFixed(1)), balanceScore: 100, reason: '当前技能结构不适合安全压缩，保留原始展示。' };
  }
  return { sections };
}

export function buildRenderResume(
  resume: ResumeDocument,
  _plan: ResumeLayoutPlan,
  _activeLayouts: Record<string, SectionLayoutMode> = {},
  _recommendations: ModuleRecommendation[] = [],
): ResumeDocument {
  // Targeting is allowed to recommend/select content, but it must never mutate
  // the user's Skill order, merge Skill items, or synthesize a different render
  // tree. Layout is controlled exclusively by sectionLayouts in the editor/PDF.
  void _plan;
  void _activeLayouts;
  void _recommendations;
  return resume;
}

export function recommendedSectionLayouts(plan: ResumeLayoutPlan) {
  return Object.fromEntries(Object.values(plan.sections).map((item) => [item.sectionId, item.layout])) as Record<string, SectionLayoutMode>;
}
