import type { ModuleRecommendation, EvidenceRecommendationPlan, JobRequirement } from '../types';
import { combinedSimilarity, idSetSimilarity } from './similarity';

function strengthRank(item: ModuleRecommendation) {
  return item.strongestEvidence === 'direct' ? 4 : item.strongestEvidence === 'strong' ? 3 : item.strongestEvidence === 'supporting' ? 2 : item.strongestEvidence === 'weak' ? 1 : 0;
}

function technicalRole(requirements: JobRequirement[]) {
  return requirements.filter((item) => item.category === 'engineering' || item.category === 'software' || item.category === 'tool').reduce((sum, item) => sum + item.weight, 0) >= 5;
}

export function buildEvidenceRecommendationPlan(
  recommendations: ModuleRecommendation[],
  requirements: JobRequirement[],
): EvidenceRecommendationPlan {
  // Evidence selection must not depend on exact JD wording. A resume bullet with
  // one transferable/supporting concept may still be valuable even when the JD
  // uses a different phrase. Keep weak evidence as a candidate when its overall
  // normalized score is meaningful; novelty/duplicate penalties below decide
  // whether it actually survives selection.
  const candidates = recommendations.filter((item) =>
    item.kind === 'bullet'
    && !item.locked
    && item.disposition === 'auto-select'
    && (item.sectionType === 'experience' || item.sectionType === 'project')
    && item.evidenceValue > 0
    && (item.strongestEvidence !== 'weak' || item.score >= 20)
  );
  const technical = technicalRole(requirements);
  const duplicateGroups: string[][] = [];
  const grouped = new Set<string>();

  for (let i = 0; i < candidates.length; i += 1) {
    const a = candidates[i];
    if (grouped.has(a.moduleId)) continue;
    const group = [a.moduleId];
    const aConcepts = a.evidence.map((item) => item.requirementId);
    for (let j = i + 1; j < candidates.length; j += 1) {
      const b = candidates[j];
      if (grouped.has(b.moduleId)) continue;
      const bConcepts = b.evidence.map((item) => item.requirementId);
      const similarity = combinedSimilarity(a.title, b.title, aConcepts, bConcepts);
      const conceptOverlap = idSetSimilarity(aConcepts, bConcepts);
      if (similarity >= 0.72 && conceptOverlap >= 0.5) {
        group.push(b.moduleId);
        grouped.add(b.moduleId);
      }
    }
    if (group.length > 1) duplicateGroups.push(group);
  }

  const duplicatePeer = new Map<string, string[]>();
  for (const group of duplicateGroups) for (const id of group) duplicatePeer.set(id, group.filter((peer) => peer !== id));

  const selected: ModuleRecommendation[] = [];
  const covered = new Map<string, number>();
  const parentCount = new Map<string, number>();
  const remaining = [...candidates];

  while (remaining.length && selected.length < 14) {
    let bestIndex = -1;
    let bestValue = -Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const item = remaining[index];
      const pkey = item.parentId ?? item.moduleId;
      const pcount = parentCount.get(pkey) ?? 0;
      if (pcount >= 5) continue;
      let novelty = 0;
      let duplicateEvidence = 0;
      for (const evidence of item.evidence) {
        const previous = covered.get(evidence.requirementId) ?? 0;
        if (evidence.points > previous) novelty += (evidence.points - previous) * 7;
        else duplicateEvidence += evidence.points * 1.8;
      }
      const peers = duplicatePeer.get(item.moduleId) ?? [];
      const semanticDuplicatePenalty = peers.some((id) => selected.some((chosen) => chosen.moduleId === id)) ? 10 : 0;
      const sectionBias = item.sectionType === 'experience'
        ? (technical ? 3.4 : 5.8)
        : item.sectionType === 'project'
          ? (technical ? 5.2 : 2.4)
          : 0;
      const value = novelty
        + item.evidenceValue * 0.44
        + strengthRank(item) * 2.8
        + sectionBias
        + (item.userPriority ? 7 : 0)
        - duplicateEvidence
        - semanticDuplicatePenalty
        - pcount * 1.25;
      if (value > bestValue) { bestValue = value; bestIndex = index; }
    }
    if (bestIndex < 0 || bestValue <= 0) break;
    const [chosen] = remaining.splice(bestIndex, 1);
    selected.push(chosen);
    const pkey = chosen.parentId ?? chosen.moduleId;
    parentCount.set(pkey, (parentCount.get(pkey) ?? 0) + 1);
    for (const evidence of chosen.evidence) covered.set(evidence.requirementId, Math.max(covered.get(evidence.requirementId) ?? 0, evidence.points));
  }

  return {
    selectedIds: selected.map((item) => item.moduleId),
    experienceIds: selected.filter((item) => item.sectionType === 'experience').map((item) => item.moduleId),
    projectIds: selected.filter((item) => item.sectionType === 'project').map((item) => item.moduleId),
    duplicateGroups,
    coveredRequirementIds: [...covered.keys()],
  };
}
