// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Helpers for the browser tests. The tests load the built extension (dist/)
 * into a real Chromium and type with real key events.
 *
 * Playwright is not a dependency of the project. The tests use the copy that
 * is installed on the machine (set NODE_PATH or PLAYWRIGHT_PATH if needed).
 */
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.csv': 'text/csv' };

export function loadPlaywright() {
  const places = [process.env.PLAYWRIGHT_PATH, process.cwd() + '/', '/opt/node-tools/node_modules/'].filter(Boolean);
  for (const place of places) {
    try {
      return createRequire(place.endsWith('/') ? place : place + '/')('playwright');
    } catch (error) { /* try the next place */ }
  }
  throw new Error('Playwright was not found. Install it or set PLAYWRIGHT_PATH to the folder that contains it.');
}

/* A tiny static server for the manual test pages. It serves local files only. */
export async function startServer(dir) {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      const file = path.join(dir, path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, ''));
      if (!file.startsWith(dir)) throw new Error('outside');
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(body);
    } catch (error) {
      response.writeHead(404);
      response.end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { origin: 'http://127.0.0.1:' + server.address().port, close: () => new Promise((resolve) => server.close(resolve)) };
}

const sessions = new WeakMap();

async function session(page) {
  if (!sessions.has(page)) sessions.set(page, await page.context().newCDPSession(page));
  return sessions.get(page);
}

/* Types text the way a keyboard does: a real key press for every character, with the key the layout produces. */
export async function typeKeys(page, text) {
  const cdp = await session(page);
  for (const ch of text) {
    if (ch === '\n') {
      await page.keyboard.press('Enter');
      continue;
    }
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
  }
  // In a rich editor the replacement runs a moment after the key (see engine.js). No person types faster than this.
  await pause(40);
}

export function createReporter() {
  const results = [];
  return {
    results,
    async check(name, fn) {
      try {
        await fn();
        results.push({ name, ok: true });
        process.stdout.write('  ok    ' + name + '\n');
      } catch (error) {
        results.push({ name, ok: false, error: String(error && error.message ? error.message : error) });
        process.stdout.write('  FAIL  ' + name + '\n        ' + String(error && error.message ? error.message : error).split('\n').join('\n        ') + '\n');
      }
    },
    summary() {
      const failed = results.filter((item) => !item.ok);
      process.stdout.write('\nBrowser tests: ' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed, ' + results.length + ' total\n');
      return failed.length === 0;
    }
  };
}

export function equal(actual, expected, label) {
  if (actual !== expected) {
    throw new Error((label ? label + ': ' : '') + 'expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
  }
}

export function truthy(value, label) {
  if (!value) throw new Error(label || 'expected a true value');
}

export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* A free local port, for the browser's debugging interface. */
export async function freePort() {
  const probe = http.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/*
 * The real toolbar popup is not listed as a page by the test library, so it is
 * driven through the browser's local debugging interface (this machine only).
 * Returns { evaluate(expression), close() }.
 */
export async function attachToTarget(port, url, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 8000);
  let target = null;
  while (!target && Date.now() < deadline) {
    const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    target = list.find((item) => item.type === 'page' && item.url === url) || null;
    if (!target) await pause(150);
  }
  if (!target) throw new Error('target not found: ' + url);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let next = 0;
  const waiting = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) {
      waiting.get(message.id)(message);
      waiting.delete(message.id);
    }
  });
  const send = (method, params) => new Promise((resolve) => {
    const callId = ++next;
    waiting.set(callId, resolve);
    socket.send(JSON.stringify({ id: callId, method, params }));
  });
  return {
    async evaluate(expression) {
      const answer = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (answer.error || (answer.result && answer.result.exceptionDetails)) {
        throw new Error('evaluate failed: ' + JSON.stringify(answer.error || answer.result.exceptionDetails.exception));
      }
      return answer.result.result.value;
    },
    close() {
      socket.close();
    }
  };
}
