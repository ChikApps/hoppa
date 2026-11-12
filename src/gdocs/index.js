// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Google Docs: a separate, isolated module.
 *
 * The document is drawn on a canvas, so its text cannot be read. Typing goes
 * through a hidden frame of the same origin (see selectors.js). This module
 * runs in the top page of a document only, and:
 * - listens to real key presses in that frame and keeps the last typed
 *   characters in memory (never written anywhere);
 * - when they end with a shortcut, deletes it with Backspace key events and
 *   pastes the text in its place, as plain text, in one step;
 * - Docs applies the paste a moment later. Keys the user presses in that moment
 *   are held and given to Docs right after the paste is in, in the same order;
 * - Backspace right after a replacement undoes it (two undo steps of Docs);
 * - any click, arrow, End, Tab, key combination or paste empties the characters,
 *   because the caret may have moved. After that a shortcut counts only after a
 *   space or a new line that the user really typed (or after Home).
 *
 * Silent failure: when Docs is not recognized, or Docs does not take the first
 * Backspace, nothing is changed. A shortcut is never left deleted: if the text
 * could not be pasted, the shortcut is put back.
 *
 * On the other editors of the Docs family (Sheets, Slides, Drawings) the general
 * engine does not start (ownsFrame), and nothing is replaced.
 * It depends only on the matcher (received as an argument) and on the state.
 * No other module depends on it. Interface: see README.md in this folder.
 */
import { LIMITS } from '../limits.js';
import { DOCS_HOST, EDITOR_PATHS, DOCUMENT_PATH, TYPING_FRAME_SELECTOR, CARET_SELECTOR, CARET_BAR_SELECTOR, PAGE_CANVAS_SELECTOR, BLANK_LEVEL, TIMING, HELD_MAX } from './selectors.js';
import { createFrameInput } from './frameInput.js';

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock', 'Fn', 'FnLock', 'Hyper', 'Super', 'Symbol', 'SymbolLock']);
const NO_TEXT_KEYS = new Set(['Process', 'Dead', 'Unidentified']);
/*
 * Copy, cut and paste keys are not held: the browser needs the real key to reach the clipboard.
 * The copy, cut or paste that the key causes is held instead, in its place in the order (see onClipboard).
 */
const CLIPBOARD_CODES = new Set(['KeyC', 'KeyV', 'KeyX']);
const CLIPBOARD_EVENTS = ['copy', 'cut', 'paste'];
/* Edits that leave the caret where Docs wants: the typed characters no longer describe the text before it. */
const FRAME_RESET_EVENTS = ['drop', 'compositionstart', 'compositionend', 'blur'];
const PAGE_RESET_EVENTS = ['mousedown', 'pagehide'];

function topLocation(view) {
  try {
    const location = view.top.location;
    return { host: location.hostname, path: location.pathname };
  } catch (error) {
    // A frame from another origin is not part of the editor itself.
    return null;
  }
}

function isTop(view) {
  try {
    return view.top === view;
  } catch (error) {
    return false;
  }
}

/*
 * The frame itself, or a frame of the same origin around it, is an editor of the Docs family.
 * This holds also when the editor is embedded in another site (the top page is then another site).
 */
function frameIsEditor(view) {
  let current = view;
  for (let depth = 0; depth < 8 && current; depth++) {
    try {
      const location = current.location;
      if (location.hostname === DOCS_HOST && EDITOR_PATHS.some((path) => location.pathname.startsWith(path))) return true;
      const parent = current.parent;
      if (!parent || parent === current) return false;
      current = parent;
    } catch (error) {
      // A frame of another origin: the editor is not around this frame.
      return false;
    }
  }
  return false;
}

function isClipboardKey(k) {
  return k.combination ? CLIPBOARD_CODES.has(k.code) : (k.shiftKey && (k.key === 'Insert' || k.key === 'Delete'));
}

/* What a held paste carried: every kind of data in it, as it was. Memory only, given to Docs and dropped. */
function clipboardContent(event) {
  const content = { strings: [], files: [] };
  const data = event.clipboardData;
  if (!data) return content;
  for (const item of Array.from(data.items || [])) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) content.files.push(file);
    }
  }
  for (const type of Array.from(data.types || [])) {
    if (type !== 'Files') content.strings.push([type, data.getData(type)]);
  }
  return content;
}

function isOneCharacter(key) {
  return typeof key === 'string' && key.length > 0 && key.length <= 2 && Array.from(key).length === 1;
}

/* What is kept of a key press: enough to give it to Docs again. Never stored anywhere else. */
function describe(event) {
  const altGraph = typeof event.getModifierState === 'function' && event.getModifierState('AltGraph');
  const combination = !altGraph && (event.ctrlKey || event.metaKey || event.altKey);
  return {
    key: event.key,
    code: event.code,
    keyCode: event.keyCode,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    combination,
    composing: event.isComposing === true,
    text: isOneCharacter(event.key) && !combination ? event.key : null
  };
}

/*
 * deps: { view, matcher: { findMatch, isBoundary }, template, getState }
 * Returns { ownsFrame, status(), start(), stop() }.
 */
export function createGdocs(deps) {
  const view = deps.view;
  const matcher = deps.matcher || {};
  const top = topLocation(view);
  const inEditor = top !== null && top.host === DOCS_HOST && EDITOR_PATHS.some((path) => top.path.startsWith(path));
  // The general engine never runs inside an editor of the Docs family, also when it is embedded in another site.
  const ownsFrame = inEditor || frameIsEditor(view);
  // Only the top page of a document handles it. The typing frame's own copy of the script stays idle.
  const inDocument = inEditor && top.path.startsWith(DOCUMENT_PATH) && isTop(view);

  let attached = null;
  let watcher = null;
  let chars = '';
  // Whether the characters start at a known start of a word (a new line, Home, or a replacement that ended with a space).
  let wordStart = false;
  let deferred = null;
  let last = null;
  let busy = false;
  let dead = false;
  // While a paste is on its way: { queue: [keys and clipboard actions], open, interrupted }.
  let holding = null;
  // stop() was called while a replacement was on its way.
  let stopping = false;

  function currentState() {
    const state = deps.getState();
    if (!state || state.active !== true || !state.settings || state.settings.docs !== true) return null;
    return state;
  }

  function findFrame() {
    try {
      return view.document.querySelector(TYPING_FRAME_SELECTOR);
    } catch (error) {
      return null;
    }
  }

  function status() {
    if (!inDocument) return 'not-docs';
    if (!currentState()) return 'off';
    if (typeof matcher.findMatch !== 'function') return 'not-recognized';
    return findFrame() ? 'ready' : 'not-recognized';
  }

  function reset(atWordStart) {
    if (deferred !== null) {
      view.clearTimeout(deferred);
      deferred = null;
    }
    chars = '';
    wordStart = atWordStart === true;
    last = null;
    if (holding !== null) holding.interrupted = true;
  }

  function fail() {
    dead = true;
    busy = false;
    stop();
  }

  function guarded(handler) {
    return (event) => {
      if (dead || busy) return;
      try {
        handler(event);
      } catch (error) {
        // Any error stops the module on this page. It never disturbs the typing.
        fail();
      }
    };
  }

  /* While the module itself sends events to Docs, its own listeners ignore them. */
  function sending(fn) {
    busy = true;
    try {
      return fn();
    } finally {
      busy = false;
    }
  }

  /* --- Waiting for Docs: the caret it draws moves when the text changes. --- */

  function caretSignature() {
    try {
      const carets = view.document.querySelectorAll(CARET_SELECTOR);
      if (carets.length === 0) return null;
      return Array.from(carets, (caret) => {
        const box = caret.getBoundingClientRect();
        return Math.round(box.left) + ',' + Math.round(box.top) + ',' + Math.round(box.height);
      }).join(';');
    } catch (error) {
      return null;
    }
  }

  /*
   * True only when the caret's line is empty on the page (so the caret is at the start of a line).
   * Any doubt (no caret, no canvas, a canvas that cannot be read, a coloured page) gives false.
   */
  function caretLineIsEmpty() {
    try {
      const bar = view.document.querySelector(CARET_BAR_SELECTOR);
      if (!bar) return false;
      const caret = bar.getBoundingClientRect();
      if (!(caret.height > 4)) return false;
      const canvas = Array.from(view.document.querySelectorAll(PAGE_CANVAS_SELECTOR)).find((item) => {
        const box = item.getBoundingClientRect();
        return box.width > 0 && caret.top >= box.top && caret.bottom <= box.bottom && caret.left >= box.left && caret.left <= box.right;
      });
      if (!canvas) return false;
      const box = canvas.getBoundingClientRect();
      const scaleY = canvas.height / box.height;
      const top = Math.round((caret.top - box.top + caret.height * 0.2) * scaleY);
      const height = Math.max(1, Math.round(caret.height * 0.6 * scaleY));
      const pixels = canvas.getContext('2d').getImageData(0, top, canvas.width, height).data;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] < BLANK_LEVEL || pixels[i + 1] < BLANK_LEVEL || pixels[i + 2] < BLANK_LEVEL) return false;
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  function nextFrame() {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      const timer = view.setTimeout(finish, 50);
      if (typeof view.requestAnimationFrame === 'function') {
        view.requestAnimationFrame(() => {
          view.clearTimeout(timer);
          finish();
        });
      }
    });
  }

  function wait(ms) {
    return new Promise((resolve) => view.setTimeout(resolve, ms));
  }

  /* After the deletion: until the caret stops moving. Returns where it stopped. */
  async function settled() {
    if (caretSignature() === null) {
      await wait(TIMING.blindSettleMs);
      return null;
    }
    const until = Date.now() + TIMING.settleMaxMs;
    await nextFrame();
    await nextFrame();
    let previous = caretSignature();
    while (Date.now() < until) {
      await nextFrame();
      const now = caretSignature();
      if (now === previous) break;
      previous = now;
    }
    return previous;
  }

  /* After the paste: until the caret moves away from where it was. */
  async function pasteArrived(before) {
    if (before === null) {
      await wait(TIMING.blindPasteMs);
      return;
    }
    const until = Date.now() + TIMING.pasteMaxMs;
    while (Date.now() < until) {
      await nextFrame();
      if (caretSignature() !== before) break;
    }
    await nextFrame();
  }

  /* --- The replacement --- */

  /* Deletes the typed shortcut. Returns true when Docs took every Backspace. */
  function deleteTyped(input, el, typed) {
    const count = Array.from(typed).length;
    return sending(() => {
      // Docs must take the first Backspace. If it does not, nothing changed: stop here.
      if (!input.backspace(el)) return false;
      for (let deleted = 1; deleted < count; deleted++) {
        if (!input.backspace(el)) {
          // Put back what was deleted, and stop.
          const removed = Array.from(typed).slice(count - deleted).join('');
          if (!input.paste(el, removed)) input.typeText(el, removed);
          return false;
        }
      }
      return true;
    });
  }

  async function finishReplace(input, el, typed, insert) {
    let done = false;
    // Whether something was already sent in place of the shortcut (the text, or the shortcut itself).
    let sent = false;
    try {
      const before = await settled();
      let pasted = sending(() => input.paste(el, insert));
      sent = true;
      await pasteArrived(before);
      // Docs did not mark the paste as taken: it counts only if the caret shows that the text went in.
      if (!pasted && before !== null && caretSignature() !== before) pasted = true;
      if (!pasted) {
        // The text did not go in: the shortcut is never left deleted.
        sending(() => {
          if (!input.paste(el, typed)) input.typeText(el, typed);
        });
        await pasteArrived(before);
      }
      done = pasted;
    } catch (error) {
      dead = true;
      if (!sent) {
        // An error before anything was sent: the shortcut is put back, key by key.
        try {
          sending(() => input.typeText(el, typed));
        } catch (ignored) { /* nothing more can be done */ }
      }
    }
    const interrupted = holding !== null && holding.interrupted;
    const lastChar = insert[insert.length - 1];
    const queue = holding !== null ? holding.queue : [];
    holding = null;
    reset(done && !interrupted && typeof matcher.isBoundary === 'function' && matcher.isBoundary(lastChar));
    if (done && !interrupted) last = { original: typed };
    release(queue);
    if ((dead || stopping) && holding === null) stop();
  }

  /* A paste the user made during a replacement, given to Docs in its place; the keys after it wait for it. */
  async function finishHeldPaste(item) {
    try {
      const before = await settled();
      deliver(item, false);
      await pasteArrived(before);
    } catch (error) {
      dead = true;
    }
    const queue = holding !== null ? holding.queue : [];
    holding = null;
    reset(false);
    release(queue);
    if ((dead || stopping) && holding === null) stop();
  }

  /* Starts a replacement when the typed characters end with a shortcut. Returns true when it started. */
  function expand(enter) {
    if (attached === null || holding !== null) return false;
    const state = currentState();
    if (!state) return false;
    const match = matcher.findMatch(chars, {
      charBefore: () => (wordStart ? null : 'x'),
      lookup: state.lookup,
      number: state.number,
      enter
    });
    if (!match) return false;
    const rendered = state.render(match.entry, new Date());
    if (typeof rendered !== 'string' || rendered.length === 0) return false;
    const input = attached.input;
    const el = input.target();
    if (!el) return false;

    const typed = chars.slice(match.start);
    const insert = (rendered + match.keep).replace(/\r\n?/g, '\n');
    if (!deleteTyped(input, el, typed)) {
      reset(false);
      return false;
    }
    holding = { queue: [], open: true, interrupted: false };
    finishReplace(input, el, typed, insert);
    return true;
  }

  function runDeferred() {
    if (deferred === null) return;
    view.clearTimeout(deferred);
    deferred = null;
    expand(false);
  }

  /* Backspace right after a replacement: Docs undoes the paste, then the deletion. */
  function undoLast(replaced) {
    const input = attached.input;
    const el = input.target();
    if (!el) return false;
    return sending(() => {
      if (!input.undo(el)) return false;
      if (!input.undo(el)) {
        // The text is gone but the shortcut did not come back: put it back.
        if (!input.paste(el, replaced.original)) input.typeText(el, replaced.original);
      }
      return true;
    });
  }

  /* Gives a held key or clipboard action to Docs. Live keys need nothing: Docs gets the event itself. */
  function deliver(item, live) {
    if (live || attached === null) return;
    const input = attached.input;
    const el = input.target();
    if (!el) return;
    sending(() => {
      if (item.clip === 'paste') input.pasteContent(el, item.content);
      else if (item.clip) input.clipboardCommand(item.clip);
      else input.replayKey(el, item);
    });
  }

  /* Gives held items to Docs as they are, without looking at them (after an error, or when the queue is full). */
  function deliverAll(queue) {
    while (queue.length > 0) {
      const item = queue.shift();
      try {
        deliver(item, false);
      } catch (error) { /* the next one may still go in */ }
    }
  }

  /*
   * Holds a key (or a clipboard action) while a paste is on its way. Returns false when it
   * was not held: the queue is full (64), so everything held goes to Docs now and the rest
   * of this replacement is not held any more. A key is never thrown away.
   */
  function hold(item, event) {
    if (holding.open && holding.queue.length < HELD_MAX) {
      if (event) block(event);
      holding.queue.push(item);
      return true;
    }
    if (holding.open) {
      holding.open = false;
      holding.interrupted = true;
      deliverAll(holding.queue);
    }
    return false;
  }

  function block(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  /*
   * One key press, live (event) or held earlier (event = null).
   * Returns true when the key was held for later.
   */
  function handleKey(k, event) {
    const live = event !== null;
    // Docs finished handling the previous key: a replacement that waited for that runs before this key.
    runDeferred();
    if (holding !== null) {
      if (hold(k, event)) return true;
      deliver(k, live);
      reset(false);
      return false;
    }

    if (k.key === 'Backspace' && !k.combination && !k.shiftKey && !k.composing) {
      const replaced = last;
      last = null;
      if (replaced && undoLast(replaced)) {
        // The shortcut is back as it was typed. It is not replaced again until it is typed again.
        if (live) block(event);
        reset(false);
        return false;
      }
      chars = chars.slice(0, -1);
      deliver(k, live);
      return false;
    }
    last = null;

    if (k.composing || NO_TEXT_KEYS.has(k.key)) {
      reset(false);
      deliver(k, live);
      return false;
    }
    if (k.key === 'Enter' && !k.combination) {
      if (expand(true)) {
        // The new line goes in right after the text.
        return hold(k, event);
      }
      deliver(k, live);
      // A new line: what comes next starts a word.
      reset(true);
      return false;
    }
    if (k.key === 'Home') {
      deliver(k, live);
      // The start of the line (or of the document with Ctrl): a start of a word.
      reset(true);
      return false;
    }
    if (k.text !== null) {
      // The first key after a click or an arrow: on an empty line the caret is at the start of a line.
      if (live && chars.length === 0 && !wordStart) wordStart = caretLineIsEmpty();
      deliver(k, live);
      chars = (chars + k.text).slice(-LIMITS.BUFFER_MAX);
      // Right after Docs handled this key, and before the next one.
      if (deferred !== null) view.clearTimeout(deferred);
      deferred = view.setTimeout(guarded(runDeferred), 0);
      return false;
    }
    // Arrows, End, Tab, Escape, Delete, Page keys, function keys and key combinations: the caret may have moved.
    deliver(k, live);
    reset(false);
    return false;
  }

  /* Gives the held keys to Docs, in order. A key may start a new replacement: the rest waits for it. */
  function release(queue) {
    try {
      while (queue.length > 0) {
        if (dead) {
          // The module stopped: the keys still go to Docs, as they are.
          deliverAll(queue);
          return;
        }
        const item = queue.shift();
        if (item.clip === 'paste') {
          // Docs applies this paste a moment later too: what comes after it waits for it.
          holding = { queue: queue.splice(0), open: true, interrupted: true };
          finishHeldPaste(item);
          return;
        }
        if (item.clip) {
          deliver(item, false);
          if (item.clip !== 'copy') reset(false);
          continue;
        }
        if (handleKey(item, null)) {
          holding.queue.push(...queue);
          return;
        }
      }
    } catch (error) {
      fail();
      deliverAll(queue);
    }
  }

  function inTypingBox(event) {
    const el = attached && attached.input.target();
    const target = event.target;
    return Boolean(el) && (target === el || (typeof el.contains === 'function' && el.contains(target)));
  }

  function onKeyDown(event) {
    if (event.isTrusted !== true) return;
    if (MODIFIER_KEYS.has(event.key)) return;
    const k = describe(event);
    if (holding !== null) {
      // The key itself goes to Docs: the copy, cut or paste it causes is held (onClipboard).
      if (isClipboardKey(k)) return;
      if (!hold(k, event)) reset(false);
      return;
    }
    if (!inTypingBox(event)) {
      reset(false);
      return;
    }
    handleKey(k, event);
  }

  function onReset() {
    reset(false);
  }

  /* A real copy, cut or paste while a paste is on its way waits in the queue, in its place. */
  function onClipboard(event) {
    if (holding !== null && holding.open && event.isTrusted === true) {
      const item = event.type === 'paste' ? { clip: 'paste', content: clipboardContent(event) } : { clip: event.type };
      if (hold(item, event)) return;
    }
    if (event.type !== 'copy') reset(false);
  }

  function onHidden() {
    if (view.document.visibilityState === 'hidden') reset(false);
  }

  function detach() {
    if (attached === null) return;
    for (const [target, name, handler] of attached.listeners) {
      try {
        target.removeEventListener(name, handler, true);
      } catch (error) { /* the frame is gone */ }
    }
    attached = null;
    reset(false);
  }

  function attach(frame) {
    const input = createFrameInput(frame);
    if (!input) return;
    // The frame's window comes first on the way of every event, before the listeners of Docs.
    const listeners = [[input.win, 'keydown', guarded(onKeyDown)]];
    for (const name of FRAME_RESET_EVENTS) listeners.push([input.win, name, guarded(onReset)]);
    for (const name of CLIPBOARD_EVENTS) listeners.push([input.win, name, guarded(onClipboard)]);
    for (const name of PAGE_RESET_EVENTS) listeners.push([view, name, guarded(onReset)]);
    listeners.push([view.document, 'visibilitychange', guarded(onHidden)]);
    for (const [target, name, handler] of listeners) target.addEventListener(name, handler, true);
    attached = { frame, doc: input.doc, win: input.win, root: input.doc.documentElement, input, listeners };
    reset(false);
  }

  /* Docs may build a new typing frame (for example after it reconnects): follow it. */
  function follow() {
    if (dead || holding !== null) return;
    try {
      if (!currentState()) {
        detach();
        return;
      }
      const frame = findFrame();
      if (!frame) {
        detach();
        return;
      }
      let doc = null;
      try {
        doc = frame.contentDocument;
      } catch (error) {
        doc = null;
      }
      let win = null;
      let root = null;
      try {
        win = frame.contentWindow;
        root = doc ? doc.documentElement : null;
      } catch (error) {
        win = null;
      }
      // Docs may replace the frame, its window, or rewrite its document (which drops listeners): attach again.
      if (attached !== null && attached.frame === frame && attached.doc === doc && attached.win === win && attached.root === root) return;
      detach();
      attach(frame);
    } catch (error) {
      fail();
    }
  }

  function start() {
    const now = status();
    if (dead || now === 'not-docs' || now === 'off') {
      stop();
      return false;
    }
    stopping = false;
    if (watcher === null) watcher = view.setInterval(follow, TIMING.frameCheckMs);
    follow();
    return attached !== null;
  }

  function stop() {
    if (watcher !== null) {
      view.clearInterval(watcher);
      watcher = null;
    }
    if (holding !== null) {
      // A replacement is still on its way: it finishes, gives back the held keys, and then the module stops.
      stopping = true;
      return;
    }
    stopping = false;
    detach();
  }

  return { ownsFrame, status, start, stop };
}
