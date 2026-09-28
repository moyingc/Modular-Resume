import { extractJdEmailCandidates, inferJdApplicationEmail, buildApplicationEmailDraft } from '../core/application';

const jd = `Please submit your resume and cover letter to careers@example.ca.\nFor website support contact support@example.ca.`;
const candidates = extractJdEmailCandidates(jd);
if (inferJdApplicationEmail(jd) !== 'careers@example.ca') throw new Error('JD application email ranking failed');
if (candidates[0]?.email !== 'careers@example.ca') throw new Error('JD candidate order failed');

const draft = buildApplicationEmailDraft({
  to: 'careers@example.ca',
  cc: ['recruiter@example.ca', ' hiring.manager@example.ca '],
  companyName: 'Example Co',
  roleName: 'Engineer',
  candidateName: 'Candidate',
});
if (draft.cc.join(',') !== 'recruiter@example.ca,hiring.manager@example.ca') throw new Error('CC normalization failed');
console.log(JSON.stringify({ inferred: inferJdApplicationEmail(jd), candidates, cc: draft.cc }, null, 2));
