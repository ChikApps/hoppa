// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

import test from 'node:test';
import assert from 'node:assert/strict';
import { TRIGGER as T } from '../../src/config.js';
import { TEXT, SMART_TEXT, errorText, packAddedText, importDoneText, rejectedText, rejectedRowText, corruptText, labelActive } from '../../src/pages/strings.js';
import { SMART_TABLE } from '../../src/smart/table.js';
import { PUBLISHER, CONTACT_EMAIL } from '../../src/pages/links.js';

test('error texts take their numbers from the limits', () => {
  assert.equal(errorText('TEXT_TOO_LONG'), 'הטקסט ארוך מדי. אפשר עד 10,000 תווים.');
  assert.equal(errorText('ABBR_TOO_LONG'), 'הקיצור ארוך מדי. אפשר עד 32 תווים.');
  assert.equal(errorText('LABEL_TOO_LONG'), 'התיאור ארוך מדי. אפשר עד 100 תווים.');
  assert.equal(errorText('FILE_TOO_BIG'), 'הקובץ גדול מדי. אפשר לייבא קובץ עד 2MB.');
  assert.ok(errorText('LIMIT_SYNC').startsWith('הגעתם ל-500 קיצורים'));
  assert.ok(errorText('LIMIT_LOCAL').startsWith('הגעתם ל-2,000 קיצורים'));
  assert.ok(errorText('CSV_TOO_MANY_ROWS').includes('עד 2,000 שורות'));
  assert.equal(errorText('ABBR_NO_TRIGGER'), 'קיצור מתחיל ב-' + T + ' (המקש שמימין ל-Tab)');
});

test('every error code that the code can produce has a text, and an unknown one gets the general message', () => {
  for (const code of ['ABBR_EMPTY', 'ABBR_SPACE', 'ABBR_CHARS', 'ABBR_NO_TRIGGER', 'ABBR_TOO_LONG', 'ABBR_DIGITS', 'ABBR_SMART', 'ABBR_EXISTS', 'TEXT_EMPTY', 'TEXT_TOO_LONG', 'LABEL_TOO_LONG', 'RECORD_INVALID', 'LIMIT_SYNC', 'LIMIT_LOCAL', 'CSV_TOO_MANY_ROWS', 'FILE_TOO_BIG', 'FILE_INVALID', 'FILE_DAMAGED', 'FILE_NEWER', 'READ_ONLY', 'SAVE_FAILED']) {
    assert.notEqual(errorText(code), '', code);
    if (code !== 'SAVE_FAILED') assert.notEqual(errorText(code), errorText('SAVE_FAILED'), code);
  }
  assert.equal(errorText('SOMETHING_ELSE'), errorText('SAVE_FAILED'));
  assert.equal(errorText('__proto__'), errorText('SAVE_FAILED'));
  assert.equal(errorText('SETTINGS_INVALID'), errorText('SAVE_FAILED'));
});

test('singular and plural wording', () => {
  assert.equal(packAddedText(1), 'נוסף קיצור אחד שהיה חסר. מה שכבר היה לא השתנה.');
  assert.equal(packAddedText(3), 'נוספו 3 קיצורים שהיו חסרים. מה שכבר היה לא השתנה.');
  assert.equal(rejectedText(1), 'רשומה אחת נדחתה בייבוא.');
  assert.equal(rejectedText(12), '12 רשומות נדחו בייבוא.');
  assert.equal(corruptText(1), 'קיצור פגום אחד לא נטען. שאר הקיצורים עובדים כרגיל.');
  assert.equal(corruptText(4), '4 קיצורים פגומים לא נטענו. שאר הקיצורים עובדים כרגיל.');
  assert.equal(importDoneText(5, 2), 'יובאו 5, דולגו 2');
  assert.equal(rejectedRowText(12, 'TEXT_TOO_LONG'), 'שורה 12: הטקסט ארוך מדי. אפשר עד 10,000 תווים.');
  assert.equal(rejectedRowText(3, 'ABBR_SPACE'), 'שורה 3: בקיצור אין רווחים.');
  assert.equal(labelActive(T + 'בב'), 'פעיל ' + T + 'בב');
});

test('texts fixed by the content writer', () => {
  assert.equal(errorText('ABBR_CHARS'), 'בקיצור יש תו שאי אפשר להשתמש בו. נסו להקליד את הקיצור מחדש.');
  assert.ok(TEXT.popupNoAccess.startsWith('התוסף לא פועל בדף הזה. נסו לרענן את הדף (F5).'));
});

test('sync wording never claims that sync is active', () => {
  for (const text of [TEXT.syncSide, TEXT.syncFull, TEXT.syncOff]) assert.ok(!text.includes('הסנכרון פעיל'), text);
  assert.ok(TEXT.syncSide.includes('אם הסנכרון של כרום פועל'));
});

test('every smart shortcut has a description, and the publisher is spelled as the owner decided', () => {
  for (const row of SMART_TABLE) assert.equal(typeof SMART_TEXT[row.id].desc, 'string', row.id);
  assert.equal(PUBLISHER, 'ChikApps');
  assert.equal(CONTACT_EMAIL, 'office@chiktime.com');
  assert.equal(TEXT.numberListAbbr, T + ' ומספר');
});
