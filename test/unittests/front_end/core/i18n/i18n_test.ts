// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const {assert} = chai;

import * as i18n from '../../../../../front_end/core/i18n/i18n.js';

describe('serializeUIString', () => {
  it('serializes strings without placeholders', () => {
    const output = i18n.i18n.serializeUIString('foo');
    assert.deepEqual(output, JSON.stringify({
      string: 'foo',
      values: {},
    }));
  });

  it('serializes strings with placeholder values', () => {
    const output = i18n.i18n.serializeUIString('a string', {PH1: 'value1', PH2: 'value2'});
    assert.deepEqual(output, JSON.stringify({
      string: 'a string',
      values: {PH1: 'value1', PH2: 'value2'},
    }));
  });
});

describe('deserializeUIString', () => {
  it('returns an empty object for an empty string input', () => {
    const output = i18n.i18n.deserializeUIString('');
    assert.deepEqual(output, {string: '', values: {}});
  });

  it('deserializes correctly for a string with no placeholders', () => {
    const output = i18n.i18n.deserializeUIString('{"string":"foo", "values":{}}');
    assert.deepEqual(output, {string: 'foo', values: {}});
  });

  it('deserializes correctly for a string with placeholders', () => {
    const output = i18n.i18n.deserializeUIString('{"string":"foo", "values":{"PH1": "value1"}}');
    assert.deepEqual(output, {string: 'foo', values: {PH1: 'value1'}});
  });
});

describe('serialize/deserialize round-trip', () => {
  it('returns a matching input/output', () => {
    const inputString = 'a string';
    const serializedString = i18n.i18n.serializeUIString(inputString);
    const deserializedString = i18n.i18n.deserializeUIString(serializedString);
    assert.deepEqual(deserializedString, {
      string: inputString,
      values: {},
    });
  });
});

describe('getLocalizedLanguageRegion', () => {
  function createMockDevToolsLocale(locale: string): i18n.DevToolsLocale.DevToolsLocale {
    return {locale, forceFallbackLocale: () => {}} as i18n.DevToolsLocale.DevToolsLocale;
  }

  it('build the correct language/region string', () => {
    assert.strictEqual(
        i18n.i18n.getLocalizedLanguageRegion('de-AT', createMockDevToolsLocale('en-US')),
        'German (Austria) - Deutsch (Österreich)');
    assert.strictEqual(
        i18n.i18n.getLocalizedLanguageRegion('de', createMockDevToolsLocale('en-US')), 'German - Deutsch');
    assert.strictEqual(
        i18n.i18n.getLocalizedLanguageRegion('en-US', createMockDevToolsLocale('de')), 'Englisch (USA) - English (US)');
  });

  it('uses english for the target locale if the languages match', () => {
    assert.strictEqual(
        i18n.i18n.getLocalizedLanguageRegion('de-AT', createMockDevToolsLocale('de')),
        'Deutsch (Österreich) - German (Austria)');
    assert.strictEqual(i18n.i18n.getLocalizedLanguageRegion('de', createMockDevToolsLocale('de')), 'Deutsch - German');
  });
});
