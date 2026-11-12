// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * The ready-made pack (25 shortcuts). Stored without the trigger, which is
 * added at run time. The signature holds placeholders only, never real details.
 */
const ROWS = [
  ['של', 'שלום רב,', 'פתיחה'],
  ['בו', 'בוקר טוב,', 'פתיחה'],
  ['לכ', 'לכבוד [שם],', 'פתיחה'],
  ['הש', 'בהמשך לשיחתנו,', 'פתיחה'],
  ['בה', 'בהמשך להודעתי הקודמת,', 'פתיחה'],
  ['בב', 'בברכה,', 'סיום'],
  ['בת', 'בברכה ובתודה,', 'סיום'],
  ['תמ', 'תודה מראש,', 'סיום'],
  ['תר', 'תודה רבה!', 'סיום'],
  ['יט', 'שיהיה יום טוב!', 'סיום'],
  ['שש', 'שבת שלום ומבורך!', 'סיום'],
  ['חג', 'חג שמח!', 'סיום'],
  ['חת', '[שם]\nטלפון: [טלפון]\nמייל: [מייל]', 'חתימה'],
  ['מצ', 'מצורף הקובץ. אשמח לאישור שהתקבל.', 'מייל'],
  ['קב', 'קיבלתי, תודה. אבדוק ואחזור אליך.', 'מייל'],
  ['אח', 'אשמח לתשובה בהקדם.', 'מייל'],
  ['אע', 'אעדכן בהמשך.', 'מייל'],
  ['סל', 'סליחה על העיכוב בתשובה.', 'מייל'],
  ['פנ', 'אשמח לפרטים נוספים.', 'בקשות ותשובות'],
  ['זמ', 'מתי נוח לך שנדבר?', 'בקשות ותשובות'],
  ['אי', 'אין בעיה, בשמחה.', 'בקשות ותשובות'],
  ['אש', 'אשמח לעזרה בנושא הבא:', 'פורומים'],
  ['יכ', 'יישר כוח!', 'פורומים'],
  ['תז', 'תזכו למצוות!', 'פורומים'],
  ['בצ', 'בהצלחה רבה!', 'פורומים']
];

export const PACK = Object.freeze(ROWS.map((row, index) => Object.freeze({
  id: 'pack-' + String(index + 1).padStart(2, '0'),
  abbr: row[0],
  text: row[1],
  label: row[2]
})));

/* Full records for storage. The first row gets the newest time, so the list keeps the pack order. */
export function packRecords(now) {
  return PACK.map((row, index) => ({
    id: row.id,
    abbr: row.abbr,
    text: row.text,
    label: row.label,
    enabled: true,
    format: 'plain',
    group: null,
    sites: null,
    builtin: true,
    createdAt: Math.max(0, now - index),
    updatedAt: Math.max(0, now - index)
  }));
}
