
import { analyzeTargeting, applyRecommendationScores, applyRecommendedSelection, applySummaryRecommendationSelection } from '../core/targeting';
import { buildApplicationEmailDraft, buildCoverLetterPlan, detectApplicationLogicClosure } from '../core/application';
import type { ResumeDocument, ResumeModule } from '../core/resume/types';

const resume: ResumeDocument = {
  id: 'real-sales-admin-fixture',
  name: 'Candidate',
  candidateName: 'Candidate',
  documentName: 'Front Desk Application',
  contactLine: 'Winnipeg, MB',
  sections: [
    {
      id:'summary', kind:'section', title:'Professional Summary', selected:true, children:[
        { id:'sum-1', kind:'bullet', title:'Administrative and customer-service professional experienced in client communication, coordination, record management, and daily operational support.', content:'Administrative and customer-service professional experienced in client communication, coordination, record management, and daily operational support.', selected:true },
        { id:'sum-2', kind:'bullet', title:'Sales and logistics support professional with experience handling customer inquiries, ERP-based records, shipment coordination, and reporting.', content:'Sales and logistics support professional with experience handling customer inquiries, ERP-based records, shipment coordination, and reporting.', selected:false },
        { id:'sum-3', kind:'bullet', title:'Service-focused professional with experience supporting customers by phone and email while maintaining accurate records and resolving operational issues.', content:'Service-focused professional with experience supporting customers by phone and email while maintaining accurate records and resolving operational issues.', selected:false }
      ]
    },
    {
      id:'experience', kind:'section', title:'Work Experience', selected:true, children:[
        {
          id:'exp-1', kind:'entry', title:'Sales Administrative Specialist', subtitle:'Jul 2012 - Apr 2014', selected:true, children:[
            {id:'e1b1',kind:'bullet',title:'Responded to client and overseas branch inquiries 10-15 requests a day via email and phone efficiently reducing processing time by 30%.',content:'Responded to client and overseas branch inquiries 10-15 requests a day via email and phone efficiently reducing processing time by 30%.',selected:true},
            {id:'e1b2',kind:'bullet',title:'Coordinated travel arrangements 2 groups a week including hotels, transportation, and itineraries.',content:'Coordinated travel arrangements 2 groups a week including hotels, transportation, and itineraries.',selected:true},
            {id:'e1b3',kind:'bullet',title:'Prepared accurate quotations and managed booking details using ERP systems.',content:'Prepared accurate quotations and managed booking details using ERP systems.',selected:true},
            {id:'e1b4',kind:'bullet',title:'Handled customer issues and ensured high-quality service delivery.',content:'Handled customer issues and ensured high-quality service delivery.',selected:true},
            {id:'e1b5',kind:'bullet',title:'Generated reports on package performance and profitability.',content:'Generated reports on package performance and profitability.',selected:true}
          ]
        },
        {
          id:'exp-2', kind:'entry', title:'Sales Assistant Supervisor', subtitle:'Aug 2016 - Oct 2018', selected:true, children:[
            {id:'e2b1',kind:'bullet',title:'Provided administrative support to the sales team in daily operations.',content:'Provided administrative support to the sales team in daily operations.',selected:true},
            {id:'e2b2',kind:'bullet',title:'Maintained customer records and shipment data in internal systems efficiently and accurately, managing 3–5 new customer accounts and 5–10 shipments daily.',content:'Maintained customer records and shipment data in internal systems efficiently and accurately, managing 3–5 new customer accounts and 5–10 shipments daily.',selected:true},
            {id:'e2b3',kind:'bullet',title:'Responded to inquiries regarding shipment operations while supporting scheduling, documentation, and order tracking for high-volume shipments.',content:'Responded to inquiries regarding shipment operations while supporting scheduling, documentation, and order tracking for high-volume shipments.',selected:true}
          ]
        }
      ]
    },
    {
      id:'skills', kind:'section', title:'Skills', selected:true, children:[
        {id:'s1',kind:'skill',title:'Customer Service',content:'Customer Service',selected:true},
        {id:'s2',kind:'skill',title:'Administrative Support',content:'Administrative Support',selected:true},
        {id:'s3',kind:'skill',title:'Record Management',content:'Record Management',selected:true},
        {id:'s4',kind:'skill',title:'ERP Systems',content:'ERP Systems',selected:true},
        {id:'s5',kind:'skill',title:'Scheduling',content:'Scheduling',selected:true},
        {id:'s6',kind:'skill',title:'Social Media Marketing',content:'Social Media Marketing',selected:true}
      ]
    }
  ]
};

const jd = `
Front Desk Receptionist
Responsibilities:
- Greet and assist clients in a professional and friendly manner.
- Answer phone and client inquiries.
- Schedule and manage appointments using Jane App.
- Maintain accurate electronic client records.
- Process payments and support direct billing.
- Support retail product promotion and social media/marketing activities.
- Maintain a clean and organized front desk environment.
Qualifications:
- Strong customer service and communication skills.
- Administrative and organizational skills.
- Accurate record keeping.
`;

const analysis = analyzeTargeting({
  jobDescription: jd,
  resume,
  options: {
    settings: {
      targetPages:'1', paperSize:'letter', bodyFontSize:10.5, density:'standard', marginPreset:'standard'
    }
  }
});

const scored = applyRecommendationScores(resume, analysis.recommendations);
const evidenceTargeted = applyRecommendedSelection(scored, analysis.selectedRecommendationIds, analysis.recommendationCandidateIds);
const summaryCandidateIds = analysis.engineV2.summary.clusters.flatMap((cluster)=>cluster.memberIds);
const targeted = applySummaryRecommendationSelection(
  evidenceTargeted,
  analysis.engineV2.summary.primaryId,
  summaryCandidateIds,
  {
    text: analysis.engineV2.summary.generatedText,
    sourceIds: analysis.engineV2.summary.sourceIds,
    sourceTexts: analysis.engineV2.summary.sourceTexts,
    selectedEvidenceIds: analysis.engineV2.summary.selectedEvidenceIds,
    generationMode: analysis.engineV2.summary.generationMode,
    jobFamilyIds: analysis.engineV2.summary.jobFamilyIds,
    architectureId: analysis.engineV2.summary.architectureId,
    patternIds: analysis.engineV2.summary.patternIds,
  }
);

const cover = buildCoverLetterPlan(targeted, analysis, 'NESTERRA Massage Therapy Clinic', 'Front Desk Receptionist', {length:'short'});
const email = buildApplicationEmailDraft({
  to:'jobs@example.com',
  companyName:'NESTERRA Massage Therapy Clinic',
  roleName:'Front Desk Receptionist',
  candidateName:'Candidate',
  attachments:{resume:true,coverLetter:true,additionalFiles:[]}
});
const closure = detectApplicationLogicClosure({
  resume: targeted,
  analysis,
  coverLetter: cover.draft,
  email,
  requireCoverLetter:true,
  requireEmail:true
});

function find(id:string, nodes:ResumeModule[]): ResumeModule | null {
  for(const n of nodes) {
    if(n.id===id) return n;
    const x=find(id,n.children??[]);
    if(x) return x;
  }
  return null;
}

console.log(JSON.stringify({
  jdRequirements: analysis.requirements.map(r=>({label:r.label,coverage:r.coverage,priority:r.priority})),
  selectedEvidenceIds: analysis.engineV2.evidence.selectedIds,
  recommendedSkills: analysis.engineV2.skills.recommendedSkillIds,
  skillItems: analysis.engineV2.skills.items,
  summary: analysis.engineV2.summary,
  appliedSummary: analysis.engineV2.summary.primaryId ? find(analysis.engineV2.summary.primaryId,targeted.sections) : null,
  consistencyIssues: analysis.engineV2.consistencyIssues,
  coverLetterDraft: cover.draft,
  coverLetterMissingEvidence: cover.missingEvidence,
  email,
  closure
}, null, 2));
