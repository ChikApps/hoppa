// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { TRIGGER as T } from '../../src/config.js';
import { LIMITS } from '../../src/limits.js';
import { readCsv, writeCsv, guardCell, unguardCell, detectDelimiter } from '../../src/io/csv.js';
import { parseImportFile, prepareImport, buildImportPlan } from '../../src/io/importFile.js';
import { exportJson, exportCsv, dateStamp } from '../../src/io/exportFile.js';
import { createStore } from '../../src/storage/index.js';
import { defaultSettings, displayAbbr } from '../../src/core/validate.js';
import { makeEvilFixtures } from '../fixtures/make-evil.mjs';
import { fakeStorage, record } from './helpers/fakeStorage.js';

let evilDir = '';
before(async () => { evilDir = await makeEvilFixtures(); });

const bytes = (text) => new TextEncoder().encode(text);
const evil = async (name) => parseImportFile(new Uint8Array(await readFile(path.join(evilDir, name))), name);
const backup = (shortcuts, extra) => bytes(JSON.stringify({ app: 'Hoppa', schemaVersion: 1, shortcuts, ...extra }));

async function seeded() {
  const api = fakeStorage();
  const store = createStore(api);
  await store.seed(1000);
  return { api, store, snapshot: await store.load() };
}

test('CSV: quotes, commas and line breaks inside a cell survive a round trip', () => {
  const rows = [['קיצור', 'טקסט', 'תיאור'], [T + 'a', 'שורה 1\nשורה 2', 'עם, פסיק'], [T + 'b', 'אמר "שלום"', '']];
  const text = writeCsv(rows);
  assert.ok(text.startsWith('﻿'), 'byte order mark for Excel');
  assert.deepEqual(readCsv(text, 100).rows, rows);
});

test('CSV: formula guard on export, removed on import, exact round trip', () => {
  for (const value of ['=1+1', '+972', '-x', '@x', '\tx', '\rx', "'=1+1", "''+5"]) {
    assert.ok(guardCell(value).startsWith("'"), value);
    assert.equal(unguardCell(guardCell(value)), value, value);
  }
  for (const value of ['רגיל', "it's", '12', 'a=b', "'quoted'"]) {
    assert.equal(guardCell(value), value);
    assert.equal(unguardCell(value), value);
  }
});

test('CSV reader: line endings, empty lines at the end, limits', () => {
  assert.deepEqual(readCsv('a,b\nc,d', 10).rows, [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(readCsv('a,b\r\nc,d\r\n\r\n', 10).rows, [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(readCsv('a,""\n', 10).rows, [['a', '']]);
  assert.equal(readCsv('a,"open', 10).ok, false);
  assert.deepEqual(readCsv('1,2\n3,4\n5,6\n', 2), { ok: false, tooManyRows: true });
});

test('export and import of a backup give back the same shortcuts and settings', async () => {
  const { store, snapshot } = await seeded();
  snapshot.settings.calendar = 'diaspora';
  snapshot.settings.disabledSites = ['example.com'];
  const text = exportJson(snapshot, '2026-11-11T10:00:00.000Z');
  const data = JSON.parse(text);
  assert.equal(data.app, 'Hoppa');
  assert.equal(data.shortcuts.length, 25);
  assert.ok(data.shortcuts.every((item) => item.abbr.startsWith(T)));
  assert.deepEqual(Object.keys(data.shortcuts[0]), ['abbr', 'text', 'label', 'enabled', 'format'], 'no ids and no internal fields');

  const empty = createStore(fakeStorage());
  const parsed = parseImportFile(bytes(text), 'hoppa-backup.json');
  assert.ok(parsed.ok);
  const plan = buildImportPlan(prepareImport(parsed, [], 5000), new Map(), 5000);
  assert.equal(plan.imported, 25);
  assert.ok((await empty.save(plan.writes, plan.settings)).ok);
  const restored = await empty.load();
  assert.deepEqual(restored.shortcuts.map((item) => [displayAbbr(item), item.text, item.label]).sort(), snapshot.shortcuts.map((item) => [displayAbbr(item), item.text, item.label]).sort());
  assert.equal(restored.settings.calendar, 'diaspora');
  assert.deepEqual(restored.settings.disabledSites, ['example.com']);
  void store;
});

test('export CSV and import it again: nothing new, nothing rejected', async () => {
  const { snapshot } = await seeded();
  const text = exportCsv(snapshot.shortcuts, ['קיצור', 'טקסט', 'תיאור']);
  const parsed = parseImportFile(bytes(text), 'hoppa.csv');
  assert.ok(parsed.ok);
  assert.equal(parsed.kind, 'csv');
  assert.equal(parsed.rows.length, 25);
  const prepared = prepareImport(parsed, snapshot.shortcuts, 5000);
  assert.deepEqual([prepared.fresh.length, prepared.conflicts.length, prepared.rejected.length, prepared.skipped], [0, 0, 0, 25]);
});

test('import: file size is checked first', () => {
  const big = new Uint8Array(LIMITS.IMPORT_BYTES + 1).fill(0x20);
  assert.deepEqual(parseImportFile(big, 'x.json'), { ok: false, code: 'FILE_TOO_BIG' });
  assert.deepEqual(parseImportFile('a string', 'x.json'), { ok: false, code: 'FILE_INVALID' });
});

test('import: conflicts need a decision; skip, replace and keep both', async () => {
  const { store, snapshot } = await seeded();
  const parsed = parseImportFile(bytes(['קיצור,טקסט,תיאור', T + 'בב,אחר,', T + 'תמ,אחר,חדש', T + 'תר,אחר,', T + 'חדש,טקסט,', T + 'חדש,כפול בקובץ,'].join('\r\n')), 'a.csv');
  const prepared = prepareImport(parsed, snapshot.shortcuts, 5000);
  assert.equal(prepared.fresh.length, 1);
  assert.deepEqual(prepared.conflicts.map((item) => item.record.abbr), [T + 'בב', T + 'תמ', T + 'תר']);
  assert.equal(prepared.skipped, 1, 'a second row with the same shortcut in one file is skipped');

  const plan = buildImportPlan(prepared, new Map([[T + 'בב', 'skip'], [T + 'תמ', 'replace'], [T + 'תר', 'both']]), 5000);
  assert.deepEqual([plan.imported, plan.skipped, plan.added], [3, 2, 2]);
  assert.ok((await store.save(plan.writes, plan.settings)).ok);
  const after = await store.load();
  assert.equal(after.shortcuts.length, 27);
  const byAbbr = (abbr) => after.shortcuts.filter((item) => displayAbbr(item) === abbr);
  assert.equal(byAbbr(T + 'בב')[0].text, 'בברכה,');
  assert.equal(byAbbr(T + 'תמ').length, 1);
  assert.equal(byAbbr(T + 'תמ')[0].text, 'אחר');
  assert.equal(byAbbr(T + 'תמ')[0].label, 'חדש');
  assert.equal(byAbbr(T + 'תמ')[0].id, 'pack-08', 'replace keeps the same record');
  assert.equal(byAbbr(T + 'תר').length, 2);
  assert.deepEqual(byAbbr(T + 'תר').map((item) => item.enabled).sort(), [false, true], 'the second copy is saved turned off');
});

test('import: a backup that holds two shortcuts with one name (one of them turned off) imports back without questions', async () => {
  const { store, snapshot } = await seeded();
  const copy = { ...snapshot.shortcuts.find((item) => item.abbr === 'תר'), id: 'copy-1', builtin: false, abbr: T + 'תר', text: 'נוסח אחר', enabled: false };
  await store.save([copy]);
  const full = await store.load();
  const parsed = parseImportFile(bytes(exportJson(full, 'now')), 'backup.json');
  const prepared = prepareImport(parsed, full.shortcuts, 5000);
  assert.deepEqual([prepared.fresh.length, prepared.conflicts.length, prepared.skipped], [0, 0, 26]);
});

test('import: with no decision the default is to skip', async () => {
  const { snapshot } = await seeded();
  const parsed = parseImportFile(bytes(T + 'בב,אחר'), 'a.csv');
  const plan = buildImportPlan(prepareImport(parsed, snapshot.shortcuts, 1), new Map(), 1);
  assert.deepEqual([plan.writes.length, plan.imported, plan.skipped], [0, 0, 1]);
});

test('import: rejected rows carry their row number and reason', () => {
  const parsed = parseImportFile(bytes(['קיצור,טקסט', 'בלי,טקסט', T + 'טוב,טקסט', T + 'ארוך,' + 'א'.repeat(LIMITS.TEXT_MAX + 1), T + 'תע,שמור', T + '55,ספרות', T + 'ריק,'].join('\n')), 'a.csv');
  const prepared = prepareImport(parsed, [], 1);
  assert.equal(prepared.fresh.length, 1);
  assert.deepEqual(prepared.rejected, [
    { row: 2, code: 'ABBR_NO_TRIGGER' }, { row: 4, code: 'TEXT_TOO_LONG' }, { row: 5, code: 'ABBR_SMART' },
    { row: 6, code: 'ABBR_DIGITS' }, { row: 7, code: 'TEXT_EMPTY' }
  ]);
});

/* "שלום" in the Hebrew encoding of Windows, as the plain CSV format of Excel saves it. */
const HEBREW_1255 = [0xF9, 0xEC, 0xE5, 0xED];
const ascii = (text) => Array.from(text, (ch) => ch.charCodeAt(0));

test('import: a table saved by Excel in the Hebrew encoding of Windows is read', () => {
  const file = new Uint8Array([...ascii(T + 'a,'), ...HEBREW_1255, 0x0D, 0x0A, ...ascii(T + 'b,'), ...HEBREW_1255, ...ascii(',x'), 0x0D, 0x0A]);
  const parsed = parseImportFile(file, 'excel.csv');
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.rows.map((row) => [row.abbr, row.text, row.label]), [[T + 'a', 'שלום', ''], [T + 'b', 'שלום', 'x']]);
});

test('import: a table saved by Excel as "Unicode text" (UTF-16, tabs) is read', () => {
  const text = 'קיצור\tטקסט\r\n' + T + 'a\tשלום רב\r\n';
  const body = [];
  for (const ch of text) body.push(ch.charCodeAt(0) & 0xFF, ch.charCodeAt(0) >> 8);
  const parsed = parseImportFile(new Uint8Array([0xFF, 0xFE, ...body]), 'excel.csv');
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.rows.map((row) => [row.abbr, row.text]), [[T + 'a', 'שלום רב']]);
});

test('import: a table with semicolons between the cells is read', () => {
  const parsed = parseImportFile(bytes('קיצור;טקסט;תיאור\r\n' + T + 'a;שלום, וברכה;תיאור\r\n'), 'excel.csv');
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.rows.map((row) => [row.abbr, row.text, row.label]), [[T + 'a', 'שלום, וברכה', 'תיאור']]);
});

test('the separator of a table is the one that gives two or three cells in the first line', () => {
  assert.equal(detectDelimiter('a,b\n'), ',');
  assert.equal(detectDelimiter('a;b;c\n'), ';');
  assert.equal(detectDelimiter('a\tb\n'), '\t');
  assert.equal(detectDelimiter('a,b;c\n'), ',');
  assert.equal(detectDelimiter('"a;b",c\n'), ',');
  assert.equal(detectDelimiter('abc\n'), ',');
  assert.equal(detectDelimiter('a;b,c,d,e\n'), ';');
});

test('a UTF-8 file with one broken byte is rejected as damaged, and is not read in another encoding', () => {
  const good = Array.from(new TextEncoder().encode(T + 'בב,בברכה\r\n'));
  const broken = good.slice();
  broken.splice(4, 0, 0x81);
  assert.deepEqual(parseImportFile(new Uint8Array(broken), 'a.csv'), { ok: false, code: 'FILE_DAMAGED' });
  assert.deepEqual(parseImportFile(new Uint8Array([0xEF, 0xBB, 0xBF, ...ascii(T + 'a,b'), 0xFF]), 'a.csv'), { ok: false, code: 'FILE_DAMAGED' });
});

test('bytes that decode to control characters or to no letter are not a table', () => {
  assert.deepEqual(parseImportFile(new Uint8Array([0x81, 0x82, 0x2C, 0x83, 0x0D, 0x0A]), 'a.csv'), { ok: false, code: 'FILE_INVALID' });
  assert.deepEqual(parseImportFile(new Uint8Array([0x31, 0x2C, 0x32, 0xA4, 0x0D, 0x0A]), 'a.csv'), { ok: false, code: 'FILE_INVALID' });
});

test('control characters of the second range (U+0080 to U+009F) are removed from text and refused in a shortcut', () => {
  const parsed = parseImportFile(bytes(T + 'a,שלום\u0085 עולם\u009F,תיאור\u0080\r\n' + T + 'b\u0081,טקסט\r\n'), 'a.csv');
  const prepared = prepareImport(parsed, [], 1);
  assert.equal(prepared.fresh.length, 1);
  assert.equal(prepared.fresh[0].text, 'שלום עולם');
  assert.equal(prepared.fresh[0].label, 'תיאור');
  assert.deepEqual(prepared.rejected, [{ row: 2, code: 'ABBR_CHARS' }]);
});

test('a backup file (JSON) is accepted in UTF-8 only', () => {
  const body = [...ascii('{"app":"Hoppa","schemaVersion":1,"shortcuts":[{"abbr":"' + T + 'a","text":"'), ...HEBREW_1255, ...ascii('"}]}')];
  assert.deepEqual(parseImportFile(new Uint8Array(body), 'backup.json'), { ok: false, code: 'FILE_INVALID' });
});

test('import: a backup without a header row of CSV, and JSON detection by content', () => {
  assert.equal(parseImportFile(bytes(T + 'a,טקסט'), 'noheader.csv').rows[0].row, 1);
  assert.equal(parseImportFile(backup([{ abbr: T + 'a', text: 'x' }]), 'noext').kind, 'json');
  assert.equal(parseImportFile(backup([]), 'empty.json').rows.length, 0);
});

const REJECTED_FILES = {
  'broken.json': 'FILE_INVALID',
  'not-json.json': 'FILE_INVALID',
  'empty.json': 'FILE_INVALID',
  'shortcuts-not-array.json': 'FILE_INVALID',
  'unknown-top-key.json': 'FILE_INVALID',
  'unknown-version.json': 'FILE_INVALID',
  'newer-version.json': 'FILE_NEWER',
  'unknown-settings.json': 'FILE_INVALID',
  'bad-setting-value.json': 'FILE_INVALID',
  'proto-top.json': 'FILE_INVALID',
  'hundred-thousand.json': 'FILE_TOO_BIG',
  'five-megabytes.json': 'FILE_TOO_BIG',
  'many-columns.csv': 'FILE_INVALID',
  'one-column.csv': 'FILE_INVALID',
  'unclosed-quote.csv': 'FILE_INVALID',
  'too-many-rows.csv': 'CSV_TOO_MANY_ROWS',
  'not-utf8.csv': 'FILE_INVALID'
};

for (const [name, code] of Object.entries(REJECTED_FILES)) {
  test('hostile file ' + name + ' is rejected as a whole (' + code + ')', async () => {
    assert.deepEqual(await evil(name), { ok: false, code });
  });
}

test('a file with 100,000 records is rejected also when it is under the size limit', () => {
  const many = Array.from({ length: LIMITS.COUNT_LOCAL + 1 }, (_, i) => ({ abbr: T + 'k' + i, text: 'x' }));
  assert.deepEqual(parseImportFile(backup(many), 'many.json'), { ok: false, code: 'FILE_INVALID' });
});

for (const [name, count] of [['wrong-types.json', 6], ['proto-record.json', 2], ['huge-text.json', 1]]) {
  test('hostile file ' + name + ': every record is rejected, nothing to write', async () => {
    const { snapshot } = await seeded();
    const parsed = await evil(name);
    assert.ok(parsed.ok);
    const plan = buildImportPlan(prepareImport(parsed, snapshot.shortcuts, 1), new Map(), 1);
    assert.equal(plan.rejected.length, count);
    assert.equal(plan.writes.length, 0);
    assert.equal(plan.settings, undefined);
  });
}

test('hostile files do not change the prototype of objects', async () => {
  await evil('proto-top.json');
  await evil('proto-record.json');
  assert.equal({}.polluted, undefined);
  assert.equal({}.enabled, undefined);
});

test('markup in a file is plain text: imported as it is, never interpreted', async () => {
  const parsed = await evil('html-everywhere.json');
  const prepared = prepareImport(parsed, [], 1);
  assert.equal(prepared.rejected.length, 0);
  assert.equal(prepared.fresh.length, 3);
  assert.equal(prepared.fresh[0].text, '<script>window.__pwned = 1</script>');
  assert.equal(prepared.fresh[2].abbr, T + '<i>x');
});

test('a CSV with formulas: the guard is removed and the text returns as it was', async () => {
  const parsed = await evil('formulas.csv');
  assert.equal(parsed.rows[0].text, '=HYPERLINK("http://example.invalid","x")');
  assert.equal(parsed.rows[0].label, '+972');
  assert.equal(parsed.rows[1].text, '@SUM(1+1)');
});

test('an import that would pass the count limit is refused by the store, and nothing is written', async () => {
  const { api, store, snapshot } = await seeded();
  const rows = Array.from({ length: LIMITS.COUNT_SYNC }, (_, i) => T + 'n' + i + ',טקסט').join('\n');
  const plan = buildImportPlan(prepareImport(parseImportFile(bytes(rows), 'a.csv'), snapshot.shortcuts, 1), new Map(), 1);
  const before = api.sync.data.size;
  assert.deepEqual(await store.save(plan.writes, plan.settings), { ok: false, code: 'LIMIT_SYNC' });
  assert.equal(api.sync.data.size, before);
});

test('settings in a file are applied only when the whole file is valid', () => {
  const good = parseImportFile(backup([], { settings: { ...defaultSettings(), suffix: 'shah' } }), 'a.json');
  assert.equal(good.settings.suffix, 'shah');
  assert.equal(parseImportFile(backup([], { settings: { suffix: 'dollars' } }), 'a.json').ok, false);
});

test('file names for export', () => {
  assert.equal(dateStamp(new Date(2026, 10, 5)), '2026-11-05');
  void record;
});
