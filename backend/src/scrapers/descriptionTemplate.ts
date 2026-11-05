// Deterministic one-line description (Architecture.md §6.2a) — used when DESCRIPTION_MODEL is empty.

export interface DescriptionInput {
  regulation: string;
  kind: 'Chapter' | 'Article' | 'Recital' | 'Annex';
  /** Full doc title, e.g. "Art. 17 GDPR — Right to erasure". */
  title: string;
  /** Markdown body as written to disk. */
  body: string;
  /** Articles only, e.g. "Rights of the data subject". */
  chapterTitle?: string;
}

const MAX_WORDS = 40;
const MAX_CHARS = 400;

/** Body lines before `# Related`, without headings, list markers or link targets. */
function plainLines(body: string): string[] {
  const lines: string[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '# Related') break;
    if (!line || line.startsWith('#')) continue;
    lines.push(line.replace(/^-\s+/, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'));
  }
  return lines;
}

/** "Art. 17 GDPR — Right to erasure" → "Right to erasure". */
function shortTitle(title: string): string {
  const rest = title.split(' — ').slice(1).join(' — ');
  return rest || title;
}

function firstWords(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > MAX_WORDS ? `${words.slice(0, MAX_WORDS).join(' ')}…` : words.join(' ');
}

/** ≤400 chars, cut at a word boundary with `…`. Also applied to LLM descriptions. */
export function capChars(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  const cut = text.slice(0, MAX_CHARS - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/…$/, '')}…`;
}

export function templateDescription(input: DescriptionInput): string {
  const lines = plainLines(input.body);
  const lead = firstWords(input.kind === 'Chapter' ? lines.join('; ') : lines.join(' '));
  const head =
    input.kind === 'Article' && input.chapterTitle
      ? `${input.chapterTitle} — ${shortTitle(input.title)}`
      : shortTitle(input.title);
  return capChars(`${head}: ${lead}`.replace(/\s+/g, ' ').trim());
}
