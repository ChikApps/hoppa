// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

export const KEYS = Object.freeze({
  PREFIX: 'hoppa:',
  META: 'hoppa:meta',
  SETTINGS: 'hoppa:settings',
  SHORTCUT: 'hoppa:s:',
  /* Kept in the local area only: 'local' when sync was turned off because the shortcuts are too big. */
  AREA: 'hoppa:area',
  /*
   * Kept in the local area only: what sync held at the moment of the move to
   * local (each shortcut key with its update time, and the settings). Used to
   * tell apart, on the way back, what changed here from what changed on another computer.
   */
  MOVED: 'hoppa:moved'
});
