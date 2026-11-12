// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * The management page: my shortcuts, smart shortcuts, settings and about.
 * Every text (a shortcut, a description, a site name, anything from an
 * imported file) is written as text. Markup is never built from strings.
 */
import { TRIGGER } from '../config.js';
import { LIMITS } from '../limits.js';
import { createStore, countLimit } from '../storage/index.js';
import { KEYS } from '../storage/keys.js';
import { validateShortcut, checkAbbr, displayAbbr, newId } from '../core/validate.js';
import { SMART_TABLE } from '../smart/table.js';
import { parseImportFile, prepareImport, buildImportPlan } from '../io/importFile.js';
import { exportJson, exportCsv, dateStamp } from '../io/exportFile.js';
import {
  TEXT, SMART_TEXT, errorText, packAddedText, importDoneText, importPlanText,
  rejectedText, rejectedRowText, corruptText, labelActive, labelEdit, labelRemove
} from './strings.js';
import { SOURCE_CODE_URL, PRIVACY_POLICY_URL, CONTACT_EMAIL, PUBLISHER } from './links.js';
import { $, $$, el, svg, coil, fillText, gain, smartValue, smartShownAbbr, createToast, matchesSearch, setAbbrText } from './ui.js';
import { connectTheme } from './themeSync.js';
import { createUpdateChecker } from './updateCheck.js';

const NEW = 'new';
const store = createStore(chrome.storage);
const toast = createToast($('#toast'), 1900);
const toastError = createToast($('#toastErr'), 5200);

let snapshot = null;
let selected = null;
const themeLink = connectTheme(store, () => snapshot);

function items() {
  return snapshot ? snapshot.shortcuts : [];
}

function current() {
  return items().find((item) => item.id === selected) || null;
}

/* Every real save goes through here. On failure the view returns to what is really saved. */
async function persist(action, successMessage) {
  let result;
  try {
    result = await action();
  } catch (error) {
    result = { ok: false, code: 'SAVE_FAILED' };
  }
  await reload();
  if (!result.ok) {
    toastError(errorText(result.code));
    return false;
  }
  if (successMessage !== null) toast(successMessage || TEXT.saved);
  return true;
}

function copySettings() {
  const settings = snapshot.settings;
  return { ...settings, disabledSites: settings.disabledSites.slice(), smart: { ...settings.smart } };
}

function saveSettings(change) {
  const next = copySettings();
  change(next);
  return persist(() => store.save([], next));
}

/* ---------- tabs ---------- */
const tabs = $$('[role="tab"]');

function showTab(name, focus) {
  for (const tab of tabs) {
    const on = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
    tab.tabIndex = on ? 0 : -1;
    $('#panel-' + tab.dataset.tab).hidden = !on;
    if (on && focus) tab.focus();
  }
  try {
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  } catch (error) { /* the address stays as it is */ }
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => showTab(tab.dataset.tab));
  tab.addEventListener('keydown', (event) => {
    let next = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== null) {
      event.preventDefault();
      showTab(tabs[next].dataset.tab, true);
    }
  });
});

function showTabFromAddress() {
  const name = location.hash.slice(1);
  if (name === 'mine' || name === 'smart' || name === 'settings') showTab(name);
}
window.addEventListener('hashchange', showTabFromAddress);

/* ---------- table ---------- */
const search = $('#q');
const tbody = $('#tbody');

function renderTable() {
  const query = search.value.trim();
  const all = items();
  const rows = all.filter((item) => matchesSearch(query, [displayAbbr(item), item.text, item.label]));
  $('#emptyState').hidden = all.length > 0;
  $('#tableWrap').hidden = all.length === 0 || rows.length === 0;
  $('#noResults').hidden = !(all.length > 0 && rows.length === 0);
  tbody.textContent = '';

  for (const item of rows) {
    const abbr = displayAbbr(item);
    const tr = el('tr');
    tr.dataset.id = item.id;
    if (item.id === selected) tr.classList.add('is-sel');
    if (!item.enabled) tr.classList.add('is-off');

    const cellAbbr = el('td', 'c-abbr');
    const chip = setAbbrText(el('span', 'chip'), abbr);
    chip.title = abbr;
    cellAbbr.appendChild(chip);
    const cellText = fillText(el('td', 'c-text td-text'), item.text);
    const cellLabel = el('td', 'c-desc td-desc');
    if (item.label) cellLabel.textContent = item.label;
    else cellLabel.appendChild(el('span', 'dash', '—'));
    const cellGain = el('td', 'c-gain');
    cellGain.appendChild(el('span', 'gain', gain(abbr, item.text)));

    const cellOn = el('td', 'c-on');
    const toggle = el('input', 'sw');
    toggle.type = 'checkbox';
    toggle.setAttribute('role', 'switch');
    toggle.dataset.act = 'toggle';
    toggle.setAttribute('aria-label', labelActive(abbr));
    toggle.checked = item.enabled;
    cellOn.appendChild(toggle);

    const cellActions = el('td', 'c-act');
    const actions = el('div', 'row-acts');
    const editButton = el('button', 'btn-text', TEXT.edit);
    editButton.type = 'button';
    editButton.dataset.act = 'edit';
    editButton.setAttribute('aria-label', labelEdit(abbr));
    const removeButton = el('button', 'btn-text danger', TEXT.remove);
    removeButton.type = 'button';
    removeButton.dataset.act = 'del';
    removeButton.setAttribute('aria-label', labelRemove(abbr));
    actions.appendChild(editButton);
    actions.appendChild(removeButton);
    cellActions.appendChild(actions);

    for (const cell of [cellAbbr, cellText, cellLabel, cellGain, cellOn, cellActions]) tr.appendChild(cell);
    tbody.appendChild(tr);
  }
  $('#countMine').textContent = String(all.length);
}

function hopRow(id) {
  const row = $$('tr', tbody).find((tr) => tr.dataset.id === id);
  if (!row) return;
  row.classList.add('hop');
  setTimeout(() => row.classList.remove('hop'), 600);
}

function hasActiveTwin(abbr, exceptId) {
  return items().some((item) => item.id !== exceptId && item.enabled && displayAbbr(item) === abbr);
}

tbody.addEventListener('click', (event) => {
  const tr = event.target.closest('tr');
  if (!tr) return;
  const item = items().find((entry) => entry.id === tr.dataset.id);
  if (!item) return;
  const act = event.target.dataset ? event.target.dataset.act : undefined;
  if (act === 'toggle') {
    const value = event.target.checked;
    if (value && hasActiveTwin(displayAbbr(item), item.id)) {
      event.target.checked = false;
      toastError(errorText('ABBR_EXISTS'));
      return;
    }
    persist(() => store.save([{ ...item, enabled: value, updatedAt: Date.now() }]));
    return;
  }
  if (act === 'del') {
    askDelete(item);
    return;
  }
  select(item.id, act === 'edit');
});

search.addEventListener('input', renderTable);
search.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && search.value) {
    search.value = '';
    renderTable();
  }
});

/* ---------- editor ---------- */
const fieldAbbr = $('#fAbbr');
const fieldText = $('#fText');
const fieldLabel = $('#fDesc');
const fieldOn = $('#fOn');
const ERROR_SLOT = new Map([[fieldAbbr, $('#eAbbr')], [fieldText, $('#eText')], [fieldLabel, $('#eDesc')]]);

/* In a narrow window the editor sits below the table: bring it into view when a row is chosen. */
function revealEditor() {
  if (!window.matchMedia('(max-width: 1100px)').matches) return;
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('.editor').scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
}

function select(id, focus) {
  selected = id;
  showInEditor(current());
  renderTable();
  revealEditor();
  if (focus) fieldAbbr.focus({ preventScroll: true });
}

function startNew() {
  selected = NEW;
  showInEditor(null);
  renderTable();
  showTab('mine');
  revealEditor();
  fieldAbbr.focus({ preventScroll: true });
  fieldAbbr.setSelectionRange(fieldAbbr.value.length, fieldAbbr.value.length);
}

function fillEditor(item) {
  clearErrors();
  $('#edTitle').textContent = item ? TEXT.editTitle : TEXT.newTitle;
  fieldAbbr.value = item ? displayAbbr(item) : TRIGGER;
  fieldText.value = item ? item.text : '';
  fieldLabel.value = item ? item.label : '';
  fieldOn.checked = item ? item.enabled : true;
  $('#btnDel').hidden = !item;
  updateSpring();
}

/* The spring stretches by how much the shortcut saves: 4 loops, 22 to 72 pixels wide. */
function coilPath(width) {
  const loops = 4;
  const step = (width - 4) / loops;
  let x = width;
  let d = 'M' + width + ' 8';
  for (let i = 0; i < loops; i++) {
    const half = step / 2;
    d += ' C' + (x - half * 0.3).toFixed(1) + ' 1 ' + (x - half * 0.7).toFixed(1) + ' 1 ' + (x - half).toFixed(1) + ' 8';
    d += ' S' + (x - step + half * 0.3).toFixed(1) + ' 15 ' + (x - step).toFixed(1) + ' 8';
    x -= step;
  }
  return d + ' L0 8';
}

function updateSpring() {
  const abbr = fieldAbbr.value.trim() || TRIGGER;
  const text = fieldText.value;
  setAbbrText($('#spChip'), abbr);
  $('#spOut').textContent = text || ' ';
  $('#spGain').textContent = gain(abbr, text);
  const ratio = Math.max(0, Math.min(1, (text.length - abbr.length) / 36));
  const width = Math.round(22 + ratio * 50);
  const coilNode = $('#spCoil');
  coilNode.setAttribute('width', width);
  coilNode.setAttribute('viewBox', '0 0 ' + width + ' 16');
  $('#spPath').setAttribute('d', coilPath(width));
}

for (const field of [fieldAbbr, fieldText, fieldLabel]) {
  field.addEventListener('input', () => {
    updateSpring();
    clearError(field);
  });
}

function errorIcon() {
  return svg(null, '0 0 24 24', 14, 14, [{ tag: 'circle', cx: 12, cy: 12, r: 9 }, 'M12 7.5v5.5M12 16.5v.01'], 2.5);
}

function setError(field, message) {
  const slot = ERROR_SLOT.get(field);
  field.closest('.f').classList.add('has-err');
  field.setAttribute('aria-invalid', 'true');
  slot.textContent = '';
  slot.appendChild(errorIcon());
  slot.appendChild(el('span', null, message));
  slot.hidden = false;
}

function clearError(field) {
  field.closest('.f').classList.remove('has-err');
  field.removeAttribute('aria-invalid');
  ERROR_SLOT.get(field).hidden = true;
}

function clearErrors() {
  for (const field of ERROR_SLOT.keys()) clearError(field);
}

function fieldOfError(code) {
  if (code.startsWith('TEXT_')) return fieldText;
  if (code.startsWith('LABEL_')) return fieldLabel;
  return fieldAbbr;
}

$('#edForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const abbr = fieldAbbr.value.trim();
  const text = fieldText.value;
  const label = fieldLabel.value;
  const enabled = fieldOn.checked;
  const editing = current();
  const now = Date.now();
  clearErrors();

  // The same order as in the design: the shortcut first, then the text.
  let abbrError = checkAbbr(abbr);
  if (!abbrError && enabled && hasActiveTwin(abbr, editing ? editing.id : null)) abbrError = 'ABBR_EXISTS';
  if (abbrError) setError(fieldAbbr, errorText(abbrError));
  if (text.trim().length === 0) setError(fieldText, errorText('TEXT_EMPTY'));
  if (abbrError || text.trim().length === 0) {
    (abbrError ? fieldAbbr : fieldText).focus();
    return;
  }

  const builtin = editing ? editing.builtin : false;
  const checked = validateShortcut({
    id: editing ? editing.id : newId(),
    abbr: builtin ? abbr.slice(TRIGGER.length) : abbr,
    text,
    label,
    enabled,
    format: 'plain',
    builtin,
    createdAt: editing ? editing.createdAt : now,
    updatedAt: now
  });
  if (!checked.ok) {
    const field = fieldOfError(checked.code);
    setError(field, errorText(checked.code));
    field.focus();
    return;
  }

  const id = checked.value.id;
  selected = id;
  const saved = await persist(() => store.save([checked.value]));
  if (saved) hopRow(id);
  else if (!editing) selected = NEW;
});

$('#btnCancel').addEventListener('click', () => {
  if (selected === NEW) selected = items()[0] ? items()[0].id : NEW;
  showInEditor(current());
  renderTable();
});
$('#btnDel').addEventListener('click', () => {
  const item = current();
  if (item) askDelete(item);
});
$('#btnNew').addEventListener('click', startNew);

/* ---------- delete, with a confirmation ---------- */
const deleteDialog = $('#dlgDel');

function askDelete(item) {
  setAbbrText($('#dDelAbbr'), displayAbbr(item));
  deleteDialog.returnValue = '';
  deleteDialog.addEventListener('close', async function onClose() {
    deleteDialog.removeEventListener('close', onClose);
    if (deleteDialog.returnValue !== 'yes') return;
    if (selected === item.id) selected = null;
    await persist(() => store.removeShortcut(item.id));
  });
  deleteDialog.showModal();
}

/* ---------- import: check the whole file, ask, show a summary, and only then write ---------- */
const conflictDialog = $('#dlgImp');
const summaryDialog = $('#dlgSum');

function askDialog(dialog, fallback) {
  return new Promise((resolve) => {
    dialog.returnValue = '';
    dialog.addEventListener('close', function onClose() {
      dialog.removeEventListener('close', onClose);
      resolve(dialog.returnValue || fallback);
    });
    dialog.showModal();
  });
}

function askConflict(abbr) {
  setAbbrText($('#dImpAbbr'), abbr);
  return askDialog(conflictDialog, 'skip');
}

function askSummary(plan) {
  $('#dSumT').textContent = importPlanText(plan.imported, plan.skipped);
  const rejected = plan.rejected.length;
  const list = $('#dSumList');
  const why = $('#dSumWhy');
  list.textContent = '';
  list.hidden = true;
  why.setAttribute('aria-expanded', 'false');
  $('#dSumRejected').hidden = rejected === 0;
  $('#dSumRejectedText').textContent = rejected > 0 ? rejectedText(rejected) : '';
  for (const item of plan.rejected) list.appendChild(el('li', null, rejectedRowText(item.row, item.code)));
  const note = $('#dSumSettings');
  note.hidden = plan.settings === undefined;
  note.textContent = plan.settings === undefined ? '' : TEXT.importSettingsNote;
  $('#dSumOk').disabled = plan.writes.length === 0 && plan.settings === undefined;
  return askDialog(summaryDialog, 'no');
}

$('#dSumWhy').addEventListener('click', () => {
  const list = $('#dSumList');
  list.hidden = !list.hidden;
  $('#dSumWhy').setAttribute('aria-expanded', list.hidden ? 'false' : 'true');
});

async function handleImport(file) {
  // The size is checked before the file is read.
  if (file.size > LIMITS.IMPORT_BYTES) {
    toastError(errorText('FILE_TOO_BIG'));
    return;
  }
  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    toastError(errorText('FILE_INVALID'));
    return;
  }
  const parsed = parseImportFile(bytes, file.name);
  if (!parsed.ok) {
    toastError(errorText(parsed.code));
    return;
  }
  if (snapshot.readOnly) {
    toastError(errorText('READ_ONLY'));
    return;
  }

  const now = Date.now();
  const prepared = prepareImport(parsed, items(), now);
  // The limit is checked before any question is asked, so the summary never promises what cannot be saved.
  const limit = countLimit(snapshot.area);
  const limitCode = snapshot.area === 'local' ? 'LIMIT_LOCAL' : 'LIMIT_SYNC';
  if (prepared.fresh.length > 0 && items().length + prepared.fresh.length > limit) {
    toastError(errorText(limitCode));
    return;
  }
  const decisions = new Map();
  for (const conflict of prepared.conflicts) {
    decisions.set(conflict.record.abbr, await askConflict(conflict.record.abbr));
  }
  const plan = buildImportPlan(prepared, decisions, now);
  if (plan.added > 0 && items().length + plan.added > limit) {
    toastError(errorText(limitCode));
    return;
  }
  // Settings from the file count only when they differ from the current ones.
  if (plan.settings !== undefined && JSON.stringify(plan.settings) === JSON.stringify(snapshot.settings)) plan.settings = undefined;
  if ((await askSummary(plan)) !== 'yes') return;
  await persist(() => store.save(plan.writes, plan.settings), importDoneText(plan.imported, plan.skipped));
}

$('#btnImport').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (file) await handleImport(file);
});

/* ---------- export ---------- */
const exportMenu = $('#exportMenu');
const exportButton = $('#btnExport');

function openMenu(open) {
  exportMenu.hidden = !open;
  exportButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    const first = $('button', exportMenu);
    if (first) first.focus();
  }
}

exportButton.addEventListener('click', () => openMenu(exportMenu.hidden));
document.addEventListener('click', (event) => {
  if (!exportMenu.hidden && !event.target.closest('.menu-wrap')) openMenu(false);
});
exportMenu.addEventListener('keydown', (event) => {
  const buttons = $$('button', exportMenu);
  const index = buttons.indexOf(document.activeElement);
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    buttons[(index + 1) % buttons.length].focus();
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    buttons[(index - 1 + buttons.length) % buttons.length].focus();
  }
  if (event.key === 'Escape') {
    openMenu(false);
    exportButton.focus();
  }
});

/* A download through a link. The file type is always a data file, never a web page. */
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 800);
  toast(TEXT.exported);
}

exportMenu.addEventListener('click', (event) => {
  const button = event.target.closest('[data-fmt]');
  if (!button) return;
  openMenu(false);
  const now = new Date();
  if (button.dataset.fmt === 'json') {
    download('hoppa-backup-' + dateStamp(now) + '.json', exportJson(snapshot, now.toISOString()), 'application/json');
  } else {
    download('hoppa-' + dateStamp(now) + '.csv', exportCsv(items(), TEXT.csvHeaders), 'text/csv;charset=utf-8');
  }
});

/* ---------- restore the ready-made pack: only what is missing, nothing is overwritten ---------- */
async function restorePack() {
  let added = 0;
  const ok = await persist(async () => {
    const result = await store.restorePack(Date.now());
    if (result.ok) added = result.added;
    return result;
  }, null);
  if (ok) toast(added === 0 ? TEXT.packNothing : packAddedText(added));
}

$('#btnRestore').addEventListener('click', restorePack);
$('#emptyState').addEventListener('click', (event) => {
  const act = event.target.dataset ? event.target.dataset.act : undefined;
  if (act === 'new') startNew();
  if (act === 'restore') restorePack();
});

/* ---------- smart shortcuts ---------- */
function renderSmart() {
  const now = new Date();
  const settings = snapshot.settings;
  const list = $('#smartList');
  list.textContent = '';
  for (const row of SMART_TABLE) {
    const on = settings.smart[row.id] === true;
    const isNumber = row.id === 'number';
    const label = isNumber ? TEXT.numberListAbbr : smartShownAbbr(row.id);
    const value = smartValue(row.id, settings, now);
    const item = el('li', 'smart-item' + (on ? '' : ' is-off'));
    item.appendChild(el('span', 'chip smart lg', label));
    item.appendChild(coil('lg'));

    const body = el('div', 'si-body');
    body.appendChild(el('p', 'si-desc', SMART_TEXT[row.id].desc));
    const line = el('p', 'si-now');
    if (isNumber) {
      line.appendChild(document.createTextNode(TEXT.forExample));
      line.appendChild(el('bdi', 'chip smart', TEXT.numberExampleAbbr));
      line.appendChild(document.createTextNode(TEXT.arrow));
      line.appendChild(el('bdi', 'si-val', value));
    } else {
      line.appendChild(document.createTextNode(TEXT.now));
      const live = el('bdi', 'si-val', value);
      live.dataset.live = row.id;
      line.appendChild(live);
    }
    body.appendChild(line);
    if (SMART_TEXT[row.id].note) body.appendChild(el('p', 'si-note', SMART_TEXT[row.id].note));
    item.appendChild(body);

    const toggle = el('input', 'sw');
    toggle.type = 'checkbox';
    toggle.setAttribute('role', 'switch');
    toggle.dataset.id = row.id;
    toggle.checked = on;
    toggle.setAttribute('aria-label', label + ' ' + SMART_TEXT[row.id].desc);
    item.appendChild(toggle);
    list.appendChild(item);
  }
  $('#countSmart').textContent = String(SMART_TABLE.length);
}

$('#smartList').addEventListener('change', (event) => {
  const id = event.target.dataset ? event.target.dataset.id : undefined;
  if (!id) return;
  const value = event.target.checked;
  saveSettings((settings) => { settings.smart[id] = value; });
});

// The time and the dates stay current while the page is open.
setInterval(() => {
  if (!snapshot) return;
  const now = new Date();
  for (const node of $$('[data-live]')) node.textContent = smartValue(node.dataset.live, snapshot.settings, now);
}, 30000);

/* ---------- settings: every change is saved at once ---------- */
function renderSettings() {
  const settings = snapshot.settings;
  const now = new Date();
  for (const name of ['calendar', 'suffix']) {
    for (const radio of $$('input[name="' + name + '"]')) radio.checked = radio.value === settings[name];
  }
  $('#pvParashaAbbr').textContent = smartShownAbbr('parasha');
  $('#pvParasha').textContent = smartValue('parasha', settings, now);
  $('#pvNumberAbbr').textContent = TEXT.numberExampleAbbr;
  $('#pvNumber').textContent = smartValue('number', settings, now);
  $('#docsSw').checked = settings.docs;

  const sites = $('#sites');
  sites.textContent = '';
  for (const site of settings.disabledSites) {
    const item = el('li');
    item.appendChild(el('bdi', 'domain', site));
    const button = el('button', 'btn-text', TEXT.enableAgain);
    button.type = 'button';
    button.dataset.site = site;
    item.appendChild(button);
    sites.appendChild(item);
  }
  $('#sitesEmpty').hidden = settings.disabledSites.length > 0;

  const syncOff = snapshot.syncOff;
  const side = $('#syncSide');
  const box = $('#syncBox');
  side.classList.toggle('warn', syncOff);
  box.classList.toggle('warn', syncOff);
  $('span', side).textContent = syncOff ? TEXT.syncOff : TEXT.syncSide;
  $('span', box).textContent = syncOff ? TEXT.syncOff : TEXT.syncFull;

  const corrupt = snapshot.corrupt.length;
  $('#corruptBox').hidden = corrupt === 0;
  $('#corruptText').textContent = corrupt > 0 ? corruptText(corrupt) : '';

  const readOnlyBox = $('#readOnlyBox');
  readOnlyBox.hidden = !snapshot.readOnly;
  $('span', readOnlyBox).textContent = snapshot.readOnly ? errorText('READ_ONLY') : '';
}

for (const name of ['calendar', 'suffix']) {
  for (const radio of $$('input[name="' + name + '"]')) {
    radio.addEventListener('change', () => {
      const value = radio.value;
      saveSettings((settings) => { settings[name] = value; });
    });
  }
}

$('#docsSw').addEventListener('change', (event) => {
  const value = event.target.checked;
  saveSettings((settings) => { settings.docs = value; });
});

$('#sites').addEventListener('click', async (event) => {
  const site = event.target.dataset ? event.target.dataset.site : undefined;
  if (!site) return;
  const saved = await saveSettings((settings) => {
    settings.disabledSites = settings.disabledSites.filter((item) => item !== site);
  });
  if (saved) ($('#sites button') || $('#docsSw')).focus();
});

$('#btnCorrupt').addEventListener('click', () => {
  const keys = snapshot.corrupt.filter((key) => key.startsWith(KEYS.SHORTCUT));
  persist(() => store.remove(keys));
});

/* ---------- about: fixed links from the code only ---------- */
/* A line with a link is shown only when its address exists. */
function setupLink(link, url) {
  if (url) link.href = url;
  else link.closest('p').hidden = true;
}

function renderAbout() {
  setupLink($('#codeLink'), SOURCE_CODE_URL);
  setupLink($('#privacyLink'), PRIVACY_POLICY_URL);
  $('#contact').textContent = CONTACT_EMAIL;
  $('#publisher').textContent = PUBLISHER;
  $('#ver').textContent = TEXT.version + chrome.runtime.getManifest().version;
}

/* ---------- check for update: Chrome checks the store; the extension itself requests nothing ---------- */
function hasUnsavedEdits() {
  const item = current();
  if (!item) return fieldText.value.length > 0 || fieldLabel.value.length > 0 || fieldAbbr.value.trim() !== TRIGGER;
  return fieldAbbr.value.trim() !== displayAbbr(item) || fieldText.value !== item.text ||
    fieldLabel.value.trim() !== item.label || fieldOn.checked !== item.enabled;
}

const updateButton = $('#btnUpdate');
const updateChecker = createUpdateChecker({
  runtime: chrome.runtime,
  hasUnsavedEdits,
  onStatus(status) {
    $('#updateStatus').textContent = TEXT.update[status] || '';
    updateButton.disabled = status === 'checking' || status === 'found';
  }
});
updateButton.addEventListener('click', () => { updateChecker.check(); });

/* ---------- start ---------- */
let editorShows = null;

function editorStamp(item) {
  return selected + ':' + (item ? item.updatedAt : '');
}

/* Fills the editor and remembers what it shows. */
function showInEditor(item) {
  editorShows = editorStamp(item);
  fillEditor(item);
}

function renderAll() {
  if (selected !== NEW && !current()) selected = items()[0] ? items()[0].id : NEW;
  // The editor is refilled only when the selected shortcut changed, so typing is not lost when storage changes.
  const item = current();
  if (editorStamp(item) !== editorShows) showInEditor(item);
  renderTable();
  renderSmart();
  renderSettings();
}

async function reload() {
  snapshot = await store.load();
  themeLink.apply(snapshot.settings.theme);
  renderAll();
}

async function init() {
  renderAbout();
  await reload();
  showTabFromAddress();
  store.onChanged(() => { reload(); });
}

init();
