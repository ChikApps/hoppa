// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * The weekly Torah portion, calculated locally by hebcal (no network).
 * Sunday to Shabbat: the portion of the coming Shabbat (on Shabbat: of that day).
 */
import { HDate } from '@hebcal/hdate';
import { getSedra } from '@hebcal/core/dist/esm/sedra';
import { PARASHA_NAMES, HOLIDAY_SHABBAT, PARASHA_PREFIX, PARASHA_JOINER } from './parashaNames.js';

/* calendar: 'il' (Land of Israel, the default) or 'diaspora'. */
export function formatParasha(date, calendar) {
  const israel = calendar !== 'diaspora';
  const today = new HDate(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
  const shabbat = today.onOrAfter(6);
  const result = getSedra(shabbat.getFullYear(), israel).lookup(shabbat);

  if (result.chag) {
    const key = result.parsha[0];
    return Object.prototype.hasOwnProperty.call(HOLIDAY_SHABBAT, key) ? HOLIDAY_SHABBAT[key] : null;
  }

  const numbers = Array.isArray(result.num) ? result.num : [result.num];
  const names = [];
  for (const number of numbers) {
    const name = PARASHA_NAMES[number - 1];
    if (typeof name !== 'string') return null;
    names.push(name);
  }
  return names.length > 0 ? PARASHA_PREFIX + names.join(PARASHA_JOINER) : null;
}

export default {
  id: 'parasha',
  run(ctx) {
    return formatParasha(ctx.now, ctx.settings.calendar);
  }
};
