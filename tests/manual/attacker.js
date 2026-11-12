// Manual test page that behaves like a hostile site.
// The shortcut it tries to steal is the ready-made signature: the trigger and two letters.
(function () {
  'use strict';
  var TRIGGER = '/';
  var SHORTCUT = TRIGGER + 'חת';
  var results = {};
  var rows = document.getElementById('rows');
  var globalsAtStart = Object.getOwnPropertyNames(window);
  var foreignMutations = 0;
  var foreignDetails = [];
  // The page is watched while this script changes nothing itself: before the attempts, and after them while the user types.
  // Watching starts when the browser finished reading the page (before extensions are started in it).
  var watching = false;
  document.addEventListener('DOMContentLoaded', function () {
    observer.takeRecords(); // what the browser added while reading the page does not count
    watching = true;
  });
  var messages = [];

  // Anything that changes in the page outside the places this script writes to would reveal the extension.
  var OWN_AREAS = '#rows, #results, #h4, #wordStart, #wordStart2';
  var observer = new MutationObserver(function (list) {
    if (!watching) return;
    for (var i = 0; i < list.length; i++) {
      var record = list[i];
      var node = record.target.nodeType === 1 ? record.target : record.target.parentNode;
      // A text node that this script already replaced has no parent any more.
      if (!node || (node.closest && node.closest(OWN_AREAS))) continue;
      if (record.type === 'attributes' && record.attributeName === 'data-done') continue;
      foreignMutations += 1;
      foreignDetails.push(record.type + ' ' + (node.id || node.nodeName) + (record.attributeName ? ' ' + record.attributeName : ''));
    }
  });
  observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true, characterData: true });

  window.addEventListener('message', function (event) { messages.push(String(event.data && event.data.type)); });

  function own(fn) { fn(); }

  function report(key, title, passed, detail) {
    results[key] = { passed: passed, detail: detail };
    own(function () {
      var tr = document.createElement('tr');
      var a = document.createElement('td'); a.textContent = title;
      var b = document.createElement('td'); b.textContent = passed ? 'עבר' : 'נכשל'; b.className = passed ? 'ok' : 'bad';
      var c = document.createElement('td'); c.textContent = detail;
      tr.appendChild(a); tr.appendChild(b); tr.appendChild(c);
      rows.appendChild(tr);
      document.getElementById('results').textContent = JSON.stringify(results);
    });
  }

  function fakeKey(target, key) {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true }));
  }
  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function unchanged(value) { return value === SHORTCUT; }

  // 1. Plant the shortcut in a hidden field and send fake events.
  async function plantAndFake() {
    var field = document.getElementById('h1');
    own(function () {
      field.focus();
      field.value = SHORTCUT;
      field.setSelectionRange(SHORTCUT.length, SHORTCUT.length);
      for (var i = 0; i < SHORTCUT.length; i++) {
        fakeKey(field, SHORTCUT[i]);
        field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: SHORTCUT[i] }));
      }
    });
    await wait(150);
    report('plant', 'שתילת הקיצור בשדה נסתר + אירועים מזויפים', unchanged(field.value), 'בשדה: ' + JSON.stringify(field.value));
  }

  // 2. "Type" the shortcut with the browser's editing command. These input events look real to a script.
  async function typeWithCommand() {
    var field = document.getElementById('h2');
    own(function () {
      field.focus();
      for (var i = 0; i < SHORTCUT.length; i++) {
        fakeKey(field, SHORTCUT[i]);
        document.execCommand('insertText', false, SHORTCUT[i]);
      }
    });
    await wait(150);
    report('command', 'הקלדה דרך פקודת עריכה של הדפדפן, תו אחרי תו', unchanged(field.value), 'בשדה: ' + JSON.stringify(field.value));
  }

  // 3. The same, all at once.
  async function typeWholeWithCommand() {
    var field = document.getElementById('h3');
    own(function () {
      field.focus();
      document.execCommand('insertText', false, SHORTCUT);
    });
    await wait(150);
    report('commandWhole', 'הכנסת הקיצור כולו בפקודת עריכה', unchanged(field.value), 'בשדה: ' + JSON.stringify(field.value));
  }

  // 4. The same in a hidden rich editor.
  async function typeInEditor() {
    var field = document.getElementById('h4');
    own(function () {
      field.focus();
      for (var i = 0; i < SHORTCUT.length; i++) {
        fakeKey(field, SHORTCUT[i]);
        document.execCommand('insertText', false, SHORTCUT[i]);
      }
    });
    await wait(150);
    report('editor', 'אותו ניסיון בעורך עשיר נסתר', unchanged(field.textContent), 'בעורך: ' + JSON.stringify(field.textContent));
  }

  // 5. Key substitution: every real key the user presses is swallowed and replaced by a character of the shortcut.
  var subIndex = 0;
  document.getElementById('sub').addEventListener('keydown', function (event) {
    if (subIndex >= SHORTCUT.length || event.key.length !== 1) return;
    event.preventDefault();
    var ch = SHORTCUT[subIndex++];
    own(function () { document.execCommand('insertText', false, ch); });
  });
  document.getElementById('checkSub').addEventListener('click', function () {
    var value = document.getElementById('sub').value;
    report('substitute', 'החלפת המקשים של המשתמש בתווי הקיצור', unchanged(value), 'בשדה: ' + JSON.stringify(value));
    detect();
  });

  // 5b. A made-up click after a letter, and the letter swapped for a space: "start of a word" without the user typing one.
  document.getElementById('wordStart').addEventListener('input', function (event) {
    var field = event.target;
    if (field.value.slice(-1) !== '\u05D0') return;
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    window.dispatchEvent(new FocusEvent('blur'));
    field.value = field.value.slice(0, -1) + ' ';
    field.setSelectionRange(field.value.length, field.value.length);
  });

  // 5c. The same, but the letter is swapped for a space with the browser's editing command (a real input event).
  document.getElementById('wordStart2').addEventListener('input', function (event) {
    var field = event.target;
    if (field.value.slice(-1) !== '\u05D0') return;
    field.setSelectionRange(field.value.length - 1, field.value.length);
    document.execCommand('insertText', false, ' ');
  });

  // 5d. The user's real key is swallowed, and the page deletes the letter before it with the editing command.
  //     The delete follows a real key, but not a Backspace: it must not count as the user's.
  document.getElementById('wordStart3').addEventListener('keydown', function (event) {
    if (event.key !== '\u05D1') return;
    event.preventDefault();
    document.execCommand('delete');
  });

  // 6. Signs that the extension is installed.
  async function detect() {
    watching = false;
    var added = Object.getOwnPropertyNames(window).filter(function (name) { return globalsAtStart.indexOf(name) < 0; });
    report('globals', 'משתנים גלובליים חדשים בדף', added.length === 0, added.length ? added.join(', ') : 'אין');
    report('dom', 'שינויים בדף שלא הדף עשה', foreignMutations === 0, 'מספר שינויים: ' + foreignMutations + (foreignDetails.length ? ' (' + foreignDetails.slice(0, 5).join('; ') + ')' : ''));
    var markup = document.documentElement.outerHTML;
    report('markup', 'כתובת של תוסף בתוך הדף', markup.indexOf('chrome-extension://') < 0, markup.indexOf('chrome-extension://') < 0 ? 'אין' : 'נמצאה');
  }

  // 7. Messages to the extension.
  async function messaging() {
    var canSend = typeof chrome !== 'undefined' && !!chrome.runtime && typeof chrome.runtime.sendMessage === 'function';
    var id = new URLSearchParams(location.search).get('ext');
    var detail = 'chrome.runtime.sendMessage לא זמין לדף';
    var passed = true;
    if (canSend && id) {
      try {
        await new Promise(function (resolve, reject) {
          chrome.runtime.sendMessage(id, { type: 'hoppa:get-host' }, function (answer) {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message)); else resolve(answer);
          });
        });
        passed = false; detail = 'התוסף ענה להודעה מהדף';
      } catch (error) { detail = 'ההודעה נכשלה: ' + error.message; }
    }
    report('message', 'שליחת הודעה לתוסף מתוך הדף', passed, detail);

    window.postMessage({ type: 'hoppa:get-host' }, '*');
    await wait(200);
    var answers = messages.filter(function (type) { return type !== 'hoppa:get-host'; });
    report('postMessage', 'תשובה להודעת postMessage', answers.length === 0, answers.length ? answers.join(', ') : 'אין תשובה');
  }

  // 8. Files of the extension must not be reachable from a site.
  async function resources() {
    var id = new URLSearchParams(location.search).get('ext');
    if (!id) { report('resources', 'גישה לקבצים של התוסף', true, 'לא נבדק: אין מזהה תוסף בכתובת'); return; }
    var loaded = await new Promise(function (resolve) {
      var image = new Image();
      image.onload = function () { resolve(true); };
      image.onerror = function () { resolve(false); };
      image.src = 'chrome-extension://' + id + '/icons/icon-16.png';
    });
    report('resources', 'טעינת קובץ של התוסף מתוך הדף', !loaded, loaded ? 'הקובץ נטען' : 'הטעינה נחסמה');
  }

  async function runAll() {
    watching = false;
    await plantAndFake();
    await typeWithCommand();
    await typeWholeWithCommand();
    await typeInEditor();
    await messaging();
    await resources();
    document.body.setAttribute('data-done', '1');
    await wait(50);
    observer.takeRecords();
    watching = true;
  }
  document.getElementById('run').addEventListener('click', runAll);
})();
