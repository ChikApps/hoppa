// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldKind, isSensitive, hasSensitiveName, hasSensitiveAutocomplete, hasHiddenText, PasswordMemory } from '../../src/core/sensitive.js';
import { MESSAGE, isAcceptedMessage, answerMessage, isHostAnswer } from '../../src/messages.js';
import { isGoogleChat, googleChat } from '../../src/sites/googleChat.js';
import { siteAdapterFor } from '../../src/sites/index.js';
import { createGdocs } from '../../src/gdocs/index.js';
import { topHost, isTopFrame } from '../../src/core/site.js';
import { renderTemplate } from '../../src/template/index.js';

/* A stand-in for a form field, with the few properties the checks read. */
function field(nodeName, attributes, props) {
  const attrs = { ...attributes };
  return {
    nodeName,
    type: nodeName === 'INPUT' ? (attrs.type || 'text') : undefined,
    readOnly: 'readonly' in attrs,
    disabled: 'disabled' in attrs,
    isContentEditable: false,
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    hasAttribute: (name) => name in attrs,
    ...props
  };
}
const input = (attributes) => field('INPUT', attributes);
const editor = (attributes) => field('DIV', attributes, { isContentEditable: true });

test('which elements are handled at all', () => {
  assert.equal(fieldKind(input({})), 'text');
  assert.equal(fieldKind(input({ type: 'search' })), 'text');
  assert.equal(fieldKind(field('TEXTAREA', {})), 'text');
  assert.equal(fieldKind(editor({})), 'rich');
  for (const type of ['password', 'email', 'tel', 'url', 'number', 'date', 'time', 'datetime-local', 'month', 'week', 'color', 'range', 'file', 'hidden', 'checkbox', 'radio', 'submit', 'button']) {
    assert.equal(fieldKind(input({ type })), null, type);
    assert.equal(isSensitive(input({ type }), null), true, type);
  }
  assert.equal(fieldKind(field('DIV', {})), null);
  assert.equal(fieldKind(null), null);
});

test('a normal field is not sensitive', () => {
  assert.equal(isSensitive(input({ name: 'subject', id: 'compose', placeholder: 'נושא' }), new PasswordMemory()), false);
  assert.equal(isSensitive(field('TEXTAREA', { name: 'message' }), null), false);
  assert.equal(isSensitive(editor({ 'aria-label': 'גוף ההודעה' }), null), false);
  assert.equal(isSensitive(input({ name: 'shipping', id: 'spinner', placeholder: 'opinion' }), null), false, 'the letters "pin" inside a word are fine');
});

test('autocomplete values that block', () => {
  for (const value of ['current-password', 'new-password', 'one-time-code', 'webauthn', 'cc-name', 'cc-given-name', 'cc-additional-name', 'cc-family-name', 'cc-number', 'cc-exp', 'cc-exp-month', 'cc-exp-year', 'cc-csc', 'cc-type', 'section-a billing cc-number', 'username webauthn', 'CC-NUMBER']) {
    assert.equal(hasSensitiveAutocomplete(input({ autocomplete: value })), true, value);
    assert.equal(isSensitive(input({ autocomplete: value }), null), true, value);
  }
  for (const value of ['off', 'on', 'name', 'email', 'street-address', 'username']) {
    assert.equal(hasSensitiveAutocomplete(input({ autocomplete: value })), false, value);
  }
});

test('names that block: name, id, placeholder, aria-label and title', () => {
  const words = [
    'password', 'user_pass', 'pwd', 'otp', 'OTP-code', '2fa', 'cvv', 'cvc', 'cardnumber', 'card-number', 'pin', 'user-pin', 'pin_code', 'PIN',
    'סיסמה', 'סיסמא', 'כרטיס אשראי', 'קוד אימות',
    // found by the tester: common names on real sites
    'card_number', 'creditCard', 'ccnum', 'Card number', 'מספר כרטיס', '3 ספרות בגב הכרטיס', 'security_code', 'expiry', 'תוקף MM/YY',
    'verification_code', 'קוד חד פעמי', 'code', 'הקוד שקיבלת ב-SMS', 'cc',
    // found by the independent reviewer: bank and identity numbers
    'iban', 'IBAN', 'swift', 'swiftCode', 'account', 'accountnumber', 'account_number', 'ssn', 'routing', 'routing-number',
    'חשבון', 'מספר חשבון', 'תעודת זהות', 'ת"ז', 'ת.ז.', 'מספר זהות', 'ccnumber', 'cc-number', 'passport', 'דרכון',
    'secret', 'api_token', 'mfa', 'totp', 'smsCode', 'expiration', 'exp_month', 'validThru', 'debit card', 'קוד סודי'
  ];
  for (const attribute of ['name', 'id', 'placeholder', 'aria-label', 'title']) {
    for (const word of words) {
      assert.equal(hasSensitiveName(input({ [attribute]: word })), true, attribute + '=' + word);
      assert.equal(isSensitive(input({ [attribute]: word }), null), true, attribute + '=' + word);
    }
  }
  assert.equal(isSensitive(editor({ 'aria-label': 'Password' }), null), true);
});

test('ordinary names do not block', () => {
  const ordinary = ['subject', 'message', 'נושא', 'shipping', 'spinner', 'opinion', 'גוף ההודעה', 'חיפוש', 'q', 'נקודה חשובה', 'title',
    'הקלדת הודעה', 'comment', 'קודם כל', 'firstname', 'תזכורת', 'Message Body', 'reply', 'תגובה', 'שם מלא', 'כתובת', 'search', 'פקודה',
    'חשבונית', 'מספר חשבונית', 'שם החשבון', 'invoice', 'accountant'];
  for (const word of ordinary) {
    for (const attribute of ['name', 'id', 'placeholder', 'aria-label']) {
      assert.equal(hasSensitiveName(input({ [attribute]: word })), false, attribute + '=' + word);
    }
  }
});

test('short fields, locked fields', () => {
  assert.equal(isSensitive(input({ inputmode: 'numeric', maxlength: '6' }), null), true);
  assert.equal(isSensitive(input({ maxlength: '1' }), null), true, 'a box for one digit of a code');
  assert.equal(isSensitive(input({ maxlength: '8' }), null), true);
  assert.equal(isSensitive(input({ maxlength: '9' }), null), false);
  assert.equal(isSensitive(input({ inputmode: 'numeric' }), null), false);
  assert.equal(isSensitive(input({ readonly: '' }), null), true);
  assert.equal(isSensitive(input({ disabled: '' }), null), true);
  assert.equal(isSensitive(editor({ contenteditable: 'false' }), null), true);
});

test('a field that was once a password field stays blocked after "show password"', () => {
  const memory = new PasswordMemory();
  const el = input({ type: 'password' });
  memory.note(el);
  el.type = 'text';
  assert.equal(fieldKind(el), 'text');
  assert.equal(isSensitive(el, memory), true);
  assert.equal(isSensitive(input({}), memory), false);

  const found = input({ type: 'password' });
  memory.scan({ querySelectorAll: (selector) => (selector.includes('password') ? [found] : []) });
  found.type = 'text';
  assert.equal(isSensitive(found, memory), true);
});

/* A tiny tree of elements for the password memory: each node knows its parent and the inputs inside it. */
function tree() {
  const nodes = [];
  const node = (nodeName, parent, attributes) => {
    const item = nodeName === 'INPUT' ? input(attributes || {}) : field(nodeName, attributes || {});
    item.parentElement = parent || null;
    item.isConnected = true;
    item.querySelectorAll = (selector) => (selector === 'input'
      ? nodes.filter((other) => other.nodeName === 'INPUT' && other.isConnected && within(other, item))
      : []);
    nodes.push(item);
    return item;
  };
  const within = (child, ancestor) => {
    for (let current = child.parentElement; current; current = current.parentElement) if (current === ancestor) return true;
    return false;
  };
  return { node };
}

test('login form: the user name next to the password field is not blocked', () => {
  const { node } = tree();
  const body = node('BODY');
  const form = node('FORM', body);
  const row1 = node('DIV', form);
  const row2 = node('DIV', form);
  const userName = node('INPUT', row1, { name: 'user' });
  const password = node('INPUT', row2, { type: 'password', name: 'pw' });
  userName.form = form;
  password.form = form;
  const memory = new PasswordMemory();
  memory.note(password);
  assert.equal(isSensitive(userName, memory), false, 'the user name was there before the password was seen');
  const sameParent = node('INPUT', row2, { name: 'nick' });
  sameParent.form = form;
  assert.equal(isSensitive(sameParent, memory), false, 'a field next to a password field that is still there is not blocked');
});

test('"show password" that swaps in a new field, or a new field together with the element around it, is blocked', () => {
  const { node } = tree();
  const body = node('BODY');
  const form = node('FORM', body);
  const row = node('DIV', form);
  const wrap = node('SPAN', row);
  const userName = node('INPUT', node('DIV', form), { name: 'user' });
  const password = node('INPUT', wrap, { type: 'password', class: 'form-control' });
  userName.form = form;
  password.form = form;
  const memory = new PasswordMemory();
  memory.note(password);

  // The site puts a new wrapper with a new text field in place of the old ones.
  wrap.isConnected = false;
  password.isConnected = false;
  const newWrap = node('SPAN', row);
  const shown = node('INPUT', newWrap, { class: 'form-control' });
  shown.form = form;
  assert.equal(isSensitive(shown, memory), true, 'no hint in its name, but it took the place of the password field');
  assert.equal(isSensitive(userName, memory), false, 'the user name stays usable');

  const area = field('TEXTAREA', {});
  area.parentElement = newWrap;
  assert.equal(isSensitive(area, memory), false, 'only one-line fields can be a password');
});

test('"show password" that switches to a hidden text field kept next to the password field', () => {
  const { node } = tree();
  const body = node('BODY');
  const form = node('FORM', body);
  const row = node('DIV', form);
  const wrap = node('SPAN', row);
  const password = node('INPUT', wrap, { type: 'password' });
  const twin = node('INPUT', wrap, { name: 'pw-visible' });
  twin.getClientRects = () => [];
  password.getClientRects = () => [{}];
  const userName = node('INPUT', node('DIV', form), { name: 'user' });
  userName.getClientRects = () => [{}];
  const memory = new PasswordMemory();
  memory.note(password);
  assert.equal(isSensitive(twin, memory), true, 'the hidden twin is the password, also when it is shown later');
  assert.equal(isSensitive(userName, memory), false, 'a visible field elsewhere in the form is not blocked');
});

test('a field whose only hint is its label', () => {
  const labelled = (text) => {
    const el = input({});
    el.labels = [{ textContent: text }];
    return el;
  };
  for (const text of ['סיסמה', 'Password', 'הקלידו סיסמא', 'PIN', 'קוד אימות', 'מספר כרטיס אשראי', 'CVV']) {
    assert.equal(isSensitive(labelled(text), null), true, text);
  }
  for (const text of ['שם משתמש', 'Email or phone', 'הוסיפו תגובה על החשבון', 'קוד מוצר לחיפוש', 'Your name']) {
    assert.equal(isSensitive(labelled(text), null), false, text);
  }
  const byId = input({ 'aria-labelledby': 'l1' });
  byId.getRootNode = () => ({ getElementById: (id) => (id === 'l1' ? { textContent: 'סיסמה' } : null) });
  assert.equal(isSensitive(byId, null), true, 'aria-labelledby');
});

test('"number" and "exp" are card fields only in a form that asks for a card', () => {
  const page = (signs) => ({ querySelectorAll: () => signs });
  const cardSign = input({ autocomplete: 'cc-number' });
  const plain = input({ name: 'q' });
  const inForm = (attributes, signs) => {
    const el = input(attributes);
    el.form = page(signs);
    return el;
  };
  assert.equal(isSensitive(inForm({ name: 'number' }, [cardSign]), null), true);
  assert.equal(isSensitive(inForm({ name: 'exp' }, [input({ name: 'cardnumber' })]), null), true);
  assert.equal(isSensitive(inForm({ name: 'number' }, [plain]), null), false, 'a house number in an address form');
  assert.equal(isSensitive(input({ placeholder: 'MM / YY' }), null), true);
  assert.equal(isSensitive(input({ placeholder: '•••• •••• •••• ••••' }), null), true);
  assert.equal(isSensitive(input({ placeholder: '0000 0000 0000 0000' }), null), true);
  assert.equal(isSensitive(input({ placeholder: 'מספר טלפון' }), null), false);
  const noForm = input({ name: 'number' });
  noForm.ownerDocument = page([input({ name: 'cvv' })]);
  assert.equal(isSensitive(noForm, null), true, 'without a form, the page decides');
});

test('pincode in every spelling', () => {
  for (const name of ['pincode', 'PINCODE', 'pinCode', 'pin-code', 'pin_code', 'user_pincode', 'pinNumber']) {
    assert.equal(isSensitive(input({ name }), null), true, name);
  }
});

test('text drawn as dots blocks, and a failure to read the style blocks too', () => {
  const view = (value) => ({ getComputedStyle: () => ({ getPropertyValue: () => value }) });
  assert.equal(hasHiddenText({}, view('none')), false);
  assert.equal(hasHiddenText({}, view('')), false);
  assert.equal(hasHiddenText({}, view('disc')), true);
  assert.equal(hasHiddenText({}, { getComputedStyle: () => { throw new Error('x'); } }), true);
});

test('messages: only from this extension, only the one known type, only the exact shape', () => {
  const ID = 'abcdefghijklmnop';
  const good = { type: MESSAGE.GET_HOST };
  assert.equal(isAcceptedMessage(good, { id: ID }, ID), true);
  assert.deepEqual(answerMessage(good, { id: ID }, ID, 'example.com'), { host: 'example.com' });
  const rejected = [
    [good, { id: 'another-extension' }],
    [good, {}],
    [good, null],
    [{ type: 'hoppa:get-shortcuts' }, { id: ID }],
    [{ type: MESSAGE.GET_HOST, extra: 1 }, { id: ID }],
    [{}, { id: ID }],
    ['hoppa:get-host', { id: ID }],
    [null, { id: ID }],
    [[MESSAGE.GET_HOST], { id: ID }]
  ];
  for (const [message, sender] of rejected) {
    assert.equal(answerMessage(message, sender, ID, 'example.com'), undefined, JSON.stringify([message, sender]));
  }
  assert.equal(answerMessage(good, { id: undefined }, undefined, 'x'), undefined);
});

test('messages: the answer holds the site name only', () => {
  const answer = answerMessage({ type: MESSAGE.GET_HOST }, { id: 'x' }, 'x', 'example.com');
  assert.deepEqual(Object.keys(answer), ['host']);
  assert.equal(isHostAnswer(answer), true);
  assert.equal(isHostAnswer({ host: 5 }), false);
  assert.equal(isHostAnswer(null), false);
  assert.equal(isHostAnswer('example.com'), false);
});

test('site name: the top page decides, also from inside a frame', () => {
  const top = { location: { hostname: 'mail.example.com' } };
  top.top = top;
  assert.equal(topHost(top), 'mail.example.com');
  assert.equal(isTopFrame(top), true);
  const sameOrigin = { top, location: { hostname: '' } };
  assert.equal(topHost(sameOrigin), 'mail.example.com');
  assert.equal(isTopFrame(sameOrigin), false);
  const blocked = { get location() { throw new Error('cross-origin'); } };
  const crossOrigin = { top: blocked, location: { hostname: 'chat.example.com', ancestorOrigins: ['https://mail.example.com'] } };
  assert.equal(topHost(crossOrigin), 'mail.example.com');
  const noAncestors = { top: blocked, location: { hostname: 'chat.example.com' } };
  assert.equal(topHost(noAncestors), 'chat.example.com');
});

test('Google Chat adapter: matches only Chat, and the Escape step is off until it is tested there', () => {
  assert.equal(isGoogleChat({ hostname: 'chat.google.com', pathname: '/' }), true);
  assert.equal(isGoogleChat({ hostname: 'mail.google.com', pathname: '/chat/u/0/' }), true);
  assert.equal(isGoogleChat({ hostname: 'mail.google.com', pathname: '/mail/u/0/' }), false);
  assert.equal(isGoogleChat({ hostname: 'example.com', pathname: '/chat' }), false);
  assert.equal(siteAdapterFor({ location: { hostname: 'chat.google.com', pathname: '/' } }), googleChat);
  assert.equal(siteAdapterFor({ location: { hostname: 'example.com', pathname: '/' } }), null);
  let dispatched = 0;
  googleChat.afterExpand({ el: { dispatchEvent: () => { dispatched += 1; }, getAttribute: () => 'menu', ownerDocument: { getElementById: () => null } } });
  assert.equal(dispatched, 0);
});

test('Google Docs module: owns the editors of the Docs family, and is silent when it cannot work', () => {
  const view = (hostname, pathname) => {
    const self = { location: { hostname, pathname }, document: { querySelector: () => ({}) } };
    self.top = self;
    return self;
  };
  const state = { active: true, settings: { docs: true } };
  const make = (hostname, pathname, current) => createGdocs({ view: view(hostname, pathname), matcher: {}, template: {}, getState: () => current || state });

  for (const pathname of ['/document/d/abc/edit', '/spreadsheets/d/abc/edit', '/presentation/d/abc/edit', '/drawings/d/abc/edit']) {
    assert.equal(make('docs.google.com', pathname).ownsFrame, true, pathname);
  }
  assert.equal(make('docs.google.com', '/forms/d/abc/edit').ownsFrame, false, 'forms have normal fields');
  assert.equal(make('example.com', '/document/1').ownsFrame, false);

  const docs = make('docs.google.com', '/document/d/abc/edit');
  assert.equal(docs.status(), 'not-recognized', 'without a matcher it does nothing');
  assert.equal(make('docs.google.com', '/document/d/abc/edit', { active: true, settings: { docs: false } }).status(), 'off');
  assert.equal(make('docs.google.com', '/document/d/abc/edit', { active: false, settings: { docs: true } }).status(), 'off');
  assert.equal(make('docs.google.com', '/spreadsheets/d/abc/edit').status(), 'not-docs');

  const crossOrigin = { top: { get location() { throw new Error('cross-origin'); } }, location: { hostname: 'x.example', pathname: '/' } };
  assert.equal(createGdocs({ view: crossOrigin, matcher: {}, template: {}, getState: () => state }).ownsFrame, false);
});

test('template: version 1 returns plain text as it is', () => {
  assert.deepEqual(renderTemplate({ format: 'plain', text: 'שלום {תאריך} <b>' }), { text: 'שלום {תאריך} <b>', caret: null });
  assert.equal(renderTemplate({ format: 'html', text: 'x' }), null);
  assert.equal(renderTemplate(null), null);
});
