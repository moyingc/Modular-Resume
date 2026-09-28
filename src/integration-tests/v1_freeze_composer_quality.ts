import { buildCoverLetterPlan, buildMiniCoverNote, inferJdJobTitle, parseContactLine } from '../core/application';
import type { ResumeDocument } from '../core/resume/types';
import type { TargetingAnalysis } from '../core/targeting';

const resume = { candidateName: 'Grace Wilson', name: 'Grace Wilson', contactLine: 'grace.wilson@example.com · 204) 555-1304' } as ResumeDocument;
const analysis = {
  requirements: [
    { label: 'Event Promotion / Coordination' },
    { label: 'Written & Verbal Communication' },
    { label: 'Scheduling / Appointments' },
  ],
  recommendations: [
    { moduleId:'a', kind:'bullet', sectionType:'experience', title:'Prepared recurring reports and correspondence supporting event promotion', score:70, evidenceValue:3, matchedRequirements:['Event Promotion / Coordination'], disposition:'auto-select', locked:false },
    { moduleId:'b', kind:'bullet', sectionType:'experience', title:'Coordinated schedules and communicated with customers and internal teams', score:68, evidenceValue:3, matchedRequirements:['Written & Verbal Communication','Scheduling / Appointments'], disposition:'auto-select', locked:false },
  ],
  engineV2:{ evidence:{ selectedIds:['a','b'] } },
} as unknown as TargetingAnalysis;

const mini = buildMiniCoverNote(resume, analysis, 'Example Org', 'Event Assistant');
if (mini.split(/\s+/).length > 50) throw new Error('Mini cover note exceeds 50 words');
if (/resume includes|experience relevant to|without claiming|\band\s+and\b/i.test(mini)) throw new Error('Mini cover note leaked mechanical/internal language');
if (!mini.includes('Event Assistant')) throw new Error('Mini cover note omitted job title');
const cover = buildCoverLetterPlan(resume, analysis, 'Example Org', 'Event Assistant').draft;
if (/without claiming|not actually used|\bevidence\b|\bcandidate\b|staff, customers, vendors, students|trackers, correspondence, or/i.test(cover)) throw new Error('Cover letter leaked internal guard/ranking language');
if (/In previous roles,\s+[A-Z][a-z]+ed\b/.test(cover)) throw new Error('Cover letter contains resume-fragment grammar');
if (!cover.includes('Event Assistant')) throw new Error('Cover letter omitted job title');
const contact = parseContactLine(resume.contactLine || '');
if (contact.phone !== '(204) 555-1304') throw new Error(`Phone formatting failed: ${contact.phone}`);


const copiedJd = `Full job description
Part-Time Front Desk Receptionist
We are seeking a reliable front desk receptionist to support evening and weekend coverage.`;
const inferredRole = inferJdJobTitle(copiedJd);
if (inferredRole !== 'Part-Time Front Desk Receptionist') throw new Error(`JD title inference failed: ${inferredRole}`);
const inferredMini = buildMiniCoverNote(resume, analysis, 'Example Org', inferredRole);
if (!inferredMini.includes('Part-Time Front Desk Receptionist')) throw new Error('Mini cover note did not receive inferred JD title');
if (/Full job description/i.test(inferredMini)) throw new Error('Mini cover note leaked generic JD heading as role');
const inferredCover = buildCoverLetterPlan(resume, analysis, 'Example Org', inferredRole).draft;
if (!inferredCover.includes('Part-Time Front Desk Receptionist')) throw new Error('Cover letter did not receive inferred JD title');
if (/Full job description/i.test(inferredCover)) throw new Error('Cover letter leaked generic JD heading as role');

console.log('V1 freeze composer quality PASS');
