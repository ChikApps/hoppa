// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Google Chat: an adapter for one site, isolated from the core.
 *
 * In Google Chat the trigger at the start of a message opens a commands menu.
 * The planned handling, in this order (see the test stage C1 in the plan):
 *   1. After a replacement the field gets a real "input" event, so the menu
 *      filters itself and closes. The core already does this on every site.
 *   2. If the menu is still open: send Escape to the field, only when a menu
 *      connected to the field is really open, and only on this site.
 *   3. Listening early (capture phase). The core already does this.
 *
 * Step 2 is written but turned off: it was not tested against the real
 * Google Chat, and Escape might close the chat window. Turn it on only after
 * test C1 shows that it is needed and that it is safe.
 */
const CLOSE_MENU_WITH_ESCAPE = false;

const CHAT_HOST = 'chat.google.com';
const MAIL_HOST = 'mail.google.com';
const MAIL_CHAT_PATH = '/chat';
const MENU_ROLES = new Set(['listbox', 'menu']);

export function isGoogleChat(location) {
  if (!location || typeof location.hostname !== 'string') return false;
  if (location.hostname === CHAT_HOST) return true;
  return location.hostname === MAIL_HOST && typeof location.pathname === 'string' && location.pathname.startsWith(MAIL_CHAT_PATH);
}

/* A menu that the field itself points to (aria-controls or aria-owns) and that is displayed. */
export function findOpenMenu(el) {
  const doc = el.ownerDocument;
  const ids = ((el.getAttribute('aria-controls') || '') + ' ' + (el.getAttribute('aria-owns') || '')).split(/\s+/);
  for (const id of ids) {
    if (id.length === 0) continue;
    const menu = doc.getElementById(id);
    if (!menu || !MENU_ROLES.has((menu.getAttribute('role') || '').toLowerCase())) continue;
    if (menu.getClientRects().length > 0) return menu;
  }
  return null;
}

export const googleChat = Object.freeze({
  id: 'googleChat',
  matches(view) {
    try {
      return isGoogleChat(view.location);
    } catch (error) {
      return false;
    }
  },
  afterExpand(info) {
    if (!CLOSE_MENU_WITH_ESCAPE) return;
    const el = info.el;
    if (!findOpenMenu(el)) return;
    const view = el.ownerDocument.defaultView;
    el.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  }
});
