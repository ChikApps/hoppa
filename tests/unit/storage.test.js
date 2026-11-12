// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

import test from 'node:test';
import assert from 'node:assert/strict';
import { TRIGGER as T } from '../../src/config.js';
import { LIMITS } from '../../src/limits.js';
import { createStore, parseStored } from '../../src/storage/index.js';
import { KEYS } from '../../src/storage/keys.js';
import { CURRENT_SCHEMA, migrate } from '../../src/storage/migrations.js';
import { PACK } from '../../src/core/pack.js';
import { buildState, idleState } from '../../src/core/state.js';
import { displayAbbr, defaultSettings } from '../../src/core/validate.js';
import { findMatch } from '../../src/core/matcher.js';
import { fakeStorage, record } from './helpers/fakeStorage.js';

const user = (id, abbr, extra) => record({ id, abbr: T + abbr, ...extra });

test('first install: the pack of 25 and the default settings are saved, in sync', async () => {
  const api = fakeStorage();
  const store = createStore(api);
  assert.deepEqual(await store.seed(1000), { ok: true, seeded: true });
  const snapshot = await store.load();
  assert.equal(snapshot.area, 'sync');
  assert.equal(snapshot.shortcuts.length, 25);
  assert.equal(PACK.length, 25);
  assert.deepEqual(snapshot.shortcuts.map((item) => item.abbr), PACK.map((item) => item.abbr), 'the pack keeps its order');
  assert.ok(snapshot.shortcuts.every((item) => item.builtin && item.enabled && !item.abbr.startsWith(T)));
  assert.deepEqual(snapshot.settings, defaultSettings());
  assert.deepEqual(api.sync.data.get(KEYS.META), { schemaVersion: CURRENT_SCHEMA });
  assert.equal(api.local.data.size, 0);
});

test('the pack: 25 shortcuts of two letters, none is the beginning of another, none is a smart one', () => {
  const abbrs = PACK.map((item) => item.abbr);
  assert.equal(new Set(abbrs).size, 25);
  assert.ok(abbrs.every((abbr) => Array.from(abbr).length === 2));
  for (const taken of ['תע', 'תל', 'שע', 'פר']) assert.ok(!abbrs.includes(taken), taken);
  const signature = PACK.find((item) => item.abbr === 'חת');
  assert.equal(signature.text.split('\n').length, 3);
  assert.ok(/^\[שם\]\nטלפון: \[טלפון\]\nמייל: \[מייל\]$/.test(signature.text), 'placeholders only, no real details');
});

test('seeding never overwrites existing data', async () => {
  const api = fakeStorage();
  const store = createStore(api);
  await store.save([user('u1', 'שלי')]);
  assert.deepEqual(await store.seed(1000), { ok: true, seeded: false });
  assert.equal((await store.load()).shortcuts.length, 1);
});

test('save validates: one bad record and nothing is written', async () => {
  const api = fakeStorage();
  const store = createStore(api);
  const result = await store.save([user('u1', 'טוב'), user('u2', 'רע', { text: '' })]);
  assert.deepEqual(result, { ok: false, code: 'TEXT_EMPTY' });
  assert.equal(api.sync.data.size, 0);
});

test('reading: damaged records are ignored, counted, and never deleted automatically', async () => {
  const api = fakeStorage();
  const store = createStore(api);
  await store.seed(1000);
  api.sync.data.set(KEYS.SHORTCUT + 'bad1', { id: 'bad1', abbr: 5 });
  api.sync.data.set(KEYS.SHORTCUT + 'bad2', 'text');
  api.sync.data.set(KEYS.SHORTCUT + 'bad3', null);
  api.sync.data.set(KEYS.SHORTCUT + 'moved', user('other-id', 'זז'));
  api.sync.data.set(KEYS.SHORTCUT + 'html', user('html', 'ה', { format: 'html' }));
  api.sync.data.set('another-extension-key', { x: 1 });
  const snapshot = await store.load();
  assert.equal(snapshot.shortcuts.length, 25);
  assert.deepEqual(snapshot.corrupt.sort(), ['bad1', 'bad2', 'bad3', 'html', 'moved'].map((id) => KEYS.SHORTCUT + id).sort());
  assert.equal(api.sync.data.size, 27 + 5 + 1, 'nothing was deleted');
  assert.deepEqual(await store.remove(snapshot.corrupt), { ok: true, area: 'sync', movedToLocal: false });
  assert.equal((await store.load()).corrupt.length, 0);
  assert.ok(api.sync.data.has('another-extension-key'), 'only our shortcut keys can be removed');
});

test('reading: damaged settings fall back to the defaults', async () => {
  const api = fakeStorage();
  api.sync.data.set(KEYS.SETTINGS, { enabled: 'x', calendar: 7, disabledSites: 'no' });
  assert.deepEqual((await createStore(api).load()).settings, defaultSettings());
});

test('data from a newer version: read only, nothing is written or converted', async () => {
  const api = fakeStorage();
  const store = createStore(api);
  await store.seed(1000);
  api.sync.data.set(KEYS.META, { schemaVersion: CURRENT_SCHEMA + 1 });
  const before = JSON.stringify(Array.from(api.sync.data));
  const snapshot = await store.load();
  assert.equal(snapshot.readOnly, true);
  assert.equal(snapshot.shortcuts.length, 25, 'records that are still valid keep working');
  for (const result of [
    await store.save([user('u1', 'חדש')]),
    await store.save([], defaultSettings()),
    await store.removeShortcut('pack-01'),
    await store.restorePack(2000)
  ]) assert.deepEqual(result, { ok: false, code: 'READ_ONLY' });
  assert.equal(JSON.stringify(Array.from(api.sync.data)), before);
});

test('migrations: version 1 needs none, and an unknown old version is left alone', () => {
  assert.equal(CURRENT_SCHEMA, 1);
  assert.deepEqual(migrate({ a: 1 }, 1), { a: 1 });
  assert.equal(migrate({ a: 1 }, 0), null);
  assert.equal(parseStored({ [KEYS.META]: { schemaVersion: 'junk' } }, 'sync').readOnly, false);
});

test('count limit in sync: the shortcut is not added, with the sync message code', async () => {
  const api = fakeStorage();
  const store = createStore(api);
  const many = Array.from({ length: LIMITS.COUNT_SYNC }, (_, i) => user('u' + i, 'k' + i, { text: 't' }));
  assert.ok((await store.save(many)).ok);
  assert.deepEqual(await store.save([user('extra', 'עוד')]), { ok: false, code: 'LIMIT_SYNC' });
  assert.ok((await store.save([user('u5', 'k5', { text: 'changed' })])).ok, 'changing an existing one is still allowed');
  assert.equal((await store.load()).shortcuts.length, LIMITS.COUNT_SYNC);
});

test('a text too big for one sync item moves everything to local, and sync is left as it was', async () => {
  const api = fakeStorage();
  const store = createStore(api);
  await store.seed(1000);
  const syncBefore = JSON.stringify(Array.from(api.sync.data));
  const result = await store.save([user('big', 'גדול', { text: 'ג'.repeat(5000) })]);
  assert.deepEqual(result, { ok: true, area: 'local', movedToLocal: true });
  assert.equal(JSON.stringify(Array.from(api.sync.data)), syncBefore, 'sync is not deleted and not changed');
  const snapshot = await store.load();
  assert.equal(snapshot.area, 'local');
  assert.equal(snapshot.syncOff, true);
  assert.equal(snapshot.shortcuts.length, 26);
  assert.equal(api.local.data.get(KEYS.AREA), 'local');
  assert.ok((await store.save([user('after', 'אחרי')])).ok);
  assert.equal((await store.load()).shortcuts.length, 27);
  assert.ok(!api.sync.data.has(KEYS.SHORTCUT + 'after'), 'new data goes to local only');
});

test('when the big shortcut is deleted, everything returns to sync and the local copy is removed', async () => {
  const api = fakeStorage();
  const store = createStore(api);
  await store.seed(1000);
  await store.save([user('big', 'גדול', { text: 'ג'.repeat(5000) })]);
  await store.save([user('later', 'אחרי')]);
  assert.equal((await store.load()).area, 'local');

  const result = await store.removeShortcut('big');
  assert.deepEqual(result, { ok: true, area: 'sync', movedToLocal: false });
  const snapshot = await store.load();
  assert.equal(snapshot.area, 'sync');
  assert.equal(snapshot.syncOff, false);
  assert.equal(snapshot.shortcuts.length, 26);
  assert.ok(api.sync.data.has(KEYS.SHORTCUT + 'later'), 'what was added while local is in sync now');
  assert.ok(!api.sync.data.has(KEYS.SHORTCUT + 'big'));
  assert.equal(Array.from(api.local.data.keys()).filter((key) => key.startsWith(KEYS.PREFIX)).length, 0, 'no local copy and no marker');
});

test('shortening the big text also returns to sync; a shortcut deleted while local does not come back', async () => {
  const api = fakeStorage();
  const store = createStore(api);
  await store.seed(1000);
  await store.save([user('big', 'גדול', { text: 'ג'.repeat(5000) })]);
  await store.removeShortcut('pack-01');
  assert.equal((await store.load()).area, 'local', 'still too big');
  assert.ok(api.sync.data.has(KEYS.SHORTCUT + 'pack-01'), 'sync still holds the old copy');

  const result = await store.save([user('big', 'גדול', { text: 'קצר' })]);
  assert.equal(result.area, 'sync');
  const snapshot = await store.load();
  assert.equal(snapshot.shortcuts.length, 25);
  assert.ok(!api.sync.data.has(KEYS.SHORTCUT + 'pack-01'), 'the stale copy was removed from sync');
});

test('no return to sync while it does not fit, and a refusal of sync keeps the local copy whole', async () => {
  const api = fakeStorage();
  const store = createStore(api);
  await store.seed(1000);
  await store.save([user('big1', 'גדול1', { text: 'ג'.repeat(5000) }), user('big2', 'גדול2', { text: 'ג'.repeat(5000) })]);
  assert.equal((await store.removeShortcut('big1')).area, 'local');

  api.sync.failNextSet('MAX_WRITE_OPERATIONS_PER_MINUTE quota exceeded');
  assert.equal((await store.removeShortcut('big2')).area, 'local');
  assert.equal((await store.load()).shortcuts.length, 25);
  assert.equal((await store.save([user('small', 'קטן')])).area, 'sync', 'the next change tries again');
});

/* Two computers of one user: each has its own local area, and both share one sync area. */
function twoComputers() {
  const first = fakeStorage();
  const second = { ...fakeStorage(), sync: first.sync };
  return { first, second, storeA: createStore(first), storeB: createStore(second) };
}

test('two computers: a shortcut added on the other computer while this one was local is not deleted on the way back', async () => {
  const { first, storeA, storeB } = twoComputers();
  await storeA.seed(1000);
  await storeA.save([user('big', 'גדול', { text: 'ג'.repeat(5000), createdAt: 2000, updatedAt: 2000 })]);
  assert.equal((await storeA.load()).area, 'local');

  assert.equal((await storeB.save([user('from-b', 'שני', { createdAt: 3000, updatedAt: 3000 })])).area, 'sync');

  assert.equal((await storeA.removeShortcut('big')).area, 'sync');
  assert.ok(first.sync.data.has(KEYS.SHORTCUT + 'from-b'), 'the shortcut of the other computer is still in sync');
  const shown = (await storeA.load()).shortcuts.map((item) => item.id);
  assert.ok(shown.includes('from-b'));
  assert.equal(shown.length, 26);
});

test('two computers: the change made last wins, on either side', async () => {
  const { first, storeA, storeB } = twoComputers();
  await storeA.seed(1000);
  await storeA.save([user('big', 'גדול', { text: 'ג'.repeat(5000), createdAt: 2000, updatedAt: 2000 })]);
  const pack = (await storeB.load()).shortcuts;
  const byId = (id) => pack.find((item) => item.id === id);
  await storeB.save([{ ...byId('pack-01'), text: 'נערך במחשב השני', updatedAt: 5000 }, { ...byId('pack-02'), text: 'ישן במחשב השני', updatedAt: 3000 }]);
  const local = (await storeA.load()).shortcuts;
  await storeA.save([{ ...local.find((item) => item.id === 'pack-02'), text: 'חדש כאן', updatedAt: 4000 }]);

  await storeA.removeShortcut('big');
  const after = (await storeA.load()).shortcuts;
  assert.equal(after.find((item) => item.id === 'pack-01').text, 'נערך במחשב השני');
  assert.equal(after.find((item) => item.id === 'pack-02').text, 'חדש כאן');
  assert.equal(first.sync.data.get(KEYS.SHORTCUT + 'pack-01').text, 'נערך במחשב השני');
});

test('two computers: deletions on either side stand, but an edit beats a deletion', async () => {
  const { first, storeA, storeB } = twoComputers();
  await storeA.seed(1000);
  await storeA.save([user('big', 'גדול', { text: 'ג'.repeat(5000), createdAt: 2000, updatedAt: 2000 })]);
  await storeA.removeShortcut('pack-03');
  await storeB.removeShortcut('pack-04');
  const pack = (await storeB.load()).shortcuts;
  await storeB.removeShortcut('pack-05');
  const local = (await storeA.load()).shortcuts;
  await storeA.save([{ ...local.find((item) => item.id === 'pack-05'), text: 'נערך כאן', updatedAt: 6000 }]);
  void pack;

  await storeA.removeShortcut('big');
  const ids = (await storeA.load()).shortcuts.map((item) => item.id);
  assert.ok(!ids.includes('pack-03'), 'deleted here');
  assert.ok(!ids.includes('pack-04'), 'deleted on the other computer');
  assert.ok(ids.includes('pack-05'), 'deleted there but edited here: kept');
  assert.ok(!first.sync.data.has(KEYS.SHORTCUT + 'pack-03'));
});

test('two computers: settings changed on the other computer while this one was local are kept', async () => {
  const { storeA, storeB } = twoComputers();
  await storeA.seed(1000);
  await storeA.save([user('big', 'גדול', { text: 'ג'.repeat(5000), createdAt: 2000, updatedAt: 2000 })]);
  await storeB.save([], { ...defaultSettings(), calendar: 'diaspora' });
  await storeA.removeShortcut('big');
  assert.equal((await storeA.load()).settings.calendar, 'diaspora');
});

test('two computers: data of a newer version in sync is never overwritten, and this computer only reads', async () => {
  const { first, storeA } = twoComputers();
  await storeA.seed(1000);
  await storeA.save([user('big', 'גדול', { text: 'ג'.repeat(5000), createdAt: 2000, updatedAt: 2000 })]);
  // The other computer was updated, and wrote data of a newer version.
  first.sync.data.set(KEYS.META, { schemaVersion: CURRENT_SCHEMA + 1 });
  first.sync.data.set(KEYS.SHORTCUT + 'v2-record', { id: 'v2-record', abbr: T + 'חדש', future: true });
  const before = JSON.stringify(Array.from(first.sync.data));

  const snapshot = await storeA.load();
  assert.equal(snapshot.readOnly, true);
  assert.deepEqual(await storeA.removeShortcut('big'), { ok: false, code: 'READ_ONLY' });
  assert.equal(JSON.stringify(Array.from(first.sync.data)), before, 'sync is exactly as the newer version left it');
  assert.equal((await storeA.load()).area, 'local');
});

test('two computers: a valid record always wins over a damaged one, whatever its time', async () => {
  const { first, storeA } = twoComputers();
  await storeA.seed(1000);
  await storeA.save([user('big', 'גדול', { text: 'ג'.repeat(5000), createdAt: 2000, updatedAt: 2000 })]);
  // A damaged record with a later time, and one that looks right but fails validation (a description too long).
  first.sync.data.set(KEYS.SHORTCUT + 'pack-01', { id: 'pack-01', abbr: 5, updatedAt: 9999999 });
  first.sync.data.set(KEYS.SHORTCUT + 'pack-02', { ...first.sync.data.get(KEYS.SHORTCUT + 'pack-02'), label: 'x'.repeat(500), updatedAt: 9999999 });
  // And the other way around: damaged here, valid there.
  first.local.data.set(KEYS.SHORTCUT + 'pack-03', { id: 'pack-03', text: null, updatedAt: 9999999 });

  await storeA.removeShortcut('big');
  const snapshot = await storeA.load();
  assert.equal(snapshot.area, 'sync');
  assert.equal(snapshot.corrupt.length, 0, 'no record became damaged');
  const ids = snapshot.shortcuts.map((item) => item.id);
  for (const id of ['pack-01', 'pack-02', 'pack-03']) assert.ok(ids.includes(id), id);
  assert.equal(snapshot.shortcuts.find((item) => item.id === 'pack-01').text, 'שלום רב,');
});

test('the way back without a record of the move (data from version 1.0.0) merges and deletes nothing from sync', async () => {
  const api = fakeStorage();
  const store = createStore(api);
  await store.seed(1000);
  await store.save([user('big', 'גדול', { text: 'ג'.repeat(5000), createdAt: 2000, updatedAt: 2000 })]);
  api.local.data.delete(KEYS.MOVED);
  await store.removeShortcut('pack-07');
  await store.removeShortcut('big');
  const ids = (await store.load()).shortcuts.map((item) => item.id);
  assert.ok(ids.includes('pack-07'), 'without the record a deletion cannot be told from an addition, so nothing is deleted');
  assert.equal(ids.length, 25);
});

test('the total size limit of sync also moves everything to local', async () => {
  const api = fakeStorage();
  const store = createStore(api);
  let moved = false;
  for (let i = 0; i < 40 && !moved; i++) {
    const result = await store.save([user('m' + i, 'm' + i, { text: 'א'.repeat(1800) })]);
    assert.ok(result.ok);
    moved = result.movedToLocal;
  }
  assert.ok(moved);
  assert.equal((await store.load()).area, 'local');
});

test('a quota error from the browser on write also moves to local; another error is reported', async () => {
  const api = fakeStorage();
  const store = createStore(api);
  await store.seed(1000);
  api.sync.failNextSet('QUOTA_BYTES_PER_ITEM quota exceeded');
  assert.deepEqual(await store.save([user('q', 'ק')]), { ok: true, area: 'local', movedToLocal: true });

  const api2 = fakeStorage();
  const store2 = createStore(api2);
  api2.sync.failNextSet('MAX_WRITE_OPERATIONS_PER_MINUTE quota exceeded');
  assert.deepEqual(await store2.save([user('q', 'ק')]), { ok: false, code: 'SAVE_FAILED' });
  assert.equal((await store2.load()).area, 'sync');
});

test('count limit in local is 2,000', async () => {
  const api = fakeStorage();
  api.local.data.set(KEYS.AREA, 'local');
  const store = createStore(api);
  const many = Array.from({ length: LIMITS.COUNT_LOCAL }, (_, i) => user('u' + i, 'k' + i, { text: 't' }));
  assert.ok((await store.save(many)).ok);
  assert.deepEqual(await store.save([user('extra', 'עוד')]), { ok: false, code: 'LIMIT_LOCAL' });
});

test('restore pack: adds only what is missing and never changes what exists', async () => {
  const api = fakeStorage();
  const store = createStore(api);
  await store.seed(1000);
  assert.deepEqual(await store.restorePack(2000), { ok: true, added: 0 });
  const snapshot = await store.load();
  const edited = { ...snapshot.shortcuts.find((item) => item.abbr === 'בב'), text: 'שלי', updatedAt: 1500 };
  await store.save([edited]);
  await store.removeShortcut('pack-01');
  await store.removeShortcut('pack-13');
  const result = await store.restorePack(2000);
  assert.equal(result.added, 2);
  const after = await store.load();
  assert.equal(after.shortcuts.length, 25);
  assert.equal(after.shortcuts.find((item) => item.abbr === 'בב').text, 'שלי');
});

test('restore pack: a user shortcut with the same name counts as existing', async () => {
  const api = fakeStorage();
  const store = createStore(api);
  await store.save([user('mine', 'בב', { text: 'שלי' })]);
  const result = await store.restorePack(2000);
  assert.equal(result.added, 24);
  const same = (await store.load()).shortcuts.filter((item) => displayAbbr(item) === T + 'בב');
  assert.equal(same.length, 1);
  assert.equal(same[0].text, 'שלי');
});

test('settings are saved only when valid', async () => {
  const api = fakeStorage();
  const store = createStore(api);
  assert.deepEqual(await store.save([], { ...defaultSettings(), calendar: 'mars' }), { ok: false, code: 'SETTINGS_INVALID' });
  assert.ok((await store.save([], { ...defaultSettings(), calendar: 'diaspora' })).ok);
  assert.equal((await store.load()).settings.calendar, 'diaspora');
});

test('change notifications: only for our keys, in any area', async () => {
  const api = fakeStorage();
  const store = createStore(api);
  let calls = 0;
  const stop = store.onChanged(() => { calls += 1; });
  await api.sync.set({ other: 1 });
  assert.equal(calls, 0);
  await store.save([user('u1', 'א')]);
  assert.equal(calls, 1);
  await api.local.set({ [KEYS.AREA]: 'local' });
  assert.equal(calls, 2);
  stop();
  await store.save([user('u2', 'ב')]);
  assert.equal(calls, 2);
});

test('state for the engine: on and off, sites, disabled shortcuts, duplicates', async () => {
  const api = fakeStorage();
  const store = createStore(api);
  await store.seed(1000);
  await store.save([
    user('off', 'כבוי', { enabled: false }),
    user('old', 'כפול', { text: 'ישן', updatedAt: 10 }),
    user('new', 'כפול', { text: 'חדש', updatedAt: 20 })
  ]);
  const snapshot = await store.load();
  const state = buildState(snapshot, 'example.com');
  assert.equal(state.active, true);
  assert.ok(state.lookup.map instanceof Map);
  assert.ok(state.lookup.map.has(T + 'בב'));
  assert.ok(state.lookup.map.has(T + 'תע'));
  assert.ok(!state.lookup.map.has(T + 'כבוי'));
  assert.equal(state.render(state.lookup.map.get(T + 'כפול'), new Date()), 'חדש', 'the newest of two with the same name wins');
  assert.equal(state.render(state.lookup.map.get(T + 'בב'), new Date()), 'בברכה,');
  const match = findMatch(T + '1500 ', { lookup: state.lookup, number: state.number, charBefore: () => null });
  assert.equal(state.render(match.entry, new Date()), 'אלף וחמש מאות שקלים חדשים');

  snapshot.settings.disabledSites = ['example.com'];
  assert.equal(buildState(snapshot, 'example.com').active, false);
  assert.equal(buildState(snapshot, 'other.com').active, true);
  snapshot.settings.enabled = false;
  assert.equal(buildState(snapshot, 'other.com').active, false);
  assert.equal(idleState().active, false);
  assert.equal(idleState().render({ kind: 'text' }), null);
});
