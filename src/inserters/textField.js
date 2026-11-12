// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Plain fields: <input> (text, search) and <textarea>.
 * The text goes in through the browser's own "insert text" command, so it is
 * always inserted as text and it enters the field's undo history (Ctrl+Z).
 */
import { LIMITS } from '../limits.js';

function insertAsText(el, text) {
  try {
    return el.ownerDocument.execCommand('insertText', false, text) === true;
  } catch (error) {
    return false;
  }
}

function announce(el, text) {
  const view = el.ownerDocument.defaultView;
  el.dispatchEvent(new view.InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
}

/* The text before the caret, or null when there is a selection or no caret. */
export function read(el) {
  let start;
  let end;
  try {
    start = el.selectionStart;
    end = el.selectionEnd;
  } catch (error) {
    return null;
  }
  if (typeof start !== 'number' || start !== end) return null;
  const value = el.value;
  const from = Math.max(0, start - LIMITS.BUFFER_MAX);
  return {
    text: value.slice(from, start),
    charBefore: () => (from > 0 ? value[from - 1] : null),
    caret: start
  };
}

/*
 * Replaces `abbrLength` characters that end `keep.length` characters before the caret.
 * Returns a token for restore(), or null when nothing can be undone by us.
 */
export function replace(el, snapshot, abbrLength, keep, text) {
  const end = snapshot.caret - keep.length;
  const start = end - abbrLength;
  if (start < 0) return null;
  // A one-line field cannot hold line breaks.
  const out = el.nodeName.toUpperCase() === 'TEXTAREA' ? text : text.replace(/\s*\n\s*/g, ' ');

  el.setSelectionRange(start, end);
  const inserted = insertAsText(el, out);
  if (!inserted) {
    // Fallback for fields where the command is not available. Ctrl+Z will not undo this one.
    el.setRangeText(out, start, end, 'end');
    announce(el, out);
  }
  if (el.value.slice(start, start + out.length) !== out) return null;

  const caret = start + out.length + keep.length;
  el.setSelectionRange(caret, caret);
  return { start, expect: out + keep };
}

/* Backspace right after a replacement: puts back what the user typed. */
export function restore(el, token, original) {
  const caret = el.selectionStart;
  if (caret !== el.selectionEnd || caret !== token.start + token.expect.length) return false;
  if (el.value.slice(token.start, caret) !== token.expect) return false;
  el.setSelectionRange(token.start, caret);
  if (!insertAsText(el, original)) {
    el.setRangeText(original, token.start, caret, 'end');
    announce(el, original);
  }
  return true;
}
