// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת'];

/* 1..999 in Hebrew letters, without marks. 15 and 16 are written טו and טז. */
export function hebrewLetters(number) {
  let rest = Math.trunc(number) % 1000;
  let hundreds = Math.floor(rest / 100);
  rest %= 100;
  let out = '';
  while (hundreds > 4) {
    out += 'ת';
    hundreds -= 4;
  }
  out += HUNDREDS[hundreds];
  if (rest === 15) out += 'טו';
  else if (rest === 16) out += 'טז';
  else out += TENS[Math.floor(rest / 10)] + ONES[rest % 10];
  return out;
}

/* One letter gets a geresh after it; more letters get gershayim before the last one. */
export function withMarks(letters, marks) {
  if (letters.length === 0) return letters;
  if (letters.length === 1) return letters + marks.geresh;
  return letters.slice(0, -1) + marks.gershayim + letters.slice(-1);
}
