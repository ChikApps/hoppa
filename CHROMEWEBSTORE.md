# Chrome Web Store Listing — Hoppa

> Last Updated: 2026-11-13 (1.1.3)
> מסמך עבודה להגשה לחנות של כרום. לא נכנס לחבילת ה-ZIP.
> מה שמסומן **[פתוח]** מחכה להחלטה או לבדיקה, ולא מגישים לפני שהוא נסגר.

## Store Listing

**Extension Name** [REQUIRED]
Hoppa – קיצורים חכמים בעברית
(באנגלית, ב-`_locales/en`: Hoppa – Hebrew text expander. **[פתוח]** השם באנגלית עוד לא אושר.)

**Short Description** [REQUIRED]
במניפסט כרגע (109 תווים):
מקלידים /בב ומקבלים "בברכה,". טקסטים מוכנים, תאריך עברי ופרשת השבוע בכל אתר. חינם, בלי הרשמה ובלי איסוף מידע.

נוסח ארוך יותר (127 תווים) מוסיף בסוף "עובד גם עם נטפרי." **[פתוח]** מוסיפים את המשפט רק אחרי בדיקה במחשב מסונן. אחרי הבדיקה מעדכנים את `src/_locales/he/messages.json`.

**Detailed Description** [REQUIRED]
לפני ההגשה:
- השורה "עובד גם בגוגל דוקס": מ-1.1.0 נכונה, למסמכים (Google Docs). נבדק במסמך אמיתי כאורח. לא בגיליונות ולא במצגות. **[פתוח]** לפני ההגשה: בדיקה עם חשבון גוגל מחובר.
- "הקוד פתוח לכולם": עם הקישור https://github.com/ChikApps/hoppa (נכון מהרגע שהמאגר ציבורי).
- **[פתוח]** "מתאים גם למי שמסונן בנטפרי": אחרי בדיקה במחשב מסונן.

**Category** [REQUIRED]
Productivity (כלים / פרודוקטיביות)

**Single Purpose** [REQUIRED]
Replaces short abbreviations that the user types with the full text they stand for (a Hebrew text expander).

**Primary Language** [REQUIRED]
Hebrew (עברית). קיים גם שם ותיאור קצר באנגלית.

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `src/icons/icon-128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 | ⬜ Not created | |
| Screenshot 2 [RECOMMENDED] | 1280×800 | ⬜ Not created | |
| Screenshot 3 [RECOMMENDED] | 1280×800 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | |

### Screenshot Notes
1. הקלדת קיצור בשדה כתיבה, לפני ואחרי ההחלפה. 2. החלון הקופץ עם הקיצורים החכמים. 3. דף הניהול ("הקיצורים שלי"). 4. לשונית ההגדרות. צילומים רק של מה שעובד בפועל בגרסה שמוגשת.

## Permissions Justification

The text in the "Justification" column is written for the review team and can be pasted into the dashboard.

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Saves the user's own shortcuts (abbreviation, full text, optional description) and the user's settings (on/off, sites where the user turned the extension off, calendar and wording choices, day/night theme). The data is saved with chrome.storage.sync so the user's shortcuts follow them between their own computers, and moves automatically to chrome.storage.local when it is too large for sync. Nothing is sent to the developer. |
| `<all_urls>` | content_scripts matches | A text expander has to work wherever the user types: webmail, chat, forums and forms on any site, which cannot be listed in advance. On each page the content script only watches the field the user is typing in, compares the last typed characters with the user's shortcuts, and replaces a matching shortcut with its text. It never reads the page content, never sends anything anywhere, and does not run in password, payment-card or one-time-code fields. The user can turn the extension off for any site from the popup. |

### Content script options (asked about during review)

| Option | Why it is needed |
|--------|------------------|
| Google Docs (1.1.0) | No new permission. In a Google Docs document the same content script, in the top page only, listens to the user's real key presses in the document's own hidden typing frame (same origin) and replaces a typed shortcut by sending Backspace key events and a plain-text paste event to that frame. It reads nothing from the document, sends nothing anywhere, and the user can turn it off with the "replacement in Google Docs" switch. It does not need `all_frames` or `match_about_blank`. |
| `all_frames: true` | Many editors live inside an inner frame of the page, for example the chat panel embedded in webmail. Measured: without it, a shortcut typed in a field inside an inner frame is not replaced. |
| `match_about_blank: true` | Some rich-text editors are built in an empty frame that the page creates (about:blank or srcdoc), for example TinyMCE and CKEditor 4. Measured: without it, a shortcut typed in such a frame is not replaced. Google Docs does not need it (the extension works there from the top page). `match_origin_as_fallback` was removed in 1.1.1: it only adds data: and blob: frames, which no editor in our tests uses. **[Open]** Gmail and Google Chat to be re-checked after this change. |

### Declarations
- **Remote code:** No. All code is inside the package. There is no `eval`, no remotely loaded script, style, font or image.
- **Background script:** runs only once, on install, to save the ready-made shortcuts and open the welcome page.
- **"Check for update" button (About):** calls `chrome.runtime.requestUpdateCheck()`, which asks Chrome to run its own update check against the Chrome Web Store. It needs no permission, the extension sends no request of its own, and updates arrive from the store only. There is no `update_url` in the manifest and no self-update mechanism.
- **Not requested, on purpose:** `tabs`, `activeTab`, `scripting`, `clipboardWrite`, `downloads`, `host_permissions`, `web_accessible_resources`, `externally_connectable`. Copying from the popup uses the standard clipboard call on a user click; export uses a normal download link.

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** The developer collects nothing: there is no server and the extension makes no network requests at all.

One thing must still be disclosed in the form, and in the privacy policy: the shortcuts and settings that the user creates are saved with `chrome.storage.sync`. When Chrome sync is on, Chrome stores them in the user's own Google Account and moves them between the user's computers through Google's servers. This counts as data leaving the device, even though it never reaches the developer or any third party.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | Only if the user writes it in a shortcut (for example a signature) | Only through the user's own Chrome sync | Replacing the shortcut with the text the user wrote | No |
| Health info | No | No | | No |
| Financial info | No | No | | No |
| Authentication info | No. The extension does not run in password or one-time-code fields | No | | No |
| Personal communications | No. Typed text is checked in memory and is never saved or sent | No | | No |
| Location | No | No | | No |
| Web history | No. Only the names of sites where the user turned the extension off are saved, in the settings | Only through the user's own Chrome sync | "Off on this site" | No |
| User activity | No. No logging, no statistics. Keystrokes are checked in memory only | No | | No |
| Website content | No. Page content is not read | No | | No |

**[פתוח]** איזה תיבות לסמן בטופס בפועל: מחליטים בזמן ההגשה, לפי הטבלה הזאת ולפי מדיניות הפרטיות. הכלל: מה שמסומן בטופס, מה שכתוב במדיניות ומה שהקוד עושה חייבים להיות זהים.

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
https://chikapps.github.io/hoppa/privacy.html (המקור: `docs/privacy.html` במאגר, עברית ואנגלית). אותה כתובת מופיעה ב-`src/pages/links.js` (`PRIVACY_POLICY_URL`).

עדכונים למדיניות בעקבות הבנייה:
- ההרשאה להעתקה ללוח **לא** נוספה. מוחקים מהמדיניות את השורה המסומנת "[רק אם ההרשאה נוספה]".
- מה קורה לעותק שבחשבון הגוגל אחרי הסרת התוסף: לא נבדק. צריך לבדוק בכרום עם חשבון מסונכרן לפני הפרסום.

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]
**[פתוח]** בקוד הפתוח: ChikApps. שם המפרסם בחנות עוד לא נקבע.

**Contact Email** [REQUIRED]
office@chiktime.com **[פתוח]** לאשר שזה גם המייל שמופיע בחנות.

**Support URL / Email** [RECOMMENDED]
office@chiktime.com

**Homepage URL** [RECOMMENDED]
https://github.com/ChikApps/hoppa (אותה כתובת ב-`src/pages/links.js`, `SOURCE_CODE_URL`).

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.1.3 | 2026-11-13 | דף "אודות": קישור לקוד המקור ולמדיניות הפרטיות | Draft |
| 1.1.2 | 2026-11-12 | דוקס: אחרי לחיצה על שורה ריקה (גם מיד אחרי פתיחת המסמך) קיצור מוחלף מיד, בלי צורך ברווח או Enter קודם. התחברות מהירה יותר למסגרת ההקלדה, וחיבור מחדש כשדוקס בונה אותה מחדש | Draft |
| 1.1.1 | 2026-11-12 | `match_origin_as_fallback` הוסר מהמניפסט (לא נדרש). בדוקס: מקשים שנלחצים מיד אחרי החלפה (גם הדבקה והעתקה) נכנסים בסדר הנכון, ותקרה של 64 מקשים. הגנה נוספת על "תחילת מילה". עמודת "טקסט" בדף הניהול לא נעלמת ברוחב 1101–1290 | Draft |
| 1.1.0 | 2026-11-12 | החלפה בגוגל דוקס (מסמכים): קיצורים רגילים וחכמים, חתימה בכמה שורות, ביטול ב-Backspace, מתג "החלפה בגוגל דוקס". בלי הרשאה חדשה | Draft |
| 1.0.2 | 2026-11-12 | תיקונים קטנים אחרי הסקירה השלישית: רשומה תקינה גוברת במיזוג, "תחילת מילה" מוגנת גם מפקודות עריכה של הדף, שדה סיסמה מוסתר-מראש מזוהה, נוסחים סופיים לשתי הודעות | Draft |
| 1.0.1 | 2026-11-12 | תיקונים לפני החנות: חזרה לסנכרון שממזגת עם מחשב אחר ולא דורסת גרסה חדשה יותר, זיהוי רחב יותר של שדות רגישים, ייבוא שדוחה קובץ פגום, קיצור באנגלית מוצג נכון | Draft |
| 1.0.0 | 2026-11-11 | גרסה ראשונה: החלפת קיצורים בשדות רגילים ובעורכים עשירים, 5 קיצורים חכמים, חבילה של 25 קיצורים, ייבוא וייצוא, מצב יום ולילה, כפתור "בדיקת עדכון". בלי החלפה בגוגל דוקס | Draft |

## Review Notes

### Known Issues / Limitations
- גוגל דוקס (מ-1.1.0): עובד במסמכים. אחרי לחיצה באמצע שורה עם טקסט, או אחרי חץ, צריך רווח או Enter לפני הקיצור (בשורה ריקה לא צריך, מ-1.1.2). Ctrl+Z מבטל בשתי לחיצות (Backspace מבטל בלחיצה אחת). בשיטס ובסליידס אין החלפה. ההעתקה מהחלון הקופץ עובדת בכולם.
- לשונית שהייתה פתוחה לפני ההתקנה או לפני עדכון: התוסף מתחיל לעבוד בה אחרי רענון, והחלון הקופץ אומר לרענן.
- הקלדה שלא דרך מקשי מקלדת (הכתבה קולית, מקלדת מסך, שיטות קלט עם חלון בחירה): אין החלפה. זו החלטת אבטחה, ראו `SECURITY.md`.
- עורכים מסוג Lexical (וואטסאפ ווב, פייסבוק): החלפה חלקית. CKEditor 5: אין החלפה. פירוט ב-`README.md`. **לפני ההגשה:** לבדוק באתרים האמיתיים, או לרכך בתיאור את "בכל מקום שכותבים בו".
- דגלי המסגרות (1.1.1, ממצא Low-1): נשארו `all_frames` ו-`match_about_blank`, שנמדד שהם נדרשים. `match_origin_as_fallback` הוסר. **[פתוח]** בדיקה חוזרת בג'ימייל, גוגל צ'אט (גם בתוך ג'ימייל), מתמחים ופרוג. אם משהו נשבר, מחזירים את הדגל (שורה אחת).
- נבדק בדפי בדיקה מקומיים, ובעורכים עשירים שהורדו למחשב. ג'ימייל, גוגל צ'אט ופרוג: עוד לא נבדקו.

### Rejection History
אין.
