// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * "Check for update" in About. The extension itself asks nothing from the
 * network: it asks Chrome to run its own update check against the Chrome Web
 * Store now instead of later. Updates arrive from the store only.
 * No permission is needed for this.
 *
 * Statuses passed to onStatus:
 *   'manual'   installed by hand (not from the store): there is nothing to check
 *   'checking' the check is running
 *   'none'     this is the latest version
 *   'found'    a new version was found; the extension reloads when it is ready
 *   'unsaved'  a new version is ready, but the page has an edit that was not saved
 *   'busy'     Chrome limits how often a check can run, or the check failed
 */
export const RELOAD_DELAY_MS = 1500;

/* Chrome adds an update address to the manifest of an extension that was installed from the store. */
export function isStoreInstall(runtime) {
  try {
    const manifest = runtime.getManifest();
    return typeof manifest.update_url === 'string' && manifest.update_url.length > 0;
  } catch (error) {
    return false;
  }
}

/*
 * options: { runtime, hasUnsavedEdits(), onStatus(status), setTimer(fn, ms) }
 * runtime is chrome.runtime (or an object with the same shape, in tests).
 */
export function createUpdateChecker(options) {
  const runtime = options.runtime;
  const setTimer = options.setTimer || ((fn, ms) => setTimeout(fn, ms));
  let listening = false;
  let ready = false;
  let reloading = false;

  /* Reloads into the new version, unless that would throw away an edit. */
  function apply() {
    if (reloading) return true;
    if (options.hasUnsavedEdits()) {
      options.onStatus('unsaved');
      return false;
    }
    reloading = true;
    options.onStatus('found');
    setTimer(() => {
      try {
        runtime.reload();
      } catch (error) {
        reloading = false;
        options.onStatus('busy');
      }
    }, RELOAD_DELAY_MS);
    return true;
  }

  async function check() {
    if (reloading) return 'found';
    if (!isStoreInstall(runtime)) {
      options.onStatus('manual');
      return 'manual';
    }
    // A new version was already downloaded on an earlier click, and waited for the edit to be saved.
    if (ready) return apply() ? 'found' : 'unsaved';

    options.onStatus('checking');
    try {
      if (!listening) {
        runtime.onUpdateAvailable.addListener(() => {
          ready = true;
          apply();
        });
        listening = true;
      }
      const result = await runtime.requestUpdateCheck();
      const status = result && typeof result.status === 'string' ? result.status : '';
      if (status === 'no_update') {
        options.onStatus('none');
        return 'none';
      }
      if (status === 'update_available') {
        // Chrome downloads the new version now. The reload happens when it reports that it is ready.
        if (!ready && !reloading) options.onStatus('found');
        return 'found';
      }
      options.onStatus('busy');
      return 'busy';
    } catch (error) {
      options.onStatus('busy');
      return 'busy';
    }
  }

  return { check };
}
