// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

function two(number) {
  return String(number).padStart(2, '0');
}

/* 24 hours, by the clock of the computer. */
export function formatTime(date) {
  return two(date.getHours()) + ':' + two(date.getMinutes());
}

export default {
  id: 'time',
  run(ctx) {
    return formatTime(ctx.now);
  }
};
