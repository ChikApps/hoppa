// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateChecker, isStoreInstall, RELOAD_DELAY_MS } from '../../src/pages/updateCheck.js';
import { TEXT } from '../../src/pages/strings.js';

/* A stand-in for chrome.runtime. */
function fakeRuntime(options) {
  const listeners = [];
  const runtime = {
    calls: { check: 0, reload: 0 },
    getManifest: () => (options.store === false ? { version: '1.0.0' } : { version: '1.0.0', update_url: 'store' }),
    onUpdateAvailable: { addListener: (listener) => listeners.push(listener) },
    async requestUpdateCheck() {
      runtime.calls.check += 1;
      if (options.fail) throw new Error('blocked');
      return options.result;
    },
    reload() {
      runtime.calls.reload += 1;
    },
    fireUpdateAvailable() {
      for (const listener of listeners) listener({ version: '1.0.1' });
    },
    listenerCount: () => listeners.length
  };
  return runtime;
}

function setup(options) {
  const runtime = fakeRuntime(options);
  const statuses = [];
  const timers = [];
  let unsaved = options.unsaved === true;
  const checker = createUpdateChecker({
    runtime,
    hasUnsavedEdits: () => unsaved,
    onStatus: (status) => statuses.push(status),
    setTimer: (fn, ms) => timers.push({ fn, ms })
  });
  return { runtime, statuses, timers, checker, setUnsaved: (value) => { unsaved = value; } };
}

test('a manual install: a clear message, and Chrome is not asked at all', async () => {
  const { runtime, statuses, checker } = setup({ store: false });
  assert.equal(isStoreInstall(runtime), false);
  assert.equal(await checker.check(), 'manual');
  assert.deepEqual(statuses, ['manual']);
  assert.equal(runtime.calls.check, 0);
  assert.equal(runtime.listenerCount(), 0);
});

test('up to date', async () => {
  const { runtime, statuses, checker } = setup({ result: { status: 'no_update' } });
  assert.equal(isStoreInstall(runtime), true);
  assert.equal(await checker.check(), 'none');
  assert.deepEqual(statuses, ['checking', 'none']);
  assert.equal(runtime.calls.reload, 0);
});

test('an update is found: the reload waits until Chrome says it is ready', async () => {
  const { runtime, statuses, timers, checker } = setup({ result: { status: 'update_available', version: '1.0.1' } });
  assert.equal(await checker.check(), 'found');
  assert.deepEqual(statuses, ['checking', 'found']);
  assert.equal(runtime.calls.reload, 0, 'no reload before the update is ready');
  assert.equal(timers.length, 0);

  runtime.fireUpdateAvailable();
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, RELOAD_DELAY_MS);
  assert.equal(runtime.calls.reload, 0);
  timers[0].fn();
  assert.equal(runtime.calls.reload, 1);
  runtime.fireUpdateAvailable();
  assert.equal(timers.length, 1, 'only one reload is scheduled');
});

test('an update is ready but an edit was not saved: no reload until it is saved', async () => {
  const { runtime, statuses, timers, checker, setUnsaved } = setup({ result: { status: 'update_available' }, unsaved: true });
  await checker.check();
  runtime.fireUpdateAvailable();
  assert.equal(statuses.at(-1), 'unsaved');
  assert.equal(timers.length, 0);
  assert.equal(runtime.calls.reload, 0);

  assert.equal(await checker.check(), 'unsaved', 'still not saved');
  assert.equal(runtime.calls.check, 1, 'Chrome is not asked again for an update that is already here');

  setUnsaved(false);
  assert.equal(await checker.check(), 'found');
  assert.equal(statuses.at(-1), 'found');
  timers[0].fn();
  assert.equal(runtime.calls.reload, 1);
});

test('Chrome limits the check, or answers something unknown', async () => {
  for (const result of [{ status: 'throttled' }, { status: 'something_new' }, {}, undefined, null]) {
    const { runtime, statuses, checker } = setup({ result });
    assert.equal(await checker.check(), 'busy');
    assert.deepEqual(statuses, ['checking', 'busy']);
    assert.equal(runtime.calls.reload, 0);
  }
});

test('the check fails (for example, blocked by a filter): a message, no crash, and the button works again', async () => {
  const { runtime, statuses, checker } = setup({ fail: true });
  assert.equal(await checker.check(), 'busy');
  assert.equal(await checker.check(), 'busy');
  assert.deepEqual(statuses, ['checking', 'busy', 'checking', 'busy']);
  assert.equal(runtime.calls.check, 2);
  assert.equal(runtime.listenerCount(), 1, 'the listener is added once');
});

test('a manifest that cannot be read counts as a manual install', () => {
  assert.equal(isStoreInstall({ getManifest: () => { throw new Error('gone'); } }), false);
  assert.equal(isStoreInstall({ getManifest: () => ({ update_url: '' }) }), false);
});

test('every status has a text', () => {
  for (const status of ['manual', 'checking', 'none', 'found', 'busy', 'unsaved']) {
    assert.equal(typeof TEXT.update[status], 'string', status);
    assert.ok(TEXT.update[status].length > 0);
  }
  assert.equal(TEXT.update.none, 'יש לכם את הגרסה האחרונה ✓');
  assert.equal(TEXT.update.manual, 'הגרסה הזו הותקנה ידנית, ולכן היא לא מתעדכנת לבד.');
});
