// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Browser tests: the built extension (dist/) inside a real Chromium, on local
 * test pages only. Run with: npm run build && npm run test:e2e
 *
 * Not covered here, because it needs a signed-in Google account: Gmail,
 * Google Chat and Google Docs.
 */
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, startServer, typeKeys, createReporter, equal, truthy, pause, freePort, attachToTarget } from './lib.mjs';
import { TRIGGER as T, HEBREW_DATE_MARKS } from '../../src/config.js';
import { formatHebrewDate } from '../../src/smart/hebrewDate.js';
import { formatGregorianDate } from '../../src/smart/gregDate.js';
import { formatParasha } from '../../src/smart/parasha.js';
import { amountInWords } from '../../src/smart/numberWords.js';
import { PACK } from '../../src/core/pack.js';
import { SOURCE_CODE_URL, PRIVACY_POLICY_URL } from '../../src/pages/links.js';

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const shots = process.env.HOPPA_E2E_SHOTS || '';
const packText = (abbr) => PACK.find((row) => row.abbr === abbr).text;
const GREETING = packText('בב');
const SIGNATURE = packText('חת');
const report = createReporter();
const { check } = report;

async function main() {
  const { chromium } = loadPlaywright();
  const work = await mkdtemp(path.join(process.env.HOPPA_TMP || os.tmpdir(), 'hoppa-e2e-'));
  const extension = path.join(work, 'ext');
  const downloads = path.join(work, 'downloads');
  await cp(path.join(root, 'dist'), extension, { recursive: true });
  await mkdir(downloads, { recursive: true });
  const server = await startServer(path.join(root, 'tests', 'manual'));

  const debugPort = await freePort();
  const context = await chromium.launchPersistentContext(path.join(work, 'profile'), {
    channel: process.env.HOPPA_E2E_CHANNEL || 'chromium',
    headless: true,
    acceptDownloads: true,
    viewport: { width: 1280, height: 800 },
    env: { ...process.env, LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' },
    args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension, '--remote-debugging-port=' + debugPort]
  });

  /* Every request the browser makes is recorded. Only the local test server and the extension's own files are expected. */
  const requests = [];
  context.on('request', (request) => requests.push(request.url()));
  const pageErrors = [];
  const watch = (page) => {
    page.on('pageerror', (error) => pageErrors.push(page.url() + ' :: ' + error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && page.url().startsWith('chrome-extension://')) pageErrors.push(page.url() + ' :: ' + message.text());
    });
  };
  context.on('page', watch);

  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
  const id = new URL(worker.url()).host;
  const ext = (file) => 'chrome-extension://' + id + '/' + file;

  const storage = async (page, fn, arg) => page.evaluate(fn, arg);

  async function openTestPage(file) {
    const page = await context.newPage();
    await page.goto(server.origin + '/' + file);
    await pause(250);
    return page;
  }
  async function typeIn(page, selector, text) {
    await page.click(selector);
    await typeKeys(page, text);
  }
  async function freshInput(page, selector, text) {
    await page.fill(selector, '');
    await typeIn(page, selector, text);
    return page.inputValue(selector);
  }
  async function freshEditor(page, selector, text) {
    await page.evaluate((sel) => { document.querySelector(sel).textContent = ''; }, selector);
    await typeIn(page, selector, text);
    return page.evaluate((sel) => document.querySelector(sel).innerText, selector);
  }
  const editorText = (page, selector) => page.evaluate((sel) => document.querySelector(sel).innerText.replace(/ /g, ' '), selector);

  try {
    /* ================= install ================= */
    process.stdout.write('\nInstall\n');
    let welcome = null;
    await check('first install opens the welcome page once', async () => {
      for (let i = 0; i < 40 && !welcome; i++) {
        welcome = context.pages().find((page) => page.url() === ext('welcome.html')) || null;
        if (!welcome) await pause(150);
      }
      truthy(welcome, 'the welcome page did not open');
      equal(context.pages().filter((page) => page.url() === ext('welcome.html')).length, 1, 'welcome pages');
    });
    await check('first install saves the ready-made pack (25) and the settings', async () => {
      const keys = await storage(welcome, async () => Object.keys(await chrome.storage.sync.get(null)));
      equal(keys.filter((key) => key.startsWith('hoppa:s:')).length, 25, 'pack size');
      truthy(keys.includes('hoppa:meta') && keys.includes('hoppa:settings'), 'meta and settings');
    });
    await check('pack shortcuts are stored without the trigger and marked as built in', async () => {
      const item = await storage(welcome, async () => (await chrome.storage.sync.get('hoppa:s:pack-06'))['hoppa:s:pack-06']);
      equal(item.abbr, 'בב');
      equal(item.builtin, true);
    });

    /* ================= welcome page ================= */
    process.stdout.write('\nWelcome page\n');
    await check('welcome: the practice field replaces the Hebrew date shortcut and shows the success message', async () => {
      await welcome.bringToFront();
      const before = formatHebrewDate(new Date(), HEBREW_DATE_MARKS);
      await typeIn(welcome, '#try', T + 'תע');
      const value = await welcome.inputValue('#try');
      truthy(value === before || value === formatHebrewDate(new Date(), HEBREW_DATE_MARKS), 'value was ' + value);
      equal(await welcome.textContent('#tryMsg'), 'יצא מצוין! זה התאריך העברי של היום.');
    });
    await check('welcome: Backspace right after brings the shortcut back', async () => {
      await welcome.keyboard.press('Backspace');
      equal(await welcome.inputValue('#try'), T + 'תע');
    });
    await check('welcome: a pack shortcut and the number work in the practice field', async () => {
      equal(await freshInput(welcome, '#try', T + 'בב'), GREETING);
      equal(await freshInput(welcome, '#try', T + '1500 '), amountInWords(1500, 0, 'shekel') + ' ');
    });
    await check('welcome: the success message is about the Hebrew date only, and goes away when another shortcut is tried', async () => {
      await freshInput(welcome, '#try', T + 'תע');
      equal(await welcome.textContent('#tryMsg'), 'יצא מצוין! זה התאריך העברי של היום.');
      const value = await freshInput(welcome, '#try', T + 'שעה');
      truthy(/^\d\d:\d\d$/.test(value), value);
      equal(await welcome.textContent('#tryMsg'), '');
    });
    await check('welcome: text from the content document (line 3) and no old wording', async () => {
      const body = await welcome.textContent('body');
      truthy(body.includes('אנחנו לא אוספים שום מידע, ואין לנו שרת.'), 'line 3');
      truthy(!body.includes('הכול נשאר במחשב שלכם'), 'old wording');
    });
    if (shots) await welcome.screenshot({ path: path.join(shots, 'welcome-dark.png') });

    /* ================= plain fields ================= */
    process.stdout.write('\nPlain fields\n');
    const page = await openTestPage('fields.html');
    await check('input: a shortcut is replaced at once', async () => {
      equal(await freshInput(page, '#in1', T + 'בב'), GREETING);
    });
    await check('input: the caret stays at the end of the inserted text', async () => {
      await typeKeys(page, ' x');
      equal(await page.inputValue('#in1'), GREETING + ' x');
    });
    await check('search field: replaced', async () => {
      equal(await freshInput(page, '#in2', T + 'תמ'), packText('תמ'));
    });
    await check('textarea: replaced after other text and a space', async () => {
      equal(await freshInput(page, '#ta1', 'שלום ' + T + 'בב'), 'שלום ' + GREETING);
    });
    await check('textarea: the signature keeps its three lines', async () => {
      equal(await freshInput(page, '#ta1', T + 'חת'), SIGNATURE);
    });
    await check('input: the signature goes in as one line', async () => {
      equal(await freshInput(page, '#in1', T + 'חת'), SIGNATURE.replace(/\n/g, ' '));
    });
    await check('textarea: a shortcut at the start of a new line is replaced', async () => {
      equal(await freshInput(page, '#ta1', 'שורה\n' + T + 'בב'), 'שורה\n' + GREETING);
    });
    await check('after an opening bracket the shortcut is replaced', async () => {
      equal(await freshInput(page, '#in1', '(' + T + 'בב'), '(' + GREETING);
    });

    /* ================= no replacement ================= */
    process.stdout.write('\nA slash that is not a shortcut\n');
    const untouched = [
      ['a date', '11' + T + '11 '],
      ['a fraction', '1' + T + '2 '],
      ['a letter before the trigger', 'ו' + T + 'או '],
      ['an apostrophe before the trigger', "א'" + T + 'בב '],
      ['a web address', 'https:' + T + T + 'x.co' + T + 'תע '],
      ['a word that is not a shortcut', T + 'home '],
      ['a Hebrew word that is not a shortcut', T + 'דרך '],
      ['a shortcut glued to a word', 'x' + T + 'בב '],
      ['a colon before the trigger', 'a:' + T + 'בב '],
      ['a quote before the trigger', '"' + T + 'בב '],
      ['part of a shortcut', T + 'ב ']
    ];
    for (const [name, text] of untouched) {
      await check('not replaced: ' + name, async () => {
        equal(await freshInput(page, '#ta1', text), text);
      });
    }

    /* ================= smart shortcuts ================= */
    process.stdout.write('\nSmart shortcuts\n');
    await check('Hebrew date in letters', async () => {
      const before = formatHebrewDate(new Date(), HEBREW_DATE_MARKS);
      const value = await freshInput(page, '#in1', T + 'תע');
      truthy(value === before || value === formatHebrewDate(new Date(), HEBREW_DATE_MARKS), 'value was ' + value);
      truthy(/^[א-ת]{1,2}["']?[א-ת]?'? ב[א-ת' ]+ [א-ת]+"[א-ת]$/.test(value), 'shape of ' + value);
    });
    await check('Hebrew date: the marks are the plain keyboard characters (U+0027, U+0022), not the Hebrew ones', async () => {
      const value = await freshInput(page, '#in1', T + 'תע');
      const codes = Array.from(value).map((ch) => ch.codePointAt(0));
      truthy(codes.includes(0x22), 'the year holds U+0022: ' + value);
      truthy(!codes.includes(0x05F3) && !codes.includes(0x05F4), 'no Hebrew marks: ' + value);
      const editorValue = (await freshEditor(page, '#ce1', T + 'תע')).trim();
      equal(editorValue, value, 'the same characters in a rich editor');
    });
    await check('Gregorian date, day first', async () => {
      const value = await freshInput(page, '#in1', T + 'תל');
      equal(value, formatGregorianDate(new Date()));
    });
    await check('time, 24 hours', async () => {
      const value = await freshInput(page, '#in1', T + 'שעה');
      truthy(/^([01]\d|2[0-3]):[0-5]\d$/.test(value), 'value was ' + value);
    });
    await check('weekly portion, Land of Israel calendar by default', async () => {
      equal(await freshInput(page, '#in1', T + 'פרשה'), formatParasha(new Date(), 'il'));
    });
    await check('number: waits for a space and keeps it', async () => {
      equal(await freshInput(page, '#in1', T + '1500'), T + '1500');
      await typeKeys(page, ' ');
      equal(await page.inputValue('#in1'), amountInWords(1500, 0, 'shekel') + ' ');
    });
    await check('number with agorot', async () => {
      equal(await freshInput(page, '#in1', T + '12.50 '), amountInWords(12, 50, 'shekel') + ' ');
    });
    await check('number followed by a full stop and a space', async () => {
      equal(await freshInput(page, '#in1', T + '1500. '), amountInWords(1500, 0, 'shekel') + '. ');
    });
    await check('number followed by a comma waits for the next character, and a doubled comma is not a number', async () => {
      equal(await freshInput(page, '#in1', T + '2000,'), T + '2000,');
      await typeKeys(page, ' ');
      equal(await page.inputValue('#in1'), amountInWords(2000, 0, 'shekel') + ', ');
      equal(await freshInput(page, '#in1', T + '1,,000 '), T + '1,,000 ');
      equal(await freshInput(page, '#in1', T + '1234,567 '), T + '1234,567 ');
    });
    await check('number with thousands separators', async () => {
      equal(await freshInput(page, '#in1', T + '1,000,000 '), amountInWords(1000000, 0, 'shekel') + ' ');
      equal(await freshInput(page, '#in1', T + '1,500 '), amountInWords(1500, 0, 'shekel') + ' ');
      equal(await freshInput(page, '#in1', T + '12,345.50 '), amountInWords(12345, 50, 'shekel') + ' ');
      equal(await freshInput(page, '#in1', T + '1, '), amountInWords(1, 0, 'shekel') + ', ', 'a comma followed by a space is punctuation');
      equal(await freshInput(page, '#in1', T + '1,5 '), T + '1,5 ', 'a broken group is not replaced');
    });
    await check('number: one digit of agorot, leading zeros, three digits after the point', async () => {
      equal(await freshInput(page, '#in1', T + '12.5 '), amountInWords(12, 50, 'shekel') + ' ');
      equal(await freshInput(page, '#in1', T + '12.05 '), amountInWords(12, 5, 'shekel') + ' ');
      equal(await freshInput(page, '#in1', T + '007 '), amountInWords(7, 0, 'shekel') + ' ');
      equal(await freshInput(page, '#in1', T + '12.505 '), T + '12.505 ');
    });
    await check('number ended by Enter in a textarea', async () => {
      equal(await freshInput(page, '#ta1', T + '3\n'), amountInWords(3, 0, 'shekel') + '\n');
    });
    await check('a date with a slash is not a number', async () => {
      equal(await freshInput(page, '#in1', '11' + T + '2026 '), '11' + T + '2026 ');
    });
    await check('a number of ten digits is not replaced', async () => {
      equal(await freshInput(page, '#in1', T + '1234567890 '), T + '1234567890 ');
    });

    /* ================= undo ================= */
    process.stdout.write('\nUndo\n');
    await check('input: Backspace right after brings the shortcut back', async () => {
      await freshInput(page, '#in1', 'א ' + T + 'בב');
      await page.keyboard.press('Backspace');
      equal(await page.inputValue('#in1'), 'א ' + T + 'בב');
    });
    await check('input: the restored shortcut is not replaced again by the next key', async () => {
      await typeKeys(page, ' ');
      equal(await page.inputValue('#in1'), 'א ' + T + 'בב ');
    });
    await check('input: a second Backspace deletes normally', async () => {
      await freshInput(page, '#in1', T + 'בב');
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Backspace');
      equal(await page.inputValue('#in1'), T + 'ב');
    });
    await check('input: Backspace after another key deletes one character only', async () => {
      await freshInput(page, '#in1', T + 'בב');
      await typeKeys(page, 'x');
      await page.keyboard.press('Backspace');
      equal(await page.inputValue('#in1'), GREETING);
    });
    await check('textarea: Backspace restores a number together with its space', async () => {
      await freshInput(page, '#ta1', T + '1500 ');
      await page.keyboard.press('Backspace');
      equal(await page.inputValue('#ta1'), T + '1500 ');
    });
    await check('textarea: Ctrl+Z undoes the replacement in one step', async () => {
      await freshInput(page, '#ta1', 'א ' + T + 'בב');
      await page.keyboard.press('Control+z');
      equal(await page.inputValue('#ta1'), 'א ' + T + 'בב');
    });
    await check('input: Ctrl+Z undoes the replacement in one step', async () => {
      await freshInput(page, '#in1', T + 'חת');
      await page.keyboard.press('Control+z');
      equal(await page.inputValue('#in1'), T + 'חת');
    });

    /* ================= caret moves and other input ================= */
    process.stdout.write('\nOnly real, continuous typing\n');
    await check('arrow keys in the middle of a shortcut: no replacement', async () => {
      await page.fill('#in1', '');
      await typeIn(page, '#in1', T + 'ב');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowRight');
      await typeKeys(page, 'ב');
      equal(await page.inputValue('#in1'), T + 'בב');
    });
    await check('a click in the middle of a shortcut: no replacement', async () => {
      await page.fill('#in1', '');
      await typeIn(page, '#in1', T + 'ב');
      await page.click('#in1');
      await typeKeys(page, 'ב');
      truthy((await page.inputValue('#in1')).includes(T), 'the trigger is still there');
      truthy(!(await page.inputValue('#in1')).includes(GREETING), 'not replaced');
    });
    await check('text that was already in the field and one typed letter: no replacement', async () => {
      await page.fill('#in1', T + 'ב');
      await page.click('#in1');
      await page.keyboard.press('End');
      await typeKeys(page, 'ב');
      equal(await page.inputValue('#in1'), T + 'בב');
    });
    await check('a typing mistake fixed with Backspace still works', async () => {
      await page.fill('#in1', '');
      await typeIn(page, '#in1', T + 'בג');
      await page.keyboard.press('Backspace');
      await typeKeys(page, 'ב');
      equal(await page.inputValue('#in1'), GREETING);
    });
    await check('pasted text is not replaced', async () => {
      await page.fill('#in1', '');
      await page.click('#in1');
      await page.keyboard.insertText(T + 'בב');
      equal(await page.inputValue('#in1'), T + 'בב');
    });
    await check('moving to another field in the middle of a shortcut: no replacement', async () => {
      await page.fill('#in1', '');
      await page.fill('#in2', '');
      await typeIn(page, '#in1', T + 'ב');
      await typeIn(page, '#in2', 'ב');
      equal(await page.inputValue('#in2'), 'ב');
    });

    /* ================= rich editors ================= */
    process.stdout.write('\nRich editors\n');
    await check('editable area: replaced', async () => {
      equal((await freshEditor(page, '#ce1', T + 'בב')).trim(), GREETING);
    });
    await check('editable area: Backspace right after brings the shortcut back', async () => {
      await page.keyboard.press('Backspace');
      equal((await editorText(page, '#ce1')).trim(), T + 'בב');
    });
    await check('editable area: the signature becomes three lines', async () => {
      const text = await freshEditor(page, '#ce1', T + 'חת');
      equal(text.replace(/\n+/g, '\n').trim(), SIGNATURE);
    });
    await check('editable area: Backspace after the signature brings the shortcut back', async () => {
      await page.keyboard.press('Backspace');
      equal((await editorText(page, '#ce1')).replace(/\n/g, '').trim(), T + 'חת');
    });
    await check('editable area: Ctrl+Z undoes the replacement in one step', async () => {
      await freshEditor(page, '#ce1', 'א ' + T + 'בב');
      await page.keyboard.press('Control+z');
      equal((await editorText(page, '#ce1')).trim(), 'א ' + T + 'בב');
    });
    await check('editable area: a shortcut after a space in the middle of a line', async () => {
      equal((await freshEditor(page, '#ce1', 'שלום ' + T + 'בב')).replace(/ /g, ' ').trim(), 'שלום ' + GREETING);
    });
    await check('editable area: a number waits for the space and keeps it', async () => {
      const text = (await freshEditor(page, '#ce1', T + '1500 x')).replace(/ /g, ' ');
      equal(text.trim(), amountInWords(1500, 0, 'shekel') + ' x');
    });
    await check('editable area: a letter before the trigger blocks the replacement', async () => {
      equal((await freshEditor(page, '#ce1', 'ו' + T + 'בב')).trim(), 'ו' + T + 'בב');
    });
    await check('editable area: a shortcut at the start of a second line is replaced', async () => {
      await page.evaluate(() => { document.querySelector('#ce1').textContent = ''; });
      await typeIn(page, '#ce1', 'שורה');
      await page.keyboard.press('Enter');
      await typeKeys(page, T + 'בב');
      equal((await editorText(page, '#ce1')).replace(/\n+/g, '\n').trim(), 'שורה\n' + GREETING);
    });
    await check('editor with existing lines (as in a mail window): replaced on the second line', async () => {
      await page.click('#ce2');
      await page.keyboard.press('Control+End');
      await typeKeys(page, T + 'בב');
      equal((await editorText(page, '#ce2')).replace(/\n+/g, '\n').trim(), 'שלום,\n' + GREETING);
    });
    await check('text-only editor: replaced', async () => {
      equal((await freshEditor(page, '#ce3', T + 'תר')).trim(), packText('תר'));
    });
    await check('editor: bold text right before the trigger blocks the replacement', async () => {
      await page.click('#ce4');
      await page.keyboard.press('Control+End');
      await typeKeys(page, T + 'בב');
      equal((await editorText(page, '#ce4')).trim(), 'מודגש' + T + 'בב');
    });
    await check('editor: after bold text and a space the shortcut is replaced', async () => {
      await typeKeys(page, ' ' + T + 'בב');
      equal((await editorText(page, '#ce4')).trim(), 'מודגש' + T + 'בב ' + GREETING);
    });

    /* ================= frames and shadow DOM ================= */
    process.stdout.write('\nFrames and shadow DOM\n');
    const frame = page.frameLocator('#fr1');
    await check('textarea inside an inner frame', async () => {
      await frame.locator('#fta').click();
      await typeKeys(page, T + 'בב');
      equal(await frame.locator('#fta').inputValue(), GREETING);
    });
    await check('editable area inside an inner frame', async () => {
      await frame.locator('#fce').click();
      await typeKeys(page, T + 'בב');
      equal((await frame.locator('#fce').innerText()).trim(), GREETING);
    });
    await check('editable area inside an empty frame that the page created (srcdoc)', async () => {
      const inner = page.frameLocator('#fr2');
      await inner.locator('#ce').click();
      await typeKeys(page, T + 'בב');
      equal((await inner.locator('#ce').innerText()).trim(), GREETING);
    });
    await check('editable area inside an empty frame that the page built by script (about:blank)', async () => {
      const inner = page.frameLocator('#fr3');
      await inner.locator('#ce').click();
      await typeKeys(page, T + 'בב');
      equal((await inner.locator('#ce').innerText()).trim(), GREETING);
    });
    await check('field inside a shadow root', async () => {
      await page.locator('#shadowHost input').click();
      await typeKeys(page, T + 'בב');
      equal(await page.locator('#shadowHost input').inputValue(), GREETING);
    });
    await check('form: a number is replaced when Enter sends the form', async () => {
      await page.fill('#in3', '');
      await typeIn(page, '#in3', T + '7');
      await page.keyboard.press('Enter');
      equal(await page.textContent('#sent'), amountInWords(7, 0, 'shekel'));
    });

    /* ================= sensitive fields ================= */
    process.stdout.write('\nSensitive fields\n');
    const sensitive = await openTestPage('sensitive.html');
    const typed = T + 'בב';
    const sensitiveInputs = ['s-password', 's-cc', 's-ccname', 's-otp', 's-newpass', 's-name-otp', 's-name-pin', 'cardnumber', 's-cvv', 's-ph', 's-aria', 's-credit', 's-masked', 's-tel', 's-url',
      's-card-number', 's-creditcard', 's-ccnum', 's-card-en', 's-card-he', 's-back', 's-seccode', 's-expiry', 's-vercode', 's-onetime-he', 's-code',
      's-iban', 's-acct', 's-ssn', 's-tz', 's-bank-he', 's-ccnumber'];
    for (const name of sensitiveInputs) {
      await check('no replacement in the sensitive field #' + name, async () => {
        await typeIn(sensitive, '#' + name, typed);
        equal(await sensitive.inputValue('#' + name), typed);
      });
    }
    await check('no replacement in an email field', async () => {
      await typeIn(sensitive, '#s-email', typed);
      equal(await sensitive.inputValue('#s-email'), typed);
    });
    await check('no replacement in a short numeric code field', async () => {
      await typeIn(sensitive, '#s-numeric', typed);
      equal(await sensitive.inputValue('#s-numeric'), typed);
    });
    await check('no replacement in a read-only field', async () => {
      await sensitive.click('#s-readonly');
      await typeKeys(sensitive, typed);
      equal(await sensitive.inputValue('#s-readonly'), '');
    });
    await check('no replacement in a password field after "show password"', async () => {
      await typeIn(sensitive, '#s-show', 'x');
      await sensitive.click('#s-show-btn');
      equal(await sensitive.getAttribute('#s-show', 'type'), 'text');
      await sensitive.fill('#s-show', '');
      await typeIn(sensitive, '#s-show', typed);
      equal(await sensitive.inputValue('#s-show'), typed);
    });
    await check('no replacement in a password field that was shown before it was ever focused', async () => {
      await sensitive.click('#s-show2-btn');
      equal(await sensitive.getAttribute('#s-show2', 'type'), 'text');
      await typeIn(sensitive, '#s-show2', typed);
      equal(await sensitive.inputValue('#s-show2'), typed);
    });
    await check('no replacement in a new field that a site swapped in for the password field', async () => {
      await typeIn(sensitive, '#s-swap', 'x');
      await sensitive.click('#s-swap-btn');
      equal(await sensitive.getAttribute('#s-swap', 'type'), 'text');
      await sensitive.fill('#s-swap', '');
      await typeIn(sensitive, '#s-swap', T + '2026!');
      equal(await sensitive.inputValue('#s-swap'), T + '2026!');
    });
    await check('no replacement in a hidden text field that a site shows instead of the password field', async () => {
      await typeIn(sensitive, '#s-twin-pw', 'x');
      await sensitive.click('#s-twin-btn');
      truthy(await sensitive.isVisible('#s-twin-text'), 'the text field is shown');
      await sensitive.fill('#s-twin-text', '');
      await typeIn(sensitive, '#s-twin-text', typed);
      equal(await sensitive.inputValue('#s-twin-text'), typed);
    });
    await check('no replacement in a box for one digit of a code', async () => {
      await typeIn(sensitive, '#s-digit', typed);
      equal(await sensitive.inputValue('#s-digit'), T);
    });
    await check('no replacement in a rich editor that is marked as a password', async () => {
      await typeIn(sensitive, '#s-ce-pass', typed);
      equal((await sensitive.evaluate(() => document.getElementById('s-ce-pass').textContent)).trim(), typed);
    });
    await check('the normal field on the same page is replaced', async () => {
      await typeIn(sensitive, '#s-normal', typed);
      equal(await sensitive.inputValue('#s-normal'), GREETING);
    });
    await sensitive.close();

    /* ================= hostile page ================= */
    process.stdout.write('\nHostile page\n');
    const attacker = await openTestPage('attacker.html?ext=' + id);
    await attacker.click('#run');
    await attacker.waitForSelector('body[data-done="1"]', { timeout: 10000 });
    await typeIn(attacker, '#sub', 'abc');
    await attacker.click('#checkSub');
    await pause(200);
    const attack = JSON.parse(await attacker.textContent('#results'));
    const attackNames = {
      plant: 'planted shortcut with fake events is not replaced',
      command: 'characters inserted by the page with an editing command are not replaced',
      commandWhole: 'a whole shortcut inserted by the page is not replaced',
      editor: 'the same in a hidden rich editor is not replaced',
      substitute: 'key substitution (real keys swapped for shortcut characters) is not replaced',
      globals: 'the page finds no new global variables',
      dom: 'the page finds no changes it did not make',
      markup: 'the page finds no extension address in its markup',
      message: 'a message from the page to the extension fails',
      postMessage: 'a window message from the page gets no answer',
      resources: 'the page cannot load a file of the extension'
    };
    for (const key of Object.keys(attackNames)) {
      await check('hostile page: ' + attackNames[key], async () => {
        truthy(attack[key], 'no result for ' + key);
        truthy(attack[key].passed, attack[key].detail);
      });
    }
    await check('hostile page: made-up click events do not turn a letter before the trigger into a start of a word', async () => {
      await typeIn(attacker, '#wordStart', 'א' + T + 'תע');
      equal(await attacker.inputValue('#wordStart'), ' ' + T + 'תע');
    });
    await check('hostile page: a letter swapped for a space by the page\'s editing command is not a start of a word', async () => {
      await typeIn(attacker, '#wordStart2', 'א' + T + 'תע');
      equal(await attacker.inputValue('#wordStart2'), ' ' + T + 'תע');
    });
    await check('hostile page: a swallowed key plus the page\'s delete command is not a start of a word', async () => {
      await attacker.click('#wordStart3');
      await attacker.keyboard.press('End');
      await typeKeys(attacker, 'אב' + T + 'תע');
      equal(await attacker.inputValue('#wordStart3'), 'x ' + T + 'תע');
    });
    await check('after Enter, Delete, Ctrl+Backspace or undo a shortcut at the new place is still replaced', async () => {
      await page.bringToFront();
      await page.fill('#ta1', '');
      await typeIn(page, '#ta1', 'שורה');
      await page.keyboard.press('Enter');
      await typeKeys(page, T + 'בב');
      equal(await page.inputValue('#ta1'), 'שורה\n' + GREETING, 'after Enter');
      await page.fill('#in1', '');
      await typeIn(page, '#in1', 'א מילה');
      await page.keyboard.press('Control+Backspace');
      await typeKeys(page, T + 'בב');
      equal(await page.inputValue('#in1'), 'א ' + GREETING, 'after Ctrl+Backspace');
      await attacker.bringToFront();
    });
    await check('hostile page: real typing in a visible field still works there', async () => {
      await attacker.fill('#sub', '');
      await typeIn(attacker, '#sub', T + 'בב');
      equal(await attacker.inputValue('#sub'), GREETING);
    });
    await attacker.close();

    /* ================= management page ================= */
    process.stdout.write('\nManagement page\n');
    const options = await context.newPage();
    await options.goto(ext('options.html'));
    await options.waitForSelector('#tbody tr');
    const rowCount = () => options.locator('#tbody tr').count();
    const toastText = () => options.textContent('#toast');
    const errorToast = () => options.textContent('#toastErr');
    const saveForm = async (abbr, text, label) => {
      await options.fill('#fAbbr', abbr);
      await options.fill('#fText', text);
      if (label !== undefined) await options.fill('#fDesc', label);
      await options.click('#edForm button[type="submit"]');
      await pause(250);
    };

    await check('management: the table shows the 25 pack shortcuts with the trigger', async () => {
      equal(await rowCount(), 25);
      equal(await options.textContent('#countMine'), '25');
      equal(await options.locator('#tbody tr').first().locator('.chip').textContent(), T + 'של');
    });
    await check('management: three tabs, and the address follows the tab', async () => {
      await options.click('#tab-smart');
      truthy(await options.isVisible('#panel-smart'), 'smart panel');
      equal(new URL(options.url()).hash, '#smart');
      equal(await options.locator('#smartList .smart-item').count(), 5);
      await options.click('#tab-settings');
      truthy(await options.isVisible('#panel-settings'), 'settings panel');
      await options.click('#tab-mine');
    });
    await check('management: the Hebrew apostrophe setting is not in the page (dropped from version 1)', async () => {
      equal(await options.locator('input[name="geresh"]').count(), 0);
    });
    if (shots) await options.screenshot({ path: path.join(shots, 'options-mine-dark.png') });

    const errorCases = [
      ['empty shortcut', T, 'טקסט', 'צריך לכתוב קיצור'],
      ['no trigger', 'בלי', 'טקסט', 'קיצור מתחיל ב-' + T + ' (המקש שמימין ל-Tab)'],
      ['double trigger', T + T + 'א', 'טקסט', 'קיצור מתחיל ב-' + T + ' (המקש שמימין ל-Tab)'],
      ['a space', T + 'א ב', 'טקסט', 'בקיצור אין רווחים'],
      ['digits only', T + '123', 'טקסט', 'קיצור שיש בו רק ספרות שמור לסכום במילים'],
      ['a smart shortcut', T + 'תע', 'טקסט', 'הקיצור הזה שמור לקיצור חכם'],
      ['an existing shortcut', T + 'בב', 'טקסט', 'הקיצור הזה כבר קיים. אפשר לבחור קיצור אחר'],
      ['too long', T + 'א'.repeat(40), 'טקסט', 'הקיצור ארוך מדי. אפשר עד 32 תווים.']
    ];
    for (const [name, abbr, text, message] of errorCases) {
      await check('management: error for ' + name, async () => {
        await options.click('#btnNew');
        await saveForm(abbr, text);
        equal((await options.textContent('#eAbbr')).trim(), message);
        equal(await rowCount(), 25, 'nothing was saved');
      });
    }
    await check('management: error for an empty text', async () => {
      await options.click('#btnNew');
      await saveForm(T + 'חדש', '');
      equal((await options.textContent('#eText')).trim(), 'צריך לכתוב את הטקסט המלא');
    });
    await check('management: error for a text that is too long (10,001 characters)', async () => {
      await options.click('#btnNew');
      await saveForm(T + 'ארוך', 'א'.repeat(10001));
      equal((await options.textContent('#eText')).trim(), 'הטקסט ארוך מדי. אפשר עד 10,000 תווים.');
      equal(await rowCount(), 25);
    });
    await check('management: error for a description that is too long', async () => {
      await options.click('#btnNew');
      await saveForm(T + 'תיאור', 'טקסט', 'ת'.repeat(101));
      equal((await options.textContent('#eDesc')).trim(), 'התיאור ארוך מדי. אפשר עד 100 תווים.');
      equal(await rowCount(), 25);
    });

    await check('management: a new shortcut is saved and shown first', async () => {
      await options.click('#btnNew');
      await saveForm(T + 'נס', 'ניסיון ראשון', 'בדיקה');
      equal((await toastText()).trim(), 'נשמר ✓');
      equal(await rowCount(), 26);
      equal(await options.locator('#tbody tr').first().locator('.chip').textContent(), T + 'נס');
    });
    await check('a new shortcut works on an open page without a reload', async () => {
      await page.bringToFront();
      equal(await freshInput(page, '#in1', T + 'נס'), 'ניסיון ראשון');
    });
    await check('management: editing the text of a shortcut', async () => {
      await options.bringToFront();
      await options.locator('#tbody tr').first().click();
      await saveForm(T + 'נס', 'ניסיון שני', 'בדיקה');
      await page.bringToFront();
      equal(await freshInput(page, '#in1', T + 'נס'), 'ניסיון שני');
    });
    await check('management: turning a shortcut off stops its replacement', async () => {
      await options.bringToFront();
      const row = options.locator('#tbody tr', { has: options.locator('.chip', { hasText: new RegExp('^' + T.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + 'נס$') }) });
      await row.locator('input.sw').click();
      await pause(250);
      await page.bringToFront();
      equal(await freshInput(page, '#in1', T + 'נס'), T + 'נס');
      await options.bringToFront();
      await row.locator('input.sw').click();
      await pause(250);
      await page.bringToFront();
      equal(await freshInput(page, '#in1', T + 'נס'), 'ניסיון שני', 'on again');
    });
    await check('management: a shortcut that is the beginning of another one waits for a terminator', async () => {
      await options.bringToFront();
      await options.click('#btnNew');
      await saveForm(T + 'נ', 'קצר');
      await page.bringToFront();
      equal(await freshInput(page, '#in1', T + 'נ'), T + 'נ', 'no immediate replacement');
      await typeKeys(page, ' ');
      equal(await page.inputValue('#in1'), 'קצר ', 'replaced after a space, and the space stays');
      equal(await freshInput(page, '#in1', T + 'נס'), 'ניסיון שני', 'the longer shortcut still works');
      equal(await freshInput(page, '#in1', T + 'נ.'), 'קצר.', 'replaced after a full stop');
      equal(await freshInput(page, '#ta1', T + 'נ\n'), 'קצר\n', 'replaced on Enter');
    });
    await check('management: delete asks first, and "no" keeps the shortcut', async () => {
      await options.bringToFront();
      const before = await rowCount();
      await options.locator('#tbody tr').first().hover();
      await options.locator('#tbody tr').first().locator('button[data-act="del"]').click();
      truthy(await options.locator('#dlgDel').evaluate((dialog) => dialog.open), 'the dialog is open');
      await options.click('#dlgDel button[value="no"]');
      await pause(200);
      equal(await rowCount(), before);
    });
    await check('management: delete with "yes" removes the shortcut', async () => {
      const before = await rowCount();
      const first = await options.locator('#tbody tr').first().locator('.chip').textContent();
      await options.locator('#tbody tr').first().hover();
      await options.locator('#tbody tr').first().locator('button[data-act="del"]').click();
      equal(await options.textContent('#dDelAbbr'), first);
      await options.click('#dlgDel button[value="yes"]');
      await pause(300);
      equal(await rowCount(), before - 1);
    });
    await check('management: search filters the table and shows "not found"', async () => {
      await options.fill('#q', 'יישר');
      equal(await rowCount(), 1);
      await options.fill('#q', 'אין-דבר-כזה');
      truthy(await options.isVisible('#noResults'), 'not found message');
      await options.fill('#q', '');
    });

    /* ----- text is always text ----- */
    process.stdout.write('\nText is always text\n');
    const payloads = ['<script>window.__pwned = 1</script>', '<img src=x onerror="window.__pwned = 2">', '"><svg onload="window.__pwned = 3">'];
    await check('markup in the text, the description and the shortcut is shown as text', async () => {
      await options.click('#btnNew');
      await saveForm(T + 'ס1', payloads[0], payloads[1]);
      await options.click('#btnNew');
      await saveForm(T + '<b>x', payloads[2], '<b>bold</b>');
      const first = options.locator('#tbody tr').nth(1);
      equal(await first.locator('.td-text').textContent(), payloads[0]);
      equal(await first.locator('.td-desc').textContent(), payloads[1]);
      equal(await options.locator('#tbody tr').first().locator('.chip').textContent(), T + '<b>x');
      equal(await options.locator('#tbody script, #tbody img, #tbody svg, #tbody b').count(), 0, 'no element was created from user text');
      equal(await options.evaluate(() => window.__pwned), undefined);
    });
    await check('markup in a shortcut is inserted into a page as text', async () => {
      await page.bringToFront();
      equal(await freshInput(page, '#ta1', T + 'ס1'), payloads[0]);
      const text = await freshEditor(page, '#ce1', T + '<b>x');
      equal(text.trim(), payloads[2]);
      equal(await page.locator('#ce1 svg, #ce1 script, #ce1 img').count(), 0, 'no element was created in the editor');
      equal(await page.evaluate(() => window.__pwned), undefined);
    });

    /* ----- smart tab and settings ----- */
    process.stdout.write('\nSmart shortcuts and settings\n');
    await check('smart tab: live values and the number example', async () => {
      await options.bringToFront();
      await options.click('#tab-smart');
      const items = options.locator('#smartList .smart-item');
      equal(await items.nth(0).locator('.chip').first().textContent(), T + 'תע');
      truthy((await items.nth(0).textContent()).includes(formatHebrewDate(new Date(), HEBREW_DATE_MARKS)), 'Hebrew date');
      truthy((await items.nth(0).textContent()).includes('התאריך העברי מתחלף בחצות, לא בשקיעה.'), 'the midnight note');
      truthy((await items.nth(3).textContent()).includes(formatParasha(new Date(), 'il')), 'portion');
      truthy((await items.nth(4).textContent()).includes(amountInWords(1500, 0, 'shekel')), 'number example');
    });
    if (shots) await options.screenshot({ path: path.join(shots, 'options-smart-dark.png') });
    await check('smart tab: turning a smart shortcut off stops it', async () => {
      await options.locator('#smartList input[data-id="time"]').click();
      await pause(250);
      await page.bringToFront();
      equal(await freshInput(page, '#in1', T + 'שעה'), T + 'שעה');
      await options.bringToFront();
      await options.locator('#smartList input[data-id="time"]').click();
      await pause(250);
    });
    await check('smart tab: turning the number off stops the number pattern', async () => {
      await options.locator('#smartList input[data-id="number"]').click();
      await pause(250);
      await page.bringToFront();
      equal(await freshInput(page, '#in1', T + '1500 '), T + '1500 ');
      await options.bringToFront();
      await options.locator('#smartList input[data-id="number"]').click();
      await pause(250);
    });
    await check('settings: the suffix of a sum changes the inserted text', async () => {
      await options.click('#tab-settings');
      await options.locator('input[name="suffix"][value="shah"]').check({ force: true });
      await pause(250);
      equal(await options.textContent('#pvNumber'), amountInWords(1500, 0, 'shah'));
      await page.bringToFront();
      equal(await freshInput(page, '#in1', T + '1500 '), amountInWords(1500, 0, 'shah') + ' ');
      await options.bringToFront();
      await options.locator('input[name="suffix"][value="none"]').check({ force: true });
      await pause(250);
      await page.bringToFront();
      equal(await freshInput(page, '#in1', T + '1500 '), amountInWords(1500, 0, 'none') + ' ');
      equal(await freshInput(page, '#in1', T + '12.50 '), 'שנים עשר שקלים חדשים וחמישים אגורות ', 'with agorot the full wording is used');
      await options.bringToFront();
      await options.locator('input[name="suffix"][value="shekel"]').check({ force: true });
      await pause(250);
    });
    await check('settings: the portion calendar is saved and used', async () => {
      await options.locator('input[name="calendar"][value="diaspora"]').check({ force: true });
      await pause(250);
      equal(await options.textContent('#pvParasha'), formatParasha(new Date(), 'diaspora'));
      const saved = await storage(options, async () => (await chrome.storage.sync.get('hoppa:settings'))['hoppa:settings'].calendar);
      equal(saved, 'diaspora');
      await options.locator('input[name="calendar"][value="il"]').check({ force: true });
      await pause(250);
    });
    await check('settings: sync wording from the content document, never "sync is active"', async () => {
      equal((await options.textContent('#syncBox')).trim(), 'הקיצורים נשמרים בכרום שלכם. אם הסנכרון של כרום פועל אצלכם, הם נשמרים גם בחשבון הגוגל שלכם ועוברים דרכו בין המחשבים שלכם.');
      equal((await options.textContent('#syncSide')).trim(), 'הקיצורים נשמרים בכרום, ומסתנכרנים אם הסנכרון של כרום פועל.');
      truthy(!(await options.textContent('body')).includes('הסנכרון פעיל'), 'old wording');
    });
    await check('settings: the Google Docs switch is on by default and is saved when turned off', async () => {
      truthy(await options.isChecked('#docsSw'), 'on by default');
      await options.click('#docsSw');
      await pause(250);
      equal(await storage(options, async () => (await chrome.storage.sync.get('hoppa:settings'))['hoppa:settings'].docs), false);
      await options.click('#docsSw');
      await pause(250);
    });
    await check('about: version from the extension, publisher, contact, credit and no warranty', async () => {
      const about = await options.textContent('.about');
      truthy(about.includes('גרסה ' + JSON.parse(await readFile(path.join(root, 'dist', 'manifest.json'), 'utf8')).version), 'version');
      truthy(about.includes('מאת ChikApps'), 'publisher');
      truthy(about.includes('office@chiktime.com'), 'contact');
      truthy(about.includes('התאריך העברי ופרשת השבוע מחושבים בעזרת hebcal'), 'credit');
      truthy(about.includes('בלי אחריות'), 'no warranty');
      truthy(!about.includes('chikapps'), 'old spelling of the publisher');
    });
    await check('about: no "to be completed" notes; the source code and privacy policy links use the fixed addresses', async () => {
      truthy(!(await options.textContent('body')).includes('להשלים'), 'a note for the team is shown to the user');
      truthy(await options.isVisible('#codeLink'), 'the source code link');
      equal(await options.getAttribute('#codeLink', 'href'), SOURCE_CODE_URL);
      truthy(await options.isVisible('#privacyLink'), 'the privacy policy link');
      equal(await options.getAttribute('#privacyLink', 'href'), PRIVACY_POLICY_URL);
    });
    await check('about: "check for update" on a manual install shows a clear message, without an error', async () => {
      equal((await options.textContent('#btnUpdate')).trim(), 'בדיקת עדכון');
      await options.click('#btnUpdate');
      await pause(200);
      equal((await options.textContent('#updateStatus')).trim(), 'הגרסה הזו הותקנה ידנית, ולכן היא לא מתעדכנת לבד.');
      truthy(await options.isEnabled('#btnUpdate'), 'the button works again');
    });
    if (shots) await options.screenshot({ path: path.join(shots, 'options-settings-dark.png'), fullPage: true });

    /* ----- export and import ----- */
    process.stdout.write('\nExport and import\n');
    await options.click('#tab-mine');
    let jsonFile = '';
    let csvFile = '';
    const exportAs = async (format) => {
      await options.click('#btnExport');
      const [download] = await Promise.all([options.waitForEvent('download'), options.click('#exportMenu [data-fmt="' + format + '"]')]);
      const file = path.join(downloads, download.suggestedFilename());
      await download.saveAs(file);
      return file;
    };
    await check('export: a backup file (JSON) with the settings and every shortcut', async () => {
      jsonFile = await exportAs('json');
      truthy(/hoppa-backup-\d{4}-\d{2}-\d{2}\.json$/.test(jsonFile), jsonFile);
      const data = JSON.parse(await readFile(jsonFile, 'utf8'));
      equal(data.app, 'Hoppa');
      equal(data.schemaVersion, 1);
      equal(data.shortcuts.length, await rowCount());
      truthy(data.shortcuts.every((item) => item.abbr.startsWith(T)), 'shortcuts are exported with the trigger');
      equal(data.settings.calendar, 'il');
      equal((await toastText()).trim(), 'הקובץ נשמר בתיקיית ההורדות');
    });
    await check('export: a table for Excel (CSV) with a byte order mark and a formula guard', async () => {
      await options.click('#btnNew');
      await saveForm(T + 'נוס', '=1+1', '+972');
      csvFile = await exportAs('csv');
      const bytes = await readFile(csvFile);
      equal(bytes.subarray(0, 3).toString('hex'), 'efbbbf', 'byte order mark');
      const text = bytes.toString('utf8');
      truthy(text.includes('קיצור,טקסט,תיאור'), 'header');
      truthy(text.includes(T + "נוס,'=1+1,'+972"), 'cells that look like formulas get an apostrophe');
      truthy(text.includes('"[שם]\nטלפון: [טלפון]\nמייל: [מייל]"'), 'a cell with line breaks is quoted');
    });

    const importFile = async (file) => {
      await options.setInputFiles('#file', file);
      await pause(350);
    };
    const snapshotKeys = () => storage(options, async () => JSON.stringify(await chrome.storage.sync.get(null)));

    await check('import: the same CSV back, with nothing new, changes nothing', async () => {
      const before = await rowCount();
      await importFile(csvFile);
      truthy(await options.locator('#dlgSum').evaluate((dialog) => dialog.open), 'the summary is shown before anything is written');
      truthy((await options.textContent('#dSumT')).includes('ייובאו 0'), await options.textContent('#dSumT'));
      truthy(await options.isDisabled('#dSumOk'), 'nothing to import');
      await options.click('#dlgSum button[value="no"]');
      equal(await rowCount(), before);
    });
    await check('import: a CSV with a formula guard returns the original text', async () => {
      const row = options.locator('#tbody tr').first();
      await row.hover();
      await row.locator('button[data-act="del"]').click();
      await options.click('#dlgDel button[value="yes"]');
      await pause(300);
      await importFile(csvFile);
      truthy((await options.textContent('#dSumT')).includes('ייובאו 1'), await options.textContent('#dSumT'));
      await options.click('#dSumOk');
      await pause(400);
      const item = await storage(options, async (abbr) => Object.values(await chrome.storage.sync.get(null)).find((value) => value && value.abbr === abbr), T + 'נוס');
      equal(item.text, '=1+1');
      equal(item.label, '+972');
      truthy((await toastText()).includes('יובאו 1'), await toastText());
    });
    await check('import: an existing shortcut asks skip, replace or keep both', async () => {
      const file = path.join(downloads, 'conflict.csv');
      await writeFile(file, '﻿קיצור,טקסט,תיאור\r\n' + T + 'בב,ברכה אחרת,\r\n' + T + 'תמ,תודה אחרת,\r\n' + T + 'תר,רבה אחרת,\r\n' + T + 'יבא,חדש לגמרי,מיובא\r\n');
      const before = await rowCount();
      await options.setInputFiles('#file', file);
      await pause(300);
      equal(await options.textContent('#dImpAbbr'), T + 'בב');
      await options.click('#dlgImp button[value="skip"]');
      await pause(150);
      equal(await options.textContent('#dImpAbbr'), T + 'תמ');
      await options.click('#dlgImp button[value="replace"]');
      await pause(150);
      equal(await options.textContent('#dImpAbbr'), T + 'תר');
      await options.click('#dlgImp button[value="both"]');
      await pause(200);
      equal((await options.textContent('#dSumT')).trim(), 'ייובאו 3, ידולגו 1');
      equal(await rowCount(), before, 'nothing is written before the confirmation');
      await options.click('#dSumOk');
      await pause(400);
      equal(await rowCount(), before + 2);
      equal((await toastText()).trim(), 'יובאו 3, דולגו 1');
      await page.bringToFront();
      equal(await freshInput(page, '#in1', T + 'בב'), GREETING, 'skipped: unchanged');
      equal(await freshInput(page, '#in1', T + 'תמ'), 'תודה אחרת', 'replaced');
      equal(await freshInput(page, '#in1', T + 'תר'), packText('תר'), 'both: the copy is saved turned off');
      equal(await freshInput(page, '#in1', T + 'יבא'), 'חדש לגמרי', 'new');
      await options.bringToFront();
    });
    await check('import: rejected rows are listed with a reason, and the rest can be imported', async () => {
      const file = path.join(downloads, 'rejected.csv');
      await writeFile(file, 'קיצור,טקסט\r\nבלי-סימן,טקסט\r\n' + T + 'טוב,טקסט טוב\r\n' + T + 'רע,' + 'א'.repeat(10001) + '\r\n');
      await options.setInputFiles('#file', file);
      await pause(300);
      equal((await options.textContent('#dSumRejectedText')).trim(), '2 רשומות נדחו בייבוא.');
      await options.click('#dSumWhy');
      const reasons = await options.locator('#dSumList li').allTextContents();
      equal(reasons.length, 2);
      truthy(reasons[0].startsWith('שורה 2: קיצור מתחיל ב-'), reasons[0]);
      equal(reasons[1], 'שורה 4: הטקסט ארוך מדי. אפשר עד 10,000 תווים.');
      await options.click('#dlgSum button[value="no"]');
      await pause(200);
      const item = await storage(options, async (abbr) => Object.values(await chrome.storage.sync.get(null)).some((value) => value && value.abbr === abbr), T + 'טוב');
      equal(item, false, 'cancel writes nothing');
    });
    await check('import: the backup file (JSON) restores a deleted shortcut and the settings', async () => {
      await storage(options, async () => { await chrome.storage.sync.remove('hoppa:s:pack-25'); });
      await pause(300);
      await importFile(jsonFile);
      for (let i = 0; i < 40 && await options.locator('#dlgImp').evaluate((dialog) => dialog.open); i++) {
        await options.click('#dlgImp button[value="skip"]');
        await pause(120);
      }
      truthy(await options.locator('#dlgSum').evaluate((dialog) => dialog.open), 'summary');
      truthy((await options.textContent('#dSumT')).includes('ייובאו 1,'), await options.textContent('#dSumT'));
      await options.click('#dSumOk');
      await pause(400);
      await page.bringToFront();
      equal(await freshInput(page, '#in1', T + 'בצ'), packText('בצ'));
      await options.bringToFront();
    });

    await check('import: the same backup again has nothing to import, and the button is off', async () => {
      const again = await exportAs('json');
      await importFile(again);
      truthy((await options.textContent('#dSumT')).includes('ייובאו 0'), await options.textContent('#dSumT'));
      truthy(await options.isHidden('#dSumSettings'), 'the settings are the same, so nothing is said about them');
      truthy(await options.isDisabled('#dSumOk'), 'nothing to import');
      await options.click('#dlgSum button[value="no"]');
    });
    await check('import: when the file would change the settings, the summary says so', async () => {
      const data = JSON.parse(await readFile(jsonFile, 'utf8'));
      data.settings.suffix = 'shah';
      data.shortcuts = [];
      const file = path.join(downloads, 'settings-only.json');
      await writeFile(file, JSON.stringify(data));
      await importFile(file);
      equal((await options.textContent('#dSumSettings')).trim(), 'שימו לב: גם ההגדרות שלכם יוחלפו בהגדרות שבקובץ.');
      truthy(await options.isEnabled('#dSumOk'), 'the settings can be imported');
      await options.click('#dlgSum button[value="no"]');
      equal(await storage(options, async () => (await chrome.storage.sync.get('hoppa:settings'))['hoppa:settings'].suffix), 'shekel', 'cancel changes nothing');
    });
    await check('import: more shortcuts than the limit are refused before any summary is shown', async () => {
      const file = path.join(downloads, 'six-hundred.csv');
      await writeFile(file, Array.from({ length: 600 }, (_, i) => T + 'רב' + i + ',טקסט ' + i).join('\r\n'));
      const before = await snapshotKeys();
      await importFile(file);
      truthy((await errorToast()).startsWith('הגעתם ל-500 קיצורים'), await errorToast());
      equal(await options.locator('dialog[open]').count(), 0, 'no summary that promises what cannot be saved');
      equal(await snapshotKeys(), before);
    });
    await check('import: a table saved by Excel in the Hebrew encoding of Windows is read', async () => {
      const hebrew = [0xF9, 0xEC, 0xE5, 0xED];
      const ascii = (text) => Array.from(Buffer.from(text, 'utf8'));
      const file = path.join(downloads, 'excel-ansi.csv');
      await writeFile(file, Buffer.from([...ascii(T + 'xl,'), ...hebrew, 0x0D, 0x0A]));
      await importFile(file);
      truthy((await options.textContent('#dSumT')).includes('ייובאו 1'), await options.textContent('#dSumT'));
      await options.click('#dSumOk');
      await pause(400);
      await page.bringToFront();
      equal(await freshInput(page, '#in1', T + 'xl'), 'שלום');
      await options.bringToFront();
    });

    const evilDir = path.join(root, 'tests', 'fixtures', 'evil');
    const evilFiles = [
      ['broken.json', 'הקובץ לא תקין'],
      ['not-json.json', 'הקובץ לא תקין'],
      ['proto-top.json', 'הקובץ לא תקין'],
      ['unknown-version.json', 'הקובץ לא תקין'],
      ['newer-version.json', 'הקובץ נוצר בגרסה חדשה יותר של Hoppa'],
      ['unknown-settings.json', 'הקובץ לא תקין'],
      ['bad-setting-value.json', 'הקובץ לא תקין'],
      ['unknown-top-key.json', 'הקובץ לא תקין'],
      ['shortcuts-not-array.json', 'הקובץ לא תקין'],
      ['hundred-thousand.json', 'הקובץ'],
      ['five-megabytes.json', 'הקובץ גדול מדי. אפשר לייבא קובץ עד 2MB.'],
      ['many-columns.csv', 'הקובץ לא תקין'],
      ['one-column.csv', 'הקובץ לא תקין'],
      ['too-many-rows.csv', 'בקובץ יש יותר מדי שורות'],
      ['not-utf8.csv', 'הקובץ לא תקין'],
      ['unclosed-quote.csv', 'הקובץ לא תקין'],
      ['empty.json', 'הקובץ לא תקין']
    ];
    for (const [name, message] of evilFiles) {
      await check('import: hostile file ' + name + ' is rejected and nothing changes', async () => {
        const before = await snapshotKeys();
        await options.setInputFiles('#file', path.join(evilDir, name));
        await pause(name.startsWith('five') || name.startsWith('hundred') ? 900 : 350);
        truthy((await errorToast()).includes(message), 'message was: ' + (await errorToast()));
        equal(await options.locator('dialog[open]').count(), 0, 'no dialog');
        equal(await snapshotKeys(), before, 'storage is unchanged');
      });
    }
    const allRejected = [['wrong-types.json', 6], ['proto-record.json', 2], ['huge-text.json', 1]];
    for (const [name, rejected] of allRejected) {
      await check('import: hostile file ' + name + ': every record is rejected and nothing can be imported', async () => {
        const before = await snapshotKeys();
        await options.setInputFiles('#file', path.join(evilDir, name));
        await pause(500);
        truthy((await options.textContent('#dSumT')).includes('ייובאו 0'), await options.textContent('#dSumT'));
        const expected = rejected === 1 ? 'רשומה אחת נדחתה בייבוא.' : rejected + ' רשומות נדחו בייבוא.';
        equal((await options.textContent('#dSumRejectedText')).trim(), expected);
        truthy(await options.isDisabled('#dSumOk'), 'the import button is disabled');
        await options.click('#dlgSum button[value="no"]');
        equal(await snapshotKeys(), before, 'storage is unchanged');
      });
    }
    await check('import: markup in every field of a file is imported and shown as text only', async () => {
      await options.setInputFiles('#file', path.join(evilDir, 'html-everywhere.json'));
      await pause(400);
      await options.click('#dSumOk');
      await pause(500);
      equal(await options.locator('#tbody script, #tbody img, #tbody svg, #tbody iframe').count(), 0);
      equal(await options.evaluate(() => window.__pwned), undefined);
      truthy((await options.textContent('#tbody')).includes('<img src=x onerror=alert(1)>'), 'shown as text');
    });
    await check('import: a CSV with formulas is imported as plain text', async () => {
      await options.setInputFiles('#file', path.join(evilDir, 'formulas.csv'));
      await pause(400);
      await options.click('#dSumOk');
      await pause(500);
      const item = await storage(options, async (abbr) => Object.values(await chrome.storage.sync.get(null)).find((value) => value && value.abbr === abbr), T + 'נוסחה');
      equal(item.text, '=HYPERLINK("http://example.invalid","x")');
    });

    /* ----- pack restore ----- */
    await check('restore pack: adds only what is missing, singular wording for one', async () => {
      await storage(options, async () => { await chrome.storage.sync.remove('hoppa:s:pack-24'); });
      await pause(300);
      await options.click('#btnRestore');
      await pause(400);
      equal((await toastText()).trim(), 'נוסף קיצור אחד שהיה חסר. מה שכבר היה לא השתנה.');
      await options.click('#btnRestore');
      await pause(400);
      equal((await toastText()).trim(), 'כל הקיצורים של החבילה כבר נמצאים אצלכם.');
    });
    await check('restore pack: a changed pack shortcut is not overwritten', async () => {
      const item = await storage(options, async (abbr) => Object.values(await chrome.storage.sync.get(null)).find((value) => value && value.builtin && value.abbr === abbr), 'תמ');
      equal(item.text, 'תודה אחרת');
    });

    /* ================= popup ================= */
    process.stdout.write('\nPopup\n');
    const pasted = async () => {
      await page.bringToFront();
      await page.fill('#ta1', '');
      await page.click('#ta1');
      await page.keyboard.press('Control+v');
      const value = await page.inputValue('#ta1');
      await popup.bringToFront();
      return value;
    };
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 360, height: 500 });
    // The address has a query, so this tab can be told apart from the real toolbar popup later.
    await popup.goto(ext('popup.html?tab'));
    await popup.waitForSelector('#list .row');
    await check('popup: smart shortcuts with live values and my active shortcuts', async () => {
      equal(await popup.locator('#list .row.smart').count(), 5);
      truthy((await popup.locator('#list .row.smart').first().textContent()).includes(formatHebrewDate(new Date(), HEBREW_DATE_MARKS)), 'Hebrew date');
      const enabled = await storage(popup, async () => Object.entries(await chrome.storage.sync.get(null)).filter(([key, value]) => key.startsWith('hoppa:s:') && value.enabled).length);
      equal(await popup.locator('#list .row:not(.smart)').count(), enabled);
    });
    await check('popup: a click on a row copies the full text and shows the message', async () => {
      const row = popup.locator('#list .row:not(.smart)', { has: popup.locator('.chip', { hasText: T + 'חת' }) }).first();
      await row.click();
      await pause(150);
      equal(await pasted(), SIGNATURE);
      equal((await popup.textContent('#toast')).trim(), 'הועתק ✓');
    });
    await check('popup: search, and the message when nothing is found', async () => {
      await popup.fill('#q', 'יישר');
      equal(await popup.locator('#list .row').count(), 1);
      await popup.fill('#q', 'אין-דבר-כזה');
      equal((await popup.textContent('#list')).trim(), 'לא נמצא קיצור כזה');
      await popup.fill('#q', '');
    });
    await check('popup: keyboard, arrow down and Enter copy the first row', async () => {
      await popup.fill('#q', T + 'בב');
      await popup.focus('#q');
      await popup.keyboard.press('Enter');
      await pause(150);
      equal(await pasted(), GREETING);
      await popup.fill('#q', '');
    });
    await check('popup: on a page where the extension is not running, the message says to refresh and explains', async () => {
      equal((await popup.textContent('#banner')).trim(), 'התוסף לא פועל בדף הזה. נסו לרענן את הדף (F5). אם זה דף של כרום עצמו, כמו החנות או ההגדרות, תוספים לא יכולים לפעול בו. אפשר ללחוץ על קיצור, להעתיק ולהדביק.');
      truthy(await popup.isHidden('#siteRow'), 'the site switch is hidden');
    });
    if (shots) await popup.screenshot({ path: path.join(shots, 'popup-dark.png') });
    await check('popup: the general switch turns the extension off everywhere, and on again', async () => {
      await popup.click('#power');
      await pause(300);
      equal((await popup.textContent('#powerLabel')).trim(), 'כבוי');
      equal((await popup.textContent('#banner')).trim(), 'התוסף כבוי. הקיצורים לא יוחלפו עד שתפעילו אותו');
      await page.bringToFront();
      equal(await freshInput(page, '#in1', T + 'בב'), T + 'בב');
      await popup.bringToFront();
      await popup.click('#power');
      await pause(300);
      await page.bringToFront();
      equal(await freshInput(page, '#in1', T + 'בב'), GREETING);
    });

    /* ----- the real popup, opened from the toolbar on top of a site ----- */
    let realPopup = null;
    await check('popup over a site: shows the site name and "off on this site" stops the replacement there', async () => {
      await page.bringToFront();
      await worker.evaluate(() => chrome.action.openPopup());
      realPopup = await attachToTarget(debugPort, ext('popup.html'), 8000);
      for (let i = 0; i < 40 && !(await realPopup.evaluate('document.querySelectorAll("#list .row").length > 0')); i++) await pause(100);
      equal(await realPopup.evaluate('document.getElementById("domain").textContent'), '127.0.0.1');
      equal(await realPopup.evaluate('document.getElementById("siteRow").hidden'), false, 'the site switch is shown');
      await realPopup.evaluate('document.getElementById("siteOff").click()');
      await pause(400);
      equal(await realPopup.evaluate('document.getElementById("banner").textContent.trim()'), 'באתר הזה התוסף כבוי. בשאר האתרים הוא ממשיך לעבוד');
      const sites = await storage(popup, async () => (await chrome.storage.sync.get('hoppa:settings'))['hoppa:settings'].disabledSites);
      equal(JSON.stringify(sites), JSON.stringify(['127.0.0.1']));
    });
    await check('off on this site: no replacement on the site, also inside its inner frame', async () => {
      if (realPopup) {
        await realPopup.evaluate('window.close()').catch(() => {});
        realPopup.close();
      }
      await page.bringToFront();
      equal(await freshInput(page, '#in1', T + 'בב'), T + 'בב');
      await frame.locator('#fta').fill('');
      await frame.locator('#fta').click();
      await typeKeys(page, T + 'בב');
      equal(await frame.locator('#fta').inputValue(), T + 'בב');
    });
    await check('settings: the site is listed, and "turn on again" brings the replacement back', async () => {
      await options.bringToFront();
      await options.click('#tab-settings');
      equal(await options.locator('#sites li .domain').textContent(), '127.0.0.1');
      await options.click('#sites button');
      await pause(300);
      truthy(await options.isVisible('#sitesEmpty'), 'the empty message');
      await page.bringToFront();
      equal(await freshInput(page, '#in1', T + 'בב'), GREETING);
    });

    /* ================= layout ================= */
    process.stdout.write('\nLayout\n');
    await check('a shortcut in English letters is shown with the trigger in front; a Hebrew one stays right to left', async () => {
      await options.bringToFront();
      await options.click('#tab-mine');
      await options.click('#btnNew');
      await saveForm(T + 'abc', 'English shortcut');
      const chip = options.locator('#tbody tr').first().locator('.chip');
      equal(await chip.textContent(), T + 'abc');
      equal(await chip.evaluate((node) => window.getComputedStyle(node).direction), 'ltr');
      const hebrew = options.locator('#tbody tr', { has: options.locator('.chip', { hasText: T + 'בב' }) }).first().locator('.chip');
      equal(await hebrew.evaluate((node) => window.getComputedStyle(node).direction), 'rtl');
    });
    await check('with the editor open, the "text" column keeps room at every width from 1000 to 1400 pixels', async () => {
      await options.bringToFront();
      await options.click('#tab-mine');
      await options.click('#tbody tr');
      const before = options.viewportSize();
      const narrow = [];
      try {
        for (let width = 1000; width <= 1400; width += 10) {
          await options.setViewportSize({ width, height: 800 });
          const cell = await options.evaluate(() => document.querySelector('#tbody tr td.c-text').getBoundingClientRect().width);
          if (cell < 120) narrow.push(width + ':' + Math.round(cell));
        }
        await options.setViewportSize({ width: 1101, height: 800 });
        const at1101 = await options.evaluate(() => document.querySelector('#tbody tr td.c-text').getBoundingClientRect().width);
        if (at1101 < 120) narrow.push('1101:' + Math.round(at1101));
      } finally {
        await options.setViewportSize(before);
      }
      equal(narrow.join(', '), '', 'widths where the text column is too narrow');
    });
    await check('a long shortcut stays inside its column in the table, and its full text is in the tooltip', async () => {
      await options.bringToFront();
      await options.click('#tab-mine');
      await options.click('#btnNew');
      await saveForm(T + 'abcdefghijklmnopqrstuvwxyz', 'טקסט של קיצור ארוך');
      const row = options.locator('#tbody tr').first();
      const box = await row.evaluate((tr) => {
        const chip = tr.querySelector('.chip').getBoundingClientRect();
        const cell = tr.querySelector('td.c-abbr').getBoundingClientRect();
        const text = tr.querySelector('td.c-text').getBoundingClientRect();
        return { inside: chip.left >= cell.left - 1 && chip.right <= cell.right + 1, apart: chip.left >= text.right - 1 || chip.right <= text.left + 1, title: tr.querySelector('.chip').title };
      });
      truthy(box.inside, 'the shortcut leaves its cell');
      truthy(box.apart, 'the shortcut covers the text column');
      equal(box.title, T + 'abcdefghijklmnopqrstuvwxyz');
    });
    await check('narrow window: choosing a row brings the edit form into view', async () => {
      await options.setViewportSize({ width: 375, height: 700 });
      await options.evaluate(() => window.scrollTo(0, 0));
      await options.locator('#tbody tr').nth(2).click();
      await pause(700);
      const visible = await options.evaluate(() => {
        const box = document.querySelector('#fAbbr').getBoundingClientRect();
        return box.top >= 0 && box.bottom <= window.innerHeight;
      });
      truthy(visible, 'the edit form is not on the screen');
      equal(await options.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no sideways scrolling');
      await options.setViewportSize({ width: 1280, height: 800 });
      await options.evaluate(() => window.scrollTo(0, 0));
    });

    /* ================= day and night ================= */
    process.stdout.write('\nDay and night\n');
    await check('theme: night is the default', async () => {
      equal(await options.getAttribute('html', 'data-theme'), 'dark');
    });
    await check('theme: day mode is saved and survives a reload', async () => {
      await options.bringToFront();
      await options.click('.theme-row');
      await pause(400);
      equal(await options.getAttribute('html', 'data-theme'), 'light');
      equal(await storage(options, async () => (await chrome.storage.sync.get('hoppa:settings'))['hoppa:settings'].theme), 'light');
      await options.reload();
      await options.waitForSelector('#tbody tr', { state: 'attached' });
      equal(await options.getAttribute('html', 'data-theme'), 'light');
      equal(await options.getAttribute('.theme-row', 'aria-pressed'), 'true');
    });
    await check('theme: the popup and the welcome page follow', async () => {
      await popup.reload();
      await popup.waitForSelector('#list .row');
      equal(await popup.getAttribute('html', 'data-theme'), 'light');
      equal(await welcome.getAttribute('html', 'data-theme'), 'light');
    });
    if (shots) {
      await popup.screenshot({ path: path.join(shots, 'popup-light.png') });
      await options.click('#tab-mine');
      await options.screenshot({ path: path.join(shots, 'options-mine-light.png') });
      await options.click('#tab-settings');
      await options.screenshot({ path: path.join(shots, 'options-settings-light.png'), fullPage: true });
      await welcome.screenshot({ path: path.join(shots, 'welcome-light.png') });
      await options.setViewportSize({ width: 375, height: 760 });
      await options.screenshot({ path: path.join(shots, 'options-settings-narrow-light.png'), fullPage: true });
      await options.click('#tab-mine');
      await options.screenshot({ path: path.join(shots, 'options-mine-narrow-light.png'), fullPage: true });
      await options.setViewportSize({ width: 1280, height: 800 });
      await welcome.setViewportSize({ width: 375, height: 760 });
      await welcome.screenshot({ path: path.join(shots, 'welcome-narrow-light.png'), fullPage: true });
      await welcome.setViewportSize({ width: 1280, height: 800 });
    }
    await check('theme: back to night from the popup, and the management page follows', async () => {
      await popup.bringToFront();
      await popup.click('.theme-btn');
      await pause(500);
      equal(await popup.getAttribute('html', 'data-theme'), 'dark');
      equal(await options.getAttribute('html', 'data-theme'), 'dark');
      equal(await storage(options, async () => (await chrome.storage.sync.get('hoppa:settings'))['hoppa:settings'].theme), 'dark');
    });

    /* ================= storage ================= */
    process.stdout.write('\nStorage\n');
    await check('a damaged record is ignored, the rest keep working, and the settings show it', async () => {
      await storage(options, async () => {
        await chrome.storage.sync.set({ 'hoppa:s:bad-one': { id: 'bad-one', abbr: 5, text: '<script>1</script>' }, 'hoppa:s:bad-two': 'not an object' });
      });
      await pause(400);
      await options.bringToFront();
      await options.click('#tab-settings');
      equal((await options.textContent('#corruptText')).trim(), '2 קיצורים פגומים לא נטענו. שאר הקיצורים עובדים כרגיל.');
      await page.bringToFront();
      equal(await freshInput(page, '#in1', T + 'בב'), GREETING);
    });
    await check('"delete the damaged ones" removes only them', async () => {
      await options.bringToFront();
      const before = await storage(options, async () => Object.keys(await chrome.storage.sync.get(null)).length);
      await options.click('#btnCorrupt');
      await pause(400);
      truthy(await options.isHidden('#corruptBox'), 'the notice is gone');
      equal(await storage(options, async () => Object.keys(await chrome.storage.sync.get(null)).length), before - 2);
    });
    await check('a text too big for sync moves everything to this computer, with a clear notice', async () => {
      await options.click('#tab-mine');
      await options.click('#btnNew');
      await saveForm(T + 'גדול', 'ג'.repeat(9000));
      await pause(400);
      equal(await storage(options, async () => (await chrome.storage.local.get('hoppa:area'))['hoppa:area']), 'local');
      await options.click('#tab-settings');
      equal((await options.textContent('#syncBox')).trim(), 'הסנכרון בין מחשבים כבוי כי הקיצורים גדולים מדי. מומלץ לגבות בייצוא.');
      const localCount = await storage(options, async () => Object.keys(await chrome.storage.local.get(null)).filter((key) => key.startsWith('hoppa:s:')).length);
      equal(localCount, await options.locator('#tbody tr').count());
    });
    await check('after the move: old and new shortcuts work, and a long text is inserted', async () => {
      await page.bringToFront();
      equal(await freshInput(page, '#in1', T + 'בב'), GREETING);
      equal((await freshInput(page, '#ta1', T + 'גדול')).length, 9000);
    });
    await check('a text of the maximum length (10,000 characters) is replaced without hanging', async () => {
      await options.bringToFront();
      await options.click('#tab-mine');
      await options.click('#btnNew');
      await saveForm(T + 'מקס', 'מ'.repeat(10000));
      await page.bringToFront();
      const started = Date.now();
      equal((await freshInput(page, '#ta1', T + 'מקס')).length, 10000);
      truthy(Date.now() - started < 5000, 'took too long');
      equal((await freshEditor(page, '#ce1', T + 'מקס')).trim().length, 10000);
    });
    await check('rich editor: Backspace brings the shortcut back also after a long text of many lines', async () => {
      await options.bringToFront();
      await options.click('#btnNew');
      await saveForm(T + 'שורות', Array.from({ length: 200 }, (_, i) => 'שורה מספר ' + i).join('\n'));
      await page.bringToFront();
      const text = await freshEditor(page, '#ce1', T + 'שורות');
      equal(text.replace(/\n+/g, '\n').trim().split('\n').length, 200);
      await page.keyboard.press('Backspace');
      equal((await editorText(page, '#ce1')).replace(/\n/g, '').trim(), T + 'שורות');
    });
    await check('data saved by a newer version: read only, with a clear notice, and nothing is written', async () => {
      await storage(options, async () => { await chrome.storage.local.set({ 'hoppa:meta': { schemaVersion: 99 } }); });
      await pause(400);
      await options.bringToFront();
      truthy(await options.isVisible('#readOnlyBox'), 'the notice');
      equal((await options.textContent('#readOnlyBox')).trim(), 'צריך לעדכן את התוסף. הקיצורים נשמרו בגרסה חדשה יותר של Hoppa, ועד העדכון אי אפשר לשנות אותם כאן.');
      const before = await storage(options, async () => JSON.stringify(await chrome.storage.local.get(null)));
      await options.click('#btnNew');
      await saveForm(T + 'אסור', 'לא נשמר');
      truthy((await errorToast()).includes('צריך לעדכן את התוסף'), await errorToast());
      equal(await storage(options, async () => JSON.stringify(await chrome.storage.local.get(null))), before);
      await storage(options, async () => { await chrome.storage.local.set({ 'hoppa:meta': { schemaVersion: 1 } }); });
      await pause(300);
    });

    await check('after the big shortcuts are deleted, sync comes back and the notice goes away', async () => {
      await options.bringToFront();
      await options.click('#tab-mine');
      for (const name of ['גדול', 'מקס']) {
        const row = options.locator('#tbody tr', { has: options.locator('.chip', { hasText: T + name }) }).first();
        await row.hover();
        await row.locator('button[data-act="del"]').click();
        await options.click('#dlgDel button[value="yes"]');
        await pause(500);
      }
      equal(await storage(options, async () => (await chrome.storage.local.get('hoppa:area'))['hoppa:area']), undefined, 'the local marker is gone');
      await options.click('#tab-settings');
      equal((await options.textContent('#syncBox')).trim(), 'הקיצורים נשמרים בכרום שלכם. אם הסנכרון של כרום פועל אצלכם, הם נשמרים גם בחשבון הגוגל שלכם ועוברים דרכו בין המחשבים שלכם.');
      const syncCount = await storage(options, async () => Object.keys(await chrome.storage.sync.get(null)).filter((key) => key.startsWith('hoppa:s:')).length);
      await options.click('#tab-mine');
      equal(syncCount, await options.locator('#tbody tr').count(), 'every shortcut is in sync again');
      await page.bringToFront();
      equal(await freshInput(page, '#in1', T + 'בב'), GREETING);
    });

    /* ================= privacy ================= */
    process.stdout.write('\nPrivacy\n');
    await check('nothing typed is saved: storage holds only shortcuts, settings and the two markers', async () => {
      const keys = await storage(options, async () => Object.keys({ ...(await chrome.storage.local.get(null)), ...(await chrome.storage.sync.get(null)) }));
      const unexpected = keys.filter((key) => !key.startsWith('hoppa:s:') && !['hoppa:meta', 'hoppa:settings', 'hoppa:area'].includes(key));
      equal(unexpected.join(','), '');
      equal(await options.evaluate(() => Object.keys(window.localStorage).join(',')), 'hoppa-theme');
    });
    await check('no network requests: only the local test pages and the extension itself', async () => {
      // "chrome-extension://invalid/" is what Chrome answers when the hostile test page asks for a file of the extension.
      const outside = requests.filter((url) => !url.startsWith(server.origin + '/') && !url.startsWith('chrome-extension://' + id + '/') &&
        !url.startsWith('blob:chrome-extension://' + id + '/') && url !== 'chrome-extension://invalid/');
      equal(outside.join('\n'), '');
      truthy(requests.length > 20, 'the request log is working (' + requests.length + ' requests seen)');
    });
    await check('no errors and no policy violations on the pages of the extension', async () => {
      equal(pageErrors.join('\n'), '');
    });
  } finally {
    const ok = report.summary();
    await context.close().catch(() => {});
    await server.close();
    if (!process.env.HOPPA_E2E_KEEP) await rm(work, { recursive: true, force: true }).catch(() => {});
    process.exitCode = ok ? 0 : 1;
  }
}

main().catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + '\n');
  process.exit(1);
});
