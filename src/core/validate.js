// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * One validation function for every entrance: the edit form, import, reading
 * from storage and changes that arrive through sync. A record is rebuilt field
 * by field; nothing is copied wholesale from the input.
 */
import { TRIGGER } from '../config.js';
import { LIMITS } from '../limits.js';
import { SMART_TABLE, SMART_IDS } from '../smart/table.js';

export const DANGEROUS_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype']);

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const WHITESPACE_RE = /\s/;
// Control characters (both ranges), direction overrides and isolates, and invisible marks.
const ABBR_FORBIDDEN_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;
// Every control character except line feed and tab, including the second range (U+0080 to U+009F).
const TEXT_CONTROL_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
const LABEL_CONTROL_RE = /[\u0000-\u001F\u007F-\u009F]/g;
const DIGITS_ONLY_RE = /^\d[\d.,]*$/;
const HOST_RE = /^[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?(\.[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?)*$/;
const HOST_IPV6_RE = /^\[[0-9a-f:.]{2,45}\]$/;

const RESERVED = new Set(SMART_TABLE.filter((row) => row.abbr).map((row) => TRIGGER + row.abbr));

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function hasDangerousKey(value) {
  for (const key of DANGEROUS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) return true;
  }
  return false;
}

function fail(code) {
  return { ok: false, code };
}

/* The shortcut as the user types and sees it. Built-in ones are stored without the trigger. */
export function displayAbbr(record) {
  return record.builtin ? TRIGGER + record.abbr : record.abbr;
}

export function isReservedAbbr(abbr) {
  return RESERVED.has(abbr);
}

/* Checks a shortcut as it is displayed (with the trigger). Returns null or an error code. */
export function checkAbbr(abbr) {
  if (typeof abbr !== 'string') return 'RECORD_INVALID';
  if (abbr.length === 0 || abbr === TRIGGER) return 'ABBR_EMPTY';
  if (!abbr.startsWith(TRIGGER) || abbr.startsWith(TRIGGER, TRIGGER.length)) return 'ABBR_NO_TRIGGER';
  if (WHITESPACE_RE.test(abbr)) return 'ABBR_SPACE';
  if (ABBR_FORBIDDEN_RE.test(abbr)) return 'ABBR_CHARS';
  if (abbr.length > LIMITS.ABBR_MAX) return 'ABBR_TOO_LONG';
  if (DIGITS_ONLY_RE.test(abbr.slice(TRIGGER.length))) return 'ABBR_DIGITS';
  if (RESERVED.has(abbr)) return 'ABBR_SMART';
  return null;
}

export function cleanText(text) {
  return text.replace(/\r\n?/g, '\n').replace(TEXT_CONTROL_RE, '');
}

export function cleanLabel(label) {
  return label.replace(/[\r\n\t]+/g, ' ').replace(LABEL_CONTROL_RE, '').trim();
}

function isTimestamp(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

/*
 * raw: { id, abbr, text, label, enabled, format, builtin, createdAt, updatedAt }
 * Returns { ok: true, value } with a clean record, or { ok: false, code }.
 */
export function validateShortcut(raw) {
  if (!isPlainObject(raw) || hasDangerousKey(raw)) return fail('RECORD_INVALID');

  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) return fail('RECORD_INVALID');
  if (raw.builtin !== undefined && typeof raw.builtin !== 'boolean') return fail('RECORD_INVALID');
  const builtin = raw.builtin === true;

  if (typeof raw.abbr !== 'string') return fail('RECORD_INVALID');
  const shown = builtin ? TRIGGER + raw.abbr : raw.abbr;
  const abbrError = checkAbbr(shown);
  if (abbrError) return fail(abbrError);

  if (typeof raw.text !== 'string') return fail('RECORD_INVALID');
  const text = cleanText(raw.text);
  if (text.trim().length === 0) return fail('TEXT_EMPTY');
  if (text.length > LIMITS.TEXT_MAX) return fail('TEXT_TOO_LONG');

  if (raw.label !== undefined && raw.label !== null && typeof raw.label !== 'string') return fail('RECORD_INVALID');
  const label = typeof raw.label === 'string' ? cleanLabel(raw.label) : '';
  if (label.length > LIMITS.LABEL_MAX) return fail('LABEL_TOO_LONG');

  if (typeof raw.enabled !== 'boolean') return fail('RECORD_INVALID');
  if (raw.format !== 'plain') return fail('RECORD_INVALID');
  if (!isTimestamp(raw.createdAt) || !isTimestamp(raw.updatedAt)) return fail('RECORD_INVALID');

  return {
    ok: true,
    value: {
      id: raw.id,
      abbr: builtin ? shown.slice(TRIGGER.length) : shown,
      text,
      label,
      enabled: raw.enabled,
      format: 'plain',
      group: null,
      sites: null,
      builtin,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt
    }
  };
}

/* ---------- settings: a closed list of keys, a closed list of values for each ---------- */

export const SETTING_CHOICES = Object.freeze({
  calendar: Object.freeze(['il', 'diaspora']),
  suffix: Object.freeze(['shekel', 'shah', 'none']),
  theme: Object.freeze(['dark', 'light'])
});

export function defaultSettings() {
  const smart = {};
  for (const id of SMART_IDS) smart[id] = true;
  return {
    enabled: true,
    calendar: 'il',
    suffix: 'shekel',
    docs: true,
    theme: 'dark',
    disabledSites: [],
    smart
  };
}

export const SETTING_KEYS = Object.freeze(Object.keys(defaultSettings()));

export function normalizeHost(value) {
  if (typeof value !== 'string') return null;
  const host = value.trim().toLowerCase();
  if (host.length === 0 || host.length > LIMITS.HOSTNAME_MAX) return null;
  if (!HOST_RE.test(host) && !HOST_IPV6_RE.test(host)) return null;
  return host;
}

/*
 * strict = true (a file): an unknown key or a bad value rejects the whole object.
 * strict = false (storage): a bad value falls back to the default.
 */
export function validateSettings(raw, strict) {
  const out = defaultSettings();
  if (raw === undefined && !strict) return { ok: true, value: out };
  if (!isPlainObject(raw) || hasDangerousKey(raw)) return strict ? fail('SETTINGS_INVALID') : { ok: true, value: out };

  if (strict) {
    for (const key of Object.keys(raw)) {
      if (!SETTING_KEYS.includes(key)) return fail('SETTINGS_INVALID');
    }
  }

  for (const key of ['enabled', 'docs']) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
    else if (strict) return fail('SETTINGS_INVALID');
  }

  for (const key of Object.keys(SETTING_CHOICES)) {
    if (raw[key] === undefined) continue;
    if (SETTING_CHOICES[key].includes(raw[key])) out[key] = raw[key];
    else if (strict) return fail('SETTINGS_INVALID');
  }

  if (raw.disabledSites !== undefined) {
    const list = raw.disabledSites;
    if (!Array.isArray(list) || list.length > LIMITS.DISABLED_SITES) {
      if (strict) return fail('SETTINGS_INVALID');
    } else {
      const seen = new Set();
      for (const item of list) {
        const host = normalizeHost(item);
        if (host === null) {
          if (strict) return fail('SETTINGS_INVALID');
          continue;
        }
        seen.add(host);
      }
      out.disabledSites = Array.from(seen);
    }
  }

  if (raw.smart !== undefined) {
    const smart = raw.smart;
    if (!isPlainObject(smart) || hasDangerousKey(smart)) {
      if (strict) return fail('SETTINGS_INVALID');
    } else {
      for (const key of Object.keys(smart)) {
        if (!SMART_IDS.includes(key)) {
          if (strict) return fail('SETTINGS_INVALID');
          continue;
        }
        if (typeof smart[key] === 'boolean') out.smart[key] = smart[key];
        else if (strict) return fail('SETTINGS_INVALID');
      }
    }
  }

  return { ok: true, value: out };
}

export function newId() {
  const bytes = new Uint8Array(9);
  globalThis.crypto.getRandomValues(bytes);
  let id = 'u';
  for (const byte of bytes) id += byte.toString(36).padStart(2, '0');
  return id;
}
