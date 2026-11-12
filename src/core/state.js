// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Turns a storage snapshot into what the engine needs: is it active here,
 * the lookup table (a Map, never an object keyed by user text) and a render
 * function for a matched entry.
 */
import { buildLookup } from './matcher.js';
import { displayAbbr } from './validate.js';
import { smartEntries, runSmart } from '../smart/index.js';
import { renderTemplate } from '../template/index.js';

export function buildState(snapshot, host) {
  const settings = snapshot.settings;
  const active = settings.enabled === true && !settings.disabledSites.includes(host);

  const mine = snapshot.shortcuts
    .filter((shortcut) => shortcut.enabled)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((shortcut) => ({ abbr: displayAbbr(shortcut), kind: 'text', shortcut }));

  const lookup = buildLookup(smartEntries(settings).concat(mine));

  function render(entry, now) {
    if (!entry) return null;
    if (entry.kind === 'text') {
      const out = renderTemplate(entry.shortcut);
      return out ? out.text : null;
    }
    if (entry.kind === 'smart') return runSmart(entry.id, { now, settings });
    if (entry.kind === 'number') return runSmart('number', { now, settings, number: entry.number });
    return null;
  }

  return { active, lookup, number: settings.smart.number === true, settings, render };
}

/* A state that does nothing. Used before storage was read and after an error. */
export function idleState() {
  return { active: false, lookup: buildLookup([]), number: false, settings: null, render: () => null };
}
