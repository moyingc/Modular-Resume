import type { ResumeDocument } from '../resume/types';
import type { ModuleRecommendation, TargetingAnalysis } from '../targeting';
import type { ApplicationSummary, CoverLetterLength, CoverLetterPlan } from './types';
import { employerFacingLabel } from '../summaryV2/employerFacingLabels';

function candidateName(resume: ResumeDocument) {
  return (resume.candidateName || resume.name || 'Candidate').trim();
}

function cleanEvidenceText(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[.;:,]+\s*$/g, '')
    .trim();
}

function evidenceKey(value: string) {
  return cleanEvidenceText(value).toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();
}

function evidenceRank(item: ModuleRecommendation) {
  // Cover-letter composition only: prefer concrete Work/Project bullets over labels/skills.
  // This does not alter Targeting score, tier, disposition, or selection.
  const section = item.sectionType === 'experience' ? 40 : item.sectionType === 'project' ? 32 : item.sectionType === 'other' ? 16 : 0;
  const kind = item.kind === 'bullet' ? 28 : item.kind === 'entry' ? 14 : item.kind === 'skill' ? -20 : 0;
  const specificity = cleanEvidenceText(item.title).split(/\s+/).length >= 6 ? 12 : 0;
  return section + kind + specificity + item.evidenceValue * 4 + item.score;
}

function uniqueRecommendations(items: ModuleRecommendation[], limit: number) {
  const seen = new Set<string>();
  const result: ModuleRecommendation[] = [];
  for (const item of [...items].sort((a, b) => evidenceRank(b) - evidenceRank(a))) {
    const text = cleanEvidenceText(item.title);
    const key = evidenceKey(text);
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
    result.push({ ...item, title: text });
    if (result.length >= limit) break;
  }
  return result;
}

function requirementEvidence(
  analysis: TargetingAnalysis,
  requirement: string,
  limit = 3,
  selectedOnly = false,
) {
  const selected = new Set(analysis.engineV2.evidence.selectedIds);
  return uniqueRecommendations(
    analysis.recommendations.filter((item) =>
      item.kind !== 'section' &&
      item.matchedRequirements.includes(requirement) &&
      item.evidenceValue > 0 &&
      (!selectedOnly || selected.has(item.moduleId)),
    ),
    limit,
  );
}

function containsInternalLanguage(value: string) {
  return /without claiming|not actually used|\bevidence\b|\bcandidate\b|resume includes|experience relevant to|documented in my resume|truthful|unsupported|assumption|limitation|support work involving|related to campaign calendars|verified required fields|before final submission|established procedures|documenting exceptions|documented exceptions|outside assigned authority|escalating issues|assigned authority/i.test(value);
}

function looksLikeCandidateEnumeration(value: string) {
  const text = cleanEvidenceText(value);
  const commas = (text.match(/,/g) ?? []).length;
  const ors = (text.match(/\bor\b/gi) ?? []).length;
  return ors >= 1 && commas >= 2;
}

function naturalEvidenceSentence(text: string) {
  const clean = cleanEvidenceText(text)
    .replace(/\bwithout claiming experience with systems not actually used\b/gi, '')
    .replace(/\bwithout claiming[^.;]*/gi, '')
    .replace(/^[-•]\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[.;:,]+\s*$/g, '')
    .trim();
  if (!clean || containsInternalLanguage(clean) || looksLikeCandidateEnumeration(clean)) return '';

  // Resume bullets are fragments by design. Convert a normal action bullet to first-person
  // prose without inventing new facts or exposing internal ranking language.
  if (/^I\b/i.test(clean)) return `${clean.charAt(0).toUpperCase()}${clean.slice(1)}.`;
  if (/^(Prepared|Coordinated|Managed|Maintained|Handled|Responded|Generated|Supported|Organized|Created|Developed|Provided|Used|Tracked|Scheduled|Processed|Assisted|Communicated|Reviewed|Updated|Resolved|Delivered|Monitored|Led|Built|Designed|Tested|Analyzed|Implemented)\b/i.test(clean)) {
    return `I ${clean.charAt(0).toLowerCase()}${clean.slice(1)}.`;
  }
  return '';
}

function naturalTheme(label: string) {
  const normalized = label.trim();
  const direct: Record<string, string> = {
    'Event Promotion / Coordination': 'event coordination and promotional support',
    'Written & Verbal Communication': 'clear written and verbal communication',
    'Scheduling & Calendar Coordination': 'scheduling and calendar coordination',
    'Scheduling / Appointments': 'scheduling and appointment coordination',
    'Microsoft Office': 'day-to-day use of Microsoft Office',
    'Organization & Changing Priorities': 'organization and changing priorities',
  };
  return direct[normalized] ?? employerFacingLabel(normalized);
}

function themePriority(label: string) {
  const text = label.toLowerCase();
  if (/coordination|communication|service|scheduling|organization|reporting|records|documentation|sales|logistics|project|stakeholder/.test(text)) return 3;
  if (/office|excel|word|powerpoint|software|tool|system/.test(text)) return 1;
  return 2;
}

function naturalRequirementList(labels: string[]) {
  const values = [...labels]
    .sort((a, b) => themePriority(b) - themePriority(a))
    .map((value) => naturalTheme(value))
    .filter(Boolean)
    .filter((value, index, all) => all.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index)
    .slice(0, 2);
  if (values.length === 0) return '';
  if (values.length === 1) return values[0];
  return `${values[0]}, along with ${values[1]}`;
}

export function buildCoverLetterPlan(
  resume: ResumeDocument,
  analysis: TargetingAnalysis,
  companyName = '',
  roleName = '',
  options: { length?: CoverLetterLength } = {},
): CoverLetterPlan {
  const length = options.length ?? 'standard';
  const focus = analysis.requirements.slice(0, 10).map((requirement) => {
    const evidenceItems = requirementEvidence(analysis, requirement.label, 3, true);
    const evidence = evidenceItems.map((item) => ({ moduleId: item.moduleId, title: item.title, score: item.score }));
    const strength = evidence.length >= 2 && evidence[0].score >= 50 ? 'high' : evidence.length ? 'medium' : 'gap';
    return {
      requirement: requirement.label,
      strength,
      evidence,
      guidance: strength === 'high'
        ? 'Use one concrete resume example as the lead evidence.'
        : strength === 'medium'
          ? 'Transferable evidence only; keep the wording factual and do not imply direct experience.'
          : 'No supporting resume evidence found. Omit this claim unless the user adds truthful evidence.',
    } as const;
  });

  const missingEvidence = focus.filter((item) => item.strength === 'gap').map((item) => item.requirement);
  const strong = focus.filter((item) => item.strength !== 'gap');
  const maxExamples = length === 'short' ? 2 : length === 'detailed' ? 3 : 2;
  const selectedEvidence: Array<{ text: string; requirement: string }> = [];
  const seenEvidence = new Set<string>();
  for (const item of strong) {
    const evidence = requirementEvidence(analysis, item.requirement, 4, true).find((candidate) => {
      const key = evidenceKey(candidate.title);
      return key && !seenEvidence.has(key) && !containsInternalLanguage(candidate.title) && !looksLikeCandidateEnumeration(candidate.title);
    });
    if (!evidence) continue;
    seenEvidence.add(evidenceKey(evidence.title));
    selectedEvidence.push({ text: cleanEvidenceText(evidence.title), requirement: item.requirement });
    if (selectedEvidence.length >= maxExamples) break;
  }

  const role = roleName.trim();
  const organization = companyName.trim();
  const target = role && organization ? `the ${role} position at ${organization}` : role ? `the ${role} position` : organization ? `an opportunity with ${organization}` : 'this opportunity';
  const themes = naturalRequirementList(strong.map((item) => item.requirement));
  const opening = themes
    ? `I am writing to apply for ${target}. My background includes ${themes}, supported by practical experience in organized, detail-focused work.`
    : `I am writing to apply for ${target}. I am interested in contributing my experience, organization, and dependable approach to your team.`;

  const evidenceSentences = selectedEvidence.map((item) => naturalEvidenceSentence(item.text)).filter(Boolean);
  const evidenceParagraph = evidenceSentences.length
    ? evidenceSentences.join(' ')
    : 'Across my previous roles, I have applied these strengths in practical, detail-focused work while maintaining clear communication and dependable follow-through.';
  const bridge = 'These responsibilities strengthened my communication, organization, attention to detail, and dependable follow-through.';
  const closingTarget = organization || 'your team';
  const closing = `I would welcome the opportunity to discuss how my experience could contribute to ${closingTarget}.`;
  const paragraphs = length === 'short' ? [opening, evidenceParagraph, closing] : [opening, evidenceParagraph, bridge, closing];
  const draft = ['Dear Hiring Manager,', ...paragraphs, `Sincerely,\n${candidateName(resume)}`].join('\n\n');
  return { focus, missingEvidence, draft };
}

export function buildMiniCoverNote(
  resume: ResumeDocument,
  analysis: TargetingAnalysis,
  companyName = '',
  roleName = '',
): string {
  void resume;
  const selected = new Set(analysis.engineV2.evidence.selectedIds);
  const supportedRequirements: string[] = [];
  for (const item of analysis.recommendations
    .filter((item) => selected.has(item.moduleId) && item.kind !== 'section' && item.evidenceValue > 0 && item.matchedRequirements.length > 0)
    .sort((a, b) => evidenceRank(b) - evidenceRank(a))) {
    for (const requirement of item.matchedRequirements) {
      if (!supportedRequirements.some((value) => value.toLowerCase() === requirement.toLowerCase())) supportedRequirements.push(requirement);
      if (supportedRequirements.length >= 2) break;
    }
    if (supportedRequirements.length >= 2) break;
  }
  const themes = naturalRequirementList(supportedRequirements);
  const role = roleName.trim();
  const company = companyName.trim();
  const target = role && company ? `the ${role} position at ${company}` : role ? `the ${role} position` : company ? `an opportunity with ${company}` : 'this position';
  const candidates = themes ? [
    `I am applying for ${target}. My background includes ${themes}. I would be pleased to bring strong organization, attention to detail, and dependable follow-through to your team.`,
    `I am applying for ${target}. I bring experience in ${themes}, supported by strong organization and attention to detail. I would welcome the opportunity to contribute these strengths to your team.`,
  ] : [
    `I am applying for ${target}. My background has developed strong organization, communication, and attention to detail, and I would welcome the opportunity to contribute these strengths to your team.`,
  ];
  return candidates.find((text) => text.trim().split(/\s+/).length <= 50) ?? candidates[candidates.length - 1];
}

export function buildApplicationSummary(
  resume: ResumeDocument,
  analysis: TargetingAnalysis,
  companyName: string,
  roleName: string,
  targetPages: string,
): ApplicationSummary {
  const strongestEvidence = analysis.requirements
    .map((requirement) => ({
      requirement: requirement.label,
      evidence: requirementEvidence(analysis, requirement.label, 3, true).map((item) => item.title),
    }))
    .filter((item) => item.evidence.length)
    .slice(0, 6);

  const missingEvidence = analysis.missingRequirements.map((item) => item.label);
  const partialEvidence = analysis.partialRequirements.map((item) => item.label);

  return {
    companyName: companyName.trim(),
    roleName: roleName.trim(),
    candidateName: candidateName(resume),
    generatedAt: new Date().toISOString(),
    targetPages,
    strongestEvidence,
    partialEvidence,
    missingEvidence,
    checklist: [
      { label: 'Company and role identified', status: companyName.trim() && roleName.trim() ? 'ready' : 'review' },
      { label: 'Targeting analysis available', status: 'ready' },
      { label: 'Missing evidence reviewed', status: missingEvidence.length ? 'review' : 'ready' },
      { label: 'Final resume selection reviewed', status: 'review' },
      { label: 'Cover letter reviewed by user', status: 'review' },
    ],
  };
}
