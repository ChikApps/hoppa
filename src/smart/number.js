// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

import { amountInWords } from './numberWords.js';

/* The only smart shortcut that is a pattern (trigger + digits) and not a fixed shortcut. */
export default {
  id: 'number',
  run(ctx) {
    if (!ctx.number) return null;
    return amountInWords(ctx.number.shekels, ctx.number.agorot, ctx.settings.suffix);
  }
};

export const NUMBER_EXAMPLE = Object.freeze({ digits: '1500', number: Object.freeze({ shekels: 1500, agorot: 0 }) });
