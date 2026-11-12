// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Building blocks for the extension's pages. Every text goes in as text
 * (textContent or a text node); markup is never built from strings.
 */
import { displayAbbr } from '../core/validate.js';
import { runSmart, smartAbbr } from '../smart/index.js';
import { NUMBER_EXAMPLE } from '../smart/number.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const COIL_PATH = 'M15.5 4C14 .6 13 .6 12 4S10 7.4 9 4 7 .6 6 4 4 7.4 3 4L.5 4';

export function $(selector, root) {
  return (root || document).querySelector(selector);
}

export function $$(selector, root) {
  return Array.from((root || document).querySelectorAll(selector));
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

/* A small line icon: view box, size, paths (or shapes), stroke width. */
export function svg(className, viewBox, width, height, shapes, strokeWidth) {
  const node = document.createElementNS(SVG_NS, 'svg');
  if (className) node.setAttribute('class', className);
  node.setAttribute('viewBox', viewBox);
  if (width) node.setAttribute('width', width);
  if (height) node.setAttribute('height', height);
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', strokeWidth || 2);
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('focusable', 'false');
  for (const shape of shapes) {
    const isPath = typeof shape === 'string';
    const child = document.createElementNS(SVG_NS, isPath ? 'path' : shape.tag);
    if (isPath) child.setAttribute('d', shape);
    else for (const key of Object.keys(shape)) if (key !== 'tag') child.setAttribute(key, shape[key]);
    node.appendChild(child);
  }
  return node;
}

export function coil(extraClass) {
  const node = svg('coil-mini' + (extraClass ? ' ' + extraClass : ''), '0 0 16 8', null, null, [COIL_PATH], 1.5);
  node.firstChild.setAttribute('vector-effect', 'non-scaling-stroke');
  return node;
}

/* Text with line breaks: every line is a text node, with a small mark between them. */
export function fillText(node, text) {
  node.textContent = '';
  String(text).split('\n').forEach((line, index) => {
    if (index > 0) {
      const mark = el('span', 'nl', '↵');
      mark.setAttribute('aria-hidden', 'true');
      node.appendChild(mark);
    }
    node.appendChild(document.createTextNode(line));
  });
  return node;
}

/* "Saves": the length of the text minus the length of the shortcut, always calculated. */
export function gain(abbr, text) {
  const saved = String(text).length - String(abbr).length;
  return saved > 0 ? '+' + saved : '—';
}

/*
 * A shortcut is shown right to left, like the rest of the page. A shortcut in
 * English letters is shown left to right, so the trigger stays in front of it
 * ("/abc" and not "abc/"). The first letter decides, as it does when typing.
 */
export function setAbbrText(node, abbr) {
  node.textContent = abbr;
  const first = /[A-Za-z\u0590-\u05FF]/.exec(abbr);
  if (first && /[A-Za-z]/.test(first[0])) node.dir = 'ltr';
  else node.removeAttribute('dir');
  return node;
}

export function shownAbbr(shortcut) {
  return displayAbbr(shortcut);
}

/* The live value of a smart shortcut, for display. The number shows a fixed example. */
export function smartValue(id, settings, now) {
  if (id === 'number') return runSmart('number', { now, settings, number: NUMBER_EXAMPLE.number }) || '';
  return runSmart(id, { now, settings }) || '';
}

export function smartShownAbbr(id) {
  return smartAbbr(id);
}

/* A message that appears for a moment at the bottom. */
export function createToast(node, duration) {
  let timer = null;
  return function show(message, keep) {
    node.textContent = message;
    node.classList.remove('on');
    void node.offsetWidth;
    node.classList.add('on');
    clearTimeout(timer);
    if (!keep) timer = setTimeout(() => node.classList.remove('on'), duration);
  };
}

export function matchesSearch(query, parts) {
  if (!query) return true;
  return parts.some((part) => typeof part === 'string' && part.includes(query));
}
