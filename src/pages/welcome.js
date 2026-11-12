// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * The welcome page, opened once after the install. Content scripts do not run
 * in the extension's own pages, so the practice field runs the real engine
 * directly, with the same rules as on any site.
 */
import { TRIGGER } from '../config.js';
import { createStore } from '../storage/index.js';
import { buildState, idleState } from '../core/state.js';
import { createEngine } from '../core/engine.js';
import { smartAbbr } from '../smart/index.js';
import { SMART_TABLE } from '../smart/table.js';
import { TEXT } from './strings.js';
import { $, gain } from './ui.js';
import { connectTheme } from './themeSync.js';

const store = createStore(chrome.storage);
const input = $('#try');
const card = $('#tryCard');
const message = $('#tryMsg');
const hint = $('#tryHint');
const chip = $('#tryChip');
const gainNode = $('#tryGain');
const key = $('#slashKey');
const hebrewDateAbbr = smartAbbr('heDate');
const hintWord = SMART_TABLE.find((row) => row.id === 'heDate').abbr;

let snapshot = null;
let state = idleState();
const themeLink = connectTheme(store, () => snapshot);

function replay(node, className) {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

function onExpanded(info) {
  if (info.el !== input) return;
  chip.textContent = info.abbr;
  gainNode.textContent = gain(info.abbr, info.text);
  replay(card, 'sprung');
  replay(input, 'pop');
  if (info.abbr === hebrewDateAbbr) {
    card.classList.add('ok');
    message.textContent = TEXT.welcomeSuccess;
    hint.hidden = true;
  } else {
    // Another shortcut was tried: the message about the Hebrew date no longer describes what is in the field.
    card.classList.remove('ok');
    message.textContent = '';
  }
}

async function refresh() {
  try {
    snapshot = await store.load();
    // The practice field works even when the extension is switched off.
    state = { ...buildState(snapshot, ''), active: true };
    themeLink.apply(snapshot.settings.theme);
  } catch (error) {
    state = idleState();
  }
}

createEngine(window, { getState: () => state, afterExpand: onExpanded });

input.addEventListener('input', (event) => {
  // The key in the drawing is "pressed" together with the real keyboard.
  if (event.data === TRIGGER) replay(key, 'press');
  hint.hidden = card.classList.contains('ok') || !input.value.includes(hintWord);
});
input.addEventListener('focus', () => {
  if (!input.value) replay(key, 'press');
});

$('#gotIt').addEventListener('click', async () => {
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab && typeof tab.id === 'number') {
      await chrome.tabs.remove(tab.id);
      return;
    }
  } catch (error) { /* fall through */ }
  window.close();
});

setTimeout(() => replay(key, 'press'), 700);
store.onChanged(() => { refresh(); });
refresh();
