import type { JobRequirement, RequirementPriority } from './types';

export function normalizeToken(value: string) {
  return value.toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}+#.\-/]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeWord(word: string) {
  // normalizeToken already removes wrapper punctuation such as parentheses/commas.
  // It intentionally preserves dots for technology names such as Node.js and .NET,
  // so remove only trailing sentence dots before stemming. This makes `DocuSign.`
  // and `docusign` follow the same normalization path without damaging internal dots.
  let value = normalizeToken(word).replace(/\.+$/g, '');
  // Technology tokens that contain meaningful punctuation are identifiers, not
  // ordinary English words, so do not stem them (Node.js must not become node.j).
  if (/[+#.]/.test(value)) return value;
  if (value.length > 5 && value.endsWith('ies')) value = `${value.slice(0, -3)}y`;
  else if (value.length > 6 && value.endsWith('ing')) value = value.slice(0, -3);
  else if (value.length > 5 && value.endsWith('ed')) value = value.slice(0, -2);
  else if (value.length > 4 && value.endsWith('s') && !value.endsWith('ss')) value = value.slice(0, -1);
  return value;
}

export function normalizeForMatch(value: string) {
  return normalizeToken(value).split(' ').map(normalizeWord).filter(Boolean).join(' ');
}

import { getActiveConcepts, type ConceptPackId } from './concepts';


function priorityRank(priority: RequirementPriority) {
  return priority === 'required' ? 3 : priority === 'preferred' ? 2 : 1;
}

function priorityFromLine(line: string, heading: string): RequirementPriority {
  const text = `${heading} ${line}`;
  if (/\b(must|required|minimum|requirement|qualifications?|you have|need to have)\b/.test(text)) return 'required';
  if (/\b(preferred|asset|nice to have|would be an asset|desirable)\b/.test(text)) return 'preferred';
  return 'responsibility';
}

function lineWeight(priority: RequirementPriority) {
  return priority === 'required' ? 4 : priority === 'preferred' ? 2.5 : 1.5;
}

function matchSurface(value: string) {
  // Treat slash/hyphen as phrase separators for matching while preserving symbols
  // that are part of technology names (C++, C#, .NET). Both JD and pattern pass
  // through the same surface, so `Workday/HRIS` matches either named concept.
  return normalizeForMatch(value).replace(/[\/–—-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function patternMatches(normalizedLine: string, pattern: string) {
  // `normalizedLine` has already passed through normalizeForMatch; do not stem it
  // a second time (e.g. `purchasing` -> `purchas` -> `purcha`).
  const lineSurface = normalizedLine.replace(/[\/–—-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const patternSurface = matchSurface(pattern);
  if (!patternSurface) return false;
  // Whole-token/phrase matching prevents catalog leakage such as `cad` in `academic`.
  return ` ${lineSurface} `.includes(` ${patternSurface} `);
}

export function extractJobRequirements(jobDescription: string, maxRequirements = 64, packIds?: ConceptPackId[]): JobRequirement[] {
  const found = new Map<string, JobRequirement>();
  let heading = '';
  const rawLines = jobDescription.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const rawLine of rawLines) {
    const cleaned = rawLine.replace(/^[•*\-–—]+\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
    const normalizedLine = normalizeForMatch(cleaned);
    const headingCandidate = normalizeToken(cleaned.replace(/[:：]+$/, ''));
    if (cleaned.length < 90 && /responsibil|duties|qualification|requirement|preferred|asset|skills|experience|education/.test(headingCandidate)) {
      heading = headingCandidate;
    }

    for (const concept of getActiveConcepts(packIds)) {
      if (!concept.patterns.some((pattern) => patternMatches(normalizedLine, pattern))) continue;
      const priority = priorityFromLine(normalizedLine, heading);
      const existing = found.get(concept.id);
      if (existing) {
        existing.frequency += 1;
        existing.weight += lineWeight(priority);
        if (priorityRank(priority) > priorityRank(existing.priority)) existing.priority = priority;
        if (existing.sourceSnippets.length < 3) existing.sourceSnippets.push(cleaned.slice(0, 220));
        continue;
      }
      found.set(concept.id, {
        id: `req-${concept.id}`,
        label: concept.label,
        normalized: normalizeForMatch(concept.label),
        weight: lineWeight(priority),
        frequency: 1,
        matched: false,
        coverage: 'none',
        priority,
        category: concept.category,
        evidenceTerms: concept.patterns.map(normalizeForMatch),
        supportingTerms: (concept.supporting ?? []).map(normalizeForMatch),
        sourceSnippets: [cleaned.slice(0, 220)],
      });
    }
  }

  // No generic noun/proper-name fallback: B4 prefers a smaller, explainable
  // concept set over leaking employer names or verbs into requirements.

  return [...found.values()]
    .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || b.weight - a.weight || b.frequency - a.frequency || a.label.localeCompare(b.label))
    .slice(0, maxRequirements);
}
