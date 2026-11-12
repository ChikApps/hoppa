// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

import { DATE_SEPARATOR } from '../config.js';

function two(number) {
  return String(number).padStart(2, '0');
}

/* Day, month, year: the order used in Israel. */
export function formatGregorianDate(date) {
  return [two(date.getDate()), two(date.getMonth() + 1), String(date.getFullYear())].join(DATE_SEPARATOR);
}

export default {
  id: 'gDate',
  run(ctx) {
    return formatGregorianDate(ctx.now);
  }
};
