// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * The Google Docs module against a small stand-in for Docs that behaves the way
 * the real document behaved when it was measured (2026-11-12):
 * - Backspace (keydown) deletes one character at once and is marked handled;
 * - a paste is taken at once (stopPropagation) but applied a moment later, and a
 *   key that arrives before that goes in first;
 * - one space is dropped at each end of a pasted text;
 * - typing, deleting and pasting are separate undo steps; Ctrl+Z undoes one.
 * The live test in a real document is tests/e2e/docs-live.mjs.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createGdocs } from '../../src/gdocs/index.js';
import { padForPaste } from '../../src/gdocs/frameInput.js';
import { findMatch, isBoundary, buildLookup } from '../../src/core/matcher.js';
import { TRIGGER as T } from '../../src/config.js';

/* Every module made here is stopped at the end, also when a check fails, so no timer is left running. */
const made = [];
after(() => { for (const gdocs of made) gdocs.stop(); });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class FakeEvent {
  constructor(type, init = {}) {
    Object.assign(this, init);
    this.type = type;
    this.isTrusted = false;
    this.defaultPrevented = false;
    this.stopped = false;
    this.stoppedNow = false;
  }
  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
  stopPropagation() { this.stopped = true; }
  stopImmediatePropagation() { this.stopped = true; this.stoppedNow = true; }
  getModifierState() { return false; }
}

class FakeTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn, capture) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push({ fn, capture: Boolean(capture) });
  }
  removeEventListener(type, fn, capture) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter((item) => !(item.fn === fn && item.capture === Boolean(capture))));
  }
  fire(event, capture) {
    for (const item of [...(this.listeners.get(event.type) || [])]) {
      if (item.capture !== capture) continue;
      item.fn(event);
      if (event.stoppedNow) break;
    }
  }
  count(type) { return (this.listeners.get(type) || []).length; }
}

class FakeDataTransfer {
  constructor() { this.data = new Map(); this.items = []; this.items.add = (file) => { this.items.push({ kind: 'file', getAsFile: () => file }); }; }
  setData(type, value) {
    if (FakeDataTransfer.broken) throw new Error('broken');
    this.data.set(type, value);
  }
  getData(type) { return this.data.get(type) || ''; }
  get types() { return Array.from(this.data.keys()); }
}

/* A stand-in for a Docs document with its hidden typing frame. */
function fakeDocs(options = {}) {
  const docs = { text: '', undo: [], lastOp: null, pastes: 0, ...options };
  const win = new FakeTarget();
  const doc = new FakeTarget();
  const box = new FakeTarget();
  box.isContentEditable = true;
  box.contains = (node) => node === box;
  doc.activeElement = box;
  docs.commands = [];
  doc.execCommand = (name) => { docs.commands.push(name + '@' + docs.text); return true; };
  win.KeyboardEvent = class extends FakeEvent {};
  win.ClipboardEvent = class extends FakeEvent {};
  win.DataTransfer = FakeDataTransfer;

  function edit(kind, change) {
    if (docs.lastOp !== kind) docs.undo.push(docs.text);
    docs.lastOp = kind;
    change();
  }
  function handle(event) {
    if (event.type === 'keydown') {
      if (event.key === 'Backspace' && !docs.ignoreBackspace) {
        event.preventDefault();
        edit('delete', () => { docs.text = Array.from(docs.text).slice(0, -1).join(''); });
      } else if (event.key === 'z' && event.ctrlKey) {
        event.preventDefault();
        if (docs.undo.length > 0) docs.text = docs.undo.pop();
        docs.lastOp = null;
      } else if (event.key === 'Enter') {
        event.preventDefault();
        edit('type', () => { docs.text += '\n'; });
      }
    } else if (event.type === 'keypress') {
      event.preventDefault();
      edit('type', () => { docs.text += event.key; });
    } else if (event.type === 'paste' && !docs.ignorePaste) {
      if (!docs.pasteNoSignal) event.stopPropagation();
      const text = event.clipboardData.getData('text/plain').replace(/^ /, '').replace(/ $/, '');
      setTimeout(() => {
        docs.pastes += 1;
        docs.lastOp = null;
        edit('paste', () => { docs.text += text; });
        docs.lastOp = null;
      }, docs.pasteDelay === undefined ? 15 : docs.pasteDelay);
    }
  }
  box.dispatchEvent = (event) => {
    event.target = box;
    win.fire(event, true);
    if (!event.stopped) doc.fire(event, true);
    if (!event.stopped) handle(event);
    if (!event.stopped && event.bubbles) {
      doc.fire(event, false);
      if (!event.stopped) win.fire(event, false);
    }
    return !event.defaultPrevented;
  };

  const caret = {
    getBoundingClientRect: () => ({ left: 1000 - docs.text.length * 5, top: docs.text.split('\n').length * 20, height: 18 })
  };
  const frame = { contentWindow: win, contentDocument: doc };
  const topDoc = new FakeTarget();
  topDoc.visibilityState = 'visible';
  const bar = { getBoundingClientRect: () => ({ left: 500, top: 100, bottom: 118, height: 18 }) };
  const canvas = {
    width: 800, height: 1000,
    getBoundingClientRect: () => ({ left: 100, top: 50, right: 900, bottom: 1050, width: 800, height: 1000 }),
    getContext: () => ({ getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(docs.lineInk ? 0 : 255) }) })
  };
  topDoc.querySelector = (selector) => {
    if (selector.includes('docs-texteventtarget-iframe')) return docs.noFrame ? null : frame;
    if (selector.includes('kix-cursor-caret')) return docs.page ? bar : null;
    return null;
  };
  topDoc.querySelectorAll = (selector) => {
    if (selector.includes('canvas')) return docs.page ? [canvas] : [];
    return docs.noCaret ? [] : [caret];
  };
  const view = new FakeTarget();
  Object.assign(view, {
    location: { hostname: 'docs.google.com', pathname: '/document/d/x/edit' },
    document: topDoc,
    setTimeout, clearTimeout, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval,
    requestAnimationFrame: (fn) => setTimeout(fn, 4)
  });
  view.top = view;

  /* A real key press: trusted, and the character goes in unless something stopped the key. */
  async function press(key, extra = {}) {
    const down = new FakeEvent('keydown', { key, code: '', keyCode: 0, bubbles: true, cancelable: true, ...extra });
    down.isTrusted = true;
    box.dispatchEvent(down);
    if (!down.defaultPrevented && !down.stopped && Array.from(key).length === 1 && !extra.ctrlKey) {
      const typed = new FakeEvent('keypress', { key, bubbles: true, cancelable: true });
      typed.isTrusted = true;
      box.dispatchEvent(typed);
    }
  }
  async function type(text, gap = 0) {
    for (const ch of text) {
      await press(ch === '\n' ? 'Enter' : ch);
      if (gap) await sleep(gap);
      else await Promise.resolve();
    }
  }
  /* A real copy, cut or paste (the browser makes it from the real key). */
  function clipboard(type, text) {
    const data = new FakeDataTransfer();
    if (text !== undefined) data.setData('text/plain', text);
    const event = new FakeEvent(type, { clipboardData: data, bubbles: true, cancelable: true });
    event.isTrusted = true;
    box.dispatchEvent(event);
  }
  return { docs, view, win, doc, box, topDoc, frame, press, type, clipboard };
}

function makeState(extra) {
  const entries = [
    { abbr: T + 'בב', kind: 'text', text: 'בברכה,' },
    { abbr: T + 'חת', kind: 'text', text: '[שם]\nטלפון: [טלפון]' },
    { abbr: T + 'ר', kind: 'text', text: ' רווחים ' }
  ];
  return {
    active: true,
    settings: { docs: true },
    lookup: buildLookup(entries),
    number: false,
    render: (entry) => entry.text,
    ...extra
  };
}

function setup(options = {}, stateExtra) {
  const fake = fakeDocs(options);
  let state = makeState(stateExtra);
  const gdocs = createGdocs({ view: fake.view, matcher: { findMatch, isBoundary }, template: {}, getState: () => state });
  made.push(gdocs);
  gdocs.start();
  return { ...fake, gdocs, setState: (next) => { state = next; } };
}

const settle = () => sleep(250);

test('Docs: padForPaste adds one space where Docs drops one', () => {
  assert.equal(padForPaste('abc'), 'abc');
  assert.equal(padForPaste('abc '), 'abc  ');
  assert.equal(padForPaste(' abc'), '  abc');
  assert.equal(padForPaste('a\nb\t'), 'a\nb\t');
});

test('Docs: status, and the module runs in the top page of a document only', () => {
  const t = setup();
  assert.equal(t.gdocs.ownsFrame, true);
  assert.equal(t.gdocs.status(), 'ready');
  t.gdocs.stop();
  const inner = fakeDocs();
  inner.view.top = { location: inner.view.location };
  const idle = createGdocs({ view: inner.view, matcher: { findMatch, isBoundary }, template: {}, getState: () => makeState() });
  assert.equal(idle.ownsFrame, true, 'the general engine stays off in the typing frame too');
  assert.equal(idle.status(), 'not-docs');
  assert.equal(idle.start(), false);
  const noFrame = setup({ noFrame: true });
  assert.equal(noFrame.gdocs.status(), 'not-recognized');
  noFrame.gdocs.stop();
});

test('Docs: a shortcut after a space is replaced, and typing goes on in order', async () => {
  const t = setup();
  await t.type('שלום ' + T + 'בב עוד', 1);
  await settle();
  assert.equal(t.docs.text, 'שלום בברכה, עוד');
  t.gdocs.stop();
});

test('Docs: keys pressed while the paste is on its way are held and come after it', async () => {
  const t = setup({ pasteDelay: 40 });
  await t.type('\n' + T + 'חת שורה', 0);
  await settle();
  assert.equal(t.docs.text, '\n[שם]\nטלפון: [טלפון] שורה');
  t.gdocs.stop();
});

test('Docs: spaces at the ends of the text arrive as they are', async () => {
  const t = setup();
  await t.type('\n' + T + 'ר', 1);
  await settle();
  assert.equal(t.docs.text, '\n רווחים ');
  t.gdocs.stop();
});

test('Docs: Backspace right after a replacement brings the shortcut back', async () => {
  const t = setup();
  await t.type('\n' + T + 'חת', 1);
  await settle();
  await t.press('Backspace');
  assert.equal(t.docs.text, '\n' + T + 'חת');
  await t.press('Backspace');
  assert.equal(t.docs.text, '\n' + T + 'ח', 'the next Backspace deletes one character');
  t.gdocs.stop();
});

test('Docs: made-up key events of a page never cause a replacement', async () => {
  const t = setup();
  await t.type('\n', 1);
  for (const ch of T + 'בב') {
    const fake = new FakeEvent('keydown', { key: ch, bubbles: true, cancelable: true });
    t.box.dispatchEvent(fake);
    const typed = new FakeEvent('keypress', { key: ch, bubbles: true, cancelable: true });
    typed.isTrusted = true;
    t.box.dispatchEvent(typed);
  }
  await settle();
  assert.equal(t.docs.text, '\n' + T + 'בב');
  t.gdocs.stop();
});

test('Docs: after a click the start of the line is unknown, so a shortcut needs a space first', async () => {
  const t = setup();
  await t.type('אבג', 1);
  const click = new FakeEvent('mousedown');
  click.isTrusted = true;
  t.view.fire(click, true);
  await t.type(T + 'בב', 1);
  await settle();
  assert.equal(t.docs.text, 'אבג' + T + 'בב');
  await t.type(' ' + T + 'בב', 1);
  await settle();
  assert.equal(t.docs.text, 'אבג' + T + 'בב בברכה,');
  t.gdocs.stop();
});

test('Docs: after a click, a shortcut on an empty line is replaced at once; on a line with text it is not', async () => {
  const t = setup({ page: true });
  const click = () => { const event = new FakeEvent('mousedown'); event.isTrusted = true; t.view.fire(event, true); };
  click();
  await t.type(T + 'בב', 1);
  await settle();
  assert.equal(t.docs.text, 'בברכה,', 'empty line');
  t.docs.lineInk = true;
  click();
  await t.type(T + 'בב', 1);
  await settle();
  assert.equal(t.docs.text, 'בברכה,' + T + 'בב', 'a line with text');
  t.gdocs.stop();
});

test('Docs: when Docs rewrites the typing frame, the module attaches again', async () => {
  const t = setup();
  t.doc.documentElement = { id: 'new' };
  t.win.listeners.clear();
  await sleep(400);
  assert.equal(t.win.count('keydown'), 1, 'listening again');
  await t.type('\n' + T + 'בב', 1);
  await settle();
  assert.equal(t.docs.text, '\nבברכה,');
  t.gdocs.stop();
});

test('Docs: an arrow key empties the typed characters', async () => {
  const t = setup();
  await t.type('\n' + T + 'ב', 1);
  await t.press('ArrowRight');
  await t.type('ב', 1);
  await settle();
  assert.equal(t.docs.text, '\n' + T + 'בב');
  t.gdocs.stop();
});

test('Docs: silent failure when Docs does not take Backspace: nothing changes', async () => {
  const t = setup({ ignoreBackspace: true });
  await t.type('\n' + T + 'בב', 1);
  await settle();
  assert.equal(t.docs.text, '\n' + T + 'בב');
  t.gdocs.stop();
});

test('Docs: when the paste is not taken, the shortcut is put back', async () => {
  const t = setup({ ignorePaste: true });
  await t.type('\n' + T + 'בב', 1);
  await sleep(1300);
  assert.equal(t.docs.text, '\n' + T + 'בב');
  t.gdocs.stop();
});

test('Docs: a paste that Docs takes without marking it is not doubled', async () => {
  const t = setup({ pasteNoSignal: true });
  await t.type('\n' + T + 'בב', 1);
  await sleep(1300);
  assert.equal(t.docs.text, '\nבברכה,');
  t.gdocs.stop();
});

test('Docs: without a caret to watch, fixed waits keep the order', async () => {
  const t = setup({ noCaret: true });
  await t.type('\n' + T + 'בב עוד', 0);
  await sleep(500);
  assert.equal(t.docs.text, '\nבברכה, עוד');
  t.gdocs.stop();
});

test('Docs: the switch off, or the extension off, means no replacement and no listeners', async () => {
  const t = setup();
  t.setState(makeState({ settings: { docs: false } }));
  assert.equal(t.gdocs.status(), 'off');
  assert.equal(t.gdocs.start(), false);
  assert.equal(t.win.count('keydown'), 0, 'listeners removed');
  await t.type('\n' + T + 'בב', 1);
  await settle();
  assert.equal(t.docs.text, '\n' + T + 'בב');
  t.setState(makeState({ active: false }));
  assert.equal(t.gdocs.status(), 'off');
  t.setState(makeState());
  assert.equal(t.gdocs.start(), true);
  await t.type('\n' + T + 'בב', 1);
  await settle();
  assert.equal(t.docs.text, '\n' + T + 'בב\nבברכה,');
  t.gdocs.stop();
});

test('Docs: the general engine stays off in a Docs editor embedded in another site, and in its typing frame', () => {
  const editor = { location: { hostname: 'docs.google.com', pathname: '/document/d/x/edit' } };
  const site = { get location() { throw new Error('cross-origin'); } };
  editor.top = site;
  editor.parent = site;
  const typing = { location: { hostname: '', pathname: 'blank' }, top: site, parent: editor };
  const other = { location: { hostname: 'example.com', pathname: '/document/x' }, top: site, parent: site };
  const make = (view) => createGdocs({ view, matcher: { findMatch, isBoundary }, template: {}, getState: () => makeState() });
  assert.equal(make(editor).ownsFrame, true, 'the embedded editor');
  assert.equal(make(typing).ownsFrame, true, 'its typing frame');
  assert.equal(make(editor).status(), 'not-docs', 'nothing is replaced there');
  assert.equal(make(other).ownsFrame, false, 'another site in a frame');
});

test('Docs: at most 64 keys are held; more than that, all of them go to Docs and none is lost', async () => {
  const t = setup({ pasteDelay: 400 });
  await t.type('\n' + T + 'בב', 1);
  const many = 'א'.repeat(70);
  await t.type(many, 0);
  await sleep(1300);
  assert.equal(Array.from(t.docs.text).filter((ch) => ch === 'א').length, 70);
  assert.equal(t.docs.text.includes('בברכה,'), true);
  t.gdocs.stop();
});

test('Docs: an error in the middle of a replacement: the shortcut comes back and the held keys still go to Docs', async () => {
  const t = setup({ pasteDelay: 40 });
  await t.type('\n' + T + 'בב', 1);
  FakeDataTransfer.broken = true;
  try {
    await t.type(' עוד', 0);
    await sleep(600);
  } finally {
    FakeDataTransfer.broken = false;
  }
  assert.equal(t.docs.text, '\n' + T + 'בב עוד');
  t.gdocs.stop();
});

test('Docs: a paste and a copy made while the paste is on its way keep their place in the order', async () => {
  const t = setup({ pasteDelay: 40 });
  await t.type('\n' + T + 'בב', 1);
  await t.type(' א', 0);
  t.clipboard('copy');
  t.clipboard('paste', 'מודבק');
  await t.type('ב', 0);
  await sleep(700);
  assert.equal(t.docs.text, '\nבברכה, אמודבקב');
  assert.deepEqual(t.docs.commands, ['copy@\nבברכה, א'], 'the copy ran after the text and the held key, before the paste');
  t.gdocs.stop();
});

test('Docs: the typed characters are not on any object the page can see', async () => {
  const t = setup();
  await t.type('\n' + T + 'ב', 1);
  const visible = JSON.stringify([Object.keys(t.view), Object.keys(t.win), Object.keys(t.doc), Object.keys(t.box)]);
  assert.equal(visible.includes(T + 'ב'), false);
  t.gdocs.stop();
});
