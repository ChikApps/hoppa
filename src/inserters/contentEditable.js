// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Rich editors (an editable area, as in webmail and forums).
 * Only the browser's "insert text" command is used, so the text is always
 * inserted as text. Nothing else is written to the page.
 */
import { LIMITS } from '../limits.js';

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BODY', 'DD', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGURE', 'FOOTER',
  'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION',
  'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'UL'
]);
const STEP_LIMIT = LIMITS.TEXT_MAX + 16;
const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

function selectionOf(el) {
  const root = typeof el.getRootNode === 'function' ? el.getRootNode() : null;
  if (root && typeof root.getSelection === 'function') return root.getSelection();
  return el.ownerDocument.defaultView.getSelection();
}

function plain(text) {
  return text.replace(/ /g, ' ');
}

function oneLineBreaks(text) {
  return plain(text).replace(/\r/g, '').replace(/\n+/g, '\n');
}

function lastCharOf(node) {
  let current = node;
  while (current) {
    if (current.nodeType === TEXT_NODE) {
      return current.data.length > 0 ? current.data[current.data.length - 1] : null;
    }
    if (current.nodeType !== ELEMENT_NODE) return null;
    if (current.nodeName === 'BR' || BLOCK_TAGS.has(current.nodeName)) return '\n';
    current = current.lastChild;
  }
  return null;
}

/* The character right before a text node, inside the same line. A new line or a new block counts as a line break. */
function charBeforeNode(node, host) {
  let current = node;
  while (current && current !== host) {
    let sibling = current.previousSibling;
    while (sibling) {
      const found = lastCharOf(sibling);
      if (found !== null) return found;
      sibling = sibling.previousSibling;
    }
    const parent = current.parentNode;
    if (!parent || parent === host || BLOCK_TAGS.has(parent.nodeName)) return null;
    current = parent;
  }
  return null;
}

/*
 * Some editors leave the caret on an element (right after a text node) instead
 * of inside the text. This finds the end of the text just before such a caret.
 */
function caretInText(node, offset) {
  if (!node) return null;
  if (node.nodeType === TEXT_NODE) return { node, offset };
  if (node.nodeType !== ELEMENT_NODE || offset === 0) return null;
  let current = node.childNodes[offset - 1];
  while (current && current.nodeType === ELEMENT_NODE && current.nodeName !== 'BR' && !BLOCK_TAGS.has(current.nodeName)) {
    current = current.lastChild;
  }
  if (!current || current.nodeType !== TEXT_NODE) return null;
  return { node: current, offset: current.data.length };
}

/* The text before the caret inside the current text node, or null. */
export function read(el) {
  const selection = selectionOf(el);
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;
  const caret = caretInText(selection.focusNode, selection.focusOffset);
  if (!caret || !el.contains(caret.node)) return null;
  const node = caret.node;
  const offset = caret.offset;
  const data = node.data;
  const from = Math.max(0, offset - LIMITS.BUFFER_MAX);
  return {
    text: plain(data.slice(from, offset)),
    charBefore: () => (from > 0 ? plain(data[from - 1]) : charBeforeNode(node, el)),
    node,
    offset
  };
}

function insertAsText(el, text) {
  try {
    return el.ownerDocument.execCommand('insertText', false, text) === true;
  } catch (error) {
    return false;
  }
}

/* Editors that keep one line of our text only when it holds line breaks. In them the text goes in as one line. */
const ONE_LINE_EDITORS = '[data-lexical-editor="true"]';

/*
 * Replaces the shortcut with the text. Returns a token for restore(), or null.
 * The character that stays after the shortcut (a space, a full stop) is put in
 * again together with the text, so the caret ends after it without being moved
 * by hand: editors that manage their own caret keep it in the right place.
 */
export function replace(el, snapshot, abbrLength, keep, text) {
  const selection = selectionOf(el);
  const start = snapshot.offset - keep.length - abbrLength;
  if (!selection || start < 0) return null;
  const oneLine = typeof el.matches === 'function' && el.matches(ONE_LINE_EDITORS);
  const out = (oneLine ? text.replace(/\s*\n\s*/g, ' ') : text) + keep;

  selection.setBaseAndExtent(snapshot.node, start, snapshot.node, snapshot.offset);
  if (!insertAsText(el, out)) {
    // Nothing was inserted, so nothing is deleted: put the caret back where it was.
    try {
      selection.collapse(snapshot.node, snapshot.offset);
    } catch (error) { /* the node is gone: leave the selection as it is */ }
    return null;
  }
  return { expect: out };
}

/* Backspace right after a replacement: selects what was inserted and puts back what the user typed. */
export function restore(el, token, original) {
  const selection = selectionOf(el);
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return false;
  const expect = token.expect;
  const node = selection.focusNode;
  const offset = selection.focusOffset;
  if (!node || !el.contains(node)) return false;

  const sameNode = node.nodeType === TEXT_NODE && !expect.includes('\n') && offset >= expect.length &&
    plain(node.data.slice(offset - expect.length, offset)) === plain(expect);

  if (sameNode) {
    selection.setBaseAndExtent(node, offset - expect.length, node, offset);
  } else {
    if (expect.length > STEP_LIMIT || typeof selection.modify !== 'function') return false;
    for (let i = 0; i < expect.length; i++) selection.modify('extend', 'backward', 'character');
    if (oneLineBreaks(selection.toString()) !== oneLineBreaks(expect)) {
      selection.collapse(node, offset);
      return false;
    }
  }
  if (!insertAsText(el, original)) {
    selection.collapseToEnd();
    return false;
  }
  return true;
}
