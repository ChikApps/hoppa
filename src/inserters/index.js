// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/* One adapter for each kind of editor. Each one has read(), replace() and restore(). */
import * as textField from './textField.js';
import * as contentEditable from './contentEditable.js';

export function inserterFor(kind) {
  if (kind === 'text') return textField;
  if (kind === 'rich') return contentEditable;
  return null;
}
