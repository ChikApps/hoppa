// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/* The registry of smart shortcuts: a table of ids, and one file with run(ctx) for each id. */
import { TRIGGER } from '../config.js';
import { SMART_TABLE } from './table.js';
import heDate from './hebrewDate.js';
import gDate from './gregDate.js';
import time from './time.js';
import parasha from './parasha.js';
import number from './number.js';

const RUNNERS = new Map([heDate, gDate, time, parasha, number].map((smart) => [smart.id, smart]));

export function hasRunner(id) {
  return RUNNERS.has(id);
}

/* ctx: { now: Date, settings, number? }. Returns a string, or null when there is nothing to insert. */
export function runSmart(id, ctx) {
  const smart = RUNNERS.get(id);
  if (!smart) return null;
  try {
    const out = smart.run(ctx);
    return typeof out === 'string' && out.length > 0 ? out : null;
  } catch (error) {
    return null;
  }
}

/* The fixed smart shortcuts that are turned on, as entries for the matcher. */
export function smartEntries(settings) {
  const entries = [];
  for (const row of SMART_TABLE) {
    if (!row.abbr || settings.smart[row.id] !== true) continue;
    entries.push({ abbr: TRIGGER + row.abbr, kind: 'smart', id: row.id });
  }
  return entries;
}

export function smartAbbr(id) {
  const row = SMART_TABLE.find((item) => item.id === id);
  return row && row.abbr ? TRIGGER + row.abbr : null;
}
