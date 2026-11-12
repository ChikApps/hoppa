// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Live test in a REAL Google Docs document (needs the network). Not part of `npm run test:e2e`.
 *
 *   HOPPA_DOCS_URL="https://docs.google.com/document/d/<id>/edit" xvfb-run -a npm run test:docs
 *
 * The document must be open for editing to anyone with the link (the test works as a guest,
 * without signing in). The test types only in its own lines and deletes everything it typed
 * at the end of every check, so the document is left empty. Use a document made for testing only.
 * It runs a visible browser (Docs gives a headless browser a different page), so on a machine
 * without a screen run it under xvfb-run.
 *
 * The text of the document is read with Ctrl+A and Ctrl+C (the page's copy event), because
 * Docs draws the text on a canvas. This happens in the test only, never in the extension.
 */
import { cp, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, createReporter, equal, truthy, pause, freePort } from './lib.mjs';
import { TRIGGER as T, HEBREW_DATE_MARKS } from '../../src/config.js';
import { PACK } from '../../src/core/pack.js';
import { formatHebrewDate } from '../../src/smart/hebrewDate.js';
import { formatGregorianDate } from '../../src/smart/gregDate.js';
import { amountInWords } from '../../src/smart/numberWords.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOC_URL = process.env.HOPPA_DOCS_URL || '';
const packText = (abbr) => PACK.find((row) => row.abbr === abbr).text;
const report = createReporter();
const { check } = report;
const CTRL = 2;
const SHIFT = 8;
const VK = { Backspace: 8, Enter: 13, Delete: 46, End: 35, Home: 36, ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, a: 65, c: 67, v: 86, z: 90 };

async function main() {
  if (!/^https:\/\/docs\.google\.com\/document\/d\/[\w-]+/.test(DOC_URL)) {
    process.stdout.write('Set HOPPA_DOCS_URL to a Google Docs document that is open for editing (see the top of this file).' + '\n');
    process.exit(2);
  }
  const { chromium } = loadPlaywright();
  const work = await mkdtemp(path.join(process.env.HOPPA_TMP || os.tmpdir(), 'hoppa-docs-'));
  const extension = path.join(work, 'ext');
  // HOPPA_DIST: another build to test (for example one with different frame options in its manifest).
  await cp(process.env.HOPPA_DIST || path.join(root, 'dist'), extension, { recursive: true });
  const debugPort = await freePort();
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined;
  const context = await chromium.launchPersistentContext(path.join(work, 'profile'), {
    channel: process.env.HOPPA_E2E_CHANNEL || 'chromium',
    headless: false,
    locale: 'he-IL',
    proxy,
    viewport: { width: 1280, height: 900 },
    env: { ...process.env, LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' },
    args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension, '--remote-debugging-port=' + debugPort]
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
  const id = new URL(worker.url()).host;

  const page = context.pages()[0] || await context.newPage();
  const cdp = await context.newCDPSession(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  async function rawKey(key, opts) {
    await cdp.send('Input.dispatchKeyEvent', { type: opts.text ? 'keyDown' : 'rawKeyDown', key, ...opts });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: opts.code, windowsVirtualKeyCode: opts.windowsVirtualKeyCode, modifiers: opts.modifiers });
  }
  async function press(key, modifiers = 0) {
    await rawKey(key, { windowsVirtualKeyCode: VK[key], code: key.length === 1 ? 'Key' + key.toUpperCase() : key, modifiers });
    await pause(60);
  }
  /* Real key presses, one per character, with the key that a Hebrew or English layout produces. */
  async function type(text, delay = 35) {
    for (const ch of text) {
      if (ch === '\n') await rawKey('Enter', { windowsVirtualKeyCode: 13, code: 'Enter', text: '\r' });
      else {
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
      }
      if (delay) await pause(delay);
    }
    await pause(400);
  }
  async function readDoc() {
    await page.evaluate(() => {
      const frame = document.querySelector('iframe.docs-texteventtarget-iframe');
      window.__hoppaTestCopy = null;
      if (!window.__hoppaTestHooked) {
        window.__hoppaTestHooked = true;
        frame.contentWindow.addEventListener('copy', (event) => { window.__hoppaTestCopy = event.clipboardData.getData('text/plain'); });
      }
    });
    await press('a', CTRL);
    await pause(150);
    await press('c', CTRL);
    await pause(250);
    await press('End', CTRL);
    await pause(150);
    const text = await page.evaluate(() => window.__hoppaTestCopy);
    return typeof text === 'string' ? text.replace(/\n$/, '') : null;
  }
  async function clearDoc() {
    await press('a', CTRL);
    await pause(150);
    await press('Delete');
    await pause(500);
  }
  async function openDoc() {
    await page.goto(DOC_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('iframe.docs-texteventtarget-iframe', { state: 'attached', timeout: 30000 });
    await pause(5000);
    await page.mouse.click(700, 320);
    await pause(400);
  }
  /* The switch "replacement in Google Docs" on the settings page, clicked like a user does. */
  async function setDocs(value) {
    const options = await context.newPage();
    await options.goto('chrome-extension://' + id + '/options.html#settings');
    await pause(500);
    const sw = options.locator('#docsSw');
    if ((await sw.isChecked()) !== value) await sw.click();
    await pause(600);
    equal(await sw.isChecked(), value, 'the switch');
    await options.close();
    await page.bringToFront();
    await page.mouse.click(700, 320);
    await pause(300);
  }
  /* Every check starts and ends with an empty document. */
  async function fresh(fn) {
    await clearDoc();
    try {
      await fn();
    } finally {
      await clearDoc();
    }
  }

  await openDoc();
  const editable = await page.evaluate(() => !/בקשה לגישת עריכה|Request edit access/.test(document.body.innerText));
  if (!editable) {
    process.stdout.write('The document is open for viewing only. Share it as "anyone with the link: editor" and run again.' + '\n');
    await context.close();
    process.exit(2);
  }

  process.stdout.write('\nGoogle Docs (live document)' + '\n');

  await check('regular shortcut after a space is replaced (Hebrew)', () => fresh(async () => {
    await type('\nשלום ' + T + 'בב');
    equal(await readDoc(), '\nשלום ' + packText('בב'));
  }));

  await check('regular shortcut at the start of a line, with an exclamation mark in the text', () => fresh(async () => {
    await type('\n' + T + 'תר');
    equal(await readDoc(), '\n' + packText('תר'));
  }));

  await check('signature with several lines: right order, every line', () => fresh(async () => {
    await type('\n' + T + 'חת');
    equal(await readDoc(), '\n' + packText('חת'));
  }));

  await check('typing goes on normally right after a replacement', () => fresh(async () => {
    await type('\n' + T + 'בב עוד מילה');
    equal(await readDoc(), '\n' + packText('בב') + ' עוד מילה');
  }));

  await check('smart: Hebrew date', () => fresh(async () => {
    const before = formatHebrewDate(new Date(), HEBREW_DATE_MARKS);
    await type('\n' + T + 'תע');
    const value = (await readDoc()).slice(1);
    truthy(value === before || value === formatHebrewDate(new Date(), HEBREW_DATE_MARKS), 'value was ' + value);
  }));

  await check('smart: Gregorian date and time', () => fresh(async () => {
    await type('\n' + T + 'תל ' + T + 'שעה');
    const value = (await readDoc()).slice(1);
    truthy(value.startsWith(formatGregorianDate(new Date()) + ' '), 'value was ' + value);
    truthy(/ \d{1,2}:\d{2}$/.test(value), 'time missing in ' + value);
  }));

  await check('smart: weekly portion', () => fresh(async () => {
    await type('\n' + T + 'פרשה');
    const value = (await readDoc()).slice(1);
    truthy(value.length > 2 && !value.includes(T), 'value was ' + value);
  }));

  await check('smart: number in words (waits for the space)', () => fresh(async () => {
    await type('\n' + T + '1500 ');
    equal(await readDoc(), '\n' + amountInWords(1500, 0, 'shekel') + ' ');
  }));

  await check('smart: number ended by Enter: the new line comes after the words', () => fresh(async () => {
    await type('\n' + T + '250\nהמשך');
    equal(await readDoc(), '\n' + amountInWords(250, 0, 'shekel') + '\nהמשך');
  }));

  await check('a typo fixed with Backspace inside the shortcut, then the right letter', async () => {
    await fresh(async () => {
      await type('\n' + T + 'בא');
      await press('Backspace');
      await type('ב');
      equal(await readDoc(), '\n' + packText('בב'));
    });
  });

  await check('Hebrew mixed with English around the shortcut', () => fresh(async () => {
    await type('\nHello ' + T + 'בב world');
    equal(await readDoc(), '\nHello ' + packText('בב') + ' world');
  }));

  await check('right-to-left paragraph: the replacement keeps the paragraph and its order', () => fresh(async () => {
    await type('\nשורה ראשונה ' + T + 'של סוף');
    equal(await readDoc(), '\nשורה ראשונה ' + packText('של') + ' סוף');
  }));

  await check('fast typing (no pause between keys)', () => fresh(async () => {
    await type('\n' + T + 'בב מהר מאוד', 0);
    equal(await readDoc(), '\n' + packText('בב') + ' מהר מאוד');
  }));

  await check('Backspace right after the replacement brings the shortcut back', () => fresh(async () => {
    await type('\nא ' + T + 'בב');
    await press('Backspace');
    await pause(500);
    equal(await readDoc(), '\nא ' + T + 'בב');
  }));

  await check('Backspace right after the signature brings the shortcut back (several lines)', () => fresh(async () => {
    await type('\n' + T + 'חת');
    await press('Backspace');
    await pause(500);
    equal(await readDoc(), '\n' + T + 'חת');
  }));

  await check('a second Backspace deletes normally (one character)', () => fresh(async () => {
    await type('\nא ' + T + 'בב');
    await press('Backspace');
    await pause(300);
    await press('Backspace');
    await pause(400);
    equal(await readDoc(), '\nא ' + T + 'ב');
  }));

  await check('Ctrl+Z: the first press removes the text, the second brings the shortcut back', () => fresh(async () => {
    await type('\nא ' + T + 'חת');
    await press('z', CTRL);
    await pause(500);
    const once = await readDoc();
    await press('z', CTRL);
    await pause(500);
    const twice = await readDoc();
    equal(once, '\nא ', 'after one Ctrl+Z');
    equal(twice, '\nא ' + T + 'חת', 'after two');
  }));

  await check('Ctrl+V right after a replacement: the pasted text comes after it, then the next key', () => fresh(async () => {
    await type('\nמקור');
    await press('Home');
    await press('End', SHIFT);
    await press('c', CTRL);
    await press('End');
    await pause(300);
    await type(' ' + T + 'בב', 0);
    await press('v', CTRL);
    await type('X', 0);
    await pause(800);
    equal(await readDoc(), '\nמקור ' + packText('בב') + 'מקורX');
  }));

  await check('Ctrl+A and Ctrl+C right after a replacement copy the document with the text in it', () => fresh(async () => {
    await type('\n' + T + 'בב', 0);
    await press('a', CTRL);
    await press('c', CTRL);
    await pause(800);
    await press('End', CTRL);
    await press('v', CTRL);
    await pause(800);
    const value = await readDoc();
    equal(value.split(packText('בב')).length - 1, 2, 'the text twice in ' + JSON.stringify(value));
  }));

  await check('a click in the middle of a word, then a shortcut: no replacement', () => fresh(async () => {
    await type('\nאבגדהוזחטיכלמנסעפצקרשת');
    // The line is the first line of the page, on the right side (a right-to-left paragraph).
    const box = await page.evaluate(() => {
      const canvas = document.querySelector('.kix-canvas-tile-content, canvas.kix-canvas-tile-content');
      const r = canvas ? canvas.getBoundingClientRect() : null;
      return r ? { x: r.x, y: r.y, width: r.width } : null;
    });
    truthy(box, 'page not found');
    await page.mouse.click(box.x + box.width - 160, box.y + 125);
    await pause(400);
    await type(T + 'בב');
    const value = await readDoc();
    truthy(value.includes(T + 'בב'), 'the shortcut was replaced: ' + value);
    truthy(!value.includes(packText('בב')), 'the shortcut was replaced: ' + value);
  }));

  await check('an arrow key, then a shortcut: no replacement', () => fresh(async () => {
    await type('\nאבג');
    await press('ArrowRight');
    await type(T + 'בב');
    const value = await readDoc();
    truthy(value.includes(T + 'בב') && !value.includes(packText('בב')), 'value was ' + value);
  }));

  await check('a slash at the start of a line does not open a menu in Docs', () => fresh(async () => {
    // Menus that are open and visible, without the toolbar's own drop-down buttons (font, style).
    const openMenus = () => page.evaluate(() => Array.from(document.querySelectorAll('[role="listbox"], [role="menu"]'))
      .filter((el) => !el.closest('.goog-toolbar, [role="toolbar"]') && el.offsetParent !== null && el.getBoundingClientRect().height > 20).length);
    const before = await openMenus();
    await type('\n' + T);
    equal(await openMenus(), before, 'menus open after the slash');
  }));

  await check('switch "replacement in Google Docs" off (settings page): no replacement', async () => {
    await setDocs(false);
    await fresh(async () => {
      await type('\n' + T + 'בב');
      equal(await readDoc(), '\n' + T + 'בב');
    });
  });

  await check('switch on again: replacement is back without reloading', async () => {
    await setDocs(true);
    await fresh(async () => {
      await type('\n' + T + 'בב');
      equal(await readDoc(), '\n' + packText('בב'));
    });
  });

  await check('a click on an empty line, then a shortcut with nothing before it: replaced at once', () => fresh(async () => {
    await type('\nשורה עם טקסט\n\n');
    await page.mouse.click(700, 700);
    await pause(400);
    await type(T + 'בב');
    const value = await readDoc();
    truthy(value.endsWith('\n' + packText('בב')), 'value was ' + JSON.stringify(value));
  }));

  await check('switching to another tab and back: still works', async () => {
    const other = await context.newPage();
    await other.goto('about:blank');
    await pause(500);
    await page.bringToFront();
    await page.mouse.click(700, 320);
    await pause(300);
    await fresh(async () => {
      await type('\n' + T + 'בב');
      equal(await readDoc(), '\n' + packText('בב'));
    });
    await other.close();
  });

  await check('right after opening: a click and a shortcut in the empty document, with no Enter first', async () => {
    await clearDoc();
    const started = Date.now();
    await page.goto(DOC_URL, { waitUntil: 'commit', timeout: 60000 });
    await page.waitForSelector('iframe.docs-texteventtarget-iframe', { state: 'attached', timeout: 30000 });
    let worked = null;
    for (let attempt = 0; attempt < 30 && worked === null; attempt++) {
      await page.mouse.click(700, 320);
      await pause(150);
      const at = Date.now() - started;
      await type(T + 'בב');
      const value = await readDoc();
      if (value === packText('בב')) worked = at;
      await clearDoc();
    }
    process.stdout.write('        first replacement after opening: typing started ' + worked + ' ms after the page was asked for\n');
    truthy(worked !== null && worked < 15000, 'it did not work within 15 seconds');
  });

  await check('after reloading the document', async () => {
    await openDoc();
    await fresh(async () => {
      await type('\n' + T + 'תמ');
      equal(await readDoc(), '\n' + packText('תמ'));
    });
  });

  await check('the document is left empty', async () => {
    await clearDoc();
    const value = await readDoc();
    truthy(value === '' || value === ' ', 'left: ' + JSON.stringify(value));
  });

  await check('no page errors from the extension', () => {
    equal(errors.filter((message) => /hoppa|chrome-extension/i.test(message)).length, 0, errors.join(' | '));
  });

  await context.close();
  await rm(work, { recursive: true, force: true });
  process.exit(report.summary() ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + '\n');
  process.exit(1);
});
