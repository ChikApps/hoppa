// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/* Export: a full backup (JSON, with the settings) or a table for Excel (CSV). */
import { displayAbbr } from '../core/validate.js';
import { CURRENT_SCHEMA } from '../storage/migrations.js';
import { writeCsv } from './csv.js';
import { APP_NAME } from './importFile.js';

export function exportJson(snapshot, exportedAt) {
  return JSON.stringify({
    app: APP_NAME,
    schemaVersion: CURRENT_SCHEMA,
    exportedAt,
    settings: snapshot.settings,
    shortcuts: snapshot.shortcuts.map((shortcut) => ({
      abbr: displayAbbr(shortcut),
      text: shortcut.text,
      label: shortcut.label,
      enabled: shortcut.enabled,
      format: shortcut.format
    }))
  }, null, 2);
}

export function exportCsv(shortcuts, headers) {
  const rows = [headers];
  for (const shortcut of shortcuts) rows.push([displayAbbr(shortcut), shortcut.text, shortcut.label]);
  return writeCsv(rows);
}

export function dateStamp(date) {
  const two = (number) => String(number).padStart(2, '0');
  return date.getFullYear() + '-' + two(date.getMonth() + 1) + '-' + two(date.getDate());
}
