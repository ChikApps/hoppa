// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * The last characters the user really typed in one field. Memory only: it is
 * never written to the page, to storage, to a message or to a log.
 */
import { typedConfirms } from './matcher.js';

export class TypedBuffer {
  #max;
  #target = null;
  #chars = '';
  /*
   * After a clear that the page itself caused (a made-up event), the start of
   * the buffer is not a start of a word: a shortcut then counts only after a
   * space or a mark that the user really typed.
   */
  #needsBoundary = false;

  constructor(max) {
    this.#max = max;
  }

  push(target, char) {
    if (target !== this.#target) {
      this.#target = target;
      this.#chars = '';
      this.#needsBoundary = false;
    }
    this.#chars = (this.#chars + char).slice(-this.#max);
  }

  /* One character was deleted with Backspace. */
  pop(target) {
    if (target !== this.#target) {
      this.clear();
      return;
    }
    this.#chars = this.#chars.slice(0, -1);
  }

  /* atWordStart = false when the clear came from the page and not from the user. */
  clear(atWordStart = true) {
    if (atWordStart) {
      this.#target = null;
      this.#needsBoundary = false;
    } else {
      // The field stays the same, so the mark is not dropped by the next character.
      this.#needsBoundary = true;
    }
    this.#chars = '';
  }

  get size() {
    return this.#chars.length;
  }

  /* True only when the typed characters, in this same field, end with `fieldText`. */
  confirms(target, fieldText) {
    if (target === null || target !== this.#target) return false;
    if (this.#needsBoundary && this.#chars.length <= fieldText.length) return false;
    return typedConfirms(this.#chars, fieldText);
  }
}
