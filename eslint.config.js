// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

const browser = {
  window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly', history: 'readonly',
  chrome: 'readonly', globalThis: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly',
  URL: 'readonly', Blob: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly'
};
const node = {
  process: 'readonly', Buffer: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', fetch: 'readonly', WebSocket: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly', structuredClone: 'readonly',
  globalThis: 'readonly', Intl: 'readonly'
};

const rules = {
  // Text of a user is never code (section 9.1 of the developer notes).
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
  'no-undef': 'error',
  'no-unused-vars': ['error', { caughtErrors: 'none' }],
  'no-var': 'error',
  'prefer-const': 'error',
  'eqeqeq': 'error',
  'no-console': 'error',
  'no-proto': 'error',
  'no-extend-native': 'error'
};

export default [
  { ignores: ['dist/**', 'build/**', 'node_modules/**', 'tests/manual/**', 'tests/fixtures/evil/**'] },
  { files: ['src/**/*.js'], ignores: ['src/pages/theme.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: browser }, rules },
  { files: ['src/pages/theme.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: browser }, rules: { ...rules, 'no-var': 'off' } },
  { files: ['scripts/**/*.mjs', 'tests/**/*.js', 'tests/**/*.mjs', 'eslint.config.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...node, document: 'readonly', window: 'readonly', chrome: 'readonly', navigator: 'readonly' } }, rules: { ...rules, 'no-console': 'off' } }
];
