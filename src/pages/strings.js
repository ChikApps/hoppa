// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Interface texts that are built in code. The source of every text is the
 * content document of the project; the trigger and the limits are filled in
 * from config.js and limits.js, so they are never written twice.
 */
import { TRIGGER } from '../config.js';
import { LIMITS } from '../limits.js';
import { NUMBER_EXAMPLE } from '../smart/number.js';

function count(number) {
  return number.toLocaleString('en-US');
}

const megabytes = Math.round(LIMITS.IMPORT_BYTES / (1024 * 1024));

export const TEXT = Object.freeze({
  on: 'פעיל',
  off: 'כבוי',
  saved: 'נשמר ✓',
  copied: 'הועתק ✓',
  exported: 'הקובץ נשמר בתיקיית ההורדות',
  noResults: 'לא נמצא קיצור כזה',
  gain: 'חוסך',
  gainTitle: 'כמה תווים הקיצור חוסך בהקלדה',
  smartTitle: 'חכמים',
  mineTitle: 'הקיצורים שלי',

  popupEmpty: 'עוד אין כאן קיצורים. אפשר להוסיף ב"ניהול קיצורים"',
  popupExtensionOff: 'התוסף כבוי. הקיצורים לא יוחלפו עד שתפעילו אותו',
  popupSiteOff: 'באתר הזה התוסף כבוי. בשאר האתרים הוא ממשיך לעבוד',
  // The popup cannot tell a page that Chrome blocks from a page that was open before the install or an update, so one text covers both.
  popupNoAccess: 'התוסף לא פועל בדף הזה. נסו לרענן את הדף (F5). אם זה דף של כרום עצמו, כמו החנות או ההגדרות, תוספים לא יכולים לפעול בו. אפשר ללחוץ על קיצור, להעתיק ולהדביק.',
  popupDocsOff: 'ההחלפה בגוגל דוקס כבויה. אפשר להפעיל אותה ',
  popupDocsOffLink: 'בהגדרות',

  editTitle: 'עריכה',
  newTitle: 'קיצור חדש',
  edit: 'עריכה',
  remove: 'מחיקה',
  enableAgain: 'הפעלה מחדש',
  now: 'עכשיו: ',
  forExample: 'למשל: ',
  arrow: ' ← ',
  numberListAbbr: TRIGGER + ' ומספר',
  numberExampleAbbr: TRIGGER + NUMBER_EXAMPLE.digits,
  csvHeaders: Object.freeze(['קיצור', 'טקסט', 'תיאור']),

  syncSide: 'הקיצורים נשמרים בכרום, ומסתנכרנים אם הסנכרון של כרום פועל.',
  syncFull: 'הקיצורים נשמרים בכרום שלכם. אם הסנכרון של כרום פועל אצלכם, הם נשמרים גם בחשבון הגוגל שלכם ועוברים דרכו בין המחשבים שלכם.',
  syncOff: 'הסנכרון בין מחשבים כבוי כי הקיצורים גדולים מדי. מומלץ לגבות בייצוא.',

  packNothing: 'כל הקיצורים של החבילה כבר נמצאים אצלכם.',
  removeCorrupt: 'מחיקת הפגומים',
  rejectedDetails: 'אילו נדחו ולמה?',
  version: 'גרסה ',

  welcomeSuccess: 'יצא מצוין! זה התאריך העברי של היום.',

  update: Object.freeze({
    manual: 'הגרסה הזו הותקנה ידנית, ולכן היא לא מתעדכנת לבד.',
    checking: 'בודקים…',
    none: 'יש לכם את הגרסה האחרונה ✓',
    found: 'נמצאה גרסה חדשה. מעדכנים עכשיו…',
    busy: 'אי אפשר לבדוק כרגע. נסו שוב מאוחר יותר.',
    unsaved: 'נמצאה גרסה חדשה. שמרו קודם את השינוי בקיצור, ואז לחצו שוב על "בדיקת עדכון".'
  }),

  importSettingsNote: 'שימו לב: גם ההגדרות שלכם יוחלפו בהגדרות שבקובץ.'
});

export const SMART_TEXT = Object.freeze({
  heDate: Object.freeze({ desc: 'התאריך העברי של היום', note: 'התאריך העברי מתחלף בחצות, לא בשקיעה.' }),
  gDate: Object.freeze({ desc: 'התאריך הלועזי' }),
  time: Object.freeze({ desc: 'השעה עכשיו' }),
  parasha: Object.freeze({ desc: 'פרשת השבוע הקרובה' }),
  number: Object.freeze({ desc: 'סכום במילים' })
});

const ERRORS = Object.freeze({
  ABBR_EMPTY: 'צריך לכתוב קיצור',
  TEXT_EMPTY: 'צריך לכתוב את הטקסט המלא',
  ABBR_NO_TRIGGER: 'קיצור מתחיל ב-' + TRIGGER + ' (המקש שמימין ל-Tab)',
  ABBR_SPACE: 'בקיצור אין רווחים',
  ABBR_EXISTS: 'הקיצור הזה כבר קיים. אפשר לבחור קיצור אחר',
  ABBR_SMART: 'הקיצור הזה שמור לקיצור חכם',
  ABBR_DIGITS: 'קיצור שיש בו רק ספרות שמור לסכום במילים',
  TEXT_TOO_LONG: 'הטקסט ארוך מדי. אפשר עד ' + count(LIMITS.TEXT_MAX) + ' תווים.',
  ABBR_TOO_LONG: 'הקיצור ארוך מדי. אפשר עד ' + count(LIMITS.ABBR_MAX) + ' תווים.',
  LABEL_TOO_LONG: 'התיאור ארוך מדי. אפשר עד ' + count(LIMITS.LABEL_MAX) + ' תווים.',
  LIMIT_SYNC: 'הגעתם ל-' + count(LIMITS.COUNT_SYNC) + ' קיצורים, וזה המספר המרבי. כרום מגביל את מספר הקיצורים שאפשר לסנכרן בין מחשבים. כדי להוסיף קיצור, צריך קודם למחוק קיצור אחר.',
  LIMIT_LOCAL: 'הגעתם ל-' + count(LIMITS.COUNT_LOCAL) + ' קיצורים, וזה המספר המרבי. כדי להוסיף קיצור, צריך קודם למחוק קיצור אחר.',
  CSV_TOO_MANY_ROWS: 'בקובץ יש יותר מדי שורות. אפשר לייבא קובץ CSV עם עד ' + count(LIMITS.CSV_ROWS) + ' שורות. שום דבר לא יובא, והקיצורים שלכם לא השתנו.',
  FILE_TOO_BIG: 'הקובץ גדול מדי. אפשר לייבא קובץ עד ' + megabytes + 'MB.',
  FILE_INVALID: 'הקובץ לא תקין, ולכן שום דבר לא יובא. הקיצורים שלכם לא השתנו. אפשר לייבא קובץ גיבוי של התוסף (JSON) או קובץ אקסל שנשמר כ-CSV.',
  FILE_DAMAGED: 'חלק מהתווים בקובץ פגומים, ולכן שום דבר לא יובא. הקיצורים שלכם לא השתנו. אפשר לשמור את הקובץ מחדש באקסל, בסוג הקובץ "CSV UTF-8", ולייבא אותו שוב.',
  FILE_NEWER: 'הקובץ נוצר בגרסה חדשה יותר של Hoppa. צריך לעדכן את התוסף כדי לפתוח את הקובץ הזה.',
  READ_ONLY: 'צריך לעדכן את התוסף. הקיצורים נשמרו בגרסה חדשה יותר של Hoppa, ועד העדכון אי אפשר לשנות אותם כאן.',
  SAVE_FAILED: 'משהו השתבש, והשינוי לא נשמר. אפשר לנסות שוב.',
  ABBR_CHARS: 'בקיצור יש תו שאי אפשר להשתמש בו. נסו להקליד את הקיצור מחדש.',
  RECORD_INVALID: 'הרשומה לא תקינה'
});

export function errorText(code) {
  return Object.prototype.hasOwnProperty.call(ERRORS, code) ? ERRORS[code] : ERRORS.SAVE_FAILED;
}

export function packAddedText(added) {
  if (added === 1) return 'נוסף קיצור אחד שהיה חסר. מה שכבר היה לא השתנה.';
  return 'נוספו ' + count(added) + ' קיצורים שהיו חסרים. מה שכבר היה לא השתנה.';
}

export function importDoneText(imported, skipped) {
  return 'יובאו ' + count(imported) + ', דולגו ' + count(skipped);
}

/* Shown before the import is confirmed. */
export function importPlanText(imported, skipped) {
  return 'ייובאו ' + count(imported) + ', ידולגו ' + count(skipped);
}

export function rejectedText(rejected) {
  if (rejected === 1) return 'רשומה אחת נדחתה בייבוא.';
  return count(rejected) + ' רשומות נדחו בייבוא.';
}

export function rejectedRowText(row, code) {
  const reason = errorText(code);
  return 'שורה ' + count(row) + ': ' + reason + (/[.!?]$/.test(reason) ? '' : '.');
}

export function corruptText(corrupt) {
  if (corrupt === 1) return 'קיצור פגום אחד לא נטען. שאר הקיצורים עובדים כרגיל.';
  return count(corrupt) + ' קיצורים פגומים לא נטענו. שאר הקיצורים עובדים כרגיל.';
}

export function labelActive(abbr) {
  return TEXT.on + ' ' + abbr;
}

export function labelEdit(abbr) {
  return TEXT.edit + ' ' + abbr;
}

export function labelRemove(abbr) {
  return TEXT.remove + ' ' + abbr;
}
