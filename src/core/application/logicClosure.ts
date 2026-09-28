
import type { ResumeDocument } from '../resume/types';
import type { TargetingAnalysis } from '../targeting';
import type { EmailDraftPlan } from './types';
import { SKILL_HIGH_RELEVANCE_THRESHOLD } from '../targeting/recommendationV2/skillEngine';

export type ClosureStatus = 'closed' | 'warning' | 'open';

export interface ClosureCheck {
  id: string;
  status: ClosureStatus;
  message: string;
}

export function detectApplicationLogicClosure(input: {
  resume: ResumeDocument;
  analysis: TargetingAnalysis;
  coverLetter?: string;
  email?: EmailDraftPlan | null;
  requireCoverLetter?: boolean;
  requireEmail?: boolean;
  mailConnected?: boolean;
}): ClosureCheck[] {
  const {analysis}=input;
  const checks: ClosureCheck[]=[];

  const summary=analysis.engineV2.summary;
  checks.push({
    id:'summary',
    status: summary.generatedText?.trim() && (summary.selectedEvidenceIds?.length ?? 0) > 0 ? 'closed' : 'warning',
    message: summary.generatedText?.trim()
      ? `Summary V2 generated from ${summary.sourceIds?.length ?? 0} summary source(s) and ${summary.selectedEvidenceIds?.length ?? 0} selected evidence item(s).`
      : 'No generated Summary V2 candidate is available.',
  });

  checks.push({
    id:'work-project',
    status: analysis.engineV2.evidence.selectedIds.length ? 'closed' : 'open',
    message: `${analysis.engineV2.evidence.selectedIds.length} Work/Project evidence item(s) selected.`,
  });

  const unsupportedSkills=analysis.engineV2.skills.items.filter((item)=>item.score>=SKILL_HIGH_RELEVANCE_THRESHOLD && !item.supported);
  checks.push({
    id:'skills',
    status: unsupportedSkills.length ? 'warning' : 'closed',
    message: unsupportedSkills.length
      ? `${unsupportedSkills.length} high-relevance skill(s) lack selected Work/Project evidence.`
      : 'Recommended skills are backed by selected Work/Project evidence.',
  });

  checks.push({
    id:'consistency',
    status: analysis.engineV2.consistencyIssues.length ? 'warning' : 'closed',
    message: analysis.engineV2.consistencyIssues.length
      ? `${analysis.engineV2.consistencyIssues.length} consistency warning(s) remain.`
      : 'No Summary/Skill evidence consistency warnings remain.',
  });

  if(input.requireCoverLetter) checks.push({
    id:'cover-letter',
    status: input.coverLetter?.trim() ? 'closed' : 'open',
    message: input.coverLetter?.trim() ? 'Cover letter draft exists.' : 'Cover letter is required but missing.',
  });

  if(input.requireEmail) checks.push({
    id:'email',
    status: input.email && !input.email.warnings.length && input.mailConnected ? 'closed' : 'warning',
    message: !input.mailConnected
      ? 'Email content exists, but Gmail is not connected for cloud draft creation.'
      : input.email
        ? `Email prepared with ${input.email.warnings.length} warning(s) and a connected provider.`
        : 'Email is required but no draft is prepared.',
  });

  return checks;
}
