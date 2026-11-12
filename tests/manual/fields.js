// Manual test page. Builds a field inside a shadow root and shows what a form sent.
(function () {
  'use strict';
  var host = document.getElementById('shadowHost');
  var root = host.attachShadow({ mode: 'open' });
  var input = document.createElement('input');
  input.id = 'sin';
  input.type = 'text';
  input.setAttribute('autocomplete', 'off');
  root.appendChild(input);

  // An empty frame (about:blank) that the page builds by script, with an editable area inside.
  var blank = document.createElement('iframe');
  blank.id = 'fr3';
  blank.title = 'מסגרת ריקה שנבנתה בסקריפט';
  document.getElementById('fr3Box').appendChild(blank);
  var blankDoc = blank.contentDocument;
  blankDoc.documentElement.setAttribute('dir', 'rtl');
  var blankEditor = blankDoc.createElement('div');
  blankEditor.id = 'ce';
  blankEditor.contentEditable = 'true';
  blankEditor.style.minHeight = '60px';
  blankEditor.style.border = '1px solid #888';
  blankDoc.body.appendChild(blankEditor);

  document.getElementById('form1').addEventListener('submit', function (event) {
    event.preventDefault();
    document.getElementById('sent').textContent = document.getElementById('in3').value;
  });
})();
