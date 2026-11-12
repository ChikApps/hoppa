// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * The storage layer. Shortcuts are kept in chrome.storage.sync, one item for
 * each shortcut. When they are too big for sync, everything moves to
 * chrome.storage.local automatically. Nothing that is read is trusted: every
 * record goes through validateShortcut() before it is used.
 */
import { LIMITS } from '../limits.js';
import { validateShortcut, validateSettings, defaultSettings, displayAbbr, newId, isPlainObject } from '../core/validate.js';
import { PACK, packRecords } from '../core/pack.js';
import { TRIGGER } from '../config.js';
import { KEYS } from './keys.js';
import { CURRENT_SCHEMA, migrate } from './migrations.js';

function fail(code) {
  return { ok: false, code };
}

function byteLength(key, value) {
  return new TextEncoder().encode(key + JSON.stringify(value)).length;
}

function isSizeQuotaError(error) {
  const message = error && typeof error.message === 'string' ? error.message : '';
  return message.includes('QUOTA_BYTES');
}

/* The update time of a stored shortcut, or -1 when the record is damaged. */
function stampOf(record) {
  return isPlainObject(record) && Number.isSafeInteger(record.updatedAt) ? record.updatedAt : -1;
}

function readSchema(meta) {
  if (meta === undefined) return CURRENT_SCHEMA;
  if (meta && Number.isSafeInteger(meta.schemaVersion) && meta.schemaVersion >= 1) return meta.schemaVersion;
  return CURRENT_SCHEMA;
}

/* Turns everything that was read from one storage area into a checked snapshot. */
export function parseStored(all, area) {
  const schemaVersion = readSchema(all[KEYS.META]);
  const readOnly = schemaVersion > CURRENT_SCHEMA;
  let items = all;
  if (schemaVersion < CURRENT_SCHEMA) items = migrate(all, schemaVersion) || all;

  const shortcuts = [];
  const corrupt = [];
  let fresh = true;
  for (const key of Object.keys(items)) {
    if (!key.startsWith(KEYS.PREFIX)) continue;
    fresh = false;
    if (!key.startsWith(KEYS.SHORTCUT)) continue;
    const checked = validateShortcut(items[key]);
    if (checked.ok && KEYS.SHORTCUT + checked.value.id === key) shortcuts.push(checked.value);
    else corrupt.push(key);
  }
  shortcuts.sort((a, b) => (b.createdAt - a.createdAt) || (a.id < b.id ? -1 : 1));

  return {
    area,
    syncOff: area === 'local',
    schemaVersion,
    readOnly,
    fresh,
    settings: validateSettings(items[KEYS.SETTINGS], false).value,
    shortcuts,
    corrupt
  };
}

export function countLimit(area) {
  return area === 'local' ? LIMITS.COUNT_LOCAL : LIMITS.COUNT_SYNC;
}

/* api: chrome.storage (or an object with the same shape, in tests). */
export function createStore(api) {
  async function activeArea() {
    const got = await api.local.get(KEYS.AREA);
    return got[KEYS.AREA] === 'local' ? 'local' : 'sync';
  }

  async function load() {
    const area = await activeArea();
    const all = await api[area].get(null);
    const snapshot = parseStored(all, area);
    // While this computer works locally, another computer may already write a newer version to sync.
    // Then this one only reads (section 9.8), so nothing it does can later overwrite that data.
    if (area === 'local' && !snapshot.readOnly) {
      const synced = await api.sync.get(KEYS.META);
      if (readSchema(synced[KEYS.META]) > CURRENT_SCHEMA) snapshot.readOnly = true;
    }
    return snapshot;
  }

  /*
   * Copies everything to the local area and marks it as the active one. Sync is
   * left as it is. What sync held at this moment is remembered for the way back.
   */
  async function moveToLocal() {
    const all = await api.sync.get(null);
    const copy = {};
    const keys = {};
    for (const key of Object.keys(all)) {
      if (!key.startsWith(KEYS.PREFIX)) continue;
      copy[key] = all[key];
      if (key.startsWith(KEYS.SHORTCUT)) keys[key] = stampOf(all[key]);
    }
    copy[KEYS.AREA] = 'local';
    copy[KEYS.MOVED] = { keys, settings: JSON.stringify(all[KEYS.SETTINGS] === undefined ? null : all[KEYS.SETTINGS]) };
    await api.local.set(copy);
  }

  /*
   * After a big shortcut was deleted or shortened: when everything fits in sync
   * again, the data goes back there and the local copy is removed.
   *
   * Another computer of the same user may have kept writing to sync meanwhile,
   * so the two sides are merged, never overwritten:
   * - a shortcut on both sides: a valid record wins over a damaged one, and
   *   between two valid records the one changed last wins;
   * - a shortcut only in sync: kept, unless it is exactly what sync held at the
   *   move and it was deleted here since;
   * - a shortcut only here: written to sync, unless it was in sync at the move,
   *   was deleted there since, and was not changed here;
   * - the settings: the ones from sync win when they changed there since the move.
   * When sync holds data of a newer version, nothing is written (section 9.8).
   */
  async function returnToSync() {
    try {
      const local = await api.local.get(null);
      const synced = await api.sync.get(null);
      if (readSchema(synced[KEYS.META]) > CURRENT_SCHEMA) return false;
      const moved = isPlainObject(local[KEYS.MOVED]) && isPlainObject(local[KEYS.MOVED].keys) ? local[KEYS.MOVED] : null;
      const atMove = (key) => (moved && Object.prototype.hasOwnProperty.call(moved.keys, key) ? moved.keys[key] : undefined);

      const merged = {};
      const shortcutKeys = new Set();
      for (const area of [local, synced]) {
        for (const key of Object.keys(area)) if (key.startsWith(KEYS.SHORTCUT)) shortcutKeys.add(key);
      }
      for (const key of shortcutKeys) {
        const here = Object.prototype.hasOwnProperty.call(local, key) ? local[key] : undefined;
        const there = Object.prototype.hasOwnProperty.call(synced, key) ? synced[key] : undefined;
        const before = atMove(key);
        if (here !== undefined && there !== undefined) {
          // A valid record always wins over a damaged one; the time decides only between two valid records.
          const hereValid = validateShortcut(here).ok;
          const thereValid = validateShortcut(there).ok;
          if (hereValid !== thereValid) merged[key] = hereValid ? here : there;
          else merged[key] = stampOf(here) >= stampOf(there) ? here : there;
        } else if (there !== undefined) {
          // Deleted here since the move, and not touched there: the deletion stands.
          if (before !== undefined && stampOf(there) === before) continue;
          merged[key] = there;
        } else {
          // Deleted on another computer since the move, and not changed here: the deletion stands.
          if (before !== undefined && stampOf(here) === before) continue;
          merged[key] = here;
        }
      }
      const settingsChangedThere = moved !== null &&
        JSON.stringify(synced[KEYS.SETTINGS] === undefined ? null : synced[KEYS.SETTINGS]) !== moved.settings;
      if (settingsChangedThere && synced[KEYS.SETTINGS] !== undefined) merged[KEYS.SETTINGS] = synced[KEYS.SETTINGS];
      else if (local[KEYS.SETTINGS] !== undefined) merged[KEYS.SETTINGS] = local[KEYS.SETTINGS];
      merged[KEYS.META] = { schemaVersion: CURRENT_SCHEMA };

      let total = 0;
      let count = 0;
      for (const key of Object.keys(merged)) {
        const size = byteLength(key, merged[key]);
        if (key.startsWith(KEYS.SHORTCUT)) {
          if (size > LIMITS.SYNC_ITEM_BYTES) return false;
          count += 1;
        }
        total += size;
      }
      if (count > LIMITS.COUNT_SYNC || total > LIMITS.SYNC_RETURN_BYTES) return false;

      const stale = Object.keys(synced).filter((key) => key.startsWith(KEYS.SHORTCUT) && !Object.prototype.hasOwnProperty.call(merged, key));
      await api.sync.set(merged);
      if (stale.length > 0) await api.sync.remove(stale);
      await api.local.remove(Object.keys(local).filter((key) => key.startsWith(KEYS.PREFIX)));
      return true;
    } catch (error) {
      // Sync refused: stay with the local copy, which is complete.
      return false;
    }
  }

  async function tooBigForSync(items) {
    let added = 0;
    for (const key of Object.keys(items)) {
      const size = byteLength(key, items[key]);
      if (key.startsWith(KEYS.SHORTCUT) && size > LIMITS.SYNC_ITEM_BYTES) return true;
      added += size;
    }
    const used = await api.sync.getBytesInUse(null);
    const replaced = await api.sync.getBytesInUse(Object.keys(items));
    return used - replaced + added > LIMITS.SYNC_TOTAL_BYTES;
  }

  async function write(items, snapshot) {
    let area = snapshot.area;
    let moved = false;
    try {
      if (area === 'sync' && await tooBigForSync(items)) {
        await moveToLocal();
        area = 'local';
        moved = true;
      }
      try {
        await api[area].set(items);
      } catch (error) {
        if (area !== 'sync' || !isSizeQuotaError(error)) throw error;
        await moveToLocal();
        await api.local.set(items);
        area = 'local';
        moved = true;
      }
    } catch (error) {
      return fail('SAVE_FAILED');
    }
    if (area === 'local' && !moved && await returnToSync()) area = 'sync';
    return { ok: true, area, movedToLocal: moved };
  }

  /*
   * Saves shortcuts (new or changed) and, optionally, the settings, in one write.
   * All or nothing: one bad record and nothing is written.
   */
  async function save(records, settings) {
    const snapshot = await load();
    if (snapshot.readOnly) return fail('READ_ONLY');

    const items = {};
    const known = new Set(snapshot.shortcuts.map((shortcut) => shortcut.id));
    let added = 0;
    for (const record of records) {
      const checked = validateShortcut(record);
      if (!checked.ok) return fail(checked.code);
      const key = KEYS.SHORTCUT + checked.value.id;
      if (!known.has(checked.value.id) && !Object.prototype.hasOwnProperty.call(items, key)) added += 1;
      items[key] = checked.value;
    }
    if (added > 0 && snapshot.shortcuts.length + added > countLimit(snapshot.area)) {
      return fail(snapshot.area === 'local' ? 'LIMIT_LOCAL' : 'LIMIT_SYNC');
    }
    if (settings !== undefined) {
      const checked = validateSettings(settings, true);
      if (!checked.ok) return fail(checked.code);
      items[KEYS.SETTINGS] = checked.value;
    }
    if (Object.keys(items).length === 0) return { ok: true, area: snapshot.area, movedToLocal: false };
    items[KEYS.META] = { schemaVersion: CURRENT_SCHEMA };
    return write(items, snapshot);
  }

  async function remove(keys) {
    const snapshot = await load();
    if (snapshot.readOnly) return fail('READ_ONLY');
    const own = keys.filter((key) => typeof key === 'string' && key.startsWith(KEYS.SHORTCUT));
    try {
      await api[snapshot.area].remove(own);
    } catch (error) {
      return fail('SAVE_FAILED');
    }
    const area = snapshot.area === 'local' && await returnToSync() ? 'sync' : snapshot.area;
    return { ok: true, area, movedToLocal: false };
  }

  function removeShortcut(id) {
    return remove([KEYS.SHORTCUT + id]);
  }

  /* First install only: the ready-made pack and the default settings. Never overwrites existing data. */
  async function seed(now) {
    const snapshot = await load();
    if (!snapshot.fresh) return { ok: true, seeded: false };
    const result = await save(packRecords(now), defaultSettings());
    return result.ok ? { ok: true, seeded: true } : result;
  }

  /* Adds only the pack shortcuts that are missing. Existing shortcuts are never changed. */
  async function restorePack(now) {
    const snapshot = await load();
    if (snapshot.readOnly) return fail('READ_ONLY');
    const existing = new Set(snapshot.shortcuts.map(displayAbbr));
    const ids = new Set(snapshot.shortcuts.map((shortcut) => shortcut.id));
    const missing = [];
    for (const record of packRecords(now)) {
      if (existing.has(TRIGGER + record.abbr)) continue;
      if (ids.has(record.id)) record.id = newId();
      missing.push(record);
    }
    if (missing.length === 0) return { ok: true, added: 0 };
    const result = await save(missing);
    return result.ok ? { ok: true, added: missing.length, movedToLocal: result.movedToLocal } : result;
  }

  /* Calls back when any of our keys changes, in any area (also when a change arrives through sync). */
  function onChanged(callback) {
    const listener = (changes) => {
      for (const key of Object.keys(changes)) {
        if (key.startsWith(KEYS.PREFIX)) {
          callback();
          return;
        }
      }
    };
    api.onChanged.addListener(listener);
    return () => api.onChanged.removeListener(listener);
  }

  return { load, save, remove, removeShortcut, seed, restorePack, onChanged };
}

export { PACK };
