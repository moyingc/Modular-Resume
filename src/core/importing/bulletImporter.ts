
import type { ResumeModule } from '../resume/types';

let seq = 0;
function id() { return `import-bullet-${Date.now().toString(36)}-${(++seq).toString(36)}`; }

export function parseBulletImportText(text: string): ResumeModule[] {
  const raw = text.trim();
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    const record = typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null;
    const list: unknown[] | null = Array.isArray(parsed) ? parsed : Array.isArray(record?.bullets) ? record.bullets : null;
    if (list) {
      return list.map((item: unknown) => {
        if (typeof item === 'object' && item !== null && 'content' in item) {
          return String((item as Record<string, unknown>).content ?? '');
        }
        return String(item);
      })
        .map((value: string) => value.trim()).filter(Boolean)
        .map((content: string) => ({ id:id(), kind:'bullet' as const, title:content, content, selected:true, locked:false }));
    }
  } catch { /* not JSON */ }

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const bullets: string[] = [];
  let buffer = '';
  const flush = () => { if (buffer.trim()) bullets.push(buffer.trim()); buffer=''; };

  for (const line of lines) {
    const match = line.match(/^(?:[-*•–—]|\d+[.)])\s+(.*)$/);
    if (match) {
      flush();
      buffer = match[1].trim();
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) { flush(); continue; }
    if (buffer) buffer += ` ${line}`;
    else bullets.push(line);
  }
  flush();

  return bullets
    .map((value) => value.replace(/\s+/g,' ').trim())
    .filter(Boolean)
    .map((content) => ({ id:id(), kind:'bullet' as const, title:content, content, selected:true, locked:false }));
}
