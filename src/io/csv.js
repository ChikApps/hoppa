// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Our own CSV reader and writer (quotes, line breaks inside a cell).
 * A cell that a spreadsheet would run as a formula gets an apostrophe in front
 * of it on export, and loses it again on import.
 */
const BOM = '﻿';
const FORMULA_START_RE = /^'*[=+\-@\t\r]/;
const GUARDED_RE = /^'+[=+\-@\t\r]/;

export function guardCell(value) {
  const text = String(value === null || value === undefined ? '' : value);
  return FORMULA_START_RE.test(text) ? "'" + text : text;
}

export function unguardCell(value) {
  return GUARDED_RE.test(value) ? value.slice(1) : value;
}

function quoteCell(text) {
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

/* rows: arrays of strings. The result starts with a byte order mark, so Excel reads Hebrew correctly. */
export function writeCsv(rows) {
  return BOM + rows.map((row) => row.map((cell) => quoteCell(guardCell(cell))).join(',')).join('\r\n') + '\r\n';
}

/*
 * Returns { ok: true, rows } or { ok: false } when a quoted cell is never closed
 * or when there are more rows than maxRows.
 */
const DELIMITERS = [',', ';', '\t'];

/*
 * Excel separates cells with a comma, a semicolon or a tab, depending on the
 * computer's settings and on the format that was chosen. The separator is the
 * one that splits the first line into two or three cells.
 */
export function detectDelimiter(input) {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const counts = new Map(DELIMITERS.map((delimiter) => [delimiter, 0]));
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && counts.has(ch)) counts.set(ch, counts.get(ch) + 1);
  }
  for (const delimiter of DELIMITERS) {
    const count = counts.get(delimiter);
    if (count === 1 || count === 2) return delimiter;
  }
  return DELIMITERS[0];
}

export function readCsv(input, maxRows, delimiter) {
  const separator = delimiter || DELIMITERS[0];
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let wasQuoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell.length === 0 && !wasQuoted) {
      quoted = true;
      wasQuoted = true;
    } else if (ch === separator) {
      row.push(cell);
      cell = '';
      wasQuoted = false;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      if (rows.length > maxRows) return { ok: false, tooManyRows: true };
      row = [];
      cell = '';
      wasQuoted = false;
    } else {
      cell += ch;
    }
  }
  if (quoted) return { ok: false, tooManyRows: false };
  if (cell.length > 0 || row.length > 0 || wasQuoted) {
    row.push(cell);
    rows.push(row);
  }
  // Empty lines at the end of the file are not rows.
  while (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  if (rows.length > maxRows) return { ok: false, tooManyRows: true };
  return { ok: true, rows };
}
