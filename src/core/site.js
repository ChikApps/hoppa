// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * The name of the site the user sees in the address bar, also from inside an
 * inner frame. "Off on this site" follows the top page, so one switch covers
 * every frame in it.
 */
export function topHost(view) {
  try {
    if (view.top === view) return view.location.hostname;
  } catch (error) { /* continue */ }
  try {
    return view.top.location.hostname;
  } catch (error) { /* a frame from another origin: continue */ }
  try {
    const origins = view.location.ancestorOrigins;
    if (origins && origins.length > 0) return new URL(origins[origins.length - 1]).hostname;
  } catch (error) { /* continue */ }
  try {
    return view.location.hostname || '';
  } catch (error) {
    return '';
  }
}

export function isTopFrame(view) {
  try {
    return view.top === view;
  } catch (error) {
    return false;
  }
}
