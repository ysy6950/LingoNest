/** Match recommendation duplicates across groups, ignoring case and repeated spaces. */
export function normalizeWord(word: string): string {
  return word.trim().replace(/\s+/g, ' ').toLowerCase();
}
