// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

import test from 'node:test';
import assert from 'node:assert/strict';
import { TRIGGER as T } from '../../src/config.js';
import { LIMITS } from '../../src/limits.js';
import { validateShortcut, validateSettings, checkAbbr, displayAbbr, defaultSettings, normalizeHost, newId } from '../../src/core/validate.js';
import { record } from './helpers/fakeStorage.js';

const ok = (overrides) => validateShortcut(record({ abbr: T + 'x', ...overrides }));
const code = (overrides) => {
  const result = ok(overrides);
  return result.ok ? 'OK' : result.code;
};

test('a good record passes and is rebuilt field by field', () => {
  const result = ok({ extra: 'dropped', group: 'g', sites: ['a'], label: '  תיאור  ' });
  assert.ok(result.ok);
  assert.deepEqual(Object.keys(result.value).sort(), ['abbr', 'builtin', 'createdAt', 'enabled', 'format', 'group', 'id', 'label', 'sites', 'text', 'updatedAt']);
  assert.equal(result.value.group, null);
  assert.equal(result.value.sites, null);
  assert.equal(result.value.label, 'תיאור');
  assert.equal(result.value.extra, undefined);
});

test('a built-in record is stored without the trigger and shown with it', () => {
  const result = validateShortcut(record({ abbr: 'בב', builtin: true }));
  assert.ok(result.ok);
  assert.equal(result.value.abbr, 'בב');
  assert.equal(displayAbbr(result.value), T + 'בב');
});

test('shortcut rules', () => {
  assert.equal(code({ abbr: '' }), 'ABBR_EMPTY');
  assert.equal(code({ abbr: T }), 'ABBR_EMPTY');
  assert.equal(code({ abbr: 'בב' }), 'ABBR_NO_TRIGGER');
  assert.equal(code({ abbr: T + T + 'בב' }), 'ABBR_NO_TRIGGER');
  assert.equal(code({ abbr: T + 'א ב' }), 'ABBR_SPACE');
  assert.equal(code({ abbr: T + 'א\nב' }), 'ABBR_SPACE');
  assert.equal(code({ abbr: T + 'א\tב' }), 'ABBR_SPACE');
  assert.equal(code({ abbr: T + 'א\u0000ב' }), 'ABBR_CHARS');
  assert.equal(code({ abbr: T + 'א\u007Fב' }), 'ABBR_CHARS');
  assert.equal(code({ abbr: T + 'א\u0085ב' }), 'ABBR_CHARS');
  assert.equal(code({ abbr: T + 'א\u009Fב' }), 'ABBR_CHARS');
  assert.equal(code({ abbr: T + 'א‮ב' }), 'ABBR_CHARS');
  assert.equal(code({ abbr: T + 'א⁦ב' }), 'ABBR_CHARS');
  assert.equal(code({ abbr: T + 'א‏ב' }), 'ABBR_CHARS');
  assert.equal(code({ abbr: T + 'א'.repeat(LIMITS.ABBR_MAX) }), 'ABBR_TOO_LONG');
  assert.equal(code({ abbr: T + 'א'.repeat(LIMITS.ABBR_MAX - T.length) }), 'OK');
  assert.equal(code({ abbr: T + '123' }), 'ABBR_DIGITS');
  assert.equal(code({ abbr: T + '12.5' }), 'ABBR_DIGITS');
  assert.equal(code({ abbr: T + '1,000,000' }), 'ABBR_DIGITS');
  assert.equal(code({ abbr: T + '1,500.50' }), 'ABBR_DIGITS');
  assert.equal(code({ abbr: T + '1a' }), 'OK');
  for (const smart of ['תע', 'תל', 'שעה', 'פרשה']) assert.equal(code({ abbr: T + smart }), 'ABBR_SMART');
  assert.equal(code({ abbr: 5 }), 'RECORD_INVALID');
  assert.equal(checkAbbr(T + 'בב'), null);
});

test('text rules', () => {
  assert.equal(code({ text: '' }), 'TEXT_EMPTY');
  assert.equal(code({ text: '  \n ' }), 'TEXT_EMPTY');
  assert.equal(code({ text: 'א'.repeat(LIMITS.TEXT_MAX) }), 'OK');
  assert.equal(code({ text: 'א'.repeat(LIMITS.TEXT_MAX + 1) }), 'TEXT_TOO_LONG');
  assert.equal(code({ text: 'א'.repeat(100000) }), 'TEXT_TOO_LONG');
  assert.equal(code({ text: 7 }), 'RECORD_INVALID');
  assert.equal(ok({ text: 'a\r\nb\tc\u0000\u0007d\u007F' }).value.text, 'a\nb\tcd');
  assert.equal(ok({ text: 'a\u0080b\u0099c\u00A0d' }).value.text, 'abc\u00A0d', 'the second control range goes, a no-break space stays');
  assert.equal(ok({ text: '<script>alert(1)</script>' }).value.text, '<script>alert(1)</script>', 'markup is kept as plain text');
});

test('description rules', () => {
  assert.equal(code({ label: 'ת'.repeat(LIMITS.LABEL_MAX) }), 'OK');
  assert.equal(code({ label: 'ת'.repeat(LIMITS.LABEL_MAX + 1) }), 'LABEL_TOO_LONG');
  assert.equal(ok({ label: 'שורה\nאחת' }).value.label, 'שורה אחת');
  assert.equal(ok({ label: null }).value.label, '');
  assert.equal(code({ label: 5 }), 'RECORD_INVALID');
});

test('types, format, id and times', () => {
  assert.equal(code({ enabled: 'yes' }), 'RECORD_INVALID');
  assert.equal(code({ enabled: 1 }), 'RECORD_INVALID');
  assert.equal(code({ format: 'html' }), 'RECORD_INVALID');
  assert.equal(code({ format: undefined }), 'RECORD_INVALID');
  assert.equal(code({ builtin: 'true' }), 'RECORD_INVALID');
  assert.equal(code({ id: '' }), 'RECORD_INVALID');
  assert.equal(code({ id: '../x' }), 'RECORD_INVALID');
  assert.equal(code({ id: '__proto__' }), 'RECORD_INVALID');
  assert.equal(code({ createdAt: -1 }), 'RECORD_INVALID');
  assert.equal(code({ updatedAt: 1.5 }), 'RECORD_INVALID');
  assert.equal(code({ updatedAt: '5' }), 'RECORD_INVALID');
});

test('things that are not a plain record are rejected', () => {
  for (const value of [null, undefined, 5, 'text', [], [record()], new Map(), () => 1]) {
    assert.equal(validateShortcut(value).ok, false);
  }
  class Fancy { constructor() { Object.assign(this, record({ abbr: T + 'x' })); } }
  assert.equal(validateShortcut(new Fancy()).ok, false);
});

test('dangerous keys are rejected', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const raw = JSON.parse('{"' + key + '":{"enabled":true}}');
    Object.assign(raw, record({ abbr: T + 'x' }));
    assert.equal(validateShortcut(raw).ok, false, key);
  }
  assert.equal({}.polluted, undefined);
});

test('settings: defaults', () => {
  const settings = defaultSettings();
  assert.equal(settings.enabled, true);
  assert.equal(settings.calendar, 'il', 'the Land of Israel calendar is the default');
  assert.equal(settings.suffix, 'shekel');
  assert.equal(settings.docs, true);
  assert.equal(settings.theme, 'dark', 'night is the default');
  assert.deepEqual(settings.disabledSites, []);
  assert.deepEqual(settings.smart, { heDate: true, gDate: true, time: true, parasha: true, number: true });
  assert.equal('geresh' in settings, false, 'the apostrophe setting is not part of version 1');
});

test('settings from storage: a bad value falls back to the default', () => {
  const result = validateSettings({ enabled: 'no', calendar: 'mars', suffix: 'shah', theme: 5, docs: false, unknown: 1, disabledSites: ['Example.COM', 'bad host', 7, 'a.co'], smart: { time: false, other: true, number: 'x' } }, false);
  assert.ok(result.ok);
  assert.equal(result.value.enabled, true);
  assert.equal(result.value.calendar, 'il');
  assert.equal(result.value.suffix, 'shah');
  assert.equal(result.value.theme, 'dark');
  assert.equal(result.value.docs, false);
  assert.equal(result.value.unknown, undefined);
  assert.deepEqual(result.value.disabledSites, ['example.com', 'a.co']);
  assert.equal(result.value.smart.time, false);
  assert.equal(result.value.smart.number, true);
  assert.equal(result.value.smart.other, undefined);
  assert.ok(validateSettings(undefined, false).ok);
  assert.ok(validateSettings('junk', false).ok);
});

test('settings from a file: an unknown key or a bad value rejects everything', () => {
  assert.ok(validateSettings({ calendar: 'diaspora', suffix: 'none', theme: 'light' }, true).ok);
  for (const bad of [
    { unknown: 1 }, { calendar: 'mars' }, { enabled: 'yes' }, { disabledSites: 'a.co' }, { disabledSites: ['bad host'] },
    { disabledSites: Array.from({ length: LIMITS.DISABLED_SITES + 1 }, (_, i) => 'a' + i + '.co') },
    { smart: { other: true } }, { smart: { time: 'on' } }, { smart: [] }, 'text', null, []
  ]) {
    assert.equal(validateSettings(bad, true).ok, false, JSON.stringify(bad).slice(0, 60));
  }
  assert.equal(validateSettings(JSON.parse('{"__proto__":{"enabled":false}}'), true).ok, false);
});

test('site names', () => {
  assert.equal(normalizeHost('Mail.Google.com'), 'mail.google.com');
  assert.equal(normalizeHost('localhost'), 'localhost');
  assert.equal(normalizeHost('127.0.0.1'), '127.0.0.1');
  assert.equal(normalizeHost('[::1]'), '[::1]');
  for (const bad of ['', 'a b.com', 'http://a.com', 'a.com/path', '<script>', 'a..b', '-a.com', 'x'.repeat(300), 5, null]) {
    assert.equal(normalizeHost(bad), null, String(bad).slice(0, 20));
  }
});

test('new ids are valid and different', () => {
  const ids = new Set(Array.from({ length: 200 }, () => newId()));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.ok(validateShortcut(record({ id, abbr: T + 'x' })).ok);
});
