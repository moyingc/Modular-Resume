import type { ModuleRecommendation, SkillRecommendationPlan } from '../types';

export const SKILL_RECOMMEND_THRESHOLD = 35;
export const SKILL_HIGH_RELEVANCE_THRESHOLD = 45;

export function buildSkillRecommendationPlan(
  recommendations: ModuleRecommendation[],
  selectedEvidenceIds: string[],
): SkillRecommendationPlan {
  const selected = new Set(selectedEvidenceIds);
  const evidenceRequirements = new Map<string, string[]>();
  for (const rec of recommendations) {
    if (!selected.has(rec.moduleId)) continue;
    for (const evidence of rec.evidence) {
      const list = evidenceRequirements.get(evidence.requirementId) ?? [];
      list.push(rec.moduleId);
      evidenceRequirements.set(evidence.requirementId, list);
    }
  }

  const items = recommendations
    .filter((item) => item.kind === 'skill' || (item.sectionType === 'skills' && item.kind !== 'section'))
    .map((item) => {
      const links = new Set<string>();
      let supportedWeight = 0;
      for (const evidence of item.evidence) {
        const ids = evidenceRequirements.get(evidence.requirementId) ?? [];
        for (const id of ids) links.add(id);
        if (ids.length) supportedWeight += evidence.points;
      }
      const score = Math.round(Math.min(100,
        item.score * 0.45 + Math.min(45, supportedWeight * 8) + Math.min(10, links.size * 3)
      ));
      return {
        moduleId: item.moduleId,
        score,
        linkedEvidenceIds: [...links],
        supported: links.size > 0,
      };
    })
    .sort((a, b) => Number(b.supported) - Number(a.supported) || b.score - a.score);

  return {
    rankedSkillIds: items.map((item) => item.moduleId),
    recommendedSkillIds: items.filter((item) => item.supported && item.score >= SKILL_RECOMMEND_THRESHOLD).map((item) => item.moduleId),
    items,
  };
}
