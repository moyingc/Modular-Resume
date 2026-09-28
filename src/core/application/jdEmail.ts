export interface JdEmailCandidate {
  email: string;
  score: number;
  context: string;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const TARGET_HINTS: Array<[RegExp, number]> = [
  [/apply|application|submit|resume|résumé|cv/i, 5],
  [/hiring|recruit|recruitment|recruiter|talent|career|careers|jobs?/i, 4],
  [/contact|email|e-mail|inquir|hr|human resources/i, 3],
];
const LOW_VALUE_HINTS: Array<[RegExp, number]> = [
  [/privacy|legal|support|webmaster|unsubscribe|newsletter/i, -5],
  [/no[-_.]?reply|donotreply|do[-_.]?not[-_.]?reply/i, -10],
];

function normalize(email: string) {
  return email.trim().replace(/[),.;:]+$/g, '').toLowerCase();
}

export function extractJdEmailCandidates(jobDescription: string): JdEmailCandidate[] {
  if (!jobDescription.trim()) return [];
  const matches = [...jobDescription.matchAll(EMAIL_RE)];
  const seen = new Set<string>();
  const candidates: JdEmailCandidate[] = [];
  for (const match of matches) {
    const raw = match[0] ?? '';
    const email = normalize(raw);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const index = match.index ?? 0;
    const lineStart = jobDescription.lastIndexOf('\n', index - 1) + 1;
    const nextLineBreak = jobDescription.indexOf('\n', index + raw.length);
    const lineEnd = nextLineBreak === -1 ? jobDescription.length : nextLineBreak;
    const scoringContext = jobDescription.slice(lineStart, lineEnd);
    const context = jobDescription.slice(Math.max(0, index - 120), Math.min(jobDescription.length, index + raw.length + 120));
    let score = 1;
    for (const [pattern, value] of TARGET_HINTS) if (pattern.test(scoringContext)) score += value;
    for (const [pattern, value] of LOW_VALUE_HINTS) if (pattern.test(email) || pattern.test(scoringContext)) score += value;
    candidates.push({ email, score, context: context.trim() });
  }
  return candidates.sort((a, b) => b.score - a.score || a.email.localeCompare(b.email));
}

export function inferJdApplicationEmail(jobDescription: string) {
  return extractJdEmailCandidates(jobDescription)[0]?.email ?? '';
}


/** Best-effort deterministic job-title extraction for employer-facing application copy. */
export function inferJdJobTitle(jobDescription: string) {
  const lines = jobDescription.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const labeled = lines.find((line) => /^(?:job\s*title|position|role)\s*[:\-–—]\s*.+/i.test(line));
  if (labeled) return labeled.replace(/^(?:job\s*title|position|role)\s*[:\-–—]\s*/i, '').trim();

  // Generic page/section headings are common in copied job postings and must never
  // become employer-facing role names. Keep this list deterministic and conservative.
  const genericHeading = /^(?:full\s+job\s+description|job\s+description|about\s+the\s+job|about\s+this\s+job|job\s+details?|job\s+summary|position\s+summary|position\s+overview|role\s+overview|about|company|location|department|overview|summary|responsibilities|key\s+responsibilities|requirements|qualifications|preferred\s+qualifications|duties|who\s+we\s+are|apply|application|how\s+to\s+apply|salary|compensation|benefits|schedule|work\s+location)\s*[:\-–—]?$/i;
  const rejectPrefix = /^(?:about|company|location|department|overview|summary|responsibilities|requirements|qualifications|duties|who we are|apply|application|salary|compensation|benefits|full job description|job description|about the job|job details?)\b/i;

  const candidate = lines.slice(0, 12).find((line) => {
    const words = line.split(/\s+/);
    return words.length >= 2
      && words.length <= 10
      && line.length <= 90
      && !genericHeading.test(line)
      && !rejectPrefix.test(line)
      && !/[.!?]$/.test(line)
      && !/@/.test(line);
  });
  return candidate ?? '';
}
