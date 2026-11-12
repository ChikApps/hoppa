// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/* All limits live here. The same numbers apply to the form, to import and to storage. */
export const LIMITS = Object.freeze({
  ABBR_MAX: 32,
  TEXT_MAX: 10000,
  LABEL_MAX: 100,
  COUNT_SYNC: 500,
  COUNT_LOCAL: 2000,
  IMPORT_BYTES: 2 * 1024 * 1024,
  CSV_ROWS: 2000,
  CSV_COLS_MIN: 2,
  CSV_COLS_MAX: 3,
  DISABLED_SITES: 200,
  HOSTNAME_MAX: 253,
  /* Typed-characters buffer: the longest shortcut, a boundary before it and a character after it. */
  BUFFER_MAX: 64,
  /* chrome.storage.sync quotas, with a safety margin below the real numbers (8,192 and 102,400). */
  SYNC_ITEM_BYTES: 7000,
  SYNC_TOTAL_BYTES: 92000,
  /* Going back to sync needs more free room than leaving it, so the two do not alternate. */
  SYNC_RETURN_BYTES: 80000,
  NUMBER_MAX_DIGITS: 9
});
