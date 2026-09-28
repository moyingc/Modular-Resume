import type { EmailDraftPlan, EmailTemplate, ApplicationAttachmentSelection } from './types';

export const DEFAULT_APPLICATION_EMAIL_TEMPLATE: EmailTemplate = {
  id: 'default-application',
  name: 'Default Application',
  subject: 'Application for {role}',
  greeting: 'Dear Hiring Manager,',
  opening: '',
  closing: 'Thank you for your time and consideration.',
  signature: '{name}',
};

function fill(value: string, vars: Record<string,string>) {
  return value.replace(/\{([a-zA-Z_]+)\}/g, (_,key) => vars[key] ?? '');
}

export function parseContactLine(contactLine: string) {
  const email = contactLine.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? '';
  const rawPhone = contactLine.match(/(?:\+?\d?[\d\s().-]{7,}\d)/)?.[0]?.trim() ?? '';
  const digits = rawPhone.replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  const phone = local.length === 10 ? `(${local.slice(0,3)}) ${local.slice(3,6)}-${local.slice(6)}` : rawPhone;
  return { email, phone };
}


export function buildApplicationEmailDraft(input: {
  to?: string;
  cc?: string[];
  companyName: string;
  roleName: string;
  candidateName: string;
  candidateEmail?: string;
  candidatePhone?: string;
  miniCoverNote?: string;
  bodyOverride?: string;
  template?: EmailTemplate;
  attachments?: Partial<ApplicationAttachmentSelection>;
}) : EmailDraftPlan {
  const template=input.template ?? DEFAULT_APPLICATION_EMAIL_TEMPLATE;
  const vars={company:input.companyName.trim(),role:input.roleName.trim(),name:input.candidateName.trim()};
  const warnings:string[]=[];
  if(!input.to?.trim()) warnings.push('recipient-missing');
  if(!vars.role) warnings.push('role-missing');
  if(!vars.company) warnings.push('company-missing');
  const attachments: ApplicationAttachmentSelection = {
    resume: input.attachments?.resume ?? true,
    coverLetter: input.attachments?.coverLetter ?? false,
    additionalFiles: input.attachments?.additionalFiles ?? [],
  };
  const signature=[vars.name,input.candidateEmail?.trim(),input.candidatePhone?.trim()].filter(Boolean).join('\n');
  const generatedBody=[fill(template.greeting,vars),input.miniCoverNote?.trim(),fill(template.closing,vars),signature]
    .filter(Boolean).join('\n\n');
  return {to:input.to?.trim()??'',cc:(input.cc ?? []).map((item)=>item.trim()).filter(Boolean),subject:fill(template.subject,vars),body:input.bodyOverride ?? generatedBody,attachments,warnings};
}
