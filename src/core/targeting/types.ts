import type { ModuleKind, ResumeDocument } from '../resume/types';
import type { PageSettings } from '../../types/editor-ui.types';
import type { ConceptPackId } from './concepts';

export type RecommendationLevel = 'keep' | 'optional' | 'low';
export type RequirementPriority = 'required' | 'preferred' | 'responsibility';
export type RequirementCategory =
  | 'administration' | 'customer-service' | 'hr' | 'admissions' | 'data'
  | 'software' | 'engineering' | 'project' | 'tool' | 'qualification'
  | 'communication' | 'operations' | 'other';
export type EvidenceStrength = 'direct' | 'strong' | 'supporting' | 'weak' | 'none';
export type TargetingDisposition = 'auto-select' | 'skill-advisory' | 'review-only' | 'check-only';
export type AttentionSeverity = 'none' | 'warning' | 'missing';
export type SkillRecommendation = 'strong' | 'related' | 'neutral';
export type SectionProtection = 'fixed' | 'targetable' | 'advisory' | 'protected';
export type LayoutPressureSeverity = 'none' | 'near-fit' | 'overflow';
export type RecommendationTier = 'core' | 'strong' | 'supporting' | 'filler';

export interface JobRequirement {
  id: string;
  label: string;
  normalized: string;
  weight: number;
  frequency: number;
  matched: boolean;
  coverage: EvidenceStrength;
  priority: RequirementPriority;
  category: RequirementCategory;
  evidenceTerms: string[];
  supportingTerms: string[];
  sourceSnippets: string[];
}

export interface RequirementEvidence {
  requirementId: string;
  requirementLabel: string;
  strength: EvidenceStrength;
  points: number;
  matchedTerms: string[];
}

export interface ModuleAttention {
  moduleId: string;
  severity: AttentionSeverity;
  title: string;
  details: string[];
  strongestEvidence: EvidenceStrength;
  skillRecommendation?: SkillRecommendation;
}

export interface ModuleRecommendation {
  moduleId: string;
  parentId: string | null;
  kind: ModuleKind;
  title: string;
  score: number;
  evidenceValue: number;
  strongestEvidence: EvidenceStrength;
  recommendation: RecommendationLevel;
  matchedRequirements: string[];
  evidence: RequirementEvidence[];
  estimatedCost: number;
  disposition: TargetingDisposition;
  locked: boolean;
  /** True when this module or one of its ancestors is marked ★ Priority by the user. */
  userPriority: boolean;
  sectionId: string | null;
  sectionType: 'experience' | 'project' | 'skills' | 'summary' | 'education' | 'training' | 'other';
  protection: SectionProtection;
}

export interface LayoutAdjustmentSuggestion {
  moduleId: string;
  title: string;
  reason: string;
  estimatedSavings: number;
  action: 'compact-skills' | 'review-module' | 'review-section';
}

export interface LayoutPressureDiagnosis {
  severity: LayoutPressureSeverity;
  message: string;
  lastPageUsagePercent: number;
  suggestions: LayoutAdjustmentSuggestion[];
}


export interface SummaryCluster {
  id: string;
  memberIds: string[];
  representativeId: string;
  scores: Record<string, number>;
}

export interface SummaryRecommendationPlan {
  clusters: SummaryCluster[];
  recommendedIds: string[];
  primaryId: string | null;
  /** Summary V2 generated candidate; based only on Personal Library + selected Work/Project evidence. */
  generatedText?: string;
  sourceIds?: string[];
  sourceTexts?: string[];
  sourceReferences?: Array<{ id: string; text: string; similarity: number; role: 'primary' | 'secondary' }>;
  selectedEvidenceIds?: string[];
  generationMode?: 'single-rewrite' | 'multi-reference';
  jobFamilyIds?: string[];
  architectureId?: string;
  patternIds?: string[];
  warnings?: string[];
}

export interface EvidenceRecommendationPlan {
  selectedIds: string[];
  experienceIds: string[];
  projectIds: string[];
  duplicateGroups: string[][];
  coveredRequirementIds: string[];
}

export interface SkillEvidenceLink {
  moduleId: string;
  score: number;
  linkedEvidenceIds: string[];
  supported: boolean;
}

export interface SkillRecommendationPlan {
  rankedSkillIds: string[];
  recommendedSkillIds: string[];
  items: SkillEvidenceLink[];
}

export interface ConsistencyIssue {
  moduleId: string;
  severity: 'warning' | 'missing';
  code: 'summary-under-supported' | 'skill-without-evidence';
  message: string;
}

export interface RecommendationEngineV2Analysis {
  summary: SummaryRecommendationPlan;
  evidence: EvidenceRecommendationPlan;
  skills: SkillRecommendationPlan;
  consistencyIssues: ConsistencyIssue[];
}

export interface TargetingAnalysis {
  generatedAt: string;
  /** Fingerprint of the exact JD used for this analysis; prevents stale-session reuse. */
  jdFingerprint: string;
  requirements: JobRequirement[];
  recommendations: ModuleRecommendation[];
  keywordMatchRate: number;
  selectedRecommendationIds: string[];
  recommendationCandidateIds: string[];
  pageBudget: number | null;
  recommendedContentSlots: number | null;
  missingRequirements: JobRequirement[];
  partialRequirements: JobRequirement[];
  moduleAttention: Record<string, ModuleAttention>;
  qualityRecommendationIds: string[];
  recommendationTiers: Record<string, RecommendationTier>;
  estimatedTargetingUsage: number;
  estimatedTargetingCapacity: number | null;
  coreOverflow: boolean;
  /** Section-specific recommendation pipeline. Page fitting runs after this plan. */
  engineV2: RecommendationEngineV2Analysis;
}

export interface TargetingOptions {
  settings: Pick<PageSettings, 'targetPages' | 'paperSize' | 'bodyFontSize' | 'density' | 'marginPreset'>;
  maxRequirements?: number;
  estimatedContentSlots?: number | null;
  /** Optional profession/domain packs. Undefined keeps all packs active for backward compatibility. */
  conceptPackIds?: ConceptPackId[];
  /** Summary-only deterministic recomposition strategy. */
  summaryVariant?: 0 | 1 | 2;
}

export interface TargetingInput {
  jobDescription: string;
  resume: ResumeDocument;
  options: TargetingOptions;
}
