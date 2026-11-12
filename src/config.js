// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * The one place where the shortcut trigger is defined (owner decision, 2026-11-11).
 * Everything else derives from here: the matcher, the number pattern, the
 * ready-made pack, the smart shortcuts, the interface texts and the site
 * adapters. No other source file may contain the trigger as a literal.
 */
export const TRIGGER = '/';

/*
 * Characters that count as "start of a word" when they come right before the
 * trigger. Start of field and start of line count too (handled by the matcher).
 * Letters, digits, the trigger itself, a colon, an apostrophe and quotes are
 * deliberately absent: they appear inside words, dates and addresses.
 */
export const BOUNDARY = [' ', ' ', '\t', '\n', '\r', '(', '[', '{', ',', ';', '!', '?', '.'];

/*
 * Characters that end a shortcut which has to wait (a shortcut that is the
 * beginning of another one, or a number). The character stays after the text.
 * Enter is handled separately, as a key.
 */
export const TERMINATORS = [' ', ' ', '\t', '\n', '.', ',', ';', ':', '!', '?', ')', ']', '}', '"', "'"];

/* Separator of the Gregorian date (day, month, year). Not related to the trigger. */
export const DATE_SEPARATOR = '/';

/* Decimal point accepted in the number pattern (shekels.agorot). */
export const DECIMAL_POINT = '.';

/* Thousands separator accepted in the number pattern: 1,000,000. */
export const THOUSANDS_SEPARATOR = ',';

/*
 * Marks used in the Hebrew date. Version 1 always uses the plain keyboard
 * marks (owner decision, 2026-11-11). To bring the setting back in version 2,
 * switch this constant to a value read from the settings:
 * Hebrew marks are '׳' (geresh) and '״' (gershayim).
 */
export const HEBREW_DATE_MARKS = Object.freeze({ geresh: "'", gershayim: '"' });
