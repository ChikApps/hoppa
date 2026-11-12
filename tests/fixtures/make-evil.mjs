// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Writes the hostile import files into tests/fixtures/evil/.
 * Every one of them must be rejected (or imported as plain text) without
 * changing any existing shortcut. The three big files are created here and
 * are not kept in the repository.
 * Run with: npm run fixtures
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRIGGER as T } from '../../src/config.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'evil');
const file = (shortcuts, extra) => JSON.stringify({ app: 'Hoppa', schemaVersion: 1, shortcuts, ...extra });
const one = (abbr, text, label) => ({ abbr: T + abbr, text, label: label || '', enabled: true, format: 'plain' });

export async function makeEvilFixtures() {
  await mkdir(dir, { recursive: true });
  const files = {
    // Not a valid file at all.
    'broken.json': '{"app":"Hoppa","schemaVersion":1,"shortcuts":[{"abbr":"' + T + 'a","text":"x"',
    'not-json.json': 'this is not a backup file',
    'empty.json': '   ',
    'shortcuts-not-array.json': JSON.stringify({ app: 'Hoppa', schemaVersion: 1, shortcuts: { 0: one('a', 'x') } }),
    'unknown-top-key.json': file([one('a', 'x')], { run: 'https://example.invalid/code.js' }),
    'unknown-version.json': JSON.stringify({ app: 'Hoppa', schemaVersion: 'one', shortcuts: [one('a', 'x')] }),
    'newer-version.json': JSON.stringify({ app: 'Hoppa', schemaVersion: 99, shortcuts: [one('a', 'x')] }),
    'unknown-settings.json': file([one('a', 'x')], { settings: { enabled: true, remoteConfig: 'https://example.invalid' } }),
    'bad-setting-value.json': file([one('a', 'x')], { settings: { calendar: 'mars' } }),
    // A dangerous key at the top of the file.
    'proto-top.json': '{"app":"Hoppa","schemaVersion":1,"__proto__":{"polluted":true},"shortcuts":[{"abbr":"' + T + 'a","text":"x"}]}',
    // Records that are all invalid: wrong types and dangerous keys.
    'wrong-types.json': file([
      { abbr: 5, text: 'x' },
      { abbr: T + 'a', text: { toString: 'x' } },
      { abbr: T + 'b', text: 'x', enabled: 'yes' },
      { abbr: T + 'c', text: 'x', format: 'html' },
      [T + 'd', 'x'],
      { abbr: T + 'e', text: 'x', label: 7 }
    ]),
    'proto-record.json': '{"app":"Hoppa","schemaVersion":1,"shortcuts":[{"abbr":"' + T + 'a","text":"x","__proto__":{"enabled":true}},{"abbr":"' + T + 'b","text":"x","constructor":{"prototype":{}}}]}',
    // Markup in every field. Valid as text: it must be imported and shown as text only.
    'html-everywhere.json': file([
      one('הזרקה1', '<script>window.__pwned = 1</script>', '<img src=x onerror=alert(1)>'),
      one('הזרקה2', '"><svg onload=alert(1)>', '<iframe src="javascript:alert(1)"></iframe>'),
      one('<i>x', '<img src=x onerror=alert(1)>', '</td><script>alert(1)</script>')
    ]),
    // CSV.
    'formulas.csv': '﻿קיצור,טקסט,תיאור\r\n' + T + 'נוסחה,"\'=HYPERLINK(""http://example.invalid"",""x"")",\'+972\r\n' + T + 'נוסחה2,\'@SUM(1+1),\'-1\r\n',
    'many-columns.csv': T + 'a,' + Array.from({ length: 4000 }, (_, i) => 'c' + i).join(',') + '\r\n',
    'one-column.csv': T + 'a\r\n' + T + 'b\r\n',
    'unclosed-quote.csv': T + 'a,"text without an end\r\n' + T + 'b,x\r\n',
    'too-many-rows.csv': Array.from({ length: 2001 }, (_, i) => T + 'r' + i + ',text ' + i).join('\r\n') + '\r\n'
  };
  for (const [name, content] of Object.entries(files)) await writeFile(path.join(dir, name), content);

  // Bytes that are not valid text in any encoding that import accepts (UTF-8, UTF-16 with a mark, Windows-1255).
  await writeFile(path.join(dir, 'not-utf8.csv'), Buffer.from([0x2f, 0x61, 0x2c, 0xd9, 0xdf, 0xfb, 0xff, 0x0d, 0x0a]));

  // The big ones.
  await writeFile(path.join(dir, 'hundred-thousand.json'), file(Array.from({ length: 100000 }, (_, i) => ({ abbr: T + i + 'a', text: 'x' }))));
  await writeFile(path.join(dir, 'five-megabytes.json'), file([one('a', 'x'.repeat(5 * 1024 * 1024))]));
  await writeFile(path.join(dir, 'huge-text.json'), file([one('a', 'x'.repeat(1024 * 1024))]));
  return dir;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  makeEvilFixtures().then((where) => process.stdout.write('Hostile import files written to ' + where + '\n'));
}
