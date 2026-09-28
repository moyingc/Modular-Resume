import type { ResumeDocument, ResumeModule } from '../resume/types';

let seq = 0;
const id = (kind: string) => `import-${kind}-${Date.now().toString(36)}-${(++seq).toString(36)}`;

const clean = (value: string) => value
  .replace(/\\\|/g, '|')
  .replace(/\*\*/g, '')
  .replace(/__/g, '')
  .replace(/`/g, '')
  .replace(/\s*\|\s*/g, ' | ')
  .replace(/\s+/g, ' ')
  .trim();

const sectionNames = new Set([
  'professional summary','summary','profile','work experience','experience','employment','projects','project experience',
  'skills','technical skills','education','training','certifications','additional experience','additional capabilities','volunteer experience'
]);
const isSectionName = (s: string) => sectionNames.has(clean(s).toLowerCase());

function logicalMarkdownLines(text: string) {
  const physical = text.split(/\r?\n/);
  const out: string[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (!paragraph.length) return;
    const joined = paragraph.join(' ').replace(/\s+/g, ' ').trim();
    if (joined) out.push(joined);
    paragraph = [];
  };
  for (const raw of physical) {
    const t = raw.trim();
    if (!t) { flush(); continue; }
    if (/^#{1,3}\s/.test(t) || /^(?:-{3,}|\*{3,}|_{3,})$/.test(t.replace(/\s/g,''))) {
      flush(); out.push(t); continue;
    }
    // True Markdown list items remain separate logical records. Wrapped continuation
    // lines are joined into the same paragraph until the next blank/heading.
    if (/^[-*•]\s+/.test(t)) { flush(); paragraph.push(t); continue; }
    paragraph.push(t);
  }
  flush();
  return out;
}
function makeSection(title: string): ResumeModule { return { id:id('section'), kind:'section', title:clean(title)||'Other', selected:true, locked:false, children:[] }; }
function makeEntry(title: string, subtitle=''): ResumeModule { return { id:id('entry'), kind:'entry', title:clean(title)||'Entry', subtitle:clean(subtitle), selected:true, locked:false, children:[] }; }
function makeBullet(content: string): ResumeModule { const c=clean(content); return { id:id('bullet'), kind:'bullet', title:c, content:c, selected:true, locked:false }; }
function makeSkill(content: string): ResumeModule { const c=clean(content); return { id:id('skill'), kind:'skill', title:c, content:c, selected:true, locked:false }; }

export function parseCanonicalResume(lines: string[], fallbackName: string): ResumeDocument {
  const fallback = fallbackName.replace(/\.[^.]+$/, '').trim() || 'Imported Resume';
  let name=fallback, contactLine='', section:ResumeModule|null=null, entry:ResumeModule|null=null;
  const sections: ResumeModule[]=[];
  let sawName=false;
  const addSection=(title:string)=>{ section=makeSection(title); sections.push(section); entry=null; return section; };
  const ensure=()=>section ?? addSection('Other');
  for (const raw of lines) {
    let line=raw.trim(); if (!line || /^(?:-{3,}|\*{3,}|_{3,})$/.test(line.replace(/\s/g,''))) continue;
    if (/^#\s+/.test(line)) { name=clean(line.replace(/^#\s+/,''))||fallback; sawName=true; continue; }
    if (/^##\s+/.test(line)) { addSection(line.replace(/^##\s+/,'')); continue; }
    if (!section && isSectionName(line)) { addSection(line); continue; }
    if (/^###\s+/.test(line)) { entry=makeEntry(line.replace(/^###\s+/,'')); ensure().children!.push(entry); continue; }
    const bullet=/^[-*•]\s+/.test(line); if (bullet) line=line.replace(/^[-*•]\s+/, '');
    const c=clean(line); if (!c) continue;
    if (sawName && !contactLine && sections.length===0) { contactLine=c; continue; }
    const currentSection = section as ResumeModule | null;
    const sectionKey=(currentSection?.title||'').toLowerCase();
    if (bullet) {
      const leaf = /skills?/.test(sectionKey) ? makeSkill(c) : makeBullet(c);
      if (entry) entry.children!.push(leaf); else ensure().children!.push(leaf);
      continue;
    }
    if (entry) {
      if (!entry.subtitle) {
        // Pandoc/Word conversions may flatten an entry subtitle and its bullets into
        // one paragraph: **Company | Date** - Bullet A - Bullet B.
        const rawClean = line.replace(/\\\|/g, '|');
        const bold = rawClean.match(/^\*\*(.+?)\*\*\s*(.*)$/);
        if (bold) {
          entry.subtitle = clean(bold[1]);
          const tail = clean(bold[2]).replace(/^[-–—]\s*/, '');
          if (tail) tail.split(/\s+-\s+(?=[A-Z])/).map(clean).filter(Boolean).forEach((part) => entry!.children!.push(makeBullet(part)));
        } else {
          entry.subtitle=c;
        }
      } else entry.children!.push(makeBullet(c));
      continue;
    }
    // Education/training/additional sections often contain compact records without ### headings.
    if (/education|training|certification/.test(sectionKey)) {
      const parts=c.split(/\s+\|\s+/).filter(Boolean);
      const e=makeEntry(parts.shift()||c, parts.join(' | ')); ensure().children!.push(e); entry=null; continue;
    }
    // A bold/plain compact record in Experience/Projects is an entry subtitle only when an entry heading already exists;
    // otherwise preserve it as section content rather than inventing ownership.
    ensure().children!.push(makeBullet(c));
  }
  if (!sections.length) { const s=addSection('Imported Content'); s.children!.push(makeBullet(clean(lines.join(' ')))); }
  return { id:id('resume'), name, candidateName:name, documentName:fallback, contactLine, sections };
}

export function parseMarkdownResume(text: string, fallbackName: string) {
  return parseCanonicalResume(logicalMarkdownLines(text), fallbackName);
}

const looksLikeContactLine = (text: string) => {
  const t = clean(text);
  return /@/.test(t) || /\b(?:https?:\/\/|www\.|linkedin\.com)\b/i.test(t) || /[|·]/.test(t) || /\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}/.test(t);
};

const looksLikePersonName = (text: string) => {
  const t = clean(text);
  if (!t || looksLikeContactLine(t) || isSectionName(t) || t.length > 70) return false;
  const words = t.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 6 && words.every((word) => /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]+$/.test(word));
};

export async function parseDocxResume(buffer: ArrayBuffer, fallbackName: string): Promise<ResumeDocument> {
  const mammoth = await import('mammoth');
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  const doc = new DOMParser().parseFromString(result.value, 'text/html');
  const lines: string[]=[];
  let sawIdentity = false;
  let sawSection = false;

  for (const el of Array.from(doc.body.children)) {
    const tag=el.tagName.toLowerCase(); const text=clean(el.textContent||''); if (!text) continue;
    if (tag==='h1') { lines.push(`# ${text}`); sawIdentity=true; }
    else if (tag==='h2') { lines.push(`## ${text}`); sawSection=true; }
    else if (tag==='h3') lines.push(`### ${text}`);
    else if (tag==='ul' || tag==='ol') for (const li of Array.from(el.querySelectorAll(':scope > li'))) lines.push(`- ${clean(li.textContent||'')}`);
    else if (isSectionName(text) || (text===text.toUpperCase() && text.length<45 && /^[A-Z &/]+$/.test(text))) {
      lines.push(`## ${text}`); sawSection=true;
    }
    else if (!sawSection && !sawIdentity && looksLikePersonName(text)) {
      // DOCX resumes commonly format the candidate name as a styled paragraph rather
      // than a true Heading 1. Body identity must override the filename fallback.
      lines.push(`# ${text}`); sawIdentity=true;
    }
    else lines.push(text);
  }
  return parseCanonicalResume(lines, fallbackName);
}
