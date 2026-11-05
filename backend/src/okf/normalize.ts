/** Unicode NFC + collapse all whitespace runs to one space + trim. */
export function normalizeText(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}
