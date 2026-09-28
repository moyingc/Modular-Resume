
import type { JobRequirement, ModuleRecommendation } from '../targeting/types';
import type { ResumeDocument } from '../resume/types';

export interface JobFamilyScore {
  id: string;
  name: string;
  score: number;
}

export interface SummarySourceReference {
  id: string;
  text: string;
  similarity: number;
  role: 'primary' | 'secondary';
}

export interface SummaryV2Result {
  text: string;
  sourceIds: string[];
  sourceTexts: string[];
  sourceReferences: SummarySourceReference[];
  selectedEvidenceIds: string[];
  mode: 'single-rewrite' | 'multi-reference';
  jobFamilies: JobFamilyScore[];
  architectureId: string;
  patternIds: string[];
  warnings: string[];
}

export interface SummaryV2Input {
  resume: ResumeDocument;
  jobDescription: string;
  requirements: JobRequirement[];
  recommendations: ModuleRecommendation[];
  selectedEvidenceIds: string[];
  candidateSummaryIds: string[];
  /** Deterministic composition strategy used by Recompose V2. */
  compositionVariant?: 0 | 1 | 2;
}
