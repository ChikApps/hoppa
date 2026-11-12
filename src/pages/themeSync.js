// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Night and day. theme.js paints the page at once from a local cache; the
 * saved setting is the source of truth and is applied here when it arrives.
 */
export function connectTheme(store, getSnapshot) {
  const theme = window.HoppaTheme;
  if (!theme) return { apply() {} };
  let applying = false;

  theme.onChange(async (value) => {
    if (applying) return;
    const snapshot = getSnapshot();
    if (!snapshot || snapshot.readOnly || snapshot.settings.theme === value) return;
    snapshot.settings.theme = value;
    await store.save([], snapshot.settings);
  });

  return {
    apply(value) {
      if (value !== 'light' && value !== 'dark') return;
      if (theme.get() === value) return;
      applying = true;
      try {
        theme.set(value);
      } finally {
        applying = false;
      }
    }
  };
}
