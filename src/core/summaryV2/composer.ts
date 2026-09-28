
import type { ResumeModule } from '../resume/types';
import type { SummaryV2Input, SummaryV2Result } from './types';
import { employerFacingLabel } from './employerFacingLabels';

type Family = { id: string; name: string; terms: string[] };

const FAMILIES: Family[] = [
  { id:'JF01', name:'Administrative & Office Support', terms:['administrative','office','records','scheduling','documentation','coordination','correspondence','clerical'] },
  { id:'JF02', name:'Customer Service & Front Desk', terms:['customer service','client service','front desk','reception','inquiries','appointments','issue resolution','customer-facing'] },
  { id:'JF03', name:'Sales & Business Development', terms:['sales','accounts','quotations','revenue','business development','client relationship'] },
  { id:'JF04', name:'Finance & Accounting', terms:['accounting','finance','reconciliation','accounts payable','financial reporting','bookkeeping','excel'] },
  { id:'JF05', name:'Supply Chain, Logistics & Transportation', terms:['logistics','shipment','shipping','freight','inventory','supply chain','warehouse','order tracking'] },
  { id:'JF06', name:'Software, IT & Data', terms:['software','developer','programming','python','javascript','typescript','react','api','database','sql','data','analytics','IT support'] },
  { id:'JF07', name:'Engineering & Applied Technology', terms:['engineering','design','testing','validation','embedded','robotics','hardware','systems','electronics'] },
  { id:'JF08', name:'Manufacturing, Operations & Quality', terms:['manufacturing','production','quality','inspection','process','operations','continuous improvement','defect'] },
  { id:'JF09', name:'Project & Program Management', terms:['project','program','stakeholder','schedule','delivery','risk','milestone','project manager'] },
  { id:'JF10', name:'Healthcare & Clinical Support', terms:['healthcare','clinical','patient','medical','clinic','care','medical records'] },
  { id:'JF11', name:'Marketing & Communications', terms:['marketing','communications','content','campaign','brand','social media','copywriting'] },
  { id:'JF12', name:'Leadership & People Management', terms:['leadership','supervisor','team','supervision','staff','performance','people management'] },
  { id:'JF13', name:'Business Analysis & Consulting', terms:['business analyst','business analysis','requirements','process analysis','process mapping','consulting'] },
  { id:'JF14', name:'Human Resources & Recruitment', terms:['human resources','HR','recruitment','onboarding','employee relations','talent acquisition'] },
  { id:'JF15', name:'Education & Training', terms:['education','teacher','teaching','training','instructor','student support','learning'] },
  { id:'JF16', name:'Hospitality & Food Service', terms:['hospitality','hotel','restaurant','food service','guest service','reservation'] },
  { id:'JF17', name:'Skilled Trades & Field Service', terms:['technician','maintenance','repair','installation','mechanic','field service','equipment'] },
  { id:'JF18', name:'Legal, Compliance & Public Administration', terms:['legal','law','compliance','regulatory','policy','public administration','contracts'] },
];

const stop = new Set('a an the and or to of in on for with from by as at into across while using use support supporting experience experienced professional specialist coordinator assistant student junior senior'.split(' '));

function norm(value: string) {
  return value.toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}+#.\- ]/gu, ' ').replace(/\s+/g,' ').trim();
}
function tokens(value: string) {
  return norm(value).split(' ').filter((t) => t.length > 1 && !stop.has(t));
}
function vector(value: string) {
  const out = new Map<string, number>();
  for (const t of tokens(value)) out.set(t, (out.get(t) ?? 0) + 1);
  return out;
}
function cosine(a: string, b: string) {
  const va = vector(a), vb = vector(b);
  let dot=0, aa=0, bb=0;
  for (const v of va.values()) aa += v*v;
  for (const v of vb.values()) bb += v*v;
  for (const [k,v] of va) dot += v*(vb.get(k) ?? 0);
  return aa && bb ? dot/Math.sqrt(aa*bb) : 0;
}
function overlap(a:string,b:string) {
  const A=new Set(tokens(a)), B=new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let n=0; for (const x of A) if (B.has(x)) n++;
  return n/Math.max(1, Math.min(A.size,B.size));
}

function flatten(nodes: ResumeModule[]): ResumeModule[] {
  const out: ResumeModule[] = [];
  const walk=(n:ResumeModule)=>{ out.push(n); for(const c of n.children??[]) walk(c); };
  for(const n of nodes) walk(n);
  return out;
}
function summaryTextNode(n: ResumeModule) {
  return (n.content ?? n.title).trim();
}
function familyScores(jd: string, reqLabels: string[]) {
  const query = `${jd} ${reqLabels.join(' ')}`;
  return FAMILIES.map((f) => {
    const surface = `${f.name} ${f.terms.join(' ')}`;
    const score = 0.72*cosine(query,surface)+0.28*overlap(query,surface);
    return {id:f.id,name:f.name,score:Number(score.toFixed(4))};
  }).sort((a,b)=>b.score-a.score).slice(0,3);
}

function selectSummarySources(resume: SummaryV2Input['resume'], ids: string[], query: string) {
  const byId = new Map(flatten(resume.sections).map((n)=>[n.id,n]));
  return ids.map((id)=>{
    const node=byId.get(id);
    if(!node) return null;
    const text=summaryTextNode(node);
    return {id,text,score:cosine(query,text)};
  }).filter((x): x is {id:string;text:string;score:number} => Boolean(x))
    .sort((a,b)=>b.score-a.score)
    .slice(0, ids.length > 1 ? 3 : 1);
}

function selectedEvidence(input: SummaryV2Input) {
  const selected = new Set(input.selectedEvidenceIds);
  return input.recommendations
    .filter((r)=>selected.has(r.moduleId) && (r.kind==='bullet' || r.kind==='entry'))
    .sort((a,b)=>b.score-a.score)
    .slice(0,6);
}


function resumePhrase(label:string) {
  return employerFacingLabel(label);
}

function evidenceConceptPhrases(recommendations: SummaryV2Input['recommendations']) {
  const seen = new Set<string>();
  const phrases: string[] = [];
  const ranked = recommendations.flatMap((rec) =>
    rec.evidence
      .filter((ev) => ev.points >= 2)
      .map((ev) => ({ label: ev.requirementLabel.trim(), points: ev.points, score: rec.score }))
  ).sort((a,b)=>b.points-a.points || b.score-a.score);
  for (const item of ranked) {
    const phrase=resumePhrase(item.label);
    const key=norm(phrase);
    if(!key || seen.has(key)) continue;
    seen.add(key);
    phrases.push(phrase);
    if(phrases.length>=5) break;
  }
  return phrases;
}

function cleanEvidence(text:string) {
  return text.replace(/^[•*\-–—]+\s*/,'').replace(/\s+/g,' ').trim().replace(/[.;]+$/,'');
}
function join(items:string[]) {
  const a=items.filter(Boolean);
  if(a.length===0) return '';
  if(a.length===1) return a[0];
  if(a.length===2) return `${a[0]} and ${a[1]}`;
  return `${a.slice(0,-1).join(', ')}, and ${a[a.length-1]}`;
}
function firstSentence(text:string) {
  return text.split(/(?<=[.!?])\s+/)[0]?.trim().replace(/[.!?]+$/,'') ?? '';
}

function sourceCapabilityPhrases(sourceTexts:string[], query:string) {
  const phrases:string[]=[];
  const cuePatterns = [
    /\b(?:experienced in|experience in|strengths in|skilled in|background in|background includes|experience includes)\s+(.+?)(?:[.!]|$)/i,
    /\b(?:combines|brings)\s+(.+?)(?:\s+to\s+support\s+|[.!]|$)/i,
    /\b(?:hands-on experience with|technical background includes)\s+(.+?)(?:[.!]|$)/i,
  ];
  for(const text of sourceTexts) {
    for(const sentence of text.split(/(?<=[.!?])\s+/)) {
      let body='';
      for(const pattern of cuePatterns) {
        const m=sentence.match(pattern);
        if(m?.[1]) { body=m[1]; break; }
      }
      if(!body) continue;
      const normalizedBody=body
        .replace(/\s+(?:while|with|including)\s+.+$/i,'')
        .replace(/\s+and\s+/g, ', ');
      for(const raw of normalizedBody.split(',')) {
        const phrase=raw.trim();
        const words=phrase.split(/\s+/).filter(Boolean);
        if(words.length < 1 || words.length > 7 || phrase.length < 4 || phrase.length > 72) continue;
        if(/^(a|an|the|this|that|these|those)\s+/i.test(phrase)) continue;
        phrases.push(phrase);
      }
    }
  }
  const unique=[...new Map(phrases.map((x)=>[norm(x),x])).values()];
  return unique
    .map((phrase)=>({phrase,score:0.72*cosine(query,phrase)+0.28*overlap(query,phrase)}))
    .filter((x)=>x.score>0)
    .sort((a,b)=>b.score-a.score)
    .map((x)=>x.phrase)
    .slice(0,4);
}

function inferIdentity(sourceTexts:string[], families:ReturnType<typeof familyScores>) {
  const sourceLead = firstSentence(sourceTexts[0] ?? '');
  if(sourceLead && sourceLead.split(/\s+/).length <= 16) {
    const m=sourceLead.match(/^(.{3,70}?)(?:\s+with\s+|\s+experienced\s+|\s+bringing\s+)/i);
    if(m?.[1]) return m[1].trim();
  }
  const defaults: Record<string,string> = {
    JF01:'Administrative professional',JF02:'Customer-service professional',JF03:'Sales professional',
    JF04:'Accounting professional',JF05:'Logistics professional',JF06:'Software and data professional',
    JF07:'Engineering professional',JF08:'Operations professional',JF09:'Project professional',
    JF10:'Healthcare support professional',JF11:'Marketing professional',JF12:'Team leader',
    JF13:'Business analysis professional',JF14:'Human resources professional',JF15:'Training professional',
    JF16:'Guest-service professional',JF17:'Field service professional',JF18:'Compliance support professional'
  };
  return defaults[families[0]?.id] ?? 'Professional';
}

function chooseArchitecture(familyId:string, evidenceCount:number) {
  if(['JF06','JF07'].includes(familyId)) return 'A05';
  if(['JF01','JF02','JF10'].includes(familyId)) return 'A06';
  if(familyId==='JF03') return 'A07';
  if(['JF05','JF08'].includes(familyId)) return 'A09';
  if(familyId==='JF12') return 'A08';
  return evidenceCount >= 3 ? 'A01' : 'A10';
}

function wordCount(text:string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const CONCEPT_ALIASES: Array<{id:string; terms:string[]}> = [
  {id:'customer-service',terms:['customer service','customer-focused','customer support','client service']},
  {id:'cash-handling',terms:['cash handling','cash-handling','register operations','register experience','payment handling']},
  {id:'records',terms:['records management','record management','customer records','documentation']},
  {id:'office-admin',terms:['office administration','administrative support','sales administration']},
  {id:'front-desk',terms:['front-desk','front desk','reception']},
  {id:'phone',terms:['phone support','phone','telephone']},
  {id:'scheduling',terms:['scheduling','appointments','appointment coordination']},
  {id:'coordination',terms:['coordination','coordinating','collaborate','collaboration']},
  {id:'priorities',terms:['competing priorities','multiple priorities','organization and changing priorities']},
  {id:'data-entry',terms:['data entry','data-entry']},
  {id:'retail-context',terms:['fast-paced retail','retail environment','retail environments','retail experience']},
  {id:'food-service-context',terms:['food service','food-service']},
  {id:'payments',terms:['electronic payment','electronic payments','payment processing','pos system','pos systems']},
];

function conceptsIn(text:string): Set<string> {
  const normalized=norm(text);
  const found=new Set<string>();
  for(const concept of CONCEPT_ALIASES) {
    if(concept.terms.some((term)=>normalized.includes(norm(term)))) found.add(concept.id);
  }
  return found;
}

function conceptNovelty(candidate:string, used:Set<string>) {
  const concepts=conceptsIn(candidate);
  if(!concepts.size) return 1;
  let fresh=0;
  for(const concept of concepts) if(!used.has(concept)) fresh+=1;
  return fresh/concepts.size;
}

function rememberConcepts(text:string, used:Set<string>) {
  for(const concept of conceptsIn(text)) used.add(concept);
}


function significantWords(text:string) {
  const stop=new Set(['and','or','the','a','an','in','on','of','to','for','with','through','by','at','from','as','is','are','be']);
  return norm(text).split(/\s+/).filter((word)=>word.length>2 && !stop.has(word));
}

function phraseAlreadyCovered(phrase:string, accepted:string[]) {
  const words=significantWords(phrase);
  if(!words.length) return false;
  const hay=norm(accepted.join(' '));
  const covered=words.filter((word)=>hay.includes(word)).length / words.length;
  return covered >= 0.72;
}

function polishEvidencePhrase(raw:string) {
  const phrase=cleanEvidence(raw)
    .replace(/\s*&\s*/g,' and ')
    .replace(/\bphone\b/gi,'handling phone inquiries')
    .replace(/\btelephone\b/gi,'handling phone inquiries')
    .replace(/\bappointments\b/gi,'appointment scheduling')
    .replace(/\s+/g,' ')
    .trim();

  // Requirement labels often arrive as nouns. Convert a few common labels into
  // employer-facing capability phrases so the Summary reads as prose, not tags.
  const normalized=norm(phrase);
  const exact:Record<string,string>={
    'scheduling and calendar coordination':'scheduling and calendar coordination',
    'scheduling calendar coordination':'scheduling and calendar coordination',
    'customer service':'customer service',
    'cash handling':'cash handling',
    'front desk':'front-desk support',
    'reception front desk':'front-desk support',
    'data entry':'accurate data entry',
    'records management':'record management',
    'record management':'record management',
  };
  return exact[normalized] ?? phrase;
}

function evidenceSentence(
  evidence:string[],
  accepted:string[],
  variant:0|1|2,
) {
  const fresh=evidence
    .map(polishEvidencePhrase)
    .filter(Boolean)
    .filter((phrase,index,array)=>array.findIndex((other)=>norm(other)===norm(phrase))===index)
    .filter((phrase)=>!phraseAlreadyCovered(phrase,accepted))
    .filter((phrase)=>!accepted.some((sentence)=>overlap(sentence,phrase)>=0.58));

  if(!fresh.length) return '';
  const picked=fresh.slice(0,3);
  const proseList = picked.length===2
    ? `${picked[0]}, along with ${picked[1]}`
    : join(picked);

  if(variant===1) {
    return `Experienced in ${proseList}.`;
  }
  if(variant===2) {
    return `Brings hands-on experience in ${proseList}.`;
  }
  return `Experienced in ${proseList}.`;
}

function proseQualityPenalty(text:string) {
  let penalty=0;
  if(/\b(phone|telephone)\b[,.]?\s*(?:and|$)/i.test(text)) penalty+=0.24;
  if(/\badditional strengths include\b/i.test(text)) penalty+=0.04;
  if(/\bexperienced in\b/i.test(text) && text.split(',').length>=4) penalty+=0.06;
  if(/\bfast-paced retail\b/i.test(text) && (text.match(/\bfast-paced retail\b/gi)?.length ?? 0)>1) penalty+=0.18;
  return penalty;
}

function sentenceValue(text:string, query:string, used:Set<string>) {
  const relevance=0.55*cosine(query,text)+0.25*overlap(query,text);
  const concepts=conceptsIn(text);
  const novelty=concepts.size ? [...concepts].filter((concept)=>!used.has(concept)).length/concepts.size : 0.5;
  const quantified=/\b\d+(?:\+|%|\s*(?:years?|daily|weekly|per day|per week))?\b/i.test(text) ? 0.12 : 0;
  const action=/\b(proven|managed|handled|coordinated|supported|delivered|maintained|prepared|resolved|collaborated|demonstrated|skilled)\b/i.test(text) ? 0.08 : 0;
  const generic=/^(additional relevant experience includes|brings practical strengths in)\b/i.test(text.trim()) ? -0.10 : 0;
  return relevance + 0.12*novelty + quantified + action + generic - proseQualityPenalty(text);
}

function completeSentence(text:string) {
  const clean=text.trim();
  return /[.!?]$/.test(clean)?clean:`${clean}.`;
}

function compose(identity:string, families:ReturnType<typeof familyScores>, evidence:string[], sourceTexts:string[], query:string, variant:0|1|2=0) {
  const fam=families[0]?.id ?? 'JF01';
  const architecture=chooseArchitecture(fam,evidence.length);
  const e=evidence.map(cleanEvidence).filter(Boolean);
  const patterns:string[]=[];
  const usedConcepts=new Set<string>();

  // Primary reference is the highest-similarity historical Summary.
  // V9.2 treats it as the baseline draft instead of merely a source pool.
  const primarySentences=(sourceTexts[0] ?? '')
    .split(/(?<=[.!?])\s+/)
    .map((sentence)=>sentence.trim())
    .filter((sentence)=>sentence.length>=24);

  const secondarySentences=sourceTexts.slice(1)
    .flatMap((text)=>text.split(/(?<=[.!?])\s+/))
    .map((sentence)=>sentence.trim())
    .filter((sentence)=>sentence.length>=24);

  const novelEvidence=e.filter((phrase)=>phrase.trim().length>0);
  const initialEvidenceSentence=evidenceSentence(novelEvidence,primarySentences.slice(0,2),variant);
  const evidenceCandidates:string[]=[];
  if(initialEvidenceSentence) evidenceCandidates.push(initialEvidenceSentence);

  // Variant 0 protects the historical baseline most strongly.
  // Variants 1/2 recompose only with supported evidence and alternate prose,
  // never by injecting unsupported JD keywords.
  const secondaryPool=variant===0
    ? secondarySentences
    : [...secondarySentences].sort((a,b)=>sentenceValue(b,query,new Set())-sentenceValue(a,query,new Set()));
  const replacementPool=[...secondaryPool,...evidenceCandidates];
  const finalSentences:string[]=[];
  const REPLACEMENT_MARGIN=variant===0 ? 0.18 : variant===1 ? 0.12 : 0.08;

  const accept=(sentence:string, pattern:string)=>{
    const clean=completeSentence(sentence);
    finalSentences.push(clean);
    rememberConcepts(clean,usedConcepts);
    patterns.push(pattern);
  };

  if(primarySentences.length) {
    // Sentence 1: preserve the primary reference unless it is unusably short.
    accept(primarySentences[0], 'KEEP-PRIMARY-1');

    for(let index=1; index<primarySentences.length && finalSentences.length<4; index+=1) {
      const original=primarySentences[index];
      const originalScore=sentenceValue(original,query,usedConcepts);

      const candidates=replacementPool
        .filter((candidate)=>!finalSentences.some((existing)=>overlap(existing,candidate)>=0.72))
        .map((candidate)=>({candidate,score:sentenceValue(candidate,query,usedConcepts)}))
        .sort((a,b)=>b.score-a.score);

      const best=candidates[0];

      // Preserve a good historical sentence by default. Replacement is allowed
      // only if the new candidate materially improves JD relevance/evidence value.
      if(best && proseQualityPenalty(best.candidate) < 0.20 && best.score >= originalScore + REPLACEMENT_MARGIN) {
        accept(best.candidate, variant===0 ? 'REPLACE-HIGHER-VALUE' : `RECOMPOSE-V${variant}`);
      } else {
        accept(original, 'KEEP-PRIMARY');
      }
    }
  } else {
    // No historical Summary: deterministic evidence-grounded fallback.
    if(e.length>=2) {
      accept(`${identity} with experience in ${join(e.slice(0,3))}`, 'I-EVID-01');
    } else {
      accept(identity, 'IDENTITY');
    }
    for(const candidate of evidenceCandidates) {
      if(finalSentences.length>=3) break;
      if(conceptNovelty(candidate,usedConcepts)>=0.5) accept(candidate,'EVIDENCE-FILL');
    }
  }

  // Rebuild the complementary evidence sentence against the sentences actually
  // kept so repeated phrases such as "fast-paced retail" are filtered out.
  const complementaryEvidence=evidenceSentence(novelEvidence,finalSentences,variant);
  const expansionCandidates=[
    ...secondarySentences,
    ...(complementaryEvidence ? [complementaryEvidence] : []),
  ];

  // If the primary reference is short, add only a complementary sentence.
  if(finalSentences.join(' ').split(/\s+/).filter(Boolean).length<55) {
    const extra=expansionCandidates
      .filter((candidate)=>!finalSentences.some((existing)=>overlap(existing,candidate)>=0.72))
      .filter((candidate)=>conceptNovelty(candidate,usedConcepts)>=0.5)
      .map((candidate)=>({candidate,score:sentenceValue(candidate,query,usedConcepts)}))
      .sort((a,b)=>b.score-a.score)[0];
    if(extra) accept(extra.candidate,'COMPLEMENTARY-EXPANSION');
  }

  let text=finalSentences.join(' ').replace(/\s+/g,' ').trim();

  // Hard ceiling protects the page budget while preserving complete sentences.
  if(wordCount(text)>110) {
    const kept:string[]=[]; let count=0;
    for(const sentence of text.split(/(?<=[.!?])\s+/)) {
      const next=wordCount(sentence);
      if(kept.length && count+next>110) break;
      kept.push(sentence); count+=next;
    }
    text=kept.join(' ');
  }

  return {text,architecture,patterns};
}

export function generateSummaryV2(input: SummaryV2Input): SummaryV2Result {
  const reqLabels=input.requirements.map((r)=>r.label);
  const query=`${input.jobDescription} ${reqLabels.join(' ')}`;
  const families=familyScores(input.jobDescription,reqLabels);
  const sources=selectSummarySources(input.resume,input.candidateSummaryIds,query);
  const evidenceRecs=selectedEvidence(input);
  const sourceTexts=sources.map((s)=>s.text);
  // Summary phrases are the preferred prose source because the user already
  // approved their wording. Selected Work/Project evidence can add supported
  // JD concepts, but never replace all natural source-summary language.
  const sourcePhrases=sourceCapabilityPhrases(sourceTexts,query);
  const evidencePhrases=evidenceConceptPhrases(evidenceRecs);
  const evidenceText=[...sourcePhrases];
  for(const candidate of evidencePhrases) {
    if(evidenceText.some((existing)=>overlap(existing,candidate)>=0.7)) continue;
    evidenceText.push(candidate);
    if(evidenceText.length>=5) break;
  }
  const identity=inferIdentity(sourceTexts,families);
  const composed=compose(identity,families,evidenceText,sourceTexts,query,input.compositionVariant ?? 0);
  const warnings:string[]=[];
  if(!sources.length) warnings.push('no-summary-source');
  if(!evidenceRecs.length) warnings.push('no-selected-work-project-evidence');
  if(composed.text.split(/\s+/).length < 55) warnings.push('summary-below-default-length');
  return {
    text:composed.text,
    sourceIds:sources.map((s)=>s.id),
    sourceTexts,
    sourceReferences:sources.map((source,index)=>({
      id:source.id,
      text:source.text,
      similarity:Number(source.score.toFixed(4)),
      role:index===0?'primary':'secondary',
    })),
    selectedEvidenceIds:evidenceRecs.map((r)=>r.moduleId),
    mode:sources.length>1?'multi-reference':'single-rewrite',
    jobFamilies:families,
    architectureId:composed.architecture,
    patternIds:composed.patterns,
    warnings,
  };
}
