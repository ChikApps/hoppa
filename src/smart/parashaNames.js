// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/* The 54 weekly portions, in the order of the Torah. Index 0 is portion number 1. */
export const PARASHA_NAMES = Object.freeze([
  'בראשית', 'נח', 'לך לך', 'וירא', 'חיי שרה', 'תולדות', 'ויצא', 'וישלח', 'וישב', 'מקץ', 'ויגש', 'ויחי',
  'שמות', 'וארא', 'בא', 'בשלח', 'יתרו', 'משפטים', 'תרומה', 'תצוה', 'כי תשא', 'ויקהל', 'פקודי',
  'ויקרא', 'צו', 'שמיני', 'תזריע', 'מצורע', 'אחרי מות', 'קדושים', 'אמור', 'בהר', 'בחוקותי',
  'במדבר', 'נשא', 'בהעלותך', 'שלח', 'קרח', 'חוקת', 'בלק', 'פינחס', 'מטות', 'מסעי',
  'דברים', 'ואתחנן', 'עקב', 'ראה', 'שופטים', 'כי תצא', 'כי תבוא', 'נצבים', 'וילך', 'האזינו', 'וזאת הברכה'
]);

/* A Shabbat that is a holiday: the name of the holiday instead of a portion. Keys are hebcal's names. */
export const HOLIDAY_SHABBAT = Object.freeze({
  'Rosh Hashana': 'שבת ראש השנה',
  'Yom Kippur': 'שבת יום כיפור',
  'Sukkot': 'שבת סוכות',
  'Sukkot Shabbat Chol ha-Moed': 'שבת חול המועד סוכות',
  'Shmini Atzeret': 'שבת שמיני עצרת',
  'Pesach': 'שבת פסח',
  'Pesach I': 'שבת פסח',
  'Pesach Shabbat Chol ha-Moed': 'שבת חול המועד פסח',
  'Pesach VII': 'שבת שביעי של פסח',
  'Pesach VIII': 'שבת אחרון של פסח',
  'Shavuot': 'שבת שבועות'
});

export const PARASHA_PREFIX = 'פרשת ';
export const PARASHA_JOINER = '-';
