import type { ResumeDocument, ResumeModule } from '../resume/types';
import { normalizeForMatch } from './jdParser';
import { estimateModuleCost } from './optimizer';
import type {
  EvidenceStrength,
  JobRequirement,
  ModuleAttention,
  ModuleRecommendation,
  RequirementEvidence,
  TargetingDisposition,
  SectionProtection,
} from './types';

export type SectionType = ModuleRecommendation['sectionType'];

export function classifySection(section: ResumeModule): SectionType {
  const title = normalizeForMatch(section.title);
  if (/(work experience|professional experience|employment|employment history|工作经历|工作经验|实习经历)/.test(title)) return 'experience';
  if (/(project|projects|project experience|项目|项目经历)/.test(title)) return 'project';
  if (/(skill|technical skills|core competencies|技能|专业技能)/.test(title)) return 'skills';
  if (/(summary|profile|objective|professional summary|职业概述|个人简介|简介)/.test(title)) return 'summary';
  if (/(education|academic|教育|学历)/.test(title)) return 'education';
  if (/(training|certification|certificate|licenses|培训|证书|认证)/.test(title)) return 'training';
  return 'other';
}

export function moduleOwnText(module: ResumeModule): string {
  return normalizeForMatch([module.title, module.subtitle ?? '', module.content ?? ''].join(' '));
}

export function moduleText(module: ResumeModule): string {
  const childText: string = (module.children ?? []).map(moduleText).join(' ');
  return normalizeForMatch([module.title, module.subtitle ?? '', module.content ?? '', childText].join(' '));
}


function containsTerm(text: string, term: string) {
  return Boolean(term && text.includes(term));
}

function evidenceFor(text: string, requirement: JobRequirement): RequirementEvidence {
  let directTerms = requirement.evidenceTerms.filter((term) => containsTerm(text, term));
  let supportingTerms = requirement.supportingTerms.filter((term) => containsTerm(text, term));

  // Guard semantic collisions: generic software `application` language is not
  // recruitment evidence. Recruitment needs explicit hiring/applicant/interview context.
  if (requirement.id === 'req-recruitment') {
    const recruitmentContext = /\b(recruit|applicant|candidate|job post|interview schedul|hiring)\b/.test(text);
    if (!recruitmentContext) { directTerms = []; supportingTerms = []; }
  }

  // Generic mentions of `data accuracy` are transferable evidence, not automatically
  // strong Data Quality evidence unless accompanied by validation/audit/verification work.
  if (requirement.id === 'req-data-quality') {
    const explicitQualityWork = /\b(data quality|data validation|validat|audit|verif|correct record|discrepanc|inconsisten)\b/.test(text);
    if (!explicitQualityWork && directTerms.some((term) => term === 'data accuracy')) {
      directTerms = directTerms.filter((term) => term !== 'data accuracy');
      if (text.includes('data accuracy')) supportingTerms = [...supportingTerms, 'data accuracy'];
    }
  }

  // Repeating Excel cannot stand in for the whole Microsoft Office suite. The umbrella
  // requirement becomes strong only with explicit Microsoft Office/MS Office wording or
  // evidence of at least two distinct Office applications.
  if (requirement.id === 'req-office' && !directTerms.length) {
    const officeApps = ['word','excel','outlook','powerpoint'].filter((app) => text.includes(app));
    supportingTerms = [...new Set(supportingTerms)];
    if (officeApps.length < 2 && supportingTerms.length > 1) supportingTerms = supportingTerms.slice(0, 1);
  }

  // `mail` must be a standalone word. Never infer physical mail/courier handling
  // from `email`, which previously contaminated weak evidence.
  if (requirement.id === 'req-mail') {
    const hasPhysicalMail = /(?:^|\s)(mail|courier|shipping)(?:\s|$)/.test(text);
    if (!hasPhysicalMail) { directTerms = []; supportingTerms = []; }
  }

  let strength: EvidenceStrength = 'none';
  let points = 0;

  if (directTerms.length) {
    const exactLabel = text.includes(requirement.normalized);
    strength = exactLabel || directTerms.length >= 2 ? 'direct' : 'strong';
    points = strength === 'direct' ? 4 : 3;
  } else if (supportingTerms.length >= 2) {
    strength = 'supporting';
    points = 2;
  } else if (supportingTerms.length === 1) {
    strength = 'weak';
    points = 1;
  }

  return {
    requirementId: requirement.id,
    requirementLabel: requirement.label,
    strength,
    points,
    matchedTerms: [...directTerms, ...supportingTerms],
  };
}

function importance(requirement: JobRequirement) {
  const priority = requirement.priority === 'required' ? 4 : requirement.priority === 'preferred' ? 2.5 : 1.5;
  const categoryMultiplier: Record<JobRequirement['category'], number> = {
    administration: 0.9, 'customer-service': 0.95, communication: 0.9, operations: 1.05,
    qualification: 1.2, project: 1.15, data: 1.3, hr: 1.4, admissions: 1.4,
    tool: 1.35, software: 1.35, engineering: 1.35, other: 1,
  };
  const distinctiveIds = new Set([
    'req-workday','req-docusign','req-populi','req-payroll','req-recruitment','req-onboarding',
    'req-hr-admin','req-admissions','req-post-secondary','req-benefits','req-employment-docs',
    'req-python','req-sql','req-react','req-cad','req-embedded','req-engineering-test','req-matlab',
  ]);
  const specificity = distinctiveIds.has(requirement.id) ? 1.35 : 1;
  const repeatSignal = Math.min(1.25, 1 + Math.log2(requirement.frequency + 1) * .08);
  return priority * categoryMultiplier[requirement.category] * specificity * repeatSignal;
}

function strongest(evidence: RequirementEvidence[]): EvidenceStrength {
  const rank: Record<EvidenceStrength, number> = { none: 0, weak: 1, supporting: 2, strong: 3, direct: 4 };
  return evidence.reduce<EvidenceStrength>((best, item) => rank[item.strength] > rank[best] ? item.strength : best, 'none');
}

function dispositionFor(sectionType: SectionType, node: ResumeModule): TargetingDisposition {
  if ((sectionType === 'experience' || sectionType === 'project') && (node.kind === 'bullet' || (node.kind === 'entry' && !(node.children?.length)))) return 'auto-select';
  if (sectionType === 'skills' || node.kind === 'skill') return 'skill-advisory';
  if (sectionType === 'summary') return 'review-only';
  return 'check-only';
}


function protectionFor(sectionType: SectionType, disposition: TargetingDisposition, locked: boolean): SectionProtection {
  if (locked) return 'fixed';
  if (disposition === 'auto-select') return 'targetable';
  if (sectionType === 'skills' || sectionType === 'summary') return 'advisory';
  return 'protected';
}

type RawRecommendation = Omit<ModuleRecommendation, 'score' | 'recommendation'> & { rawScore: number };

export function scoreResumeModules(resume: ResumeDocument, requirements: JobRequirement[]) {
  const raw: RawRecommendation[] = [];

  const walk = (nodes: ResumeModule[], parentId: string | null, sectionId: string | null, sectionType: SectionType, inheritedLocked: boolean, inheritedPriority: boolean) => {
    for (const node of nodes) {
      const isRootSection = parentId === null && node.kind === 'section';
      const nextSectionId = isRootSection ? node.id : sectionId;
      const nextSectionType = isRootSection ? classifySection(node) : sectionType;
      const effectiveLocked = inheritedLocked || Boolean(node.locked);
      // Parent Priority influences descendants without mutating their stored flag.
      const effectivePriority = inheritedPriority || Boolean(node.targetingPriority);
      const text = moduleOwnText(node);
      const evidence = requirements.map((requirement) => evidenceFor(text, requirement)).filter((item) => item.strength !== 'none');
      const evidenceValue = evidence.reduce((sum, item) => {
        const requirement = requirements.find((candidate) => candidate.id === item.requirementId)!;
        return sum + item.points * importance(requirement);
      }, 0);
      const strongestEvidence = strongest(evidence);
      const disposition = dispositionFor(nextSectionType, node);
      const diversity = new Set(evidence.filter((item) => item.points >= 2).map((item) => item.requirementId)).size;
      // User Priority is intentionally a soft signal: it only boosts modules that
      // already carry genuine JD evidence, so an unrelated starred item cannot
      // displace relevant content merely because the user marked it.
      const userIntentBonus = effectivePriority && evidenceValue > 0
        ? 4 + Math.min(6, evidenceValue * 0.12)
        : 0;
      const rawScore = evidenceValue + diversity * 1.25 + userIntentBonus;

      raw.push({
        moduleId: node.id,
        parentId,
        kind: node.kind,
        title: node.kind === 'bullet' ? (node.content ?? node.title) : (node.title || node.content || node.id),
        evidenceValue,
        strongestEvidence,
        matchedRequirements: evidence.map((item) => item.requirementLabel),
        evidence,
        estimatedCost: estimateModuleCost(node),
        disposition,
        locked: effectiveLocked,
        userPriority: effectivePriority,
        sectionId: nextSectionId,
        sectionType: nextSectionType,
        protection: protectionFor(nextSectionType, disposition, effectiveLocked),
        rawScore,
      });

      if (node.children) walk(node.children, node.id, nextSectionId, nextSectionType, effectiveLocked, effectivePriority);
    }
  };

  walk(resume.sections, null, null, 'other', false, false);
  const targetable = raw.filter((item) => item.disposition === 'auto-select' && !item.locked);
  const maxRaw = Math.max(1, ...targetable.map((item) => item.rawScore));

  return raw.map<ModuleRecommendation>(({ rawScore, ...item }) => {
    const score = rawScore <= 0 ? 0 : Math.max(1, Math.round((rawScore / maxRaw) * 100));
    const recommendation = item.strongestEvidence === 'direct' || item.strongestEvidence === 'strong'
      ? 'keep'
      : item.strongestEvidence === 'supporting' || item.strongestEvidence === 'weak'
        ? 'optional'
        : 'low';
    return { ...item, score, recommendation };
  }).sort((a, b) => b.evidenceValue - a.evidenceValue || b.score - a.score || a.estimatedCost - b.estimatedCost);
}

export function buildModuleAttention(
  resume: ResumeDocument,
  requirements: JobRequirement[],
  recommendations: ModuleRecommendation[],
): Record<string, ModuleAttention> {
  const output: Record<string, ModuleAttention> = {};
  const byId = new Map(recommendations.map((item) => [item.moduleId, item]));
  const importantMissing = requirements.filter((requirement) => requirement.priority === 'required' && requirement.coverage === 'none');

  const walk = (nodes: ResumeModule[]) => {
    for (const node of nodes) {
      const rec = byId.get(node.id);
      if (!rec) continue;
      let severity: ModuleAttention['severity'] = 'none';
      let title = '';
      const details: string[] = [];
      let skillRecommendation: ModuleAttention['skillRecommendation'];

      if (rec.disposition === 'skill-advisory') {
        if (rec.strongestEvidence === 'direct' || rec.strongestEvidence === 'strong') skillRecommendation = 'strong';
        else if (rec.strongestEvidence === 'supporting' || rec.strongestEvidence === 'weak') skillRecommendation = 'related';
        else skillRecommendation = 'neutral';
        if (skillRecommendation === 'related') {
          severity = 'warning';
          title = '相关技能，建议人工确认';
          details.push('该技能与 JD 有可迁移关联，但没有被判定为直接证据。');
        }
      }

      if (rec.disposition === 'review-only') {
        const missingFromSummary = requirements
          .filter((requirement) => requirement.priority !== 'responsibility')
          .filter((requirement) => !rec.evidence.some((item) => item.requirementId === requirement.id && item.points >= 2))
          .slice(0, 4);
        if (missingFromSummary.length) {
          severity = 'warning';
          title = '描述建议检查';
          details.push(`当前描述没有明显覆盖：${missingFromSummary.map((item) => item.label).join('、')}。`);
          details.push('仅提示修改方向，不自动改写原文。');
        }
      }

      if (rec.locked) {
        if (rec.sectionType === 'education' || rec.sectionType === 'training') {
          const relevantMissing = importantMissing.filter((requirement) => requirement.category === 'qualification' || requirement.category === 'tool');
          if (relevantMissing.length && node.kind === 'section') {
            severity = 'missing';
            title = '固定内容存在 JD 证据缺口';
            details.push(`未找到直接证据：${relevantMissing.slice(0, 4).map((item) => item.label).join('、')}。`);
            details.push('模块已固定，系统只提示，不会修改。');
          }
        } else if (rec.strongestEvidence === 'weak' || rec.strongestEvidence === 'supporting') {
          severity = 'warning';
          title = '固定内容仅提供部分证据';
          details.push(`相关要求：${rec.matchedRequirements.slice(0, 4).join('、') || '存在可迁移关联'}。`);
          details.push('模块已固定，系统只提示，不会修改。');
        }
      }

      if (rec.sectionType === 'skills' && node.kind === 'section') {
        const missingSkills = importantMissing.filter((requirement) => requirement.category === 'tool' || requirement.category === 'software' || requirement.category === 'engineering');
        if (missingSkills.length) {
          severity = 'missing';
          title = 'JD 要求的技能证据缺失';
          details.push(`未找到：${missingSkills.slice(0, 6).map((item) => item.label).join('、')}。`);
          details.push('请仅在你真实具备相关技能时手动添加。');
        }
      }

      if (severity !== 'none' || skillRecommendation) {
        output[node.id] = {
          moduleId: node.id,
          severity,
          title,
          details,
          strongestEvidence: rec.strongestEvidence,
          skillRecommendation,
        };
      }
      if (node.children) walk(node.children);
    }
  };

  walk(resume.sections);
  return output;
}
