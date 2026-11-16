# Hoppa (הופה)

**[התקנה מהחנות של כרום](https://chromewebstore.google.com/detail/iockpgpmilbnfjkmjofeemaopgokmjdg)** · **[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/iockpgpmilbnfjkmjofeemaopgokmjdg)**

Copyright (C) 2026 ChikApps · License: GPL-2.0-or-later · [Privacy policy](https://chikapps.github.io/hoppa/privacy.html)

## English

Hoppa is a Hebrew text expander for Chrome. Type a short abbreviation, for example `/בב`, and it is replaced with the full text ("בברכה,"). It includes ready-made shortcuts, a signature, and smart shortcuts such as the Hebrew date and the weekly Torah portion. No network requests, no server, no data collection. Your shortcuts are saved in Chrome and, if Chrome sync is on, in your own Google Account.

**Install:** [Hoppa in the Chrome Web Store](https://chromewebstore.google.com/detail/iockpgpmilbnfjkmjofeemaopgokmjdg)

### For developers

**Build** (Node.js 20 or later): `npm ci --ignore-scripts`, then `npm run build`. The extension is built into `dist/`. `npm run package` creates `release/hoppa-<version>.zip` and prints its SHA-256, so you can compare it with the version in the Chrome Web Store. Tests: `npm test`, `npm run lint`, `npm run check:security`. The large test files are created with `npm run fixtures`.

**Install manually:** open `chrome://extensions`, turn on "Developer mode", click "Load unpacked" and choose the `dist/` folder (or a folder where you extracted the ZIP). Refresh tabs that were open before.

### License and security

**License:** GPL-2.0-or-later. See `LICENSE` and `COPYRIGHT`. Bundled libraries and their licenses: `THIRD_PARTY_NOTICES.md`. This program comes with ABSOLUTELY NO WARRANTY.

**Security problems:** please write to office@chiktime.com and do not open a public issue. See `SECURITY.md`.

## עברית

Hoppa הוא תוסף לכרום שמחליף קיצורים בטקסט מלא, בעברית. מקלידים קיצור, למשל `/בב`, ומקבלים "בברכה,". יש בו קיצורים מוכנים, חתימה, וקיצורים חכמים כמו התאריך העברי ופרשת השבוע. בלי בקשות רשת, בלי שרת ובלי איסוף מידע. הקיצורים נשמרים בכרום, ואם הסנכרון של כרום פועל, גם בחשבון הגוגל שלכם.

**התקנה:** [Hoppa בחנות של כרום](https://chromewebstore.google.com/detail/iockpgpmilbnfjkmjofeemaopgokmjdg)

### למפתחים

**בנייה** (Node.js 20 ומעלה): `npm ci --ignore-scripts` ואז `npm run build`. התוסף נבנה לתיקייה `dist/`. הפקודה `npm run package` יוצרת את `release/hoppa-<גרסה>.zip` ומדפיסה את ה-SHA-256 שלו, כדי שאפשר להשוות לגרסה שבחנות. בדיקות: `npm test`, `npm run lint`, `npm run check:security`. קובצי הבדיקה הגדולים נוצרים ב-`npm run fixtures`.

**התקנה ידנית:** לפתוח את `chrome://extensions`, להדליק "מצב פיתוח", ללחוץ "טעינת פריט Unpacked" ולבחור את התיקייה `dist/` (או תיקייה שאליה פתחתם את ה-ZIP). לשוניות שהיו פתוחות קודם: לרענן.

### פרטיות, רישיון ואבטחה

**מדיניות פרטיות:** https://chikapps.github.io/hoppa/privacy.html

**רישיון:** GPL-2.0-or-later, ראו `LICENSE` ו-`COPYRIGHT`. ספריות בחבילה והרישיונות שלהן: `THIRD_PARTY_NOTICES.md`. התוכנה ניתנת כמו שהיא, בלי שום אחריות.

**בעיות אבטחה:** כתבו ל-office@chiktime.com, ואל תפתחו על זה דיווח ציבורי. פרטים ב-`SECURITY.md`.
