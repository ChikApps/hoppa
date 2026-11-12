// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * The background script has one job: on the first install it saves the
 * ready-made pack and opens the welcome page, once. It keeps no state, makes
 * no network requests and listens to no messages.
 */
import { createStore } from '../storage/index.js';

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== 'install') return;
  try {
    await createStore(chrome.storage).seed(Date.now());
  } catch (error) {
    // The pack can be restored later from the management page.
  }
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  } catch (error) {
    // No window to open a tab in: the user can still open the popup.
  }
});
