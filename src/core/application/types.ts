export type CoverLetterLength = 'short' | 'standard' | 'detailed';

export interface CoverLetterEvidence {
  moduleId: string;
  title: string;
  score: number;
}

export interface CoverLetterFocusItem {
  requirement: string;
  strength: 'high' | 'medium' | 'gap';
  evidence: CoverLetterEvidence[];
  guidance: string;
}

export interface ApplicationSummary {
  companyName: string;
  roleName: string;
  candidateName: string;
  generatedAt: string;
  targetPages: string;
  strongestEvidence: Array<{ requirement: string; evidence: string[] }>;
  partialEvidence: string[];
  missingEvidence: string[];
  checklist: Array<{ label: string; status: 'ready' | 'review' }>;
}

export interface CoverLetterPlan {
  focus: CoverLetterFocusItem[];
  missingEvidence: string[];
  draft: string;
}

export interface ApplicationPackageRecord {
  version: 1 | 2;
  companyName: string;
  roleName: string;
  createdAt: string;
  jobDescription: string;
  resumeId: string;
  candidateName: string;
  targetPages: string;
  summary: ApplicationSummary;
  coverLetter: string;
  email?: EmailDraftPlan;
  attachments?: ApplicationAttachmentSelection;
  closureChecks?: Array<{ id: string; status: 'closed' | 'warning' | 'open'; message: string }>;
  notes: string;
  evidencePolicy: 'resume-only-no-fabrication';
}


export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  greeting: string;
  opening: string;
  closing: string;
  signature: string;
}

export interface ApplicationAttachmentSelection {
  resume: boolean;
  coverLetter: boolean;
  additionalFiles: string[];
}

export interface EmailDraftPlan {
  to: string;
  cc: string[];
  subject: string;
  body: string;
  attachments: ApplicationAttachmentSelection;
  warnings: string[];
}

export interface ApplicationPackageSelection {
  includeResume: boolean;
  includeCoverLetter: boolean;
  includeEmail: boolean;
  additionalAttachments: string[];
}

export interface MailProviderAdapter {
  id: string;
  displayName: string;
  isConnected(): Promise<boolean>;
  send(draft: EmailDraftPlan): Promise<{ messageId?: string }>;
}
