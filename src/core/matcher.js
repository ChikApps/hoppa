// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Finds a shortcut in the text before the caret.
 * A replacement happens only when (1) the trigger is at the start of a word and
 * (2) the text from the trigger to the caret equals an existing shortcut exactly.
 * A shortcut that is the beginning of another one waits for a terminator.
 * The number pattern (trigger + digits) always waits for a terminator.
 */
import { TRIGGER, BOUNDARY, TERMINATORS, DECIMAL_POINT, THOUSANDS_SEPARATOR } from '../config.js';
import { LIMITS } from '../limits.js';

const BOUNDARY_SET = new Set(BOUNDARY);
const TERMINATOR_SET = new Set(TERMINATORS);
const SPACE_RE = /\s/;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

const POINT = escapeRegExp(DECIMAL_POINT);
const COMMA = escapeRegExp(THOUSANDS_SEPARATOR);
const MAX_GROUPS = Math.ceil(LIMITS.NUMBER_MAX_DIGITS / 3) - 1;

/* Digits only (1500), or groups of three with separators (1,500 or 1,000,000). Then agorot, then one trailing mark. */
const NUMBER_RE = new RegExp(
  '^' + escapeRegExp(TRIGGER) +
  '(\\d{1,' + LIMITS.NUMBER_MAX_DIGITS + '}|\\d{1,3}(?:' + COMMA + '\\d{3}){1,' + MAX_GROUPS + '})' +
  '(?:' + POINT + '(\\d{1,2}))?' +
  '([' + POINT + COMMA + ']?)$'
);

export function isBoundary(ch) {
  return ch === null || ch === undefined || ch === '' || BOUNDARY_SET.has(ch);
}

export function isTerminator(ch) {
  return TERMINATOR_SET.has(ch);
}

/*
 * entries: [{ abbr, ...payload }] where abbr is the full shortcut, with the trigger.
 * The first entry wins when two entries share a shortcut.
 */
export function buildLookup(entries) {
  const map = new Map();
  for (const entry of entries) {
    if (typeof entry.abbr !== 'string' || map.has(entry.abbr)) continue;
    map.set(entry.abbr, entry);
  }
  const sorted = Array.from(map.keys()).sort();
  const prefixes = new Set();
  for (let i = 0; i + 1 < sorted.length; i++) {
    if (sorted[i + 1].startsWith(sorted[i])) prefixes.add(sorted[i]);
  }
  return { map, prefixes };
}

function parseNumber(candidate) {
  const found = NUMBER_RE.exec(candidate);
  if (!found) return null;
  const whole = found[1];
  const groups = whole.split(THOUSANDS_SEPARATOR);
  const fraction = found[2] === undefined ? '' : found[2];
  return {
    shekels: Number(groups.join('')),
    agorot: fraction === '' ? 0 : Number(fraction.length === 1 ? fraction + '0' : fraction),
    hasFraction: fraction !== '',
    trailingPoint: found[3].length
  };
}

/*
 * A full stop or a comma right after a number may still belong to it ("1500."
 * may become "1500.50", and "1," may become "1,000"), so the decision waits
 * for one more character. Two marks in a row ("1,,000", "12.50.,") are never a number.
 */
function isMark(ch) {
  return ch === DECIMAL_POINT || ch === THOUSANDS_SEPARATOR;
}

/*
 * text: the text before the caret (a window of the last characters is enough).
 * options.charBefore(): the character right before `text`, or null at the start
 *   of the field or of the line. Called only when a candidate starts at index 0.
 * options.lookup: the result of buildLookup().
 * options.number: whether the number pattern is active.
 * options.enter: true when Enter was pressed (there is no terminator in the text).
 *
 * Returns null, or { start, end, abbr, entry, keep }: text[start:end] is the
 * shortcut to replace and `keep` is what stays after it.
 */
export function findMatch(text, options) {
  if (typeof text !== 'string' || text.length === 0) return null;
  const lookup = options.lookup;
  const enter = options.enter === true;
  const length = text.length;

  // The shortcut has no whitespace in it; only the last character may be one (a terminator).
  let low = enter ? length : length - 1;
  while (low > 0 && !SPACE_RE.test(text[low - 1])) low--;
  const floor = Math.max(low, length - (LIMITS.ABBR_MAX + 2));

  for (let i = floor; i < length; i++) {
    if (!text.startsWith(TRIGGER, i)) continue;
    const before = i === 0 ? (options.charBefore ? options.charBefore() : null) : text[i - 1];
    if (!isBoundary(before)) continue;

    const candidate = text.slice(i);
    if (candidate.length <= TRIGGER.length) continue;

    if (enter) {
      const entry = lookup.map.get(candidate);
      if (entry && lookup.prefixes.has(candidate)) {
        return { start: i, end: length, abbr: candidate, entry, keep: '' };
      }
      const number = options.number ? parseNumber(candidate) : null;
      if (number) {
        const end = length - number.trailingPoint;
        return { start: i, end, abbr: text.slice(i, end), entry: { kind: 'number', number }, keep: text.slice(end) };
      }
      continue;
    }

    const exact = lookup.map.get(candidate);
    if (exact) {
      // The beginning of a longer shortcut: wait for a terminator.
      if (lookup.prefixes.has(candidate)) return null;
      return { start: i, end: length, abbr: candidate, entry: exact, keep: '' };
    }

    const last = candidate[candidate.length - 1];
    if (!TERMINATOR_SET.has(last)) continue;
    const base = candidate.slice(0, -1);

    const waiting = lookup.map.get(base);
    if (waiting && lookup.prefixes.has(base)) {
      return { start: i, end: length - 1, abbr: base, entry: waiting, keep: last };
    }

    if (options.number) {
      const number = parseNumber(base);
      if (number) {
        if (isMark(last)) {
          if (number.trailingPoint > 0) continue;
          return null;
        }
        const end = length - 1 - number.trailingPoint;
        return { start: i, end, abbr: text.slice(i, end), entry: { kind: 'number', number }, keep: text.slice(end) };
      }
    }
  }
  return null;
}

/*
 * The characters the user really typed must end with the same text that is in
 * the field (shortcut + what stays after it), and start at a word boundary too.
 */
export function typedConfirms(typed, fieldText) {
  const plain = (value) => value.replace(/ /g, ' ');
  const buffer = plain(typed);
  const wanted = plain(fieldText);
  if (wanted.length === 0 || !buffer.endsWith(wanted)) return false;
  if (buffer.length === wanted.length) return true;
  return BOUNDARY_SET.has(buffer[buffer.length - wanted.length - 1]);
}
