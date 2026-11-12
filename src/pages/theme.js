// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Night mode and day mode. Loaded in the head of the page, before it is
 * painted, so there is no flash. The default is night.
 * The choice is cached locally for the first paint; the saved setting of the
 * extension is the source of truth (see themeSync.js).
 * Every button with data-theme-toggle switches. aria-pressed="true" means day.
 */
(function () {
  'use strict';
  var KEY = 'hoppa-theme';
  var root = document.documentElement;
  var listeners = [];
  var animationTimer = null;

  function read() {
    try { return window.localStorage.getItem(KEY); } catch (error) { return null; }
  }
  function write(value) {
    try { window.localStorage.setItem(KEY, value); } catch (error) { /* continue without the cache */ }
  }
  function reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (error) { return false; }
  }

  var theme = read() === 'light' ? 'light' : 'dark';
  root.setAttribute('data-theme', theme);

  function syncButtons() {
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
    }
  }

  function apply(value, animate) {
    theme = value === 'light' ? 'light' : 'dark';
    if (animate && !reducedMotion()) {
      root.classList.add('theme-anim');
      clearTimeout(animationTimer);
      animationTimer = setTimeout(function () { root.classList.remove('theme-anim'); }, 340);
    }
    root.setAttribute('data-theme', theme);
    syncButtons();
    for (var i = 0; i < listeners.length; i++) listeners[i](theme);
  }

  window.HoppaTheme = {
    get: function () { return theme; },
    set: function (value) { apply(value, true); write(theme); },
    toggle: function () { this.set(theme === 'light' ? 'dark' : 'light'); },
    onChange: function (listener) { listeners.push(listener); }
  };

  document.addEventListener('DOMContentLoaded', function () {
    syncButtons();
    document.addEventListener('click', function (event) {
      var button = event.target && event.target.closest ? event.target.closest('[data-theme-toggle]') : null;
      if (button) window.HoppaTheme.toggle();
    });
  });

  // A change in another open page of the extension shows here at once.
  window.addEventListener('storage', function (event) {
    if (event.key === KEY && (event.newValue === 'light' || event.newValue === 'dark') && event.newValue !== theme) {
      apply(event.newValue, true);
    }
  });
})();
