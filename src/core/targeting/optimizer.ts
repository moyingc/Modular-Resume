import type { ResumeDocument, ResumeModule } from '../resume/types';
import type { LayoutPressureDiagnosis, ModuleRecommendation } from './types';

const DEFAULT_LAYOUT_UNITS_PER_PAGE = 30;
const TARGET_SAFETY_RATIO = 0.96;
const COMFORT_FILL_RATIO = 0.92;
const STOP_FILL_RATIO = 0.98;
const IDEAL_FILL_RATIO = 0.96;

export function pageBudgetFor(targetPages: '1' | '2' | 'none') {
  if (targetPages === 'none') return null;
  return Number(targetPages) * DEFAULT_LAYOUT_UNITS_PER_PAGE;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isTargetingSection(section: ResumeModule) {
  const title = normalize(section.title);
  return /(work experience|professional experience|employment|employment history|工作经历|工作经验|实习经历|project|projects|project experience|项目|项目经历)/.test(title);
}

function ownTextLength(module: ResumeModule) {
  const body = module.useCompactContent && module.compactContent?.trim()
    ? module.compactContent.trim()
    : (module.content ?? '');
  return `${module.title ?? ''} ${module.subtitle ?? ''} ${body}`.trim().length;
}

/**
 * Cheap layout-aware size proxy. It intentionally estimates visual line usage,
 * not semantic item count: a 250-character bullet must cost more than a short
 * skill or a one-line bullet.
 */
export function estimateModuleCost(module: ResumeModule) {
  const length = ownTextLength(module);
  if (module.kind === 'section') return 1.15;
  if (module.kind === 'entry' && (module.children?.length ?? 0) > 0) {
    return 1.15 + Math.max(0, Math.ceil(length / 95) - 1) * 0.65;
  }
  if (module.kind === 'skill') return Math.max(0.65, Math.ceil(Math.max(1, length) / 55) * 0.65);
  return Math.max(1, Math.ceil(Math.max(1, length) / 92));
}

function selectedLayoutCost(module: ResumeModule): number {
  if (!module.selected) return 0;
  const selectedChildren = (module.children ?? []).filter((child) => child.selected);
  if (module.kind === 'section') {
    return estimateModuleCost(module) + selectedChildren.reduce((sum, child) => sum + selectedLayoutCost(child), 0);
  }
  if (module.kind === 'entry' && selectedChildren.length > 0) {
    return estimateModuleCost(module) + selectedChildren.reduce((sum, child) => sum + selectedLayoutCost(child), 0);
  }
  return estimateModuleCost(module);
}

export function estimateSelectedLayoutCost(resume: ResumeDocument) {
  // Header/contact occupy stable vertical space even though they are not modules.
  return 2.75 + resume.sections.reduce((sum, section) => sum + selectedLayoutCost(section), 0);
}

/** Current selected visual cost used only to calibrate the already-available HTML preview. */
export function countSelectedContentUnits(resume: ResumeDocument) {
  return estimateSelectedLayoutCost(resume);
}

/**
 * B4.1 residual-page budget.
 * Calibrate approximate visual units/page from the existing preview, then
 * subtract content Targeting is not allowed to remove. This prevents the old
 * bug where Work/Project recommendations were given an entire page even when
 * Summary/Education/Skills/Training already consumed most of it.
 */
export function estimateContentSlots({
  targetPages,
  selectedContentUnits,
  previewPageCount,
  previewMaxUsagePercent,
  resume,
  pageSettings,
}: {
  targetPages: '1' | '2' | 'none';
  selectedContentUnits: number;
  previewPageCount: number;
  previewMaxUsagePercent: number;
  resume?: ResumeDocument;
  pageSettings?: { paperSize: 'a4' | 'letter'; bodyFontSize: number; density: 'compact' | 'standard' | 'relaxed'; marginPreset: 'compact' | 'standard' | 'wide' };
}) {
  if (targetPages === 'none') return null;
  const requestedPages = Number(targetPages);
  const safePreviewPages = Math.max(1, previewPageCount);
  const utilization = Math.min(1, Math.max(0.2, previewMaxUsagePercent / 100));

  const measuredTotal = Math.max(1, selectedContentUnits);
  const measuredPerPage = measuredTotal / safePreviewPages / utilization;
  // Preview calibration is authoritative because it already reflects the user's
  // actual font, margins, density and paper size. The setting-derived factor is
  // only a fallback when the preview is too small/noisy to calibrate reliably.
  const settingCapacityFactor = (() => {
    if (!pageSettings) return 1;
    const font = Math.pow(10.5 / Math.max(8, pageSettings.bodyFontSize), 1.12);
    const density = pageSettings.density === 'compact' ? 1.10 : pageSettings.density === 'relaxed' ? 0.90 : 1;
    const margin = pageSettings.marginPreset === 'compact' ? 1.10 : pageSettings.marginPreset === 'wide' ? 0.89 : 1;
    const paper = pageSettings.paperSize === 'letter' ? 0.97 : 1;
    return font * density * margin * paper;
  })();
  const unitsPerPage = Number.isFinite(measuredPerPage) && measuredTotal >= 6
    ? measuredPerPage
    : DEFAULT_LAYOUT_UNITS_PER_PAGE * settingCapacityFactor;

  if (!resume) {
    return Math.max(1, Math.round(unitsPerPage * requestedPages * TARGET_SAFETY_RATIO));
  }

  const targetTotal = unitsPerPage * requestedPages * TARGET_SAFETY_RATIO;

  // B4.5.1 reserves only genuinely high-priority/non-negotiable baseline space.
  // Lower-priority unlocked supplementary sections no longer pre-empt Strong
  // Work/Project evidence before the page optimizer gets a chance to compare them.
  const baselineForSection = (section: ResumeModule) => {
    if (!section.selected || isTargetingSection(section)) return 0;
    if (section.locked) return selectedLayoutCost(section);
    const title = normalize(section.title);
    if (/(education|academic|教育|学历)/.test(title)) {
      const selectedEntries = (section.children ?? []).filter((item) => item.selected);
      // Degree/school/date are core; long coursework bullets are compressible.
      return estimateModuleCost(section) + selectedEntries.reduce((sum, item) => sum + (item.kind === 'entry' ? estimateModuleCost(item) : 0), 0);
    }
    if (/(skill|technical skills|core competencies|技能|专业技能)/.test(title)) return compactSkillCost(section);
    if (/(summary|profile|objective|professional summary|职业概述|个人简介|简介)/.test(title)) return Math.min(selectedLayoutCost(section), 3.2);
    return 0;
  };
  const highPriorityBaseline = 2.75 + resume.sections.reduce((sum, section) => sum + baselineForSection(section), 0);

  return Math.max(0, Number((targetTotal - highPriorityBaseline).toFixed(2)));
}

function evidenceRank(item: ModuleRecommendation) {
  return item.strongestEvidence === 'direct' ? 4 : item.strongestEvidence === 'strong' ? 3 : item.strongestEvidence === 'supporting' ? 2 : item.strongestEvidence === 'weak' ? 1 : 0;
}

function buildCandidateList(recommendations: ModuleRecommendation[]) {
  return recommendations
    .filter((item) => item.disposition === 'auto-select' && !item.locked && item.kind === 'bullet')
    .sort((a, b) => evidenceRank(b) - evidenceRank(a) || Number(b.userPriority) - Number(a.userPriority) || b.evidenceValue - a.evidenceValue || b.score - a.score || a.estimatedCost - b.estimatedCost);
}

/**
 * B4.1: layout-aware evidence selection.
 * - budget is residual capacity after protected/non-targetable content
 * - first bullet under an entry pays the entry header/subtitle overhead
 * - already-open entries get a small cohesion bonus, avoiding many orphaned
 *   one-bullet jobs/projects and producing a more readable resume
 * - no iterative PDF generation
 */
export function optimizeRecommendations(
  recommendations: ModuleRecommendation[],
  targetPages: '1' | '2' | 'none',
  estimatedContentSlots?: number | null,
) {
  // Kept in the public signature for compatibility with callers; page fitting happens later.
  void targetPages;
  void estimatedContentSlots;
  // B4.4 deliberately separates recommendation quality from page fitting.
  // Page limits are applied later (B4.5); this pass answers only: "what is worth showing?"
  const candidates = buildCandidateList(recommendations)
    .filter((item) => item.evidenceValue > 0 && item.strongestEvidence !== 'weak');
  const selected: string[] = [];
  const covered = new Map<string, number>();
  const parentCounts = new Map<string, number>();
  const MAX_RECOMMENDATIONS = 12;

  const distinctiveRequirement = (label: string) => {
    const value = label.toLowerCase();
    if (/(workday|hris|docusign|populi|payroll|timekeep|recruit|onboard|human resources|admissions|post-secondary|benefits|rrsp|employment letters|contracts)/.test(value)) return 1.7;
    if (/(python|sql|react|cad|engineering|embedded|matlab|data quality|database)/.test(value)) return 1.45;
    if (/(administrative support|communication|customer service|organization)/.test(value)) return 0.8;
    return 1;
  };

  const remaining = [...candidates];
  while (remaining.length && selected.length < MAX_RECOMMENDATIONS) {
    let bestIndex = -1;
    let bestValue = -Infinity;

    for (let index = 0; index < remaining.length; index += 1) {
      const item = remaining[index];
      const parentKey = item.parentId ?? item.moduleId;
      const parentCount = parentCounts.get(parentKey) ?? 0;
      if (parentCount >= 5) continue;

      let novelty = 0;
      let repeated = 0;
      for (const evidence of item.evidence) {
        const previous = covered.get(evidence.requirementId) ?? 0;
        const specificity = distinctiveRequirement(evidence.requirementLabel);
        if (previous === 0) novelty += evidence.points * 6 * specificity;
        else if (evidence.points > previous) novelty += (evidence.points - previous) * 3.5 * specificity;
        else repeated += evidence.points * 2.2 * specificity;
      }

      // Formal work evidence gets precedence over projects when semantic value is similar.
      // Projects remain competitive for technical roles because distinctive technical evidence
      // still earns a large novelty bonus above.
      const sectionBias = item.sectionType === 'experience' ? 5.0 : item.sectionType === 'project' ? 2.2 : 0;
      const strengthBonus = evidenceRank(item) * 2.4;
      const parentDiversityPenalty = parentCount * 1.35;
      const userIntentBonus = item.userPriority ? 7.5 : 0;
      const value = novelty + item.evidenceValue * 0.38 + sectionBias + strengthBonus + userIntentBonus - repeated * 0.72 - parentDiversityPenalty;

      if (value > bestValue) { bestValue = value; bestIndex = index; }
    }

    if (bestIndex < 0 || bestValue <= 0) break;
    const [chosen] = remaining.splice(bestIndex, 1);
    selected.push(chosen.moduleId);
    const parentKey = chosen.parentId ?? chosen.moduleId;
    parentCounts.set(parentKey, (parentCounts.get(parentKey) ?? 0) + 1);
    for (const evidence of chosen.evidence) {
      covered.set(evidence.requirementId, Math.max(covered.get(evidence.requirementId) ?? 0, evidence.points));
    }
  }

  return selected;
}


export type PageOptimizationResult = {
  selectedIds: string[];
  tiers: Record<string, 'core' | 'strong' | 'supporting' | 'filler'>;
  estimatedUsage: number;
  capacity: number | null;
  coreOverflow: boolean;
};

function isDistinctiveEvidence(label: string) {
  return /(workday|hris|docusign|populi|payroll|timekeep|recruit|onboard|human resources|admissions|post-secondary|benefits|rrsp|employment|database|data quality|confidential|reception|front desk|mail|courier|python|sql|react|cad|engineering|embedded|matlab)/i.test(label);
}

function classifyRecommendationTier(item: ModuleRecommendation, qualityIds: Set<string>) {
  const distinctiveStrong = item.evidence.some((e) => e.points >= 3 && isDistinctiveEvidence(e.requirementLabel));
  if (qualityIds.has(item.moduleId) && (item.strongestEvidence === 'direct' || distinctiveStrong)) return 'core' as const;
  if (qualityIds.has(item.moduleId) && item.strongestEvidence === 'strong') return 'strong' as const;
  if (qualityIds.has(item.moduleId) || item.strongestEvidence === 'supporting') return 'supporting' as const;
  return 'filler' as const;
}

/**
 * B4.5 page fitter. B4.4 owns semantic importance; this layer may only remove
 * lower tiers when a page target is active. Core evidence is never removed to
 * fake a fit. Entry-header overhead is paid once per opened job/project.
 */
export function fitRecommendationsToPageBudget(
  recommendations: ModuleRecommendation[],
  qualityRecommendationIds: string[],
  targetPages: '1' | '2' | 'none',
  estimatedCapacity?: number | null,
): PageOptimizationResult {
  const quality = new Set(qualityRecommendationIds);
  const recById = new Map(recommendations.map((r) => [r.moduleId, r]));
  const tiers: Record<string, 'core' | 'strong' | 'supporting' | 'filler'> = {};
  for (const rec of recommendations) tiers[rec.moduleId] = classifyRecommendationTier(rec, quality);

  if (targetPages === 'none' || estimatedCapacity == null) {
    const usage = qualityRecommendationIds.reduce((sum, id) => sum + (recById.get(id)?.estimatedCost ?? 0), 0);
    return { selectedIds: [...qualityRecommendationIds], tiers, estimatedUsage: Number(usage.toFixed(2)), capacity: null, coreOverflow: false };
  }

  const capacity = Math.max(0, estimatedCapacity);
  const softTarget = capacity * STOP_FILL_RATIO;
  const comfortTarget = capacity * COMFORT_FILL_RATIO;
  const selected: string[] = [];
  const selectedSet = new Set<string>();
  const openedParents = new Set<string>();
  const covered = new Map<string, number>();
  let usage = 0;

  const entryOverhead = (item: ModuleRecommendation) => {
    const parentId = item.parentId;
    if (!parentId || openedParents.has(parentId)) return 0;
    return recById.get(parentId)?.estimatedCost ?? 1.15;
  };
  const marginalCost = (item: ModuleRecommendation) => item.estimatedCost + entryOverhead(item);
  const add = (item: ModuleRecommendation) => {
    if (selectedSet.has(item.moduleId)) return;
    usage += marginalCost(item);
    selected.push(item.moduleId); selectedSet.add(item.moduleId);
    if (item.parentId) openedParents.add(item.parentId);
    for (const e of item.evidence) covered.set(e.requirementId, Math.max(covered.get(e.requirementId) ?? 0, e.points));
  };

  // Preserve a diverse core first. Duplicated core evidence has diminishing
  // returns, but is still retained when it covers a stronger requirement.
  const core = qualityRecommendationIds.map((id) => recById.get(id)).filter((x): x is ModuleRecommendation => Boolean(x) && tiers[x!.moduleId] === 'core');
  core.sort((a,b) => evidenceRank(b)-evidenceRank(a) || Number(b.userPriority)-Number(a.userPriority) || b.evidenceValue-a.evidenceValue || a.estimatedCost-b.estimatedCost);
  for (const item of core) {
    const addsNew = item.evidence.some((e) => e.points >= 3 && (covered.get(e.requirementId) ?? 0) < e.points);
    if (addsNew || selected.length < 4) add(item);
  }
  const coreOverflow = usage > softTarget && selected.length > 0;

  const tierOrder = ['strong','supporting','filler'] as const;
  for (const tier of tierOrder) {
    const pool = recommendations.filter((r) => !r.locked && r.disposition === 'auto-select' && r.kind === 'bullet' && tiers[r.moduleId] === tier && (quality.has(r.moduleId) || tier === 'filler'));
    while (pool.length) {
      let bestIndex = -1, bestScore = -Infinity;
      for (let i=0;i<pool.length;i++) {
        const item = pool[i];
        if (selectedSet.has(item.moduleId)) continue;
        const cost = marginalCost(item);
        if (usage + cost > softTarget) continue;
        let novelty = 0, duplicate = 0;
        for (const e of item.evidence) {
          const prev = covered.get(e.requirementId) ?? 0;
          if (e.points > prev) novelty += (e.points - prev) * (isDistinctiveEvidence(e.requirementLabel) ? 4.5 : 3);
          else duplicate += e.points;
        }
        const cohesion = item.parentId && openedParents.has(item.parentId) ? 2.2 : 0;
        const section = item.sectionType === 'experience' ? 2.2 : item.sectionType === 'project' ? 1 : 0;
        const userIntent = item.userPriority ? 3.5 : 0;
        const score = novelty + item.evidenceValue * .18 + cohesion + section + userIntent - duplicate * .8 - cost * .45;
        if (score > bestScore) { bestScore = score; bestIndex = i; }
      }
      if (bestIndex < 0) break;
      const [item] = pool.splice(bestIndex,1);
      // Filler is only used when the page is visibly under-filled.
      if (tier === 'filler' && usage >= comfortTarget) break;
      add(item);
    }
  }

  return { selectedIds: selected, tiers, estimatedUsage: Number(usage.toFixed(2)), capacity: Number(capacity.toFixed(2)), coreOverflow };
}


function selectedSectionCost(section: ResumeModule) {
  return selectedLayoutCost(section);
}

/**
 * One-pass post-layout diagnosis using the existing HTML preview metrics.
 * It does not regenerate PDFs and never auto-removes protected content.
 */
export function diagnoseLayoutPressure({
  resume,
  recommendations,
  targetPages,
  actualPages,
  usageByPage,
}: {
  resume: ResumeDocument;
  recommendations: ModuleRecommendation[];
  targetPages: '1' | '2' | 'none';
  actualPages: number;
  usageByPage: number[];
}): LayoutPressureDiagnosis {
  if (targetPages === 'none') return { severity: 'none', message: '', lastPageUsagePercent: usageByPage.length ? usageByPage[usageByPage.length - 1] : 0, suggestions: [] };
  const target = Number(targetPages);
  const last = usageByPage.length ? usageByPage[usageByPage.length - 1] : 0;
  const overflow = actualPages > target;
  const nearFit = overflow && last <= 38;
  if (!overflow) return { severity: 'none', message: '', lastPageUsagePercent: last, suggestions: [] };

  const recById = new Map(recommendations.map((item) => [item.moduleId, item]));
  const candidates = resume.sections
    .filter((section) => section.selected && !section.locked)
    .map((section) => {
      const rec = recById.get(section.id);
      const type = rec?.sectionType ?? 'other';
      const cost = selectedSectionCost(section);
      let priority = 3;
      if (type === 'experience' || type === 'project') priority = 0;
      else if (type === 'education' || type === 'skills') priority = 1;
      else if (type === 'summary' || type === 'training') priority = 2;
      const title = section.title;
      let reason = '该区域未固定，可人工检查是否需要完整保留。';
      let action: 'compact-skills' | 'review-module' | 'review-section' = 'review-section';
      if (type === 'skills') { reason = '优先使用 Compact Skills，保留真实技能但减少描述占用。'; action = 'compact-skills'; }
      else if (type === 'training') reason = 'Training 通常低于直接 Work/Project evidence；如非岗位硬要求，可人工取消低相关条目。';
      else if (type === 'education') reason = '保留学历核心信息；可人工检查课程/作业类长 bullet 是否必须出现在目标版本。';
      else if (type === 'summary') reason = 'Summary 应简短；如果已由经历充分证明，可人工压缩描述。';
      else if (type === 'other') reason = '补充区域不能挤掉更强的 Work/Project evidence；建议检查低优先级内容。';
      return { moduleId: section.id, title, reason, estimatedSavings: Number(cost.toFixed(1)), action, priority };
    })
    .filter((item) => item.priority > 0)
    .sort((a, b) => a.priority - b.priority || b.estimatedSavings - a.estimatedSavings)
    .slice(0, 4)
    .map((item) => ({
      moduleId: item.moduleId,
      title: item.title,
      reason: item.reason,
      estimatedSavings: item.estimatedSavings,
      action: item.action,
    }));

  return {
    severity: nearFit ? 'near-fit' : 'overflow',
    message: nearFit
      ? `目标 ${target} 页，但最后一页仅使用约 ${last}%。这是 near-fit overflow：优先压缩 Skills 或人工取消低优先级未固定内容，不应删除核心 Work/Project evidence。`
      : `当前为 ${actualPages} 页，超过 ${target} 页目标。系统保留核心 Work/Project evidence，并建议人工检查未固定的辅助区域。`,
    lastPageUsagePercent: last,
    suggestions: candidates,
  };
}


export type WholeResumeOptimizationResult = {
  resume: ResumeDocument;
  estimatedUsage: number;
  targetCapacity: number | null;
  removedModuleIds: string[];
  cannotFitWithoutCoreOrFixed: boolean;
};

function sectionPagePriority(section: ResumeModule) {
  const title = normalize(section.title);
  if (isTargetingSection(section)) return 1;
  if (/(education|academic|教育|学历)/.test(title)) return 2;
  if (/(skill|technical skills|core competencies|技能|专业技能)/.test(title)) return 3;
  if (/(training|certification|certificate|licenses|培训|证书|认证)/.test(title)) return 5;
  if (/(additional experience|volunteer|其他经历|志愿)/.test(title)) return 6;
  if (/(additional capabilities|additional skills|other capabilities|补充能力|其他能力)/.test(title)) return 7;
  if (/(summary|profile|objective|professional summary|职业概述|个人简介|简介)/.test(title)) return 4;
  return 6;
}

function compactSkillCost(section: ResumeModule) {
  const selected = (section.children ?? []).filter((item) => item.selected);
  if (!selected.length) return estimateModuleCost(section);
  // Compact Skills are rendered as short category/inline groups. Do not charge
  // the raw long-description cost when page planning has already chosen compact layout.
  const categories = selected.filter((item) => (item.children ?? []).some((child) => child.selected));
  if (categories.length >= 2) return estimateModuleCost(section) + categories.length * 1.15;
  return estimateModuleCost(section) + Math.max(1, Math.ceil(selected.length / 4)) * 0.9;
}

function selectedCostForWholePlan(section: ResumeModule) {
  if (!section.selected) return 0;
  const title = normalize(section.title);
  if (/(skill|technical skills|core competencies|技能|专业技能)/.test(title)) return compactSkillCost(section);
  return selectedLayoutCost(section);
}

function moduleEvidenceValue(id: string, byId: Map<string, ModuleRecommendation>) {
  return byId.get(id)?.evidenceValue ?? 0;
}

/**
 * B4.5.1 whole-resume page policy.
 * Semantic ranking remains owned by B4.4/B4.5. This pass only removes unlocked,
 * lower-priority supplementary content after Work/Project selection has been applied.
 * Fixed nodes and core target evidence are never removed.
 *
 * Priority: Core -> Strong distinctive -> Education core -> Compact Skills ->
 * Supporting -> Relevant Training -> Additional Experience -> Additional Capabilities -> Filler.
 */
export function optimizeWholeResumeForPageTarget({
  resume,
  recommendations,
  targetPages,
  calibratedUnitsPerPage,
  recommendationTiers,
  measureResume,
}: {
  resume: ResumeDocument;
  recommendations: ModuleRecommendation[];
  targetPages: '1' | '2' | 'none';
  calibratedUnitsPerPage?: number | null;
  recommendationTiers?: Record<string, 'core' | 'strong' | 'supporting' | 'filler'>;
  /** Final-render measurement callback. When supplied, this is the single source of truth for page cost. */
  measureResume?: (resume: ResumeDocument) => number;
}): WholeResumeOptimizationResult {
  if (targetPages === 'none') return { resume, estimatedUsage: measureResume ? measureResume(resume) : estimateSelectedLayoutCost(resume), targetCapacity: null, removedModuleIds: [], cannotFitWithoutCoreOrFixed: false };
  const byId = new Map(recommendations.map((item) => [item.moduleId, item]));
  const perPage = measureResume
    ? Math.max(100, calibratedUnitsPerPage ?? DEFAULT_LAYOUT_UNITS_PER_PAGE)
    : Math.max(20, calibratedUnitsPerPage ?? DEFAULT_LAYOUT_UNITS_PER_PAGE);
  // Aim for a nearly full page rather than the mathematical edge. 96% leaves a
  // small renderer/model tolerance while still visibly filling the page.
  const targetCapacity = perPage * Number(targetPages) * IDEAL_FILL_RATIO;
  let next = JSON.parse(JSON.stringify(resume)) as ResumeDocument;
  const removed: string[] = [];

  const usage = () => measureResume
    ? measureResume(next)
    : 2.75 + next.sections.reduce((sum, section) => sum + selectedCostForWholePlan(section), 0);
  type Candidate = {
    id: string;
    sectionIndex: number;
    path: number[];
    priority: number;
    evidence: number;
    cost: number;
    tier: 'core' | 'strong' | 'supporting' | 'filler' | 'supplementary';
    userPriority: boolean;
    parentId: string | null;
  };
  const candidates: Candidate[] = [];
  const collect = (nodes: ResumeModule[], sectionIndex: number, path: number[], inheritedLocked: boolean, sectionPriority: number) => {
    nodes.forEach((node, index) => {
      const effectiveLocked = inheritedLocked || Boolean(node.locked);
      const p = [...path, index];
      const rec = byId.get(node.id);
      const hasSelectedChildren = (node.children ?? []).some((child) => child.selected);
      if (node.selected && !effectiveLocked && node.kind !== 'section') {
        // Experience/Project structural parents are never page-pruning candidates.
        // Their selected evidence leaves determine whether the parent renders.
        const structuralTargetParent = node.kind === 'entry' && (rec?.sectionType === 'experience' || rec?.sectionType === 'project');
        if (structuralTargetParent) {
          if (node.children) collect(node.children, sectionIndex, p, effectiveLocked, sectionPriority);
          return;
        }
        // Work/Project auto-select nodes are already governed by evidence tiers and
        // must not be silently removed here. Skills are compressed, not deleted.
        const tier = recommendationTiers?.[node.id];
        const targetEvidence = rec?.disposition === 'auto-select' || sectionPriority === 1;
        const protectedCore = targetEvidence && tier === 'core';
        const skill = rec?.sectionType === 'skills' || node.kind === 'skill' || sectionPriority === 3;
        const educationCore = (rec?.sectionType === 'education' || sectionPriority === 2) && node.kind === 'entry';
        const protectedSummary = rec?.sectionType === 'summary' || sectionPriority === 4;
        if (!protectedCore && !skill && !educationCore && !protectedSummary) {
          let priority = sectionPriority;
          // Work/Project evidence participates in page convergence by tier.
          // Higher numeric priority exits earlier.
          if (targetEvidence) {
            priority = tier === 'filler' ? 10 : tier === 'supporting' ? 7 : tier === 'strong' ? 3 : 2;
          }
          // Education detail bullets may leave before supporting evidence; the degree entry remains.
          if (rec?.sectionType === 'education' || sectionPriority === 2) priority = 4;
          // Relevant training stays above Additional Experience; irrelevant training leaves earlier.
          if (rec?.sectionType === 'training') priority = rec.evidenceValue > 0 ? 5 : 8;
          candidates.push({
            id: node.id,
            sectionIndex,
            path: p,
            priority,
            evidence: moduleEvidenceValue(node.id, byId),
            cost: hasSelectedChildren ? selectedLayoutCost(node) : estimateModuleCost(node),
            tier: targetEvidence ? (tier ?? 'supporting') : 'supplementary',
            userPriority: Boolean(rec?.userPriority),
            parentId: rec?.parentId ?? null,
          });
        }
      }
      if (node.children) collect(node.children, sectionIndex, p, effectiveLocked, sectionPriority);
    });
  };
  next.sections.forEach((section, sectionIndex) => collect(section.children ?? [], sectionIndex, [], Boolean(section.locked), sectionPagePriority(section)));

  // Semantic preservation gate:
  // page efficiency is NEVER allowed to outrank evidence tier.
  // Within a tier, user priority and entry cohesion win before physical cost.
  const semanticExitRank = {
    filler: 50,
    supplementary: 40,
    supporting: 30,
    strong: 20,
    core: -1000,
  } as const;

  const highValueSiblingCounts = new Map<string, number>();
  for (const candidate of candidates) {
    if (!candidate.parentId || (candidate.tier !== 'core' && candidate.tier !== 'strong')) continue;
    highValueSiblingCounts.set(candidate.parentId, (highValueSiblingCounts.get(candidate.parentId) ?? 0) + 1);
  }
  const cohesion = (candidate: Candidate) =>
    candidate.parentId ? Math.max(0, (highValueSiblingCounts.get(candidate.parentId) ?? 0) - 1) : 0;

  candidates.sort((a, b) =>
    semanticExitRank[b.tier] - semanticExitRank[a.tier] ||
    // Supplementary section policy still decides among non-target content.
    b.priority - a.priority ||
    Number(a.userPriority) - Number(b.userPriority) ||
    cohesion(a) - cohesion(b) ||
    a.evidence - b.evidence ||
    b.cost - a.cost
  );

  const setSelected = (candidate: Candidate, selected: boolean) => {
    let nodes = next.sections[candidate.sectionIndex].children ?? [];
    let node: ResumeModule | undefined;
    for (let depth = 0; depth < candidate.path.length; depth += 1) {
      node = nodes[candidate.path[depth]];
      if (!node) return;
      if (depth < candidate.path.length - 1) nodes = node.children ?? [];
    }
    if (node) node.selected = selected;
  };

  // Near-fit first uses user-approved compact variants. This is loss-controlled:
  // the optimizer never invents or truncates text; it may only switch to a compactContent
  // explicitly stored on the module by the user.
  const applyCompactVariants = (nodes: ResumeModule[], inheritedLocked = false) => {
    for (const node of nodes) {
      const locked = inheritedLocked || Boolean(node.locked);
      if (usage() <= targetCapacity) return;
      if (!locked && node.selected && node.kind === 'bullet' && node.compactContent?.trim() && !node.useCompactContent) {
        node.useCompactContent = true;
      }
      if (node.children) applyCompactVariants(node.children, locked);
    }
  };
  applyCompactVariants(next.sections);

  for (const candidate of candidates) {
    if (usage() <= targetCapacity) break;
    setSelected(candidate, false);
    removed.push(candidate.id);
  }

  // Remove unlocked structural shells created by supplementary pruning only.
  const clean = (nodes: ResumeModule[], inheritedLocked = false): ResumeModule[] => nodes.map((node) => {
    const locked = inheritedLocked || Boolean(node.locked);
    const children = node.children ? clean(node.children, locked) : undefined;
    if (locked) return { ...node, children };
    const selectedChildren = (children ?? []).some((child) => child.selected);
    if ((node.kind === 'entry' || node.kind === 'section') && (node.children?.length ?? 0) > 0 && !selectedChildren) {
      const rec = byId.get(node.id);
      if (rec?.sectionType === 'training' || rec?.sectionType === 'other') return { ...node, selected: false, children };
    }
    return { ...node, children };
  });
  next = { ...next, sections: clean(next.sections) };

  // Dynamic refill: pruning may create useful space. Re-open the highest-value
  // B4.4 candidates that fit without crossing the 96% target. This does not
  // redefine evidence importance; it consumes the tier map produced upstream.
  const refillFloor = perPage * Number(targetPages) * COMFORT_FILL_RATIO;
  const findAndSelect = (id: string, selected: boolean) => {
    let found = false;
    const walk = (nodes: ResumeModule[]): boolean => {
      for (const node of nodes) {
        if (node.id === id) { node.selected = selected; return true; }
        if (node.children && walk(node.children)) {
          if (selected && (node.kind === 'entry' || node.kind === 'section')) node.selected = true;
          return true;
        }
      }
      return false;
    };
    found = walk(next.sections);
    return found;
  };
  const isSelected = (id: string) => {
    let result = false;
    const walk = (nodes: ResumeModule[]) => {
      for (const node of nodes) {
        if (node.id === id) { result = node.selected; return; }
        if (node.children) walk(node.children);
        if (result) return;
      }
    };
    walk(next.sections);
    return result;
  };

  if (usage() < refillFloor) {
    const tierRank = { core: 4, strong: 3, supporting: 2, filler: 1 } as const;
    const refill = recommendations
      .filter((r) => !r.locked && r.disposition === 'auto-select' && r.kind === 'bullet' && r.evidenceValue > 0 && !isSelected(r.moduleId))
      .map((r) => ({ r, tier: recommendationTiers?.[r.moduleId] ?? (r.strongestEvidence === 'direct' ? 'core' : r.strongestEvidence === 'strong' ? 'strong' : r.strongestEvidence === 'supporting' ? 'supporting' : 'filler') }))
      .filter((x) => x.tier !== 'filler' || usage() < refillFloor * 0.90)
      .sort((a,b) => {
        const tierDelta = tierRank[b.tier] - tierRank[a.tier];
        if (tierDelta) return tierDelta;
        const priorityDelta = Number(b.r.userPriority) - Number(a.r.userPriority);
        if (priorityDelta) return priorityDelta;
        const parentHighValueCount = (r: ModuleRecommendation) => recommendations.filter((x) =>
          x.parentId === r.parentId &&
          (recommendationTiers?.[x.moduleId] === 'core' || recommendationTiers?.[x.moduleId] === 'strong')
        ).length;
        const cohesionDelta = parentHighValueCount(b.r) - parentHighValueCount(a.r);
        if (cohesionDelta) return cohesionDelta;
        return b.r.evidenceValue - a.r.evidenceValue || a.r.estimatedCost - b.r.estimatedCost;
      });

    for (const { r } of refill) {
      if (usage() >= refillFloor) break;
      const before = usage();
      const snapshot = JSON.parse(JSON.stringify(next)) as ResumeDocument;
      if (!findAndSelect(r.moduleId, true)) continue;
      const after = usage();
      if (after > targetCapacity || after <= before) next = snapshot;
    }
  }

  const finalUsage = usage();
  return {
    resume: next,
    estimatedUsage: Number(finalUsage.toFixed(2)),
    targetCapacity: Number(targetCapacity.toFixed(2)),
    removedModuleIds: removed,
    cannotFitWithoutCoreOrFixed: finalUsage > targetCapacity,
  };
}

/**
 * Apply preselection only inside Work Experience / Projects.
 * Structural target parents now strictly follow selected descendants. This
 * removes the B4 "job/project heading with no bullets" failure.
 */
export function applyRecommendedSelection(
  resume: ResumeDocument,
  recommendationIds: string[],
  recommendationCandidateIds: string[] = recommendationIds,
) {
  const selectedIds = new Set(recommendationIds);
  const candidateIds = new Set(recommendationCandidateIds);

  const walk = (nodes: ResumeModule[], inheritedLocked = false): ResumeModule[] => nodes.map((node) => {
    const effectiveLocked = inheritedLocked || Boolean(node.locked);
    const children = node.children ? walk(node.children, effectiveLocked) : undefined;
    if (effectiveLocked) return { ...node, children };

    const isCandidate = candidateIds.has(node.id);
    if (isCandidate) return { ...node, selected: selectedIds.has(node.id), children };

    const hasCandidateDescendant = (items?: ResumeModule[]): boolean => (items ?? []).some((child) => candidateIds.has(child.id) || hasCandidateDescendant(child.children));
    const childSelected = children?.some((child) => child.selected) ?? false;
    const structuralTargetParent = (node.kind === 'section' || node.kind === 'entry') && hasCandidateDescendant(node.children);

    if (structuralTargetParent) {
      // Do not retain a previously checked structural shell when all of its
      // recommended content was removed.
      return { ...node, selected: childSelected, children };
    }

    return { ...node, children };
  });

  return { ...resume, sections: walk(resume.sections) };
}


/** Apply the V2 Professional Summary decision independently from Work/Project.
 * Summary candidates are advisory during scoring, but Apply Targeting should not
 * leave every imported summary variant selected. Only the V2 primary summary is
 * preselected; users can still manually choose any alternative afterwards.
 */
export function applySummaryRecommendationSelection(
  resume: ResumeDocument,
  primaryId: string | null,
  candidateIds: string[],
  generated?: {
    text?: string;
    sourceIds?: string[];
    sourceTexts?: string[];
    sourceReferences?: Array<{ id: string; text: string; similarity: number; role: 'primary' | 'secondary' }>;
    selectedEvidenceIds?: string[];
    generationMode?: 'single-rewrite' | 'multi-reference';
    jobFamilyIds?: string[];
    architectureId?: string;
    patternIds?: string[];
  },
) {
  if (!candidateIds.length) return resume;
  const candidates = new Set(candidateIds);
  const generatedText = generated?.text?.trim() ?? '';

  const findNode = (nodes: ResumeModule[], id: string | null): ResumeModule | null => {
    if (!id) return null;
    for (const node of nodes) {
      if (node.id === id) return node;
      const nested = findNode(node.children ?? [], id);
      if (nested) return nested;
    }
    return null;
  };

  const primaryNode = findNode(resume.sections, primaryId);
  const previousText = (primaryNode?.content ?? primaryNode?.title ?? '').trim();
  const refs = generated?.sourceReferences ?? (generated?.sourceIds ?? (primaryId ? [primaryId] : [])).map((id,index)=>({
    id,
    text:(generated?.sourceTexts ?? [previousText])[index] ?? '',
    similarity:index===0?1:0,
    role:(index===0?'primary':'secondary') as 'primary' | 'secondary',
  }));

  const revision = generatedText ? {
    engineVersion: 'summary-v2-v9.5' as const,
    mode: generated?.generationMode ?? (refs.length>1?'multi-reference':'single-rewrite'),
    action: 'generate-apply' as const,
    sourceIds: refs.map((ref)=>ref.id),
    sourceTexts: refs.map((ref)=>ref.text),
    sourceReferences: refs,
    primarySummaryId: refs.find((ref)=>ref.role==='primary')?.id ?? null,
    secondarySummaryIds: refs.filter((ref)=>ref.role==='secondary').map((ref)=>ref.id),
    selectedEvidenceIds: generated?.selectedEvidenceIds ?? [],
    jobFamilyIds: generated?.jobFamilyIds ?? [],
    architectureId: generated?.architectureId ?? 'A01',
    patternIds: generated?.patternIds ?? [],
    previousText,
    generatedText,
    changedFields: previousText===generatedText?[]:['content'],
    changeReason: 'V9.5 stores the applied V2 candidate as the newest Summary item while preserving historical Summary entries. Recomposition is evidence-grounded and removes repeated/tag-like phrasing.',
    previousWordCount: previousText.split(/\s+/).filter(Boolean).length,
    wordCount: generatedText.split(/\s+/).filter(Boolean).length,
    generatedAt: new Date().toISOString(),
  } : null;

  const hasSummaryCandidate = (items?: ResumeModule[]): boolean =>
    (items ?? []).some((child) => candidates.has(child.id) || hasSummaryCandidate(child.children));

  const makeGeneratedSummary = (history: ResumeModule['summaryRevisionHistory'] = []): ResumeModule => ({
    id: `summary-v2-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    kind: 'bullet',
    title: generatedText,
    content: generatedText,
    selected: true,
    relevance: 100,
    summaryRevision: revision ?? undefined,
    summaryRevisionHistory: revision ? [...history, revision] : history,
  });

  const walk = (nodes: ResumeModule[], inheritedLocked = false): ResumeModule[] => nodes.map((node) => {
    const effectiveLocked = inheritedLocked || Boolean(node.locked);

    // Summary candidate leaves are historical source material after V2 Apply.
    // Preserve their text and metadata; only the new V2 item becomes selected.
    if (candidates.has(node.id)) {
      if (!generatedText) {
        const selected = primaryId !== null && node.id === primaryId;
        return { ...node, selected };
      }
      return { ...node, selected: false };
    }

    const children = node.children ? walk(node.children, effectiveLocked) : undefined;

    if (node.kind === 'section' && hasSummaryCandidate(node.children) && generatedText) {
      const existingGenerated = (children ?? []).find((child) =>
        (child.content ?? child.title).trim() === generatedText
        && child.summaryRevision?.engineVersion?.startsWith('summary-v2-')
      );
      const others = (children ?? []).filter((child) => child.id !== existingGenerated?.id);
      const newest = existingGenerated
        ? {
            ...existingGenerated,
            selected: true,
            title: generatedText,
            content: generatedText,
            summaryRevision: revision ?? existingGenerated.summaryRevision,
            summaryRevisionHistory: revision
              ? [...(existingGenerated.summaryRevisionHistory ?? []), revision]
              : existingGenerated.summaryRevisionHistory,
          }
        : makeGeneratedSummary(primaryNode?.summaryRevisionHistory ?? []);
      return { ...node, selected: true, children: [newest, ...others] };
    }

    if (effectiveLocked) return { ...node, children };
    return { ...node, children };
  });

  return { ...resume, sections: walk(resume.sections) };
}

/** Keep top-level order stable; only targetable unlocked siblings are sorted. */
export function applyRecommendationScores(resume: ResumeDocument, recommendations: ModuleRecommendation[]) {
  const byId = new Map(recommendations.map((item) => [item.moduleId, item]));
  const walk = (nodes: ResumeModule[], depth: number): ResumeModule[] => {
    const prepared = nodes.map((node, originalIndex) => ({
      node: {
        ...node,
        relevance: byId.get(node.id)?.score ?? node.relevance,
        children: node.children ? walk(node.children, depth + 1) : undefined,
      },
      originalIndex,
      rec: byId.get(node.id),
    }));
    if (depth === 0) return prepared.map((item) => item.node);
    return prepared.sort((a, b) => {
      const aTarget = a.rec?.disposition === 'auto-select' && !a.rec.locked;
      const bTarget = b.rec?.disposition === 'auto-select' && !b.rec.locked;
      if (!aTarget || !bTarget) return a.originalIndex - b.originalIndex;
      return ((b.rec?.score ?? 0) - (a.rec?.score ?? 0)) || (a.originalIndex - b.originalIndex);
    }).map((item) => item.node);
  };
  return { ...resume, sections: walk(resume.sections, 0) };
}
