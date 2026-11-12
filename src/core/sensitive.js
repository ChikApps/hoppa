// Copyright (C) 2026 ChikApps
// SPDX-License-Identifier: GPL-2.0-or-later

/*
 * Fields the extension never works in. When in doubt, it does not replace:
 * a missed replacement is better than a replacement in a sensitive field.
 */
const TEXT_TYPES = new Set(['', 'text', 'search']);
const AUTOCOMPLETE_BLOCKED = new Set(['current-password', 'new-password', 'one-time-code', 'webauthn']);

/*
 * Words that mark a field as sensitive. The name, id, placeholder, aria-label
 * and title of the field are joined, lower-cased and stripped of separators,
 * so "card_number", "cardNumber" and "Card number" all read as "cardnumber".
 * The list is wide on purpose: a blocked field only means no replacement there.
 */
const NAME_PARTS = [
  // passwords and secrets
  'pass', 'pwd', 'secret', 'token', 'passphrase',
  // one-time and verification codes
  'otp', '2fa', 'mfa', 'totp', 'onetime', 'verification', 'verify', 'authcode', 'smscode', 'securitycode', 'passcode',
  'pincode', 'pinnumber', 'pinnum',
  // payment cards
  'card', 'cvv', 'cvc', 'csc', 'ccnum', 'ccno', 'ccname', 'ccexp', 'cccode', 'expiry', 'expiration', 'expdate',
  'expmonth', 'expyear', 'validthru',
  // bank accounts and identity numbers
  'iban', 'swift', 'routing', 'accountnumber', 'accountno', 'acctno', 'accnum', 'bankaccount', 'ssn', 'socialsecurity',
  'taxid', 'nationalid', 'idnumber', 'passport',
  // Hebrew
  'סיסמ', 'ססמ', 'אשראי', 'כרטיס', 'קודאימות', 'קודחד', 'קודסודי', 'ספרותבגב', 'תוקף', 'מספרחשבון', 'חשבוןבנק',
  'תעודתזהות', 'מספרזהות', 'דרכון'
];
/*
 * Short words that are sensitive only as a whole word: "pin" but not "shipping",
 * "חשבון" (an account) but not "חשבונית" (an invoice).
 */
const NAME_WORDS = new Set(['pin', 'code', 'cc', 'bic', 'sms', 'account', 'acct', 'קוד', 'הקוד', 'בקוד', 'לקוד', 'זהות', 'תז', 'חשבון']);
const NAME_ATTRIBUTES = ['name', 'id', 'placeholder', 'aria-label', 'title'];

/*
 * The visible label of a field is read too, but only for the clearest words,
 * because a label is longer and freer than a name ("Comment on your account").
 */
const LABEL_PARTS = ['password', 'passcode', 'pincode', 'סיסמ', 'ססמ', 'cvv', 'cvc', 'cardnumber', 'creditcard', 'debitcard',
  'מספרכרטיס', 'כרטיסאשראי', 'קודאימות', 'קודחד', 'iban', 'ssn', 'תעודתזהות', 'onetimecode', 'verificationcode'];
const LABEL_WORDS = new Set(['pin', 'otp', 'תז']);
const LABEL_TEXT_MAX = 80;

/*
 * Names that say nothing alone ("number", "exp"), and are sensitive only in a
 * form (or, without a form, a page) that is clearly about a payment card.
 */
const CARD_FORM_WORDS = new Set(['number', 'num', 'no', 'exp', 'mm', 'yy', 'yyyy', 'month', 'year', 'holder', 'מספר', 'חודש', 'שנה']);
const CARD_SIGNS = ['cardnumber', 'creditcard', 'debitcard', 'ccnum', 'ccnumber', 'cvv', 'cvc', 'csc', 'expiry', 'expiration',
  'אשראי', 'מספרכרטיס'];
/* Placeholders that look like a card number or an expiry date: "•••• ••••", "0000 0000 0000 0000", "MM / YY". */
const CARD_PLACEHOLDER_RE = /^[\s•*·x0-9]{12,}$|^\s*(mm|חח)\s*[/\-]\s*(yy|yyyy|שש)\s*$/i;
/* A field that holds only a few characters is a code box, never a place for text. */
const SHORT_FIELD_MAX = 8;

function attr(el, name) {
  const value = typeof el.getAttribute === 'function' ? el.getAttribute(name) : null;
  return typeof value === 'string' ? value : '';
}

function inputType(el) {
  return (typeof el.type === 'string' ? el.type : attr(el, 'type')).toLowerCase();
}

/* 'text' for a plain field, 'rich' for an editable area, null for anything else. */
export function fieldKind(el) {
  if (!el || typeof el.nodeName !== 'string') return null;
  const name = el.nodeName.toUpperCase();
  if (name === 'TEXTAREA') return 'text';
  if (name === 'INPUT') return TEXT_TYPES.has(inputType(el)) ? 'text' : null;
  if (el.isContentEditable === true) return 'rich';
  return null;
}

export function isPasswordInput(el) {
  return !!el && typeof el.nodeName === 'string' && el.nodeName.toUpperCase() === 'INPUT' && inputType(el) === 'password';
}

const GROUP_DEPTH = 4;

/* The form of a field, and its first ancestors: the places where a replacement field may appear. */
function groupsOf(el) {
  const out = [];
  if (el.form) out.push(el.form);
  let current = el.parentElement;
  for (let depth = 0; current && depth < GROUP_DEPTH; depth++) {
    out.push(current);
    current = current.parentElement;
  }
  return out;
}

function isInputElement(el) {
  return !!el && typeof el.nodeName === 'string' && el.nodeName.toUpperCase() === 'INPUT';
}

/*
 * Remembers every field that was ever a password field, also after "show
 * password". Some sites show the password by putting a new field in place of
 * the old one, sometimes together with the element around it. So for each
 * password field the fields that were already next to it are remembered too:
 * a new one-line field that appears in the same form or area after the
 * password field was removed is the password field; a field that was there
 * before (the user name of a login form) is not.
 */
export class PasswordMemory {
  #seen = new WeakSet();
  #groups = new WeakMap();
  #twins = new WeakSet();

  note(el) {
    if (!isPasswordInput(el) || this.#seen.has(el)) return;
    this.#seen.add(el);
    this.#noteTwins(el);
    const groups = groupsOf(el);
    if (groups.length === 0) return;
    const widest = groups[groups.length - 1];
    const known = new WeakSet();
    if (typeof widest.querySelectorAll === 'function') {
      for (const input of widest.querySelectorAll('input')) known.add(input);
    }
    for (const group of groups) {
      const state = this.#groups.get(group) || { passwords: [], known: [] };
      state.passwords.push(el);
      state.known.push(known);
      this.#groups.set(group, state);
    }
  }

  /*
   * Some sites keep a second, hidden text field right next to the password
   * field, and show it instead on "show password". A one-line text field that
   * is hidden in the same small area at the moment the password field is seen
   * is remembered as its twin.
   */
  #noteTwins(el) {
    const area = el.parentElement && el.parentElement.parentElement ? el.parentElement.parentElement : el.parentElement;
    if (!area || typeof area.querySelectorAll !== 'function') return;
    for (const other of area.querySelectorAll('input')) {
      if (other === el || fieldKind(other) !== 'text') continue;
      let hidden = false;
      try {
        hidden = typeof other.getClientRects === 'function' && other.getClientRects().length === 0;
      } catch (error) {
        hidden = false;
      }
      if (hidden) this.#twins.add(other);
    }
  }

  has(el) {
    if (this.#seen.has(el) || this.#twins.has(el)) return true;
    if (!isInputElement(el)) return false;
    for (const group of groupsOf(el)) {
      const state = this.#groups.get(group);
      if (!state) continue;
      for (let i = 0; i < state.passwords.length; i++) {
        const removed = state.passwords[i].isConnected === false;
        if (removed && !state.known[i].has(el)) return true;
      }
    }
    return false;
  }

  /* One cheap query, run when the user clicks or moves between fields. */
  scan(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const found = root.querySelectorAll('input[type="password" i]');
    for (const el of found) this.note(el);
  }
}

/* "card_number", "cardNumber", "Card number" -> words: card, number; joined: cardnumber. */
function nameWords(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/["'׳״.]/g, '')
    .split(/[^a-z0-9א-ת]+/)
    .filter((word) => word.length > 0);
}

function textOf(node) {
  return node && typeof node.textContent === 'string' ? node.textContent.slice(0, LABEL_TEXT_MAX) : '';
}

/* The text of the labels of a field: <label for>, a wrapping <label>, and aria-labelledby. */
function labelTexts(el) {
  const out = [];
  try {
    if (el.labels) for (const label of el.labels) out.push(textOf(label));
    const ids = attr(el, 'aria-labelledby').split(/\s+/).filter((id) => id.length > 0);
    const root = typeof el.getRootNode === 'function' ? el.getRootNode() : null;
    for (const id of ids.slice(0, 4)) {
      const node = root && typeof root.getElementById === 'function' ? root.getElementById(id) : null;
      out.push(textOf(node));
    }
  } catch (error) {
    // A label that cannot be read says nothing.
  }
  return out;
}

export function hasSensitiveLabel(el) {
  for (const text of labelTexts(el)) {
    const words = nameWords(text);
    const joined = words.join('');
    if (LABEL_PARTS.some((part) => joined.includes(part))) return true;
    if (words.some((word) => LABEL_WORDS.has(word))) return true;
  }
  return false;
}

/* Does a form, or a page without a form, ask for a payment card? Cached until its fields change. */
const cardContexts = new WeakMap();
function isCardContext(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return false;
  const fields = root.querySelectorAll('input');
  const cached = cardContexts.get(root);
  if (cached && cached.count === fields.length) return cached.card;
  let card = false;
  for (const field of fields) {
    if (attr(field, 'autocomplete').toLowerCase().split(/\s+/).some((token) => token.startsWith('cc-'))) card = true;
    for (const name of NAME_ATTRIBUTES) {
      const joined = nameWords(attr(field, name)).join('');
      if (CARD_SIGNS.some((sign) => joined.includes(sign))) card = true;
    }
    if (card) break;
  }
  cardContexts.set(root, { count: fields.length, card });
  return card;
}

export function isCardField(el) {
  if (CARD_PLACEHOLDER_RE.test(attr(el, 'placeholder'))) return true;
  const words = [];
  for (const name of ['name', 'id', 'autocomplete']) words.push(...nameWords(attr(el, name)));
  if (!words.some((word) => CARD_FORM_WORDS.has(word))) return false;
  return isCardContext(el.form || el.ownerDocument || null);
}

export function hasSensitiveName(el) {
  for (const name of NAME_ATTRIBUTES) {
    const value = attr(el, name);
    if (value.length === 0) continue;
    const words = nameWords(value);
    const joined = words.join('');
    for (const part of NAME_PARTS) {
      if (joined.includes(part)) return true;
    }
    for (const word of words) {
      if (NAME_WORDS.has(word)) return true;
    }
  }
  return false;
}

export function hasSensitiveAutocomplete(el) {
  const tokens = attr(el, 'autocomplete').toLowerCase().split(/\s+/);
  for (const token of tokens) {
    if (AUTOCOMPLETE_BLOCKED.has(token) || token.startsWith('cc-')) return true;
  }
  return false;
}

function isShortField(el) {
  const max = Number.parseInt(attr(el, 'maxlength'), 10);
  return Number.isFinite(max) && max > 0 && max <= SHORT_FIELD_MAX;
}

/* Checks that read attributes only. Cheap enough to run on every keystroke. */
export function isSensitive(el, memory) {
  const kind = fieldKind(el);
  if (kind === null) return true;
  if (memory && memory.has(el)) return true;
  if (kind === 'text') {
    if (el.readOnly === true || el.disabled === true) return true;
    if (el.hasAttribute && (el.hasAttribute('readonly') || el.hasAttribute('disabled'))) return true;
  } else if (attr(el, 'contenteditable').toLowerCase() === 'false' || attr(el, 'aria-readonly').toLowerCase() === 'true') {
    return true;
  }
  if (hasSensitiveAutocomplete(el)) return true;
  if (hasSensitiveName(el)) return true;
  if (hasSensitiveLabel(el)) return true;
  if (kind === 'text' && isCardField(el)) return true;
  if (isShortField(el)) return true;
  return false;
}

/* Text that is drawn as dots. Reads the computed style, so it runs only right before a replacement. */
export function hasHiddenText(el, view) {
  try {
    const style = view.getComputedStyle(el);
    const value = style.getPropertyValue('-webkit-text-security');
    return value !== '' && value !== 'none';
  } catch (error) {
    return true;
  }
}
