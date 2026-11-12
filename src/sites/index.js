// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/* Site adapters. To handle another site with a menu of its own, add a file and list it here. The core is not touched. */
import { googleChat } from './googleChat.js';

const ADAPTERS = [googleChat];

export function siteAdapterFor(view) {
  for (const adapter of ADAPTERS) {
    if (adapter.matches(view)) return adapter;
  }
  return null;
}
