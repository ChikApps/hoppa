// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Turns a shortcut into the text to insert. Version 1 knows one format,
 * "plain", and returns the text as it is. This is the future connection point
 * for variables, caret position and fill-in fields.
 */
export function renderTemplate(shortcut) {
  if (!shortcut || shortcut.format !== 'plain' || typeof shortcut.text !== 'string') return null;
  return { text: shortcut.text, caret: null };
}
