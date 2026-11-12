// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * The table of numbers. The answers were checked by the content writer and
 * are listed in the content document (section 6).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { amountInWords, integerInWords } from '../../src/smart/numberWords.js';

const S = ' שקלים חדשים';
const TABLE = [
  [0, 'אפס' + S],
  [1, 'שקל חדש אחד'],
  [2, 'שני' + S],
  [3, 'שלושה' + S],
  [4, 'ארבעה' + S],
  [5, 'חמישה' + S],
  [6, 'שישה' + S],
  [7, 'שבעה' + S],
  [8, 'שמונה' + S],
  [9, 'תשעה' + S],
  [10, 'עשרה' + S],
  [11, 'אחד עשר' + S],
  [12, 'שנים עשר' + S],
  [13, 'שלושה עשר' + S],
  [15, 'חמישה עשר' + S],
  [19, 'תשעה עשר' + S],
  [20, 'עשרים' + S],
  [21, 'עשרים ואחד' + S],
  [22, 'עשרים ושניים' + S],
  [30, 'שלושים' + S],
  [45, 'ארבעים וחמישה' + S],
  [99, 'תשעים ותשעה' + S],
  [100, 'מאה' + S],
  [101, 'מאה ואחד' + S],
  [102, 'מאה ושניים' + S],
  [110, 'מאה ועשרה' + S],
  [112, 'מאה ושנים עשר' + S],
  [120, 'מאה ועשרים' + S],
  [121, 'מאה עשרים ואחד' + S],
  [200, 'מאתיים' + S],
  [300, 'שלוש מאות' + S],
  [999, 'תשע מאות תשעים ותשעה' + S],
  [1000, 'אלף' + S],
  [1001, 'אלף ואחד' + S],
  [1100, 'אלף ומאה' + S],
  [1234, 'אלף מאתיים שלושים וארבעה' + S],
  [1500, 'אלף וחמש מאות' + S],
  [2000, 'אלפיים' + S],
  [2020, 'אלפיים ועשרים' + S],
  [3000, 'שלושת אלפים' + S],
  [5021, 'חמשת אלפים עשרים ואחד' + S],
  [4000, 'ארבעת אלפים' + S],
  [8000, 'שמונת אלפים' + S],
  [10000, 'עשרת אלפים' + S],
  [11000, 'אחד עשר אלף' + S],
  [12345, 'שנים עשר אלף שלוש מאות ארבעים וחמישה' + S],
  [20000, 'עשרים אלף' + S],
  [21000, 'עשרים ואחד אלף' + S],
  [21500, 'עשרים ואחד אלף וחמש מאות' + S],
  [100000, 'מאה אלף' + S],
  [102000, 'מאה ושניים אלף' + S],
  [250000, 'מאתיים וחמישים אלף' + S],
  [999999, 'תשע מאות תשעים ותשעה אלף תשע מאות תשעים ותשעה' + S],
  [1000000, 'מיליון' + S],
  [1000001, 'מיליון ואחד' + S],
  [1001000, 'מיליון ואלף' + S],
  [1100500, 'מיליון מאה אלף וחמש מאות' + S],
  [1500000, 'מיליון וחמש מאות אלף' + S],
  [2000000, 'שני מיליון' + S],
  [3000000, 'שלושה מיליון' + S],
  [10000000, 'עשרה מיליון' + S],
  [21000000, 'עשרים ואחד מיליון' + S],
  [123456789, 'מאה עשרים ושלושה מיליון ארבע מאות חמישים ושישה אלף שבע מאות שמונים ותשעה' + S],
  [999999999, 'תשע מאות תשעים ותשעה מיליון תשע מאות תשעים ותשעה אלף תשע מאות תשעים ותשעה' + S]
];

test('the table of whole sums (' + TABLE.length + ' numbers)', () => {
  assert.ok(TABLE.length >= 30);
  for (const [number, words] of TABLE) assert.equal(amountInWords(number, 0, 'shekel'), words, String(number));
});

test('the examples from the specification', () => {
  assert.equal(amountInWords(1500, 0, 'shekel'), 'אלף וחמש מאות שקלים חדשים');
  assert.equal(amountInWords(12, 50, 'shekel'), 'שנים עשר שקלים חדשים וחמישים אגורות');
  assert.equal(amountInWords(1, 0, 'shekel'), 'שקל חדש אחד');
  assert.equal(amountInWords(2000, 0, 'none'), 'אלפיים');
  assert.equal(amountInWords(3, 0, 'shekel'), 'שלושה שקלים חדשים');
  assert.equal(amountInWords(2, 0, 'shekel'), 'שני שקלים חדשים');
  assert.equal(amountInWords(5, 2, 'shekel'), 'חמישה שקלים חדשים ושתי אגורות');
});

test('agorot are feminine', () => {
  assert.equal(amountInWords(0, 1, 'shekel'), 'אגורה אחת');
  assert.equal(amountInWords(0, 2, 'shekel'), 'שתי אגורות');
  assert.equal(amountInWords(0, 3, 'shekel'), 'שלוש אגורות');
  assert.equal(amountInWords(0, 10, 'shekel'), 'עשר אגורות');
  assert.equal(amountInWords(0, 11, 'shekel'), 'אחת עשרה אגורות');
  assert.equal(amountInWords(0, 12, 'shekel'), 'שתים עשרה אגורות');
  assert.equal(amountInWords(0, 22, 'shekel'), 'עשרים ושתיים אגורות');
  assert.equal(amountInWords(0, 99, 'shekel'), 'תשעים ותשע אגורות');
  assert.equal(amountInWords(7, 1, 'shekel'), 'שבעה שקלים חדשים ואגורה אחת');
});

test('the suffix setting', () => {
  assert.equal(amountInWords(1500, 0, 'shah'), 'אלף וחמש מאות ש"ח');
  assert.equal(amountInWords(1, 0, 'shah'), 'ש"ח אחד');
  assert.equal(amountInWords(2, 0, 'shah'), 'שני ש"ח');
  assert.equal(amountInWords(1500, 0, 'none'), 'אלף וחמש מאות');
  assert.equal(amountInWords(1, 0, 'none'), 'אחד');
  assert.equal(amountInWords(2, 0, 'none'), 'שניים');
  assert.equal(amountInWords(12, 50, 'shah'), 'שנים עשר ש"ח וחמישים אגורות');
  assert.equal(amountInWords(2000, 0, 'shah'), 'אלפיים ש"ח');
  assert.equal(amountInWords(5, 2, 'shah'), 'חמישה ש"ח ושתי אגורות');
  assert.equal(amountInWords(1, 1, 'shah'), 'ש"ח אחד ואגורה אחת');
});

test('"no suffix" with agorot is written in full, because without "shekels" the sentence is cut off', () => {
  assert.equal(amountInWords(12, 50, 'none'), 'שנים עשר שקלים חדשים וחמישים אגורות');
  assert.equal(amountInWords(1, 1, 'none'), 'שקל חדש אחד ואגורה אחת');
  assert.equal(amountInWords(0, 50, 'none'), 'חמישים אגורות', 'agorot alone stay as they are');
  assert.equal(amountInWords(12, 0, 'none'), 'שנים עשר', 'a whole sum stays without a suffix');
});

test('agorot from the content writer\'s table', () => {
  assert.equal(amountInWords(0, 1, 'shekel'), 'אגורה אחת');
  assert.equal(amountInWords(0, 10, 'shekel'), 'עשר אגורות');
  assert.equal(amountInWords(1, 1, 'shekel'), 'שקל חדש אחד ואגורה אחת');
  assert.equal(amountInWords(5, 2, 'shekel'), 'חמישה שקלים חדשים ושתי אגורות');
});

test('out of range gives nothing', () => {
  assert.equal(amountInWords(1000000000, 0, 'shekel'), null);
  assert.equal(amountInWords(-1, 0, 'shekel'), null);
  assert.equal(amountInWords(1.5, 0, 'shekel'), null);
  assert.equal(amountInWords(1, 100, 'shekel'), null);
  assert.equal(integerInWords(NaN, false), null);
});

test('every number up to 3,000 and a sample of large ones gives clean words', () => {
  const sample = [];
  for (let i = 0; i <= 3000; i++) sample.push(i);
  for (let i = 3001; i < 999999999; i += 7919731) sample.push(i);
  for (const number of sample) {
    const words = integerInWords(number, false);
    assert.equal(typeof words, 'string');
    assert.ok(/^[א-ת]+( [א-ת]+)*$/.test(words), number + ': ' + words);
    assert.ok(!words.includes('undefined'));
  }
});
