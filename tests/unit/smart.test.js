// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

import test from 'node:test';
import assert from 'node:assert/strict';
import { TRIGGER as T, HEBREW_DATE_MARKS as MARKS, DATE_SEPARATOR } from '../../src/config.js';
import { formatHebrewDate } from '../../src/smart/hebrewDate.js';
import { formatGregorianDate } from '../../src/smart/gregDate.js';
import { formatTime } from '../../src/smart/time.js';
import { formatParasha } from '../../src/smart/parasha.js';
import { PARASHA_NAMES } from '../../src/smart/parashaNames.js';
import { hebrewLetters, withMarks } from '../../src/smart/gematria.js';
import { SMART_TABLE } from '../../src/smart/table.js';
import { hasRunner, runSmart, smartEntries, smartAbbr } from '../../src/smart/index.js';
import { defaultSettings } from '../../src/core/validate.js';

const day = (y, m, d, h) => new Date(y, m - 1, d, h === undefined ? 12 : h, 0);

test('Hebrew date in letters, with the plain keyboard marks', () => {
  assert.equal(formatHebrewDate(day(2026, 11, 11), MARKS), 'א\' בכסלו תשפ"ז');
  assert.equal(formatHebrewDate(day(2026, 11, 20), MARKS), 'י\' בכסלו תשפ"ז');
  assert.equal(formatHebrewDate(day(2026, 9, 12), MARKS), 'א\' בתשרי תשפ"ז');
  assert.equal(formatHebrewDate(day(2026, 9, 26), MARKS), 'ט"ו בתשרי תשפ"ז');
  assert.equal(formatHebrewDate(day(2026, 9, 27), MARKS), 'ט"ז בתשרי תשפ"ז');
  assert.equal(formatHebrewDate(day(2027, 2, 20), MARKS), 'י"ג באדר א\' תשפ"ז');
  assert.equal(formatHebrewDate(day(2027, 3, 20), MARKS), 'י"א באדר ב\' תשפ"ז');
  assert.equal(formatHebrewDate(day(2028, 3, 12), MARKS), 'י"ד באדר תשפ"ח');
  assert.equal(formatHebrewDate(day(2027, 4, 22), MARKS), 'ט"ו בניסן תשפ"ז');
});

test('Hebrew date: the marks are the plain keyboard characters U+0027 and U+0022, never the Hebrew ones', () => {
  for (const date of [day(2026, 11, 11), day(2026, 11, 20), day(2027, 2, 20), day(2027, 3, 20), day(2026, 9, 26)]) {
    const text = formatHebrewDate(date, MARKS);
    const codes = Array.from(text).map((ch) => ch.codePointAt(0));
    assert.ok(codes.includes(0x27) || codes.includes(0x22), text);
    for (const forbidden of [0x05F3, 0x05F4, 0x2019, 0x201D, 0x2032, 0x2033]) {
      assert.ok(!codes.includes(forbidden), text + ' holds U+' + forbidden.toString(16));
    }
  }
  const single = formatHebrewDate(day(2026, 11, 11), MARKS);
  assert.equal(single.codePointAt(1), 0x27, 'the mark after a single letter');
  assert.equal(single.codePointAt(single.length - 2), 0x22, 'the mark before the last letter of the year');
  assert.equal(MARKS.geresh.codePointAt(0), 0x27);
  assert.equal(MARKS.gershayim.codePointAt(0), 0x22);
});

test('Hebrew date: month names as they are written in calendars and synagogues', () => {
  assert.equal(formatHebrewDate(day(2026, 10, 20), MARKS), 'ט\' בחשון תשפ"ז');
  assert.equal(formatHebrewDate(day(2027, 6, 10), MARKS), 'ה\' בסיון תשפ"ז');
  const months = new Set();
  for (let i = 0; i < 800; i++) months.add(formatHebrewDate(new Date(2026, 8, 1 + i, 12), MARKS).split(' ').slice(1, -1).join(' '));
  assert.deepEqual(Array.from(months).sort(), ['באב', 'באדר', "באדר א'", "באדר ב'", 'באייר', 'באלול', 'בחשון', 'בטבת', 'בכסלו', 'בניסן', 'בסיון', 'בשבט', 'בתמוז', 'בתשרי'].sort());
});

test('Hebrew date: the marks come from one constant, ready for the setting to return in version 2', () => {
  assert.deepEqual(MARKS, { geresh: "'", gershayim: '"' });
  assert.equal(formatHebrewDate(day(2026, 11, 11), { geresh: '׳', gershayim: '״' }), 'א׳ בכסלו תשפ״ז');
});

test('Hebrew date changes at midnight, not at sunset', () => {
  assert.equal(formatHebrewDate(day(2026, 11, 11, 23), MARKS), formatHebrewDate(day(2026, 11, 11, 1), MARKS));
  assert.notEqual(formatHebrewDate(day(2026, 11, 12, 0), MARKS), formatHebrewDate(day(2026, 11, 11, 23), MARKS));
});

test('Hebrew date agrees with the calendar built into the JavaScript engine, for 1,500 days', () => {
  const builtIn = new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', year: 'numeric' });
  for (let i = 0; i < 1500; i++) {
    const date = new Date(2025, 0, 1 + i, 12);
    const parts = Object.fromEntries(builtIn.formatToParts(date).map((part) => [part.type, part.value]));
    const ours = formatHebrewDate(date, MARKS);
    const expectedDay = withMarks(hebrewLetters(Number(parts.day)), MARKS);
    const expectedYear = withMarks(hebrewLetters(Number(parts.year) % 1000), MARKS);
    assert.ok(ours.startsWith(expectedDay + ' ב'), date.toDateString() + ': ' + ours);
    assert.ok(ours.endsWith(' ' + expectedYear), date.toDateString() + ': ' + ours);
  }
});

test('Hebrew letters for numbers', () => {
  assert.equal(hebrewLetters(1), 'א');
  assert.equal(hebrewLetters(15), 'טו');
  assert.equal(hebrewLetters(16), 'טז');
  assert.equal(hebrewLetters(30), 'ל');
  assert.equal(hebrewLetters(787), 'תשפז');
  assert.equal(hebrewLetters(800), 'תת');
  assert.equal(withMarks('י', MARKS), "י'");
  assert.equal(withMarks('תשפז', MARKS), 'תשפ"ז');
});

test('Gregorian date: day, month, year', () => {
  assert.equal(formatGregorianDate(day(2026, 11, 11)), ['11', '11', '2026'].join(DATE_SEPARATOR));
  assert.equal(formatGregorianDate(day(2027, 1, 5)), ['05', '01', '2027'].join(DATE_SEPARATOR));
});

test('time: 24 hours', () => {
  assert.equal(formatTime(new Date(2026, 10, 11, 14, 5)), '14:05');
  assert.equal(formatTime(new Date(2026, 10, 11, 0, 0)), '00:00');
  assert.equal(formatTime(new Date(2026, 10, 11, 23, 59)), '23:59');
});

test('weekly portion: Sunday to Shabbat give the portion of the coming Shabbat', () => {
  for (let d = 8; d <= 14; d++) assert.equal(formatParasha(day(2026, 11, d), 'il'), 'פרשת תולדות', '2026-11-' + d);
  assert.equal(formatParasha(day(2026, 11, 15), 'il'), 'פרשת ויצא');
  assert.equal(formatParasha(day(2026, 10, 10), 'il'), 'פרשת בראשית');
  assert.equal(formatParasha(day(2026, 12, 5), 'il'), 'פרשת וישב');
});

test('weekly portion: spelling chosen by the content writer', () => {
  assert.equal(formatParasha(day(2026, 9, 3), 'il'), 'פרשת נצבים-וילך');
  assert.ok(PARASHA_NAMES.includes('נצבים'));
  assert.ok(!PARASHA_NAMES.includes('ניצבים'));
  for (const name of ['פינחס', 'תצוה', 'קרח', 'חוקת', 'בחוקותי', 'שופטים', 'בהעלותך', 'כי תשא', 'כי תבוא', 'לך לך']) assert.ok(PARASHA_NAMES.includes(name), name);
});

test('weekly portion: joined portions', () => {
  assert.equal(formatParasha(day(2027, 7, 31), 'il'), 'פרשת מטות-מסעי');
  assert.equal(formatParasha(day(2026, 3, 14), 'il'), 'פרשת ויקהל-פקודי');
  assert.equal(formatParasha(day(2027, 3, 6), 'il'), 'פרשת ויקהל', 'a leap year: read separately');
});

test('weekly portion: a Shabbat that is a holiday shows the holiday', () => {
  assert.equal(formatParasha(day(2027, 4, 24), 'il'), 'שבת חול המועד פסח');
  assert.equal(formatParasha(day(2026, 9, 12), 'il'), 'שבת ראש השנה');
  assert.equal(formatParasha(day(2026, 10, 3), 'il'), 'שבת שמיני עצרת');
  assert.equal(formatParasha(day(2026, 9, 26), 'il'), 'שבת סוכות');
});

test('weekly portion: Land of Israel and Diaspora differ after a holiday on Shabbat', () => {
  assert.equal(formatParasha(day(2027, 6, 12), 'il'), 'פרשת נשא');
  assert.equal(formatParasha(day(2027, 6, 12), 'diaspora'), 'שבת שבועות');
  assert.equal(formatParasha(day(2027, 6, 19), 'il'), 'פרשת בהעלותך');
  assert.equal(formatParasha(day(2027, 6, 19), 'diaspora'), 'פרשת נשא');
  assert.equal(formatParasha(day(2026, 11, 11), 'something else'), 'פרשת תולדות', 'anything that is not "diaspora" is the Land of Israel');
});

test('weekly portion: every Shabbat for 20 years gives a name, in both calendars', () => {
  assert.equal(PARASHA_NAMES.length, 54);
  assert.equal(new Set(PARASHA_NAMES).size, 54);
  for (const calendar of ['il', 'diaspora']) {
    const seen = new Set();
    for (let i = 0; i < 20 * 53; i++) {
      const text = formatParasha(new Date(2026, 0, 3 + i * 7, 12), calendar);
      assert.equal(typeof text, 'string', calendar + ' week ' + i);
      assert.ok(text.startsWith('פרשת ') || text.startsWith('שבת '), text);
      for (const name of text.replace('פרשת ', '').split('-')) seen.add(name);
    }
    for (const name of PARASHA_NAMES.slice(0, 53)) assert.ok(seen.has(name), calendar + ': ' + name + ' never appeared');
  }
});

test('the registry: every row of the table has a file that runs', () => {
  const settings = defaultSettings();
  const now = day(2026, 11, 11);
  for (const row of SMART_TABLE) {
    assert.ok(hasRunner(row.id), row.id);
    const out = runSmart(row.id, { now, settings, number: { shekels: 5, agorot: 0 } });
    assert.equal(typeof out, 'string', row.id);
  }
  assert.equal(runSmart('missing', { now, settings }), null);
  assert.equal(runSmart('number', { now, settings }), null, 'the number needs a number');
  assert.equal(runSmart('parasha', { now: 'not a date', settings }), null, 'an error gives nothing, it does not throw');
});

test('the registry: entries get the trigger at run time and follow the switches', () => {
  const settings = defaultSettings();
  assert.deepEqual(smartEntries(settings).map((entry) => entry.abbr), [T + 'תע', T + 'תל', T + 'שעה', T + 'פרשה']);
  settings.smart.time = false;
  assert.deepEqual(smartEntries(settings).map((entry) => entry.id), ['heDate', 'gDate', 'parasha']);
  assert.equal(smartAbbr('heDate'), T + 'תע');
  assert.equal(smartAbbr('number'), null);
});
