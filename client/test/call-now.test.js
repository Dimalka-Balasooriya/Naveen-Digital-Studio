import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { transformSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { phoneHref } from '../src/utils/phone.js';

const require = createRequire(import.meta.url);
const compiled = transformSync(readFileSync(new URL('../src/components/CallNowButton.jsx', import.meta.url), 'utf8'), { loader: 'jsx', format: 'cjs', jsx: 'automatic' }).code;
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled)(name => name === '../utils/phone' ? { phoneHref } : require(name), module, module.exports);
const CallNowButton = module.exports.default;

test('normalizes ordinary national and international phone formatting without inventing a country code', () => {
  for (const [input, href] of [['077 123 4567', 'tel:0771234567'], [' +94 (77) 123-4567 ', 'tel:+94771234567'], ['020.7946.0958', 'tel:02079460958'], ['+123456789012345', 'tel:+123456789012345']]) assert.equal(phoneHref(input), href);
});

test('rejects absent, malformed, excessive, URL, extension and dial-code inputs', () => {
  for (const input of [null, undefined, 771234567, '', '   ', '0000000000', '123', '+0123456789', '+1234567890123456', '077/1234567', 'abc0771234567', 'tel:0771234567', 'javascript:alert(1)', '*123#', '0771234567;123', '0771234567,123', '0771234567 ext 2', '077+1234567', '++94771234567']) assert.equal(phoneHref(input), null, String(input));
});

test('valid contact renders an accessible native tel link with a decorative phone icon', () => {
  const element = CallNowButton({ phone: '+94 77 123 4567' });
  assert.equal(element.type, 'a');
  assert.equal(element.props.href, 'tel:+94771234567');
  assert.equal(element.props.onClick, undefined); // Native navigation only; no status/save callback.
  assert.equal(element.props.onMouseDown, undefined);
  const markup = renderToStaticMarkup(element);
  assert.match(markup, /Call Now/);
  assert.match(markup, /aria-label="Call Now: \+94 77 123 4567"/);
  assert.match(markup, /<svg[^>]*aria-hidden="true"/);
});

test('invalid contact renders a genuinely disabled non-submit button, without a dial target', () => {
  for (const phone of [null, '', 'unknown', '*123#']) {
    const element = CallNowButton({ phone });
    assert.equal(element.type, 'button');
    assert.equal(element.props.disabled, true);
    assert.equal(element.props.type, 'button');
    assert.equal(element.props.href, undefined);
    assert.equal(element.props.onClick, undefined);
    assert.match(renderToStaticMarkup(React.createElement(CallNowButton, { phone })), /disabled=""/);
  }
});
