import type { ResumeDocument } from '../../resume/types';
import type { JobRequirement, ModuleRecommendation, RecommendationEngineV2Analysis } from '../types';
import { buildSummaryRecommendationPlan } from './summaryEngine';
import { buildEvidenceRecommendationPlan } from './evidenceEngine';
import { buildSkillRecommendationPlan } from './skillEngine';
import { buildConsistencyIssues } from './consistencyEngine';

export function buildRecommendationEngineV2(
  resume: ResumeDocument,
  requirements: JobRequirement[],
  recommendations: ModuleRecommendation[],
  jobDescription = '',
  summaryVariant: 0 | 1 | 2 = 0,
): RecommendationEngineV2Analysis {
  const evidence = buildEvidenceRecommendationPlan(recommendations, requirements);
  const summary = buildSummaryRecommendationPlan(resume, recommendations, requirements, jobDescription, evidence.selectedIds, summaryVariant);
  const skills = buildSkillRecommendationPlan(recommendations, evidence.selectedIds);
  const consistencyIssues = buildConsistencyIssues(recommendations, summary.recommendedIds, evidence.selectedIds, skills.items);
  return { summary, evidence, skills, consistencyIssues };
}

export * from './similarity';
export * from './summaryEngine';
export * from './evidenceEngine';
export * from './skillEngine';
export * from './consistencyEngine';
