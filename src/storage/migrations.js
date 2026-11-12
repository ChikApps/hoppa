// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Data versions. A newer version of the extension adds a step here that turns
 * the stored items of version N into version N + 1, so an update never loses
 * data. Version 1 is the first one, so there are no steps yet.
 */
export const CURRENT_SCHEMA = 1;

const STEPS = new Map();

/* items: every stored key and value. Returns the items in the current version, or null if a step is missing. */
export function migrate(items, fromVersion) {
  let version = fromVersion;
  let out = items;
  while (version < CURRENT_SCHEMA) {
    const step = STEPS.get(version);
    if (typeof step !== 'function') return null;
    out = step(out);
    version += 1;
  }
  return out;
}
