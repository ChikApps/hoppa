# gdocs: Google Docs module

**Status (1.1.2): works in Google Docs documents.** Tested on a real document (2026-11-12, `tests/e2e/docs-live.mjs`, 30/30).
Sheets, Slides and Drawings: no replacement. The general engine stays off there, because typing goes through a hidden frame.

## How it works (measured, not assumed)
- Runs in the top page of `docs.google.com/document/...` only, in the extension's isolated world. It listens on the
  hidden typing frame (`iframe.docs-texteventtarget-iframe`, same origin, about:blank). Measured: it works with none
  of the frame options in the manifest. In any frame that is (or is inside) a Docs editor, also one embedded in another
  site, the general engine never starts (`ownsFrame`).
- Keeps the last typed characters in memory, from real (`isTrusted`) key presses in that frame only.
- On a match: Backspace key events delete the shortcut (Docs marks each one handled; if the first is not handled, stop).
  Then a `paste` event with `text/plain` inserts the text in one step, new lines included. Docs drops one space at each
  end of a pasted text, so one is added there (`padForPaste`).
- Docs applies the paste a few milliseconds later, and a key that arrives first would go in before it. So keys pressed in
  that moment are held and given to Docs again right after the paste (the caret `.kix-cursor` shows when it is in).
  At most 64 are held; beyond that, or after an error, the held keys go to Docs at once. Nothing is thrown away.
  A real copy, cut or paste in that moment is held in its place too (the key goes through; the clipboard event is
  held, then a paste is sent with the same data, and a copy or cut runs as the browser's own command).
- Backspace right after a replacement: two Ctrl+Z events (Docs undoes the paste, then the deletion).
- Click, arrows, End, Tab, combinations, paste: the characters are emptied and the start of the line is unknown, so a
  shortcut then needs a space or Enter typed before it. Home and Enter count as a start of a line. Exception (1.1.2):
  if the caret's whole line on the page canvas is blank (an empty line), it counts as a start of a line too, so a
  shortcut works at once after a click on an empty line or in a new, empty document. Only a yes/no is kept.
- The typing frame is looked for every 250 ms, and the module attaches again if Docs replaces the frame, its window,
  or rewrites its document.

Rejected: keypress insertion (Docs autocorrects it: `--`, `1/2`, `:)`, and it is slow), `execCommand`, `beforeinput`,
composition events (Docs ignores them), the `debugger` permission, code in the page's world.

## Interface
`createGdocs({ view, matcher: { findMatch, isBoundary }, template, getState })` returns
`{ ownsFrame, status(), start(), stop() }`. `status()`: `'not-docs' | 'off' | 'not-recognized' | 'ready'`.
The switch "replacement in Google Docs" (`settings.docs`) stops it at once, with no reload. Everything that depends on how
Docs is built today is in `selectors.js`. `frameInput.js` sends the events.

## Smoke test (after every update and every complaint). Automatic version: `npm run test:docs`
In a test document, with a Hebrew keyboard:
1. Type `/תע` at the start of a line. It is replaced by today's Hebrew date.
2. Type `/חת`. Three lines appear, in the right order, right to left. Keep typing at once: the words come after it.
3. Press Backspace right after a replacement. The shortcut comes back as typed.
4. Type a shortcut, then Ctrl+Z: the first press removes the text, the second brings back the shortcut.
5. Turn off "replacement in Google Docs" in the settings and type a shortcut. Nothing is replaced.

## Known open issue (2026-11-12, 1.1.2)
Reported on one machine (signed in to Google, behind a filtering proxy): replacement in Docs starts only after about 30 seconds.
Not reproduced here (guest, no filter): the module attaches 0.3-0.9 s after the typing frame appears.
Hypotheses: (a) `document_idle` runs late on a heavy signed-in page behind a filtering proxy (late `window.onload`);
(b) a signed-in user gets a different or extra typing frame, or it is replaced after add-ons and AI helpers load;
(c) the empty-line check on the canvas fails for a signed-in user (side panel, zoom).
Next version idea (diagnostics): a per-tab timeline in the settings page, "אבחון דוקס", with a copy button: times
since the page opened (script start, DOMContentLoaded, load, frame found, attached, reattach, first real key, first
shortcut) and a reason code for every shortcut not replaced. Times and codes only, no typed text and no document
content, in chrome.storage.local, deleted after 24 hours or by a button, no network. Plus a green ✓ badge on the
toolbar icon while the module is attached. To test (a): a separate content_scripts entry for
`https://docs.google.com/document/*` with `run_at: document_start`, guarded against double injection.
