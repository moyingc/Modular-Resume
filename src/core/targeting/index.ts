import { extractJobRequirements } from './jdParser';
import { buildModuleAttention, scoreResumeModules } from './scorer';
import { fitRecommendationsToPageBudget, pageBudgetFor } from './optimizer';
import { buildRecommendationEngineV2 } from './recommendationV2';
import type { EvidenceStrength, TargetingAnalysis, TargetingInput } from './types';

export * from './types';
export * from './optimizer';
export * from './layoutPlanner';
export * from './renderMetrics';
export { extractJobRequirements, normalizeForMatch } from './jdParser';
export { classifySection } from './scorer';
export * from './recommendationV2';

const evidenceRank: Record<EvidenceStrength, number> = { none: 0, weak: 1, supporting: 2, strong: 3, direct: 4 };

function fingerprintJobDescription(value: string) {
  const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `jd-${(hash >>> 0).toString(16)}-${normalized.length}`;
}

export function analyzeTargeting({ jobDescription, resume, options }: TargetingInput): TargetingAnalysis {
  const requirements = extractJobRequirements(jobDescription, options.maxRequirements ?? 64, options.conceptPackIds);
  const initialRecommendations = scoreResumeModules(resume, requirements);
  const bestByRequirement = new Map<string, EvidenceStrength>();
  const weakModuleCount = new Map<string, number>();
  const officeApps = new Set<string>();

  for (const recommendation of initialRecommendations) {
    for (const evidence of recommendation.evidence) {
      const previous = bestByRequirement.get(evidence.requirementId) ?? 'none';
      if (evidenceRank[evidence.strength] > evidenceRank[previous]) bestByRequirement.set(evidence.requirementId, evidence.strength);
      if (evidence.strength === 'weak') weakModuleCount.set(evidence.requirementId, (weakModuleCount.get(evidence.requirementId) ?? 0) + 1);
      if (evidence.requirementId === 'req-office') {
        for (const term of evidence.matchedTerms) {
          for (const app of ['word','excel','outlook','powerpoint']) if (term.includes(app)) officeApps.add(app);
        }
      }
    }
  }

  const withMatches = requirements.map((requirement) => {
    let coverage = bestByRequirement.get(requirement.id) ?? 'none';
    // Microsoft Office may be evidenced across separate modules, but repeated
    // mentions of the same application (e.g. Excel) do not prove the whole suite.
    if (requirement.label === 'Microsoft Office' && coverage === 'weak' && officeApps.size >= 2) coverage = 'strong';
    return { ...requirement, coverage, matched: evidenceRank[coverage] >= evidenceRank.strong };
  });

  const recommendations = scoreResumeModules(resume, withMatches);
  const engineV2 = buildRecommendationEngineV2(resume, withMatches, recommendations, jobDescription, options.summaryVariant ?? 0);
  // V2 chooses semantic evidence first. Page constraints are deliberately applied afterwards.
  const qualityRecommendationIds = engineV2.evidence.selectedIds;
  const pagePlan = fitRecommendationsToPageBudget(
    recommendations,
    qualityRecommendationIds,
    options.settings.targetPages,
    options.estimatedContentSlots,
  );
  // Selection candidates are evidence leaves. Entry/section recommendations are
  // structural/scoring context only; selecting a parent without a visible child
  // caused the historical "recommended Project with an empty body" bug.
  const recommendationCandidateIds = recommendations
    .filter((item) => item.disposition === 'auto-select' && !item.locked && item.kind === 'bullet')
    .map((item) => item.moduleId);
  const candidateSet = new Set(recommendationCandidateIds);
  const selectedRecommendationIds = pagePlan.selectedIds.filter((id) => candidateSet.has(id));
  const matched = withMatches.filter((item) => item.matched).length;
  const missingRequirements = withMatches.filter((item) => item.coverage === 'none');
  const partialRequirements = withMatches.filter((item) => item.coverage === 'weak' || item.coverage === 'supporting');
  const moduleAttention = buildModuleAttention(resume, withMatches, recommendations);

  // Summary is a section-specific decision in V2. The generic scorer can mark
  // several summary variants as strong because they independently match the JD,
  // but the UI should expose one clear winner after clustering. Suppress generic
  // recommendation badges for the other summary candidates.
  const summaryCandidateIds = new Set(engineV2.summary.clusters.flatMap((cluster) => cluster.memberIds));
  for (const id of summaryCandidateIds) {
    const attention = moduleAttention[id];
    if (!attention) continue;
    moduleAttention[id] = {
      ...attention,
      strongestEvidence: id === engineV2.summary.primaryId ? 'direct' : 'none',
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    jdFingerprint: fingerprintJobDescription(jobDescription),
    requirements: withMatches,
    recommendations,
    keywordMatchRate: withMatches.length ? Math.round((matched / withMatches.length) * 100) : 0,
    selectedRecommendationIds,
    recommendationCandidateIds,
    pageBudget: pageBudgetFor(options.settings.targetPages),
    recommendedContentSlots: options.estimatedContentSlots ?? pageBudgetFor(options.settings.targetPages),
    missingRequirements,
    partialRequirements,
    moduleAttention,
    qualityRecommendationIds,
    recommendationTiers: pagePlan.tiers,
    estimatedTargetingUsage: pagePlan.estimatedUsage,
    estimatedTargetingCapacity: pagePlan.capacity,
    coreOverflow: pagePlan.coreOverflow,
    engineV2,
  };
}
