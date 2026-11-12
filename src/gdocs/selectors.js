// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Everything that depends on how Google Docs is built today, in one file.
 * When Google changes Docs, this is the first place to look.
 * These are findings measured in a real document (2026-11-12), not an official interface.
 */
export const DOCS_HOST = 'docs.google.com';

/* Editors of the Docs family draw the page themselves and take typing through a hidden frame. */
export const EDITOR_PATHS = Object.freeze(['/document/', '/spreadsheets/', '/presentation/', '/drawings/']);

/* The only editor this module handles. */
export const DOCUMENT_PATH = '/document/';

/*
 * The hidden frame that receives the typing in a document. It is an about:blank
 * frame of the same origin, and the focus inside it is on an editable element
 * (role "textbox"). Docs reads the keys from there and draws the text itself.
 */
export const TYPING_FRAME_SELECTOR = 'iframe.docs-texteventtarget-iframe';

/*
 * How Docs takes edits from that frame (measured):
 * - a "keydown" of Backspace deletes one character, and Docs marks it handled (preventDefault);
 * - a "paste" event with plain text inserts the whole text, new lines included, as one
 *   undo step, and Docs stops it from going further (stopPropagation);
 * - a "keypress" with a character code inserts that character (used only to put a shortcut back);
 * - a "keydown" of Ctrl+Z undoes one step.
 */
export const KEYS = Object.freeze({
  backspace: Object.freeze({ key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8 }),
  enter: Object.freeze({ key: 'Enter', code: 'Enter', keyCode: 13, which: 13 }),
  undo: Object.freeze({ key: 'z', code: 'KeyZ', keyCode: 90, which: 90, ctrlKey: true })
});

/*
 * The caret that Docs draws (a DOM element that moves when the text changes).
 * Docs applies a paste a few milliseconds after it gets it, and if a key arrives
 * in between, Docs handles the key first. So keys typed in that moment are held
 * and given to Docs again once the caret shows that the paste is in.
 */
export const CARET_SELECTOR = '.kix-cursor';

/*
 * The caret's bar (its height is the line's height) and the canvas the page is drawn on.
 * After a click the module does not know what is before the caret. If the caret's whole line
 * on the canvas is blank (no dark pixel across the page), the line is empty, so the caret is at
 * the start of a line. Only that yes/no is kept; nothing is read as text and nothing is stored.
 */
export const CARET_BAR_SELECTOR = '.kix-cursor .kix-cursor-caret';
export const PAGE_CANVAS_SELECTOR = 'canvas.kix-canvas-tile-content';
/* A pixel darker than this in any colour counts as something drawn on the line. */
export const BLANK_LEVEL = 200;

/* Docs drops one space at the start and one at the end of a pasted text. */
export const PASTE_TRIMS_EDGE_SPACE = true;

/* The most keys held while one paste is on its way. More than that: everything held goes to Docs at once. */
export const HELD_MAX = 64;

export const TIMING = Object.freeze({
  /* How often to look for the typing frame again (Docs may replace it). */
  frameCheckMs: 250,
  /* The longest wait for the caret after the deletion, and after the paste. */
  settleMaxMs: 300,
  pasteMaxMs: 1000,
  /* Without a caret to watch: fixed waits. */
  blindSettleMs: 40,
  blindPasteMs: 250
});
