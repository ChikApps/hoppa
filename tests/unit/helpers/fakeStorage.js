// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/* A stand-in for chrome.storage, with the real quotas of the sync area. */
const SYNC_ITEM = 8192;
const SYNC_TOTAL = 102400;
const SYNC_ITEMS = 512;

function size(key, value) {
  return new TextEncoder().encode(key + JSON.stringify(value)).length;
}

function area(limited, notify, name) {
  const data = new Map();
  let failNext = null;
  return {
    data,
    failNextSet(message) {
      failNext = message;
    },
    async get(keys) {
      const out = {};
      const wanted = keys === null || keys === undefined ? Array.from(data.keys()) : (Array.isArray(keys) ? keys : [keys]);
      for (const key of wanted) if (data.has(key)) out[key] = structuredClone(data.get(key));
      return out;
    },
    async set(items) {
      if (failNext) {
        const message = failNext;
        failNext = null;
        throw new Error(message);
      }
      if (limited) {
        let total = 0;
        const merged = new Map(data);
        for (const [key, value] of Object.entries(items)) {
          if (size(key, value) > SYNC_ITEM) throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
          merged.set(key, value);
        }
        for (const [key, value] of merged) total += size(key, value);
        if (total > SYNC_TOTAL) throw new Error('QUOTA_BYTES quota exceeded');
        if (merged.size > SYNC_ITEMS) throw new Error('MAX_ITEMS quota exceeded');
      }
      const changes = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: data.get(key), newValue: value };
        data.set(key, structuredClone(value));
      }
      notify(changes, name);
    },
    async remove(keys) {
      const changes = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (data.has(key)) changes[key] = { oldValue: data.get(key) };
        data.delete(key);
      }
      notify(changes, name);
    },
    async getBytesInUse(keys) {
      const wanted = keys === null || keys === undefined ? Array.from(data.keys()) : (Array.isArray(keys) ? keys : [keys]);
      let total = 0;
      for (const key of wanted) if (data.has(key)) total += size(key, data.get(key));
      return total;
    }
  };
}

export function fakeStorage() {
  const listeners = new Set();
  const notify = (changes, name) => {
    if (Object.keys(changes).length === 0) return;
    for (const listener of listeners) listener(changes, name);
  };
  return {
    sync: area(true, notify, 'sync'),
    local: area(false, notify, 'local'),
    onChanged: {
      addListener: (listener) => listeners.add(listener),
      removeListener: (listener) => listeners.delete(listener)
    }
  };
}

export function record(overrides) {
  return {
    id: 'u1',
    abbr: overrides && overrides.abbr !== undefined ? overrides.abbr : 'x',
    text: 'text',
    label: '',
    enabled: true,
    format: 'plain',
    builtin: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  };
}
