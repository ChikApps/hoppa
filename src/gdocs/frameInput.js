// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Edits sent to Google Docs through its hidden typing frame.
 *
 * Every function reports whether Docs really took the edit. If Docs did not
 * handle the event, nothing happened in the document, and the caller stops.
 * Text is always sent as plain text (text/plain). Never markup.
 * The events are made with the frame's own constructors, so Docs sees ordinary events of that frame.
 */
import { KEYS, PASTE_TRIMS_EDGE_SPACE } from './selectors.js';

/* Docs drops one space at each end of a pasted text: add one there, so the text arrives as it is. */
export function padForPaste(text) {
  if (!PASTE_TRIMS_EDGE_SPACE) return text;
  let out = text;
  if (out.startsWith(' ')) out = ' ' + out;
  if (out.endsWith(' ')) out = out + ' ';
  return out;
}

function keyEvent(win, type, init) {
  return new win.KeyboardEvent(type, { ...init, bubbles: true, cancelable: true, composed: true });
}

/* frame: the typing frame (an iframe element). Returns null when it cannot be used. */
export function createFrameInput(frame) {
  let win = null;
  let doc = null;
  try {
    win = frame.contentWindow;
    doc = frame.contentDocument;
  } catch (error) {
    return null;
  }
  if (!win || !doc || typeof win.KeyboardEvent !== 'function' || typeof win.ClipboardEvent !== 'function' || typeof win.DataTransfer !== 'function') return null;

  /* The element that has the focus in the frame, only when it is editable. */
  function target() {
    const el = doc.activeElement;
    return el && el.isContentEditable === true ? el : null;
  }

  /* One key. Docs marks the keys it handled. */
  function sendKey(el, init) {
    const event = keyEvent(win, 'keydown', init);
    el.dispatchEvent(event);
    return event.defaultPrevented === true;
  }

  function backspace(el) {
    return sendKey(el, KEYS.backspace);
  }

  function undo(el) {
    return sendKey(el, KEYS.undo);
  }

  /*
   * Inserts plain text in one step. Docs takes the paste and stops it from going
   * further, so a listener at the end of the way (the frame's window) never hears it.
   */
  function paste(el, text) {
    const data = new win.DataTransfer();
    data.setData('text/plain', padForPaste(text));
    const event = new win.ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true, composed: true });
    let reachedEnd = false;
    const listen = () => { reachedEnd = true; };
    win.addEventListener('paste', listen, false);
    try {
      el.dispatchEvent(event);
    } finally {
      win.removeEventListener('paste', listen, false);
    }
    return event.defaultPrevented === true || !reachedEnd;
  }

  /* Character by character. Only used to put a shortcut back when a paste failed. */
  function typeText(el, text) {
    for (const ch of text) {
      if (ch === '\n') {
        if (!sendKey(el, KEYS.enter)) return false;
        continue;
      }
      const code = ch.codePointAt(0);
      const event = keyEvent(win, 'keypress', { key: ch, charCode: code, keyCode: code, which: code });
      el.dispatchEvent(event);
      if (event.defaultPrevented !== true) return false;
    }
    return true;
  }

  /*
   * A key the user pressed while a paste was on its way, given to Docs now, in order.
   * k: { key, code, keyCode, ctrlKey, shiftKey, altKey, metaKey, text }
   * (text: the character it types, or null).
   */
  function replayKey(el, k) {
    const down = keyEvent(win, 'keydown', {
      key: k.key, code: k.code, keyCode: k.keyCode, which: k.keyCode,
      ctrlKey: k.ctrlKey, shiftKey: k.shiftKey, altKey: k.altKey, metaKey: k.metaKey
    });
    el.dispatchEvent(down);
    if (down.defaultPrevented || typeof k.text !== 'string') return;
    const code = k.text.codePointAt(0);
    el.dispatchEvent(keyEvent(win, 'keypress', { key: k.text, charCode: code, keyCode: code, which: code, shiftKey: k.shiftKey }));
  }

  /*
   * A paste the user made while a replacement was on its way, given to Docs now, with the
   * same data it had (the user's own clipboard, as the browser gave it). Nothing is added.
   */
  function pasteContent(el, content) {
    const data = new win.DataTransfer();
    for (const [type, value] of content.strings) data.setData(type, value);
    for (const file of content.files) data.items.add(file);
    el.dispatchEvent(new win.ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true, composed: true }));
  }

  /* A copy or cut the user made in that moment: the browser's own command, so Docs fills the clipboard as usual. */
  function clipboardCommand(kind) {
    try {
      return doc.execCommand(kind === 'cut' ? 'cut' : 'copy');
    } catch (error) {
      return false;
    }
  }

  return { win, doc, target, backspace, undo, paste, typeText, replayKey, pasteContent, clipboardCommand };
}
