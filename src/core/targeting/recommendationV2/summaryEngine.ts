import type { ResumeDocument, ResumeModule } from '../../resume/types';
import type { JobRequirement, ModuleRecommendation, SummaryCluster, SummaryRecommendationPlan } from '../types';
import { generateSummaryV2 } from '../../summaryV2';
import { combinedSimilarity } from './similarity';

function nodeText(node: ResumeModule) {
  return [node.title, node.subtitle ?? '', node.content ?? ''].join(' ').replace(/\s+/g, ' ').trim();
}

function collectSummaryNodes(resume: ResumeDocument) {
  const nodes: ResumeModule[] = [];
  const walk = (node: ResumeModule, insideSummary: boolean) => {
    const next = insideSummary || (node.kind === 'section' && /(summary|profile|objective|professional summary|职业概述|个人简介|简介)/i.test(node.title));
    if (next && node.kind !== 'section') nodes.push(node);
    for (const child of node.children ?? []) walk(child, next);
  };
  for (const section of resume.sections) walk(section, false);
  return nodes;
}

function qualityScore(text: string) {
  const quantified = /\b\d+(?:\.\d+)?%|\b\d+\+|\b\d+\s*(?:years?|hours?|points?)\b/i.test(text) ? 8 : 0;
  const sentenceShape = text.length >= 80 && text.length <= 520 ? 6 : text.length > 800 ? -10 : 0;
  const notePenalty = /[（(][^)]*[\u3400-\u9fff][^)]*[)）]/.test(text) ? -8 : 0;
  return quantified + sentenceShape + notePenalty;
}

export function buildSummaryRecommendationPlan(
  resume: ResumeDocument,
  recommendations: ModuleRecommendation[],
  requirements: JobRequirement[] = [],
  jobDescription = '',
  selectedEvidenceIds: string[] = [],
  compositionVariant: 0 | 1 | 2 = 0,
): SummaryRecommendationPlan {
  const byId = new Map(recommendations.map((item) => [item.moduleId, item]));
  const candidates = collectSummaryNodes(resume)
    .map((node) => ({ node, rec: byId.get(node.id), text: nodeText(node) }))
    .filter((item) => item.text.length > 0);

  const clusters: Array<{ members: typeof candidates }> = [];
  for (const candidate of candidates) {
    const concepts = candidate.rec?.evidence.map((item) => item.requirementId) ?? [];
    let target = clusters.find((cluster) => {
      const representative = cluster.members[0];
      const repConcepts = representative.rec?.evidence.map((item) => item.requirementId) ?? [];
      return combinedSimilarity(candidate.text, representative.text, concepts, repConcepts) >= 0.54;
    });
    if (!target) { target = { members: [] }; clusters.push(target); }
    target.members.push(candidate);
  }

  const outputClusters: SummaryCluster[] = clusters.map((cluster, index) => {
    const ranked = cluster.members.map(({ node, rec, text }) => {
      const evidence = rec?.evidenceValue ?? 0;
      const coverage = new Set(rec?.evidence.filter((item) => item.points >= 2).map((item) => item.requirementId) ?? []).size;
      const score = (rec?.score ?? 0) * 0.46 + Math.min(24, evidence * 0.7) + coverage * 5 + qualityScore(text);
      return { moduleId: node.id, score: Number(score.toFixed(2)), text };
    }).sort((a, b) => b.score - a.score || a.text.length - b.text.length);
    return {
      id: `summary-cluster-${index + 1}`,
      memberIds: ranked.map((item) => item.moduleId),
      representativeId: ranked[0]?.moduleId ?? '',
      scores: Object.fromEntries(ranked.map((item) => [item.moduleId, item.score])),
    };
  });

  const rankedRepresentatives = outputClusters
    .map((cluster) => ({ id: cluster.representativeId, score: cluster.scores[cluster.representativeId] ?? 0 }))
    .filter((item) => item.id)
    .sort((a, b) => b.score - a.score);

  const recommendedIds = rankedRepresentatives.slice(0, 2).map((item) => item.id);
  const primaryId = rankedRepresentatives[0]?.id ?? null;
  const allCandidateIds = outputClusters.flatMap((cluster) => cluster.memberIds);
  const generated = generateSummaryV2({
    resume,
    jobDescription,
    requirements,
    recommendations,
    selectedEvidenceIds,
    candidateSummaryIds: recommendedIds.length ? recommendedIds : allCandidateIds,
    compositionVariant,
  });

  return {
    clusters: outputClusters,
    recommendedIds,
    primaryId,
    generatedText: generated.text,
    sourceIds: generated.sourceIds,
    sourceTexts: generated.sourceTexts,
    sourceReferences: generated.sourceReferences,
    selectedEvidenceIds: generated.selectedEvidenceIds,
    generationMode: generated.mode,
    jobFamilyIds: generated.jobFamilies.map((item) => item.id),
    architectureId: generated.architectureId,
    patternIds: generated.patternIds,
    warnings: generated.warnings,
  };
}
