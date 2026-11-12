// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * A sum of money in Hebrew words. Our own function, no library.
 * Shekel is masculine ("שלושה שקלים"), agora is feminine ("שתי אגורות").
 * Range: 0 to 999,999,999, with up to 99 agorot.
 */
const UNITS_M = ['', 'אחד', 'שניים', 'שלושה', 'ארבעה', 'חמישה', 'שישה', 'שבעה', 'שמונה', 'תשעה'];
const UNITS_F = ['', 'אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע'];
const TEENS_M = ['עשרה', 'אחד עשר', 'שנים עשר', 'שלושה עשר', 'ארבעה עשר', 'חמישה עשר', 'שישה עשר', 'שבעה עשר', 'שמונה עשר', 'תשעה עשר'];
const TEENS_F = ['עשר', 'אחת עשרה', 'שתים עשרה', 'שלוש עשרה', 'ארבע עשרה', 'חמש עשרה', 'שש עשרה', 'שבע עשרה', 'שמונה עשרה', 'תשע עשרה'];
const TENS = ['', '', 'עשרים', 'שלושים', 'ארבעים', 'חמישים', 'שישים', 'שבעים', 'שמונים', 'תשעים'];
const HUNDREDS = ['', 'מאה', 'מאתיים', 'שלוש מאות', 'ארבע מאות', 'חמש מאות', 'שש מאות', 'שבע מאות', 'שמונה מאות', 'תשע מאות'];
const THOUSANDS = ['', 'אלף', 'אלפיים', 'שלושת אלפים', 'ארבעת אלפים', 'חמשת אלפים', 'ששת אלפים', 'שבעת אלפים', 'שמונת אלפים', 'תשעת אלפים', 'עשרת אלפים'];

const WORD = Object.freeze({
  zero: 'אפס',
  and: 'ו',
  thousand: 'אלף',
  million: 'מיליון',
  twoMillion: 'שני מיליון',
  twoBeforeNounM: 'שני',
  twoBeforeNounF: 'שתי',
  shekelOne: 'שקל חדש אחד',
  shekels: 'שקלים חדשים',
  shah: 'ש"ח',
  shahOne: 'ש"ח אחד',
  agoraOne: 'אגורה אחת',
  agorot: 'אגורות'
});

export const MAX_AMOUNT = 999999999;

/* 1..999 as a list of parts: hundreds, then a "teen", or tens and units. */
function partsBelowThousand(number, feminine) {
  const parts = [];
  const hundreds = Math.floor(number / 100);
  const rest = number % 100;
  if (hundreds > 0) parts.push(HUNDREDS[hundreds]);
  if (rest >= 10 && rest < 20) {
    parts.push((feminine ? TEENS_F : TEENS_M)[rest - 10]);
  } else {
    const tens = Math.floor(rest / 10);
    const units = rest % 10;
    if (tens > 0) parts.push(TENS[tens]);
    if (units > 0) parts.push((feminine ? UNITS_F : UNITS_M)[units]);
  }
  return parts;
}

/* "and" comes before the last part: מאה עשרים ושלושה. */
function joinParts(parts) {
  if (parts.length <= 1) return parts.join('');
  return parts.slice(0, -1).join(' ') + ' ' + WORD.and + parts[parts.length - 1];
}

/* A whole number, 0..999,999,999. `feminine` applies to the last three digits only. */
export function integerInWords(number, feminine) {
  if (!Number.isInteger(number) || number < 0 || number > MAX_AMOUNT) return null;
  if (number === 0) return WORD.zero;

  const millions = Math.floor(number / 1000000);
  const thousands = Math.floor(number / 1000) % 1000;
  const units = number % 1000;
  const groups = [];

  if (millions === 1) groups.push({ text: WORD.million, single: true });
  else if (millions === 2) groups.push({ text: WORD.twoMillion, single: true });
  else if (millions > 2) {
    const parts = partsBelowThousand(millions, false);
    groups.push({ text: joinParts(parts) + ' ' + WORD.million, single: parts.length === 1 });
  }

  if (thousands > 0 && thousands <= 10) groups.push({ text: THOUSANDS[thousands], single: true });
  else if (thousands > 10) {
    const parts = partsBelowThousand(thousands, false);
    groups.push({ text: joinParts(parts) + ' ' + WORD.thousand, single: parts.length === 1 });
  }

  if (units > 0) {
    const parts = partsBelowThousand(units, feminine === true);
    groups.push({ text: joinParts(parts), single: parts.length === 1 });
  }

  // "and" before the last group when it is one part: אלף וחמש מאות, מיליון ומאה אלף.
  const last = groups[groups.length - 1];
  if (groups.length > 1 && last.single) last.text = WORD.and + last.text;
  return groups.map((group) => group.text).join(' ');
}

function shekelPhrase(shekels, suffix) {
  const words = integerInWords(shekels, false);
  if (words === null) return null;
  if (suffix === 'none') return words;
  if (suffix === 'shah') {
    if (shekels === 1) return WORD.shahOne;
    if (shekels === 2) return WORD.twoBeforeNounM + ' ' + WORD.shah;
    return words + ' ' + WORD.shah;
  }
  if (shekels === 1) return WORD.shekelOne;
  if (shekels === 2) return WORD.twoBeforeNounM + ' ' + WORD.shekels;
  return words + ' ' + WORD.shekels;
}

function agorotPhrase(agorot) {
  if (agorot === 1) return WORD.agoraOne;
  if (agorot === 2) return WORD.twoBeforeNounF + ' ' + WORD.agorot;
  return integerInWords(agorot, true) + ' ' + WORD.agorot;
}

/* suffix: 'shekel' (שקלים חדשים, the default), 'shah' (ש"ח) or 'none'. */
export function amountInWords(shekels, agorot, suffix) {
  if (!Number.isInteger(shekels) || shekels < 0 || shekels > MAX_AMOUNT) return null;
  if (!Number.isInteger(agorot) || agorot < 0 || agorot > 99) return null;
  if (agorot === 0) return shekelPhrase(shekels, suffix);
  if (shekels === 0) return agorotPhrase(agorot);
  // Shekels together with agorot are always written in full, also when the setting is "no suffix":
  // without the word "shekels" the sentence is cut off.
  const main = shekelPhrase(shekels, suffix === 'none' ? 'shekel' : suffix);
  return main === null ? null : main + ' ' + WORD.and + agorotPhrase(agorot);
}
