const ROMAN_VALUE: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };

/** "XIV" → 14. */
export function romanToInt(roman: string): number {
  let total = 0;
  for (let i = 0; i < roman.length; i++) {
    const value = ROMAN_VALUE[roman[i]];
    total += value < (ROMAN_VALUE[roman[i + 1]] ?? 0) ? -value : value;
  }
  return total;
}
