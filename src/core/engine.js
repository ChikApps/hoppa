// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * The replacement engine. It runs in the content script of every page, and
 * directly inside the extension's welcome page (content scripts do not run there).
 *
 * Security rules that are enforced here:
 * - Only real typing counts. A page can create "input" events that look real
 *   (the browser marks the events of its own editing commands as trusted), so
 *   every character must also match a trusted key press with the same key.
 *   A page cannot create a trusted key press.
 * - A character counts when the browser reports that it was inserted, or, in
 *   editors that insert text by themselves, when it really is right before the
 *   caret on the next key event.
 * - A replacement needs both: the typed characters end with the shortcut, and
 *   the text before the caret in the field ends with it too.
 * - Nothing is kept beyond a short buffer in memory, and nothing is logged.
 * - Any error stops the engine on this page. It never disturbs the typing.
 */
import { LIMITS } from '../limits.js';
import { findMatch } from './matcher.js';
import { TypedBuffer } from './typedBuffer.js';
import { fieldKind, isSensitive, hasHiddenText, PasswordMemory } from './sensitive.js';
import { inserterFor } from '../inserters/index.js';

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock', 'Fn', 'FnLock', 'Hyper', 'Super', 'Symbol', 'SymbolLock']);
const NO_TEXT_KEYS = new Set(['Process', 'Dead', 'Unidentified']);
/*
 * Edits after which a new word may start, and the real key each one needs.
 * An edit counts as the user's only when the key that was really pressed makes
 * that edit: a page that swallows a letter and deletes or inserts something in
 * its place does not get a start of a word.
 */
const letter = (k, code) => k.code === code;
const command = (k) => k.ctrlKey || k.metaKey;
const EDIT_KEYS = new Map([
  ['insertParagraph', (k) => k.key === 'Enter'],
  ['insertLineBreak', (k) => k.key === 'Enter'],
  ['deleteContentBackward', (k) => k.key === 'Backspace'],
  ['deleteWordBackward', (k) => k.key === 'Backspace'],
  ['deleteSoftLineBackward', (k) => k.key === 'Backspace'],
  ['deleteHardLineBackward', (k) => k.key === 'Backspace'],
  ['deleteContentForward', (k) => k.key === 'Delete'],
  ['deleteWordForward', (k) => k.key === 'Delete'],
  ['deleteSoftLineForward', (k) => k.key === 'Delete'],
  ['deleteHardLineForward', (k) => k.key === 'Delete'],
  ['deleteByCut', (k) => k.key === 'Cut' || (command(k) && letter(k, 'KeyX')) || (k.shiftKey && k.key === 'Delete')],
  ['historyUndo', (k) => k.key === 'Undo' || (command(k) && letter(k, 'KeyZ') && !k.shiftKey)],
  ['historyRedo', (k) => k.key === 'Redo' || (command(k) && (letter(k, 'KeyY') || (letter(k, 'KeyZ') && k.shiftKey)))],
  ['insertFromPaste', (k) => k.key === 'Paste' || (command(k) && letter(k, 'KeyV')) || (k.shiftKey && k.key === 'Insert')]
]);

function editByKey(inputType, key) {
  const fits = EDIT_KEYS.get(inputType);
  return key !== null && typeof fits === 'function' && fits(key);
}
const RESET_EVENTS = ['mousedown', 'focusin', 'focusout', 'paste', 'cut', 'drop', 'compositionstart', 'compositionend'];

function eventTarget(event) {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : null;
  return path && path.length > 0 ? path[0] : event.target;
}

/* The outermost editable element around a node (the editing host). */
function editingHost(el) {
  let host = el;
  while (host.parentElement && host.parentElement.isContentEditable) host = host.parentElement;
  return host;
}

function resolveField(target) {
  if (!target || target.nodeType !== 1) return null;
  const kind = fieldKind(target);
  if (kind === null) return null;
  return kind === 'rich' ? { el: editingHost(target), kind } : { el: target, kind };
}

function isOneCharacter(key) {
  return typeof key === 'string' && key.length > 0 && key.length <= 2 && Array.from(key).length === 1;
}

function sameCharacter(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const plain = (value) => (value === ' ' ? ' ' : value);
  return plain(a) === plain(b);
}

/*
 * view: the window to listen on.
 * options.getState(): the current state from buildState() (active, lookup, number, render).
 * options.afterExpand(info): optional, called after a successful replacement
 *   with { el, kind, abbr, text }. Used by site adapters and by the welcome page.
 */
export function createEngine(view, options) {
  const doc = view.document;
  const buffer = new TypedBuffer(LIMITS.BUFFER_MAX);
  const passwords = new PasswordMemory();
  let pendingKey = null;
  let pendingDelete = false;
  let last = null;
  let busy = false;
  let dead = false;
  // The real key pressed since the last input event ({ key, code, ctrlKey, metaKey, shiftKey }), or null.
  let realKey = null;
  let deferred = null;

  /* A reset caused by a made-up event: the buffer is emptied, but its start is not a start of a word. */
  function resetFromPage() {
    if (deferred !== null) {
      view.clearTimeout(deferred.timer);
      deferred = null;
    }
    buffer.clear(false);
    pendingKey = null;
    pendingDelete = false;
    last = null;
  }

  function reset() {
    realKey = null;
    if (deferred !== null) {
      view.clearTimeout(deferred.timer);
      deferred = null;
    }
    buffer.clear();
    pendingKey = null;
    pendingDelete = false;
    last = null;
  }

  function guarded(handler) {
    return (event) => {
      if (dead) return;
      try {
        handler(event);
      } catch (error) {
        dead = true;
        busy = false;
        reset();
      }
    };
  }

  function usableField(event) {
    const state = options.getState();
    if (!state || state.active !== true) return null;
    const field = resolveField(eventTarget(event));
    if (!field) return null;
    passwords.note(field.el);
    if (isSensitive(field.el, passwords)) return null;
    return { field, state };
  }

  function expand(field, state, enter) {
    const inserter = inserterFor(field.kind);
    const snapshot = inserter.read(field.el);
    if (!snapshot) return false;
    const match = findMatch(snapshot.text, {
      charBefore: snapshot.charBefore,
      lookup: state.lookup,
      number: state.number,
      enter
    });
    if (!match) return false;

    const typed = snapshot.text.slice(match.start);
    if (!buffer.confirms(field.el, typed)) return false;
    if (hasHiddenText(field.el, view)) return false;

    const text = state.render(match.entry, new Date());
    if (typeof text !== 'string' || text.length === 0) return false;

    let token = null;
    busy = true;
    try {
      token = inserter.replace(field.el, snapshot, match.abbr.length, match.keep, text);
    } finally {
      busy = false;
    }
    buffer.clear();
    if (!token) return false;
    last = { el: field.el, kind: field.kind, token, original: typed };
    if (typeof options.afterExpand === 'function') {
      options.afterExpand({ el: field.el, kind: field.kind, abbr: match.abbr, text });
    }
    return true;
  }

  /*
   * In a plain field the replacement happens at once. In a rich editor it
   * happens right after the editor finished handling the key by itself, so
   * the editor sees the replacement as a separate edit and keeps its own
   * state (for example the space that was just typed) in order.
   */
  /* Runs a waiting replacement now. Called by the timer, and before the next key is handled. */
  function runDeferred() {
    if (deferred === null) return;
    const field = deferred.field;
    view.clearTimeout(deferred.timer);
    deferred = null;
    const current = options.getState();
    if (current && current.active === true) expand(field, current, false);
  }

  function expandSoon(field, state) {
    if (field.kind !== 'rich') {
      expand(field, state, false);
      return;
    }
    if (deferred !== null) view.clearTimeout(deferred.timer);
    deferred = { field, timer: view.setTimeout(guarded(runDeferred), 0) };
  }

  /*
   * Editors that insert the typed character by themselves do not let the
   * browser report it. For them the key press is confirmed here, on the next
   * key event: the character counts only if it really is right before the caret.
   */
  function confirmPending(event) {
    if (pendingKey === null && !pendingDelete) return;
    const key = pendingKey;
    const deleting = pendingDelete;
    pendingKey = null;
    pendingDelete = false;
    const usable = usableField(event);
    if (!usable) {
      reset();
      return;
    }
    const field = usable.field;
    if (deleting) {
      buffer.pop(field.el);
      return;
    }
    const snapshot = inserterFor(field.kind).read(field.el);
    const text = snapshot ? snapshot.text : '';
    if (text.length === 0 || !sameCharacter(text[text.length - 1], key)) {
      buffer.clear();
      return;
    }
    buffer.push(field.el, key);
    expandSoon(field, usable.state);
  }

  function undoLast(event, replaced) {
    const field = resolveField(eventTarget(event));
    if (!field || field.el !== replaced.el) return false;
    let done = false;
    busy = true;
    try {
      done = inserterFor(replaced.kind).restore(replaced.el, replaced.token, replaced.original);
    } finally {
      busy = false;
    }
    return done;
  }

  function onKeyDown(event) {
    if (event.isTrusted !== true) return;
    const key = event.key;
    if (MODIFIER_KEYS.has(key)) return;
    realKey = { key, code: event.code, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey };
    // The editor finished handling the previous key: a replacement that waited for that runs before this key.
    runDeferred();
    confirmPending(event);

    const altGraph = typeof event.getModifierState === 'function' && event.getModifierState('AltGraph');
    const combination = !altGraph && (event.ctrlKey || event.metaKey || event.altKey);

    if (key === 'Backspace' && !combination && !event.shiftKey && !event.isComposing) {
      const replaced = last;
      last = null;
      pendingKey = null;
      if (replaced && undoLast(event, replaced)) {
        // The shortcut is back as it was typed. It is not replaced again until it is typed again.
        event.preventDefault();
        event.stopPropagation();
        buffer.clear();
        pendingDelete = false;
        return;
      }
      pendingDelete = true;
      return;
    }

    last = null;
    pendingDelete = false;

    if (event.isComposing || NO_TEXT_KEYS.has(key)) {
      pendingKey = null;
      buffer.clear();
      return;
    }

    if (key === 'Enter' && !combination) {
      pendingKey = null;
      const usable = usableField(event);
      if (usable) expand(usable.field, usable.state, true);
      buffer.clear();
      last = null;
      return;
    }

    if (isOneCharacter(key) && !combination) {
      pendingKey = key;
      return;
    }

    // Arrows, Home, End, Tab, Escape, Delete, function keys and key combinations: the caret may have moved.
    pendingKey = null;
    buffer.clear();
  }

  function onInput(event) {
    if (busy) return;
    const key = pendingKey;
    const deleting = pendingDelete;
    const afterRealKey = realKey;
    pendingKey = null;
    pendingDelete = false;
    realKey = null;

    if (event.isTrusted !== true) {
      resetFromPage();
      return;
    }
    if (event.isComposing) {
      reset();
      return;
    }
    const usable = usableField(event);
    if (!usable) {
      reset();
      return;
    }
    const field = usable.field;

    if (event.inputType === 'insertText' && key !== null && sameCharacter(event.data, key)) {
      buffer.push(field.el, key);
      expandSoon(field, usable.state);
      return;
    }
    if (event.inputType === 'deleteContentBackward' && deleting) {
      buffer.pop(field.el);
      return;
    }
    // A new line, a delete, undo, or a paste, made by the key the user pressed: a word may start here.
    // Anything else (text the page inserted, an edit that does not fit the key, a drop, autocorrect) is not a start of a word.
    if (editByKey(event.inputType, afterRealKey)) buffer.clear();
    else buffer.clear(false);
  }

  function onKeyUp(event) {
    if (event.isTrusted !== true || MODIFIER_KEYS.has(event.key)) return;
    confirmPending(event);
  }

  function onReset(event) {
    if (event.isTrusted !== true) {
      resetFromPage();
      return;
    }
    reset();
    if (event.type === 'mousedown' || event.type === 'focusin') {
      const target = eventTarget(event);
      const root = target && typeof target.getRootNode === 'function' ? target.getRootNode() : doc;
      passwords.scan(root);
      if (root !== doc) passwords.scan(doc);
    }
  }

  function onHidden(event) {
    if (doc.visibilityState !== 'hidden') return;
    if (event.isTrusted === true) reset();
    else resetFromPage();
  }

  function onLeave(event) {
    if (event.isTrusted === true) reset();
    else resetFromPage();
  }

  const listeners = [
    [view, 'keydown', guarded(onKeyDown)],
    [view, 'input', guarded(onInput)],
    [view, 'keyup', guarded(onKeyUp)],
    [view, 'pagehide', guarded(onLeave)],
    [view, 'blur', guarded(onLeave)],
    [doc, 'visibilitychange', guarded(onHidden)]
  ];
  for (const name of RESET_EVENTS) listeners.push([view, name, guarded(onReset)]);

  // The capture phase: the engine sees the event before the page does.
  for (const [target, name, handler] of listeners) target.addEventListener(name, handler, true);

  return {
    reset,
    destroy() {
      for (const [target, name, handler] of listeners) target.removeEventListener(name, handler, true);
      reset();
      dead = true;
    }
  };
}
