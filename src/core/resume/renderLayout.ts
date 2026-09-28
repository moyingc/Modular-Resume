/**
 * Pure resume-rendering helpers shared by browser preview and PDF rendering.
 * These helpers may change geometry, but must never mutate resume content.
 */

const MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const DATE_WORD = '(?:Present|Current|Now)';

/** Return true when a trailing field looks like a resume date/range. */
export function looksLikeResumeDate(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/^\d{4}$/.test(text)) return true;
  if (new RegExp(`^(?:${MONTH}\\s+)?\\d{4}\\s*(?:[-–—]|to)\\s*(?:(?:${MONTH}\\s+)?\\d{4}|${DATE_WORD})$`, 'i').test(text)) return true;
  if (new RegExp(`^(?:${MONTH}\\s+)?\\d{4}\\s*(?:[-–—]|to)\\s*${DATE_WORD}$`, 'i').test(text)) return true;
  return false;
}

export type AlignedResumeLine = { left: string; right: string };

/**
 * Parse a line that intentionally carries a right-aligned date.
 *
 * Examples:
 *   "Company | Winnipeg, MB | 2012 - Present"
 *     -> { left: "Company | Winnipeg, MB", right: "2012 - Present" }
 *   "Community Resource Centre        2021 - 2023"
 *     -> { left: "Community Resource Centre", right: "2021 - 2023" }
 *
 * A plain "Company | Winnipeg, MB" is NOT split because the final field is
 * not a date. This avoids accidentally pushing locations to the far right.
 */
export function parseAlignedResumeLine(value: string): AlignedResumeLine | null {
  const text = value.trim();
  if (!text) return null;

  const pipeParts = text.split(/\s*\|\s*/).map((part) => part.trim()).filter(Boolean);
  if (pipeParts.length >= 2 && looksLikeResumeDate(pipeParts[pipeParts.length - 1])) {
    return {
      left: pipeParts.slice(0, -1).join(' | '),
      right: pipeParts[pipeParts.length - 1],
    };
  }

  const spacedParts = text.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
  if (spacedParts.length >= 2 && looksLikeResumeDate(spacedParts[spacedParts.length - 1])) {
    return {
      left: spacedParts.slice(0, -1).join(' '),
      right: spacedParts[spacedParts.length - 1],
    };
  }

  return null;
}

/**
 * Conservative text-width estimate in PDF points. It is intentionally biased
 * slightly high so compact packing prefers readability over squeezing.
 */
export function estimateResumeTextWidthPt(value: string, fontSizePt: number): number {
  let units = 0;
  for (const char of value.trim()) {
    if (/\s/.test(char)) units += 0.30;
    else if (/[ilI1.,'`:;]/.test(char)) units += 0.28;
    else if (/[MW@%&]/.test(char)) units += 0.86;
    else if (/[A-Z0-9]/.test(char)) units += 0.60;
    else units += 0.52;
  }
  return units * fontSizePt;
}

/**
 * Decide whether one skill can safely occupy a half-row cell.
 * availableEntryWidthPt is the width of the Skill Group entry itself, not the
 * entire page. The reserve accounts for bullet mark, gutter and PDF wrapping.
 */
export function canPackSkillInHalfRow(
  value: string,
  availableEntryWidthPt: number,
  fontSizePt: number,
): boolean {
  const halfCell = availableEntryWidthPt / 2;
  // React-PDF line wrapping is slightly more aggressive than a simple glyph-width
  // estimate. Keep a deliberately large reserve so a skill is only compacted
  // when it is very likely to remain on one physical line.
  const bulletAndPaddingReservePt = 24;
  const usableTextWidth = Math.max(28, halfCell - bulletAndPaddingReservePt);
  const noWrapSafetyFactor = 0.72;
  return estimateResumeTextWidthPt(value, fontSizePt) <= usableTextWidth * noWrapSafetyFactor;
}
