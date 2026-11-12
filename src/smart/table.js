// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * The smart shortcuts, without the trigger (it is added at run time).
 * To add a smart shortcut: add a row here and a file with the same id that
 * exports { id, run(ctx) }, then register the file in smart/index.js.
 * A row without `abbr` is a pattern (the number) and not a fixed shortcut.
 */
export const SMART_TABLE = Object.freeze([
  Object.freeze({ id: 'heDate', abbr: 'תע' }),
  Object.freeze({ id: 'gDate', abbr: 'תל' }),
  Object.freeze({ id: 'time', abbr: 'שעה' }),
  Object.freeze({ id: 'parasha', abbr: 'פרשה' }),
  Object.freeze({ id: 'number', abbr: null })
]);

export const SMART_IDS = Object.freeze(SMART_TABLE.map((row) => row.id));
