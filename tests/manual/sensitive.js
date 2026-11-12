// Manual test page: "show password" switches.
(function () {
  'use strict';
  function toggle(id) {
    var field = document.getElementById(id);
    field.type = field.type === 'password' ? 'text' : 'password';
  }
  document.getElementById('s-show-btn').addEventListener('click', function () { toggle('s-show'); });
  document.getElementById('s-show2-btn').addEventListener('click', function () { toggle('s-show2'); });
  // A site that keeps a hidden text field next to the password field, and switches between them.
  document.getElementById('s-twin-btn').addEventListener('click', function () {
    var pw = document.getElementById('s-twin-pw');
    var text = document.getElementById('s-twin-text');
    var show = text.hidden;
    text.value = pw.value;
    text.hidden = !show;
    pw.hidden = show;
    (show ? text : pw).focus();
  });
  // A site that shows the password by putting a new field in place of the old one.
  document.getElementById('s-swap-btn').addEventListener('click', function () {
    var wrap = document.getElementById('s-swap-wrap');
    var old = document.getElementById('s-swap');
    var fresh = document.createElement('input');
    fresh.id = 's-swap';
    fresh.type = old.type === 'password' ? 'text' : 'password';
    fresh.className = 'form-control';
    fresh.value = old.value;
    wrap.replaceChild(fresh, old);
    fresh.focus();
  });
})();
