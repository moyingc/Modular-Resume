
export interface SummaryRevisionRecord {
  engineVersion: 'summary-v2-v9' | 'summary-v2-v9.5';
  mode: 'single-rewrite' | 'multi-reference' | 'manual-edit' | 'page-compression';
  action: 'generate-apply' | 'manual-edit' | 'page-compression';
  sourceIds: string[];
  sourceTexts: string[];
  sourceReferences: Array<{ id: string; text: string; similarity: number; role: 'primary' | 'secondary' }>;
  primarySummaryId: string | null;
  secondarySummaryIds: string[];
  selectedEvidenceIds: string[];
  jobFamilyIds: string[];
  architectureId: string;
  patternIds: string[];
  previousText: string;
  generatedText: string;
  changedFields: string[];
  changeReason: string;
  previousWordCount: number;
  wordCount: number;
  generatedAt: string;
}

export type ModuleKind = 'section' | 'entry' | 'bullet' | 'skill';

export interface ResumeModule {
  id: string;
  kind: ModuleKind;
  title: string;
  subtitle?: string;
  content?: string;
  selected: boolean;
  locked?: boolean;
  /** User intent signal for Targeting. Soft preference, never a hard keep constraint. */
  targetingPriority?: boolean;
  relevance?: number;
  /** Optional user-approved shorter rendering for near-fit page pressure. */
  compactContent?: string;
  /** When true, render compactContent instead of full content. */
  useCompactContent?: boolean;
  /** User-controlled compact layout for short skill children; changes layout only, never wording. */
  compactShortSkills?: boolean;
  children?: ResumeModule[];
  /** Audit trail when Professional Summary is generated/modified by Summary V2. */
  summaryRevision?: SummaryRevisionRecord;
  /** Append-only history. Previous Summary revisions are never overwritten. */
  summaryRevisionHistory?: SummaryRevisionRecord[];
}

export interface ResumeDocument {
  id: string;
  /** Legacy candidate-name field retained for backward compatibility. */
  name: string;
  /** Explicit candidate identity; new code should prefer this when present. */
  candidateName?: string;
  /** Internal resume/project label; never used as candidate identity. */
  documentName?: string;
  contactLine: string;
  sections: ResumeModule[];
}
