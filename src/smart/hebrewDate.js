// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * The Hebrew date of today, in letters. The date changes at midnight, not at
 * sunset. The conversion is done by hebcal (HDate); the wording is ours.
 */
import { HDate } from '@hebcal/hdate';
import { HEBREW_DATE_MARKS } from '../config.js';
import { hebrewLetters, withMarks } from './gematria.js';

/* hebcal month numbers: Nisan is 1, Tishrei is 7, Adar (or Adar I) is 12, Adar II is 13. */
const MONTHS = ['', 'ניסן', 'אייר', 'סיון', 'תמוז', 'אב', 'אלול', 'תשרי', 'חשון', 'כסלו', 'טבת', 'שבט', 'אדר', 'אדר ב'];
const ADAR_FIRST = 'אדר א';

export function formatHebrewDate(date, marks) {
  const hebrew = new HDate(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
  const month = hebrew.getMonth();
  let monthName = MONTHS[month];
  if (month === 12 && hebrew.isLeapYear()) monthName = ADAR_FIRST;
  if (month === 13 || (month === 12 && hebrew.isLeapYear())) monthName += marks.geresh;
  const day = withMarks(hebrewLetters(hebrew.getDate()), marks);
  const year = withMarks(hebrewLetters(hebrew.getFullYear() % 1000), marks);
  return day + ' ב' + monthName + ' ' + year;
}

export default {
  id: 'heDate',
  run(ctx) {
    return formatHebrewDate(ctx.now, HEBREW_DATE_MARKS);
  }
};
