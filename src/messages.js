// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Messages between the parts of the extension. There is exactly one: the
 * popup asks the content script of the active tab for the name of the site.
 * The answer holds the site name only. It never holds shortcuts or typed text.
 */
import { isPlainObject } from './core/validate.js';

export const MESSAGE = Object.freeze({ GET_HOST: 'hoppa:get-host' });

/* Accepts only a message from this extension, of a known type, with the exact expected shape. */
export function isAcceptedMessage(message, sender, ownId) {
  if (!sender || typeof ownId !== 'string' || sender.id !== ownId) return false;
  if (!isPlainObject(message)) return false;
  const keys = Object.keys(message);
  return keys.length === 1 && keys[0] === 'type' && message.type === MESSAGE.GET_HOST;
}

/* Returns the answer, or undefined when the message is dropped silently. */
export function answerMessage(message, sender, ownId, host) {
  if (!isAcceptedMessage(message, sender, ownId)) return undefined;
  return { host: typeof host === 'string' ? host : '' };
}

export function isHostAnswer(answer) {
  return isPlainObject(answer) && typeof answer.host === 'string';
}
