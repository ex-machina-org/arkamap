/** Up to two letters for an avatar: the first letter of the first and last word. "Arka Test" gives "AT", "Arka" gives "A". */
export function initialsOf(name: string | undefined | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  // Spread by code point so a leading emoji or accented letter is not cut in half.
  const letter = (word: string) => [...word][0].toLocaleUpperCase("id-ID");
  return words.length === 1 ? letter(words[0]) : letter(words[0]) + letter(words[words.length - 1]);
}
