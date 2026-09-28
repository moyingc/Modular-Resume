import { normalizeForMatch } from '../jdParser';

const STOP = new Set(['the','a','an','and','or','to','of','in','on','for','with','by','at','from','as','is','are','be','been','being','this','that','these','those','their','your','our','into','across']);

export function semanticTokens(value: string) {
  return normalizeForMatch(value)
    .split(/[^a-z0-9+#.]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP.has(token));
}

function setSimilarity(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

export function lexicalSimilarity(a: string, b: string) {
  const aTokens = semanticTokens(a);
  const bTokens = semanticTokens(b);
  const unigram = setSimilarity(new Set(aTokens), new Set(bTokens));
  const bigrams = (tokens: string[]) => new Set(tokens.slice(0, -1).map((token, index) => `${token} ${tokens[index + 1]}`));
  const bigram = setSimilarity(bigrams(aTokens), bigrams(bTokens));
  return Math.min(1, unigram * 0.72 + bigram * 0.28);
}

export function idSetSimilarity(a: Iterable<string>, b: Iterable<string>) {
  return setSimilarity(new Set(a), new Set(b));
}

export function combinedSimilarity(
  aText: string,
  bText: string,
  aConcepts: Iterable<string>,
  bConcepts: Iterable<string>,
) {
  const lexical = lexicalSimilarity(aText, bText);
  const concept = idSetSimilarity(aConcepts, bConcepts);
  // Concepts carry more weight because JD wording and resume wording often differ.
  return Math.min(1, lexical * 0.38 + concept * 0.62);
}
