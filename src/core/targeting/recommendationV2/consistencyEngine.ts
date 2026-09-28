import { SKILL_HIGH_RELEVANCE_THRESHOLD } from './skillEngine';
import type { ConsistencyIssue, ModuleRecommendation, RecommendationEngineV2Analysis } from '../types';

export function buildConsistencyIssues(
  recommendations: ModuleRecommendation[],
  summaryIds: string[],
  selectedEvidenceIds: string[],
  skillItems: RecommendationEngineV2Analysis['skills']['items'],
): ConsistencyIssue[] {
  const byId = new Map(recommendations.map((item) => [item.moduleId, item]));
  const evidenceRequirements = new Set<string>();
  for (const id of selectedEvidenceIds) {
    for (const evidence of byId.get(id)?.evidence ?? []) if (evidence.points >= 2) evidenceRequirements.add(evidence.requirementId);
  }

  const issues: ConsistencyIssue[] = [];
  for (const id of summaryIds) {
    const rec = byId.get(id);
    if (!rec) continue;
    const claims = rec.evidence.filter((item) => item.points >= 2).map((item) => item.requirementId);
    const supported = claims.filter((req) => evidenceRequirements.has(req));
    if (claims.length && supported.length < Math.ceil(claims.length * 0.5)) {
      issues.push({
        moduleId: id,
        severity: 'warning',
        code: 'summary-under-supported',
        message: 'Summary 与已推荐的 Work/Project 证据闭环较弱，建议人工确认。',
      });
    }
  }

  for (const skill of skillItems) {
    if (skill.score >= SKILL_HIGH_RELEVANCE_THRESHOLD && !skill.supported) {
      issues.push({
        moduleId: skill.moduleId,
        severity: 'warning',
        code: 'skill-without-evidence',
        message: '该 Skill 与 JD 相关，但当前推荐的 Work/Project 内容没有形成直接证据闭环。',
      });
    }
  }
  return issues;
}
