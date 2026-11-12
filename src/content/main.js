// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * The content script. It runs in every page and frame, in the extension's own
 * separate script context. It adds nothing to the page: no elements, no
 * classes, no attributes. The only thing it ever writes to a page is the text
 * that replaces a shortcut, in the field the user is typing in.
 * It does not listen to anything the page sends, and it does not log.
 */
import { createStore } from '../storage/index.js';
import { buildState, idleState } from '../core/state.js';
import { createEngine } from '../core/engine.js';
import { topHost, isTopFrame } from '../core/site.js';
import { findMatch, isBoundary } from '../core/matcher.js';
import { renderTemplate } from '../template/index.js';
import { siteAdapterFor } from '../sites/index.js';
import { createGdocs } from '../gdocs/index.js';
import { answerMessage } from '../messages.js';

const START_EVENTS = ['focusin', 'keydown', 'mousedown'];

function main() {
  const api = globalThis.chrome;
  if (!api || !api.storage || !api.runtime || !api.runtime.id) return;

  const view = window;
  const host = topHost(view);
  const store = createStore(api.storage);
  const adapter = siteAdapterFor(view);
  const idle = idleState();
  let state = idle;
  let engine = null;
  let started = false;

  const gdocs = createGdocs({
    view,
    matcher: { findMatch, isBoundary },
    template: { renderTemplate },
    getState: () => state
  });

  async function refresh() {
    try {
      state = buildState(await store.load(), host);
    } catch (error) {
      // Storage is not reachable (for example, the extension was updated): stop working on this page.
      state = idleState();
    }
    if (!state.active && engine) engine.reset();
    if (gdocs.ownsFrame) {
      if (state.active) gdocs.start();
      else gdocs.stop();
    }
  }

  function start() {
    if (started) return;
    started = true;
    for (const name of START_EVENTS) view.removeEventListener(name, start, true);
    try {
      // On the editors of the Docs family the general engine never runs. The gdocs module owns them.
      if (!gdocs.ownsFrame) {
        engine = createEngine(view, {
          // After an update or a reload of the extension this old script is cut off from it: stop quietly.
          getState: () => (api.runtime && api.runtime.id ? state : idle),
          afterExpand: adapter ? (info) => adapter.afterExpand(info) : undefined
        });
      }
      store.onChanged(() => { refresh(); });
      refresh();
    } catch (error) {
      state = idleState();
    }
  }

  if (isTopFrame(view)) {
    // The popup asks the top frame for the site name. Nothing else is ever answered.
    api.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const answer = answerMessage(message, sender, api.runtime.id, host);
      if (answer !== undefined) sendResponse(answer);
      return false;
    });
  }

  // The top page starts right away. Inner frames start on the first sign that the user is there.
  if (isTopFrame(view) || view.document.hasFocus()) start();
  else for (const name of START_EVENTS) view.addEventListener(name, start, true);
}

try {
  main();
} catch (error) {
  // Never disturb the page.
}
