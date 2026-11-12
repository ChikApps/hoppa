// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * The popup: a general on/off switch, "off on this site", search, and the list.
 * A click on a row copies the full text. Every text is written as text.
 */
import { createStore } from '../storage/index.js';
import { normalizeHost } from '../core/validate.js';
import { SMART_TABLE } from '../smart/table.js';
import { MESSAGE, isHostAnswer } from '../messages.js';
import { LIMITS } from '../limits.js';
import { TEXT, errorText } from './strings.js';
import { $, el, svg, coil, fillText, gain, shownAbbr, smartValue, smartShownAbbr, createToast, matchesSearch, setAbbrText } from './ui.js';
import { connectTheme } from './themeSync.js';

/* On this site the switch "replacement in Google Docs" decides, not the site switch. */
const DOCS_HOST = 'docs.google.com';

const store = createStore(chrome.storage);
const popup = $('#popup');
const list = $('#list');
const search = $('#q');
const toastNode = $('#toast');
const power = $('#power');
const powerLabel = $('#powerLabel');
const siteRow = $('#siteRow');
const siteOff = $('#siteOff');
const banner = $('#banner');
const showToast = createToast(toastNode, 1500);

let snapshot = null;
let page = { kind: 'blocked', host: '' };
const themeLink = connectTheme(store, () => snapshot);

function toast(message, isError) {
  toastNode.classList.toggle('err', isError === true);
  showToast(message);
}

/* Asks the content script of the active tab for the site name. No answer means a page extensions cannot run in. */
async function detectPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || typeof tab.id !== 'number') return { kind: 'blocked', host: '' };
    const answer = await chrome.tabs.sendMessage(tab.id, { type: MESSAGE.GET_HOST }, { frameId: 0 });
    const host = isHostAnswer(answer) ? normalizeHost(answer.host) : null;
    if (host === null) return { kind: 'blocked', host: '' };
    return { kind: host === DOCS_HOST ? 'docs' : 'normal', host };
  } catch (error) {
    return { kind: 'blocked', host: '' };
  }
}

function isSiteOff() {
  return page.host !== '' && snapshot.settings.disabledSites.includes(page.host);
}

function openSettings() {
  chrome.tabs.create({ url: chrome.runtime.getURL('options.html#settings') });
  window.close();
}

function renderStatus() {
  const settings = snapshot.settings;
  const on = settings.enabled;
  const docsOff = page.kind === 'docs' && !settings.docs;
  power.checked = on;
  powerLabel.textContent = on ? TEXT.on : TEXT.off;
  popup.classList.toggle('is-off', !on);
  siteOff.checked = isSiteOff();
  siteRow.classList.toggle('is-checked', isSiteOff());
  $('#domain').textContent = page.host;

  banner.textContent = '';
  banner.className = 'p-banner';
  let show = true;
  if (!on) {
    banner.textContent = TEXT.popupExtensionOff;
  } else if (page.kind === 'blocked') {
    banner.classList.add('info');
    banner.textContent = TEXT.popupNoAccess;
  } else if (docsOff) {
    const span = el('span');
    span.appendChild(document.createTextNode(TEXT.popupDocsOff));
    const link = el('a', null, TEXT.popupDocsOffLink);
    link.href = 'options.html#settings';
    link.addEventListener('click', (event) => {
      event.preventDefault();
      openSettings();
    });
    span.appendChild(link);
    banner.appendChild(span);
  } else if (isSiteOff()) {
    banner.textContent = TEXT.popupSiteOff;
  } else {
    show = false;
  }
  banner.hidden = !show;
  siteRow.hidden = !on || page.kind === 'blocked' || docsOff;
}

function makeRow(abbr, text, smart) {
  const row = el('button', 'row' + (smart ? ' smart' : ''));
  row.type = 'button';
  row.dataset.text = text;
  const chip = setAbbrText(el('span', 'chip' + (smart ? ' smart' : '')), abbr);
  chip.title = abbr;
  row.appendChild(chip);
  row.appendChild(coil());
  row.appendChild(fillText(el('span', 'row-text'), text));
  if (!smart) row.appendChild(el('span', 'gain', gain(abbr, text)));
  return row;
}

function group(id, title, aside) {
  const section = el('section');
  section.setAttribute('aria-labelledby', id);
  const heading = el('h2', 'grp-h');
  heading.id = id;
  heading.appendChild(el('span', null, title));
  if (aside) {
    const side = el('span', null, aside);
    side.title = TEXT.gainTitle;
    heading.appendChild(side);
  }
  section.appendChild(heading);
  return section;
}

function render() {
  const query = search.value.trim();
  const now = new Date();
  const settings = snapshot.settings;

  const smart = SMART_TABLE
    .filter((row) => settings.smart[row.id])
    .map((row) => ({
      abbr: row.id === 'number' ? TEXT.numberExampleAbbr : smartShownAbbr(row.id),
      text: smartValue(row.id, settings, now)
    }))
    .filter((row) => row.text !== '' && matchesSearch(query, [row.abbr, row.text]));
  const all = snapshot.shortcuts;
  const mine = all
    .filter((shortcut) => shortcut.enabled)
    .filter((shortcut) => matchesSearch(query, [shownAbbr(shortcut), shortcut.text, shortcut.label]));

  list.textContent = '';
  if (query && smart.length === 0 && mine.length === 0) {
    list.appendChild(el('p', 'p-none', TEXT.noResults));
    return;
  }
  if (smart.length > 0) {
    const section = group('g1', TEXT.smartTitle);
    for (const row of smart) section.appendChild(makeRow(row.abbr, row.text, true));
    list.appendChild(section);
  }
  if (all.length === 0) {
    const section = group('g2', TEXT.mineTitle);
    const empty = el('p', 'p-empty');
    empty.appendChild(svg(null, '0 0 34 18', 34, 18, ['M32 9c-1-6-2-6-3 0s-2 6-3 0-2-6-3 0-2 6-3 0-2-6-3 0-2 6-3 0-2-6-3 0-2 6-3 0'], 2));
    empty.appendChild(el('span', null, TEXT.popupEmpty));
    section.appendChild(empty);
    list.appendChild(section);
  } else if (mine.length > 0) {
    const section = group('g2', TEXT.mineTitle, TEXT.gain);
    for (const shortcut of mine) section.appendChild(makeRow(shownAbbr(shortcut), shortcut.text, false));
    list.appendChild(section);
  }
}

/* ---------- copy on click: an extra tool on every site, not a substitute for the automatic replacement ---------- */
function markCopied(row) {
  toast(TEXT.copied, false);
  row.classList.remove('copied');
  void row.offsetWidth;
  row.classList.add('copied');
  setTimeout(() => row.classList.remove('copied'), 900);
  row.focus();
}

function fallbackCopy(text) {
  try {
    const area = el('textarea', 'copy-buffer');
    area.value = text;
    area.setAttribute('readonly', '');
    area.setAttribute('aria-hidden', 'true');
    document.body.appendChild(area);
    area.select();
    const done = document.execCommand('copy');
    document.body.removeChild(area);
    return done;
  } catch (error) {
    return false;
  }
}

async function copy(row) {
  const text = row.dataset.text;
  try {
    await navigator.clipboard.writeText(text);
    markCopied(row);
  } catch (error) {
    if (fallbackCopy(text)) markCopied(row);
  }
}

list.addEventListener('click', (event) => {
  const row = event.target.closest('.row');
  if (row) copy(row);
});

/* ---------- keyboard: arrows between rows, Enter copies, Escape clears the search ---------- */
function rows() {
  return Array.from(list.querySelectorAll('.row'));
}

search.addEventListener('keydown', (event) => {
  const first = rows()[0];
  if (event.key === 'ArrowDown' && first) {
    event.preventDefault();
    first.focus();
  }
  if (event.key === 'Enter' && first) {
    event.preventDefault();
    copy(first);
  }
  if (event.key === 'Escape' && search.value) {
    event.preventDefault();
    search.value = '';
    render();
  }
});

list.addEventListener('keydown', (event) => {
  const all = rows();
  const index = all.indexOf(document.activeElement);
  if (index < 0) return;
  if (event.key === 'ArrowDown' && all[index + 1]) {
    event.preventDefault();
    all[index + 1].focus();
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    (all[index - 1] || search).focus();
  }
});

search.addEventListener('input', render);

/* ---------- switches: saved at once ---------- */
async function saveSettings(change) {
  const next = { ...snapshot.settings, disabledSites: snapshot.settings.disabledSites.slice(), smart: { ...snapshot.settings.smart } };
  change(next);
  const result = await store.save([], next);
  if (!result.ok) toast(errorText(result.code), true);
  await reload();
}

power.addEventListener('change', () => {
  const value = power.checked;
  saveSettings((settings) => { settings.enabled = value; });
});

siteOff.addEventListener('change', () => {
  const value = siteOff.checked;
  const host = page.host;
  if (host === '') return;
  saveSettings((settings) => {
    const others = settings.disabledSites.filter((site) => site !== host);
    settings.disabledSites = value ? others.concat(host).slice(-LIMITS.DISABLED_SITES) : others;
  });
});

$('#manage').addEventListener('click', (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
  window.close();
});

async function reload() {
  snapshot = await store.load();
  themeLink.apply(snapshot.settings.theme);
  renderStatus();
  render();
}

async function init() {
  page = await detectPage();
  await reload();
  store.onChanged(() => { reload(); });
  search.focus();
}

init();
