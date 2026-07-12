const DIGITS: Record<string, string> = {
  '1': '⠁',
  '2': '⠃',
  '3': '⠉',
  '4': '⠙',
  '5': '⠑',
  '6': '⠋',
  '7': '⠛',
  '8': '⠓',
  '9': '⠊',
  '0': '⠚',
}

// Proper braille numerals: ⠼ (number sign) before each digit group,
// ⠲ as the point. Reads as dot texture on the print — the caption is
// still the date, just in the medium of the sheet.
export function brailleDate(date: Date): string {
  const groups = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
  return groups
    .map((n) => '⠼' + [...String(n)].map((d) => DIGITS[d]).join(''))
    .join('⠲')
}
