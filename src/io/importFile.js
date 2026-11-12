// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Import. A file is untrusted input: it is checked in full before anything is
 * written, and nothing in it is ever run or fetched. All or nothing: a file
 * that is not valid changes no existing shortcut.
 */
import { LIMITS } from '../limits.js';
import { validateShortcut, validateSettings, displayAbbr, isPlainObject, hasDangerousKey, newId } from '../core/validate.js';
import { CURRENT_SCHEMA } from '../storage/migrations.js';
import { readCsv, unguardCell, detectDelimiter } from './csv.js';

export const APP_NAME = 'Hoppa';
const FILE_KEYS = new Set(['app', 'schemaVersion', 'exportedAt', 'settings', 'shortcuts']);
const CSV_HEADERS = new Set(['קיצור', 'abbr']);

function fail(code) {
  return { ok: false, code };
}

function decodeAs(bytes, encoding) {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch (error) {
    return null;
  }
}

function decode(bytes) {
  return decodeAs(bytes, 'utf-8');
}

/*
 * Is this a UTF-8 file that was damaged, and not a file in another encoding?
 * A real two- or three-byte UTF-8 letter (as every Hebrew letter in UTF-8 is)
 * almost never appears by chance in a file of the Hebrew encoding of Windows.
 */
function looksLikeUtf8(bytes) {
  for (let i = 0; i + 1 < bytes.length; i++) {
    const lead = bytes[i];
    if (lead >= 0xC2 && lead <= 0xDF && (bytes[i + 1] & 0xC0) === 0x80) return true;
    if (lead >= 0xE0 && lead <= 0xEF && i + 2 < bytes.length && (bytes[i + 1] & 0xC0) === 0x80 && (bytes[i + 2] & 0xC0) === 0x80) return true;
  }
  return false;
}

const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;
const LETTER_RE = /[A-Za-z\u05D0-\u05EA]/;

/*
 * A table saved by Excel is not always UTF-8: the plain "CSV" format uses the
 * Hebrew encoding of Windows, and "Unicode text" uses UTF-16. Each one is
 * decoded strictly (any invalid byte rejects the file). A backup file (JSON)
 * is always UTF-8 and never goes through here.
 * Returns the text, or { damaged: true } for a UTF-8 file with a broken byte,
 * or null when the bytes are not text.
 */
function decodeTable(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return decodeAs(bytes, 'utf-16le');
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return decodeAs(bytes, 'utf-16be');
  const utf8 = decodeAs(bytes, 'utf-8');
  if (utf8 !== null) return utf8;
  const hasUtf8Mark = bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
  if (hasUtf8Mark || looksLikeUtf8(bytes)) return { damaged: true };
  const windows = decodeAs(bytes, 'windows-1255');
  // A file that decodes to control characters, or to no letter at all, is not a table of shortcuts.
  if (windows === null || CONTROL_RE.test(windows) || !LETTER_RE.test(windows)) return null;
  return windows;
}

function parseJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return fail('FILE_INVALID');
  }
  if (!isPlainObject(data) || hasDangerousKey(data)) return fail('FILE_INVALID');
  for (const key of Object.keys(data)) {
    if (!FILE_KEYS.has(key)) return fail('FILE_INVALID');
  }
  if (data.app !== APP_NAME) return fail('FILE_INVALID');
  if (!Number.isSafeInteger(data.schemaVersion) || data.schemaVersion < 1) return fail('FILE_INVALID');
  if (data.schemaVersion > CURRENT_SCHEMA) return fail('FILE_NEWER');
  if (data.exportedAt !== undefined && typeof data.exportedAt !== 'string') return fail('FILE_INVALID');
  if (!Array.isArray(data.shortcuts) || data.shortcuts.length > LIMITS.COUNT_LOCAL) return fail('FILE_INVALID');

  let settings;
  if (data.settings !== undefined) {
    const checked = validateSettings(data.settings, true);
    if (!checked.ok) return fail('FILE_INVALID');
    settings = checked.value;
  }

  const rows = data.shortcuts.map((item, index) => {
    const row = index + 1;
    if (!isPlainObject(item) || hasDangerousKey(item)) return { row, invalid: true };
    if (item.enabled !== undefined && typeof item.enabled !== 'boolean') return { row, invalid: true };
    if (item.format !== undefined && item.format !== 'plain') return { row, invalid: true };
    return {
      row,
      abbr: item.abbr,
      text: item.text,
      label: item.label === undefined || item.label === null ? '' : item.label,
      enabled: item.enabled === undefined ? true : item.enabled
    };
  });
  return { ok: true, kind: 'json', rows, settings };
}

function parseCsv(text) {
  const read = readCsv(text, LIMITS.CSV_ROWS + 1, detectDelimiter(text));
  if (!read.ok) return fail(read.tooManyRows ? 'CSV_TOO_MANY_ROWS' : 'FILE_INVALID');
  const lines = read.rows;
  if (lines.length === 0) return fail('FILE_INVALID');

  let offset = 0;
  if (CSV_HEADERS.has(lines[0][0].trim().toLowerCase())) offset = 1;
  if (lines.length - offset > LIMITS.CSV_ROWS) return fail('CSV_TOO_MANY_ROWS');
  if (lines.length - offset === 0) return fail('FILE_INVALID');

  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i];
    if (cells.length < LIMITS.CSV_COLS_MIN || cells.length > LIMITS.CSV_COLS_MAX) return fail('FILE_INVALID');
    if (i < offset) continue;
    rows.push({
      row: i + 1,
      abbr: unguardCell(cells[0]).trim(),
      text: unguardCell(cells[1]),
      label: cells.length > 2 ? unguardCell(cells[2]) : '',
      enabled: true
    });
  }
  return { ok: true, kind: 'csv', rows, settings: undefined };
}

/*
 * bytes: Uint8Array with the content of the file. The size is checked here again,
 * although the page checks it before reading the file.
 * Returns { ok: false, code } or { ok: true, kind, rows, settings }.
 */
export function parseImportFile(bytes, fileName) {
  if (!(bytes instanceof Uint8Array)) return fail('FILE_INVALID');
  if (bytes.length > LIMITS.IMPORT_BYTES) return fail('FILE_TOO_BIG');
  const name = typeof fileName === 'string' ? fileName.toLowerCase() : '';
  const utf8 = decode(bytes);
  if (name.endsWith('.json')) {
    return utf8 === null || utf8.trim().length === 0 ? fail('FILE_INVALID') : parseJson(utf8);
  }
  if (!name.endsWith('.csv') && utf8 !== null && utf8.trimStart().startsWith('{')) return parseJson(utf8);
  const table = decodeTable(bytes);
  if (table !== null && typeof table === 'object') return fail('FILE_DAMAGED');
  if (table === null || table.trim().length === 0) return fail('FILE_INVALID');
  return parseCsv(table);
}

/*
 * Checks every row with validateShortcut() and compares it with what exists.
 * Returns the rows that can be added, the ones that need a decision, and the rejected ones.
 * Nothing is written here.
 */
export function prepareImport(parsed, existing, now) {
  // Every existing shortcut by its name. An active one comes first: it is the one a conflict is about.
  const byAbbr = new Map();
  for (const shortcut of existing) {
    const abbr = displayAbbr(shortcut);
    const list = byAbbr.get(abbr) || [];
    if (shortcut.enabled) list.unshift(shortcut);
    else list.push(shortcut);
    byAbbr.set(abbr, list);
  }
  const same = (current, record) => current.text === record.text && (record.label === '' || current.label === record.label);

  const fresh = [];
  const conflicts = [];
  const rejected = [];
  let skipped = 0;
  const seen = new Set();

  for (const row of parsed.rows) {
    if (row.invalid) {
      rejected.push({ row: row.row, code: 'RECORD_INVALID' });
      continue;
    }
    const checked = validateShortcut({
      id: newId(),
      abbr: row.abbr,
      text: row.text,
      label: row.label,
      enabled: row.enabled,
      format: 'plain',
      builtin: false,
      createdAt: now,
      updatedAt: now
    });
    if (!checked.ok) {
      rejected.push({ row: row.row, code: checked.code });
      continue;
    }
    const record = checked.value;
    if (seen.has(record.abbr)) {
      skipped += 1;
      continue;
    }
    seen.add(record.abbr);

    const current = byAbbr.get(record.abbr);
    if (!current) fresh.push(record);
    else if (current.some((item) => same(item, record))) skipped += 1;
    else conflicts.push({ record, current: current[0] });
  }
  return { fresh, conflicts, rejected, skipped, settings: parsed.settings };
}

/*
 * decisions: Map from the shortcut to 'skip' | 'replace' | 'both'.
 * Returns the records to write and the numbers for the summary.
 */
export function buildImportPlan(prepared, decisions, now) {
  const writes = prepared.fresh.slice();
  let imported = prepared.fresh.length;
  let skipped = prepared.skipped;
  let added = prepared.fresh.length;

  for (const conflict of prepared.conflicts) {
    const decision = decisions.get(conflict.record.abbr);
    if (decision === 'replace') {
      writes.push({
        ...conflict.current,
        text: conflict.record.text,
        label: conflict.record.label === '' ? conflict.current.label : conflict.record.label,
        updatedAt: now
      });
      imported += 1;
    } else if (decision === 'both') {
      // The second copy is saved turned off, so two active shortcuts never share a name.
      writes.push({ ...conflict.record, enabled: false });
      imported += 1;
      added += 1;
    } else {
      skipped += 1;
    }
  }
  return { writes, imported, skipped, added, rejected: prepared.rejected, settings: prepared.settings };
}
