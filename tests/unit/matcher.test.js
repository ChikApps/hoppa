// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

import test from 'node:test';
import assert from 'node:assert/strict';
import { TRIGGER as T, BOUNDARY } from '../../src/config.js';
import { buildLookup, findMatch, typedConfirms, isBoundary } from '../../src/core/matcher.js';
import { TypedBuffer } from '../../src/core/typedBuffer.js';

const lookup = buildLookup([
  { abbr: T + 'תע', id: 'date' },
  { abbr: T + 'בב', id: 'regards' },
  { abbr: T + 'ת', id: 'short' },
  { abbr: T + 'a.b', id: 'dotted' }
]);
const find = (text, extra) => findMatch(text, { lookup, number: true, charBefore: () => null, ...extra });
const hit = (text, extra) => {
  const match = find(text, extra);
  return match ? { abbr: match.abbr, keep: match.keep, start: match.start, id: match.entry.id || match.entry.kind } : null;
};

test('a shortcut at the start of the field is replaced', () => {
  assert.deepEqual(hit(T + 'תע'), { abbr: T + 'תע', keep: '', start: 0, id: 'date' });
});

test('a shortcut after a space is replaced', () => {
  assert.deepEqual(hit('שלום ' + T + 'תע'), { abbr: T + 'תע', keep: '', start: 5, id: 'date' });
});

test('a shortcut after every boundary character is replaced', () => {
  for (const ch of BOUNDARY) {
    const match = hit('x' + ch + T + 'בב');
    assert.ok(match, 'after ' + JSON.stringify(ch));
    assert.equal(match.id, 'regards');
  }
});

test('the required cases that must NOT be replaced', () => {
  const cases = [
    '11' + T + '11',
    '1' + T + '2',
    'ו' + T + 'או',
    "א'" + T + 'בב',
    'https:' + T + T + 'x.co' + T + 'תע',
    T + 'home',
    'בעל' + T + 'ת',
    'צה"ל' + T + 'בב',
    'a:' + T + 'בב',
    T + T + 'בב',
    'x' + T + T + 'בב',
    T + 'בבx',
    T + 'ב',
    T,
    ''
  ];
  for (const text of cases) assert.equal(find(text), null, text);
});

test('the character before the text window decides when the candidate starts the window', () => {
  assert.ok(find(T + 'בב', { charBefore: () => ' ' }));
  assert.ok(find(T + 'בב', { charBefore: () => '\n' }));
  assert.equal(find(T + 'בב', { charBefore: () => 'x' }), null);
  assert.equal(find(T + 'בב', { charBefore: () => '5' }), null);
});

test('a shortcut that is the beginning of another one waits for a terminator', () => {
  assert.equal(find(T + 'ת'), null);
  assert.deepEqual(hit(T + 'ת '), { abbr: T + 'ת', keep: ' ', start: 0, id: 'short' });
  assert.deepEqual(hit(T + 'ת.'), { abbr: T + 'ת', keep: '.', start: 0, id: 'short' });
  assert.deepEqual(hit(T + 'ת', { enter: true }), { abbr: T + 'ת', keep: '', start: 0, id: 'short' });
});

test('a shortcut that is not the beginning of another one does not wait, and is not replaced later', () => {
  assert.equal(find(T + 'בב '), null);
  assert.equal(find(T + 'בב', { enter: true }), null);
});

test('a shortcut may contain a boundary character', () => {
  assert.deepEqual(hit(T + 'a.b'), { abbr: T + 'a.b', keep: '', start: 0, id: 'dotted' });
});

test('the number pattern waits for a terminator and keeps it', () => {
  assert.equal(find(T + '1500'), null);
  const match = find(T + '1500 ');
  assert.equal(match.abbr, T + '1500');
  assert.equal(match.keep, ' ');
  assert.equal(match.entry.number.shekels, 1500);
  assert.equal(match.entry.number.agorot, 0);
});

test('the number pattern: agorot, a full stop, Enter', () => {
  assert.equal(find(T + '12.50 ').entry.number.agorot, 50);
  assert.equal(find(T + '12.5 ').entry.number.agorot, 50);
  assert.equal(find(T + '12.05 ').entry.number.agorot, 5);
  assert.equal(find(T + '1500.'), null, 'may still become a fraction');
  const stop = find(T + '1500. ');
  assert.equal(stop.abbr, T + '1500');
  assert.equal(stop.keep, '. ');
  assert.equal(find(T + '12.50.'), null, 'a full stop after agorot also waits');
  const enter = find(T + '1500', { enter: true });
  assert.equal(enter.abbr, T + '1500');
  const enterStop = find(T + '1500.', { enter: true });
  assert.equal(enterStop.keep, '.');
  assert.equal(find(T + '12.50. ').keep, '. ');
});

test('the number pattern: thousands separators', () => {
  const amount = (text, extra) => {
    const match = find(text, extra);
    return match ? [match.entry.number.shekels, match.entry.number.agorot, match.abbr, match.keep] : null;
  };
  assert.deepEqual(amount(T + '1,000,000 '), [1000000, 0, T + '1,000,000', ' ']);
  assert.deepEqual(amount(T + '1,500 '), [1500, 0, T + '1,500', ' ']);
  assert.deepEqual(amount(T + '12,345.50 '), [12345, 50, T + '12,345.50', ' ']);
  assert.deepEqual(amount(T + '999,999,999 '), [999999999, 0, T + '999,999,999', ' ']);
  assert.deepEqual(amount(T + '1,500', { enter: true }), [1500, 0, T + '1,500', '']);
  assert.equal(find(T + '1,'), null, 'a group of three digits may still follow');
  assert.equal(find(T + '1,000,'), null, 'another group may still follow');
  assert.deepEqual(amount(T + '1, '), [1, 0, T + '1', ', '], 'a comma and a space: the comma was punctuation');
  assert.equal(find(T + '1500,'), null, 'a comma always waits for the next character');
  assert.deepEqual(amount(T + '1500, '), [1500, 0, T + '1500', ', ']);
  assert.deepEqual(amount(T + '1,000,000, '), [1000000, 0, T + '1,000,000', ', ']);
  assert.deepEqual(amount(T + '1500,', { enter: true }), [1500, 0, T + '1500', ','], 'Enter after the comma');
  for (const text of [T + '1,,', T + '1,, ', T + '1,,000 ', T + '1234,567 ', T + '12.50., ', T + '12.,', T + '1500.. ']) {
    assert.equal(find(text), null, text);
  }
  for (const text of [T + '1,5 ', T + '1,50 ', T + '1,5000 ', T + '1,000,00 ', T + '1000,000 ', T + '1,,000 ', T + ',500 ', T + '1,000,000,000 ']) {
    assert.equal(find(text), null, text);
  }
});

test('the number pattern: agorot and leading zeros, as the content writer asked to check', () => {
  const amount = (text) => {
    const match = find(text);
    return match ? [match.entry.number.shekels, match.entry.number.agorot] : null;
  };
  assert.deepEqual(amount(T + '12.5 '), [12, 50], 'one digit after the point is tens of agorot');
  assert.deepEqual(amount(T + '12.05 '), [12, 5]);
  assert.deepEqual(amount(T + '12.50 '), [12, 50]);
  assert.equal(amount(T + '12.505 '), null, 'three digits after the point is not a sum');
  assert.deepEqual(amount(T + '007 '), [7, 0]);
  assert.deepEqual(amount(T + '0.50 '), [0, 50]);
});

test('the number pattern: what is not a number', () => {
  for (const text of ['11' + T + '11 ', T + '1234567890 ', T + '12.505 ', T + '2a ', T + '1500x', 'x' + T + '5 ', T + '5' + T + ' ']) {
    assert.equal(find(text), null, text);
  }
  assert.equal(findMatch(T + '1500 ', { lookup, number: false, charBefore: () => null }), null, 'the number is turned off');
});

test('buildLookup: the first entry wins, and prefixes are found', () => {
  const built = buildLookup([{ abbr: T + 'a', n: 1 }, { abbr: T + 'a', n: 2 }, { abbr: T + 'ab', n: 3 }, { abbr: T + 'c', n: 4 }]);
  assert.equal(built.map.get(T + 'a').n, 1);
  assert.deepEqual(Array.from(built.prefixes), [T + 'a']);
  assert.ok(built.map instanceof Map);
});

test('the lookup is safe with names of object properties', () => {
  const built = buildLookup([{ abbr: T + '__proto__', n: 1 }, { abbr: T + 'constructor', n: 2 }]);
  assert.equal(built.map.get(T + 'toString'), undefined);
  assert.equal(find(T + 'toString'), null);
});

test('isBoundary', () => {
  assert.ok(isBoundary(null));
  assert.ok(isBoundary(' '));
  assert.ok(!isBoundary('a'));
  assert.ok(!isBoundary(':'));
  assert.ok(!isBoundary("'"));
  assert.ok(!isBoundary('"'));
  assert.ok(!isBoundary('5'));
});

test('typedConfirms: the typed characters must end with the field text, at a word boundary', () => {
  assert.ok(typedConfirms(T + 'בב', T + 'בב'));
  assert.ok(typedConfirms('שלום ' + T + 'בב', T + 'בב'));
  assert.ok(!typedConfirms('ב', T + 'בב'), 'only one letter was typed');
  assert.ok(!typedConfirms('', T + 'בב'));
  assert.ok(!typedConfirms('x' + T + 'בב', T + 'בב'), 'typed after a letter');
  assert.ok(typedConfirms(T + 'ת ', T + 'ת '), 'a no-break space equals a space');
});

test('TypedBuffer: a clear caused by the page does not make a start of a word (the case of a/shortcut)', () => {
  const buffer = new TypedBuffer(16);
  const field = {};
  buffer.push(field, 'א');
  buffer.clear(false);
  for (const ch of T + 'תע') buffer.push(field, ch);
  assert.ok(!buffer.confirms(field, T + 'תע'), 'the user typed a letter before the trigger; the page only emptied the buffer');

  buffer.push(field, ' ');
  for (const ch of T + 'תע') buffer.push(field, ch);
  assert.ok(buffer.confirms(field, T + 'תע'), 'after a space the user really typed, it counts again');

  buffer.clear(false);
  buffer.clear(true);
  for (const ch of T + 'תע') buffer.push(field, ch);
  assert.ok(buffer.confirms(field, T + 'תע'), 'a clear caused by the user (a click, a new field) is a start of a word');

  buffer.clear(false);
  const other = {};
  for (const ch of T + 'תע') buffer.push(other, ch);
  assert.ok(buffer.confirms(other, T + 'תע'), 'typing in another field starts fresh');
});

test('TypedBuffer: one field at a time, limited size, cleared on demand', () => {
  const buffer = new TypedBuffer(8);
  const a = {};
  const b = {};
  for (const ch of T + 'בב') buffer.push(a, ch);
  assert.ok(buffer.confirms(a, T + 'בב'));
  assert.ok(!buffer.confirms(b, T + 'בב'), 'another field');
  buffer.push(b, 'ב');
  assert.ok(!buffer.confirms(a, T + 'בב'), 'moving to another field clears');
  buffer.clear();
  assert.equal(buffer.size, 0);
  for (const ch of 'abcdefghijkl') buffer.push(a, ch);
  assert.equal(buffer.size, 8);
  buffer.pop(a);
  assert.equal(buffer.size, 7);
  buffer.pop(b);
  assert.equal(buffer.size, 0, 'a delete in another field clears');
});
