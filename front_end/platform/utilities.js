/*
 * Copyright (C) 2007 Apple Inc.  All rights reserved.
 * Copyright (C) 2012 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/* The long term goal here is to remove all functions in this file and
 * replace them with ES Module functions rather than prototype
 * extensions but in the mean time if an old func in here depends on one
 * that has been migrated, it will need to be imported.
 */
import {caseInsensetiveComparator, regexSpecialCharacters, sprintf} from './string-utilities.js';

// Still used in the test runners that can't use ES modules :(
String.sprintf = sprintf;

// @ts-ignore https://crbug.com/1050549
String.regexSpecialCharacters = regexSpecialCharacters;
// @ts-ignore https://crbug.com/1050549
String.caseInsensetiveComparator = caseInsensetiveComparator;

Object.defineProperty(Array.prototype, 'lowerBound', {
  /**
   * Return index of the leftmost element that is equal or greater
   * than the specimen object. If there's no such element (i.e. all
   * elements are smaller than the specimen) returns right bound.
   * The function works for sorted array.
   * When specified, |left| (inclusive) and |right| (exclusive) indices
   * define the search window.
   *
   * @param {!T} object
   * @param {function(!T,!S):number} comparator
   * @param {number=} left
   * @param {number=} right
   * @return {number}
   * @this {Array.<!S>}
   * @template T,S
   */
  value: function(object, comparator, left, right) {
    /**
     * @param {string|number} a
     * @param {string|number} b
     */
    function defaultComparator(a, b) {
      return a < b ? -1 : (a > b ? 1 : 0);
    }
    comparator = comparator || defaultComparator;
    let l = left || 0;
    let r = right !== undefined ? right : this.length;
    while (l < r) {
      const m = (l + r) >> 1;
      if (comparator(object, this[m]) > 0) {
        l = m + 1;
      } else {
        r = m;
      }
    }
    return r;
  },
  configurable: true
});

Object.defineProperty(Array.prototype, 'upperBound', {
  /**
   * Return index of the leftmost element that is greater
   * than the specimen object. If there's no such element (i.e. all
   * elements are smaller or equal to the specimen) returns right bound.
   * The function works for sorted array.
   * When specified, |left| (inclusive) and |right| (exclusive) indices
   * define the search window.
   *
   * @param {!T} object
   * @param {function(!T,!S):number} comparator
   * @param {number=} left
   * @param {number=} right
   * @return {number}
   * @this {Array.<!S>}
   * @template T,S
   */
  value: function(object, comparator, left, right) {
    /**
     * @param {string|number} a
     * @param {string|number} b
     */
    function defaultComparator(a, b) {
      return a < b ? -1 : (a > b ? 1 : 0);
    }
    comparator = comparator || defaultComparator;
    let l = left || 0;
    let r = right !== undefined ? right : this.length;
    while (l < r) {
      const m = (l + r) >> 1;
      if (comparator(object, this[m]) >= 0) {
        l = m + 1;
      } else {
        r = m;
      }
    }
    return r;
  },
  configurable: true
});

Object.defineProperty(Uint32Array.prototype, 'lowerBound', {value: Array.prototype.lowerBound, configurable: true});

Object.defineProperty(Uint32Array.prototype, 'upperBound', {value: Array.prototype.upperBound, configurable: true});

Object.defineProperty(Int32Array.prototype, 'lowerBound', {value: Array.prototype.lowerBound, configurable: true});

Object.defineProperty(Int32Array.prototype, 'upperBound', {value: Array.prototype.upperBound, configurable: true});

Object.defineProperty(Float64Array.prototype, 'lowerBound', {value: Array.prototype.lowerBound, configurable: true});

/**
 * @param {string} query
 * @param {string=} flags
 * @return {!RegExp}
 */
self.createPlainTextSearchRegex = function(query, flags) {
  // This should be kept the same as the one in StringUtil.cpp.
  let regex = '';
  for (let i = 0; i < query.length; ++i) {
    const c = query.charAt(i);
    if (regexSpecialCharacters().indexOf(c) !== -1) {
      regex += '\\';
    }
    regex += c;
  }
  return new RegExp(regex, flags || '');
};

/**
 * @param {function():void} callback
 */
export function runOnWindowLoad(callback) {
  function windowLoaded() {
    window.removeEventListener('DOMContentLoaded', windowLoaded, false);
    callback();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    callback();
  } else {
    window.addEventListener('DOMContentLoaded', windowLoaded, false);
  }
}

/**
 * @param {never} type
 * @param {string} message
 * @return {never}
 */
export function assertNever(type, message) {
  throw new Error(message);
}

/**
 * @param {?string} content
 * @return {number}
 */
self.base64ToSize = function(content) {
  if (!content) {
    return 0;
  }
  let size = content.length * 3 / 4;
  if (content[content.length - 1] === '=') {
    size--;
  }
  if (content.length > 1 && content[content.length - 2] === '=') {
    size--;
  }
  return size;
};
