// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/* eslint-disable rulesdir/no_underscored_properties */

import * as TextUtils from '../../models/text_utils/text_utils.js';
import type * as Protocol from '../../generated/protocol.js';

import {cssMetadata} from './CSSMetadata.js';
import type {CSSModel, Edit} from './CSSModel.js';
import {CSSProperty} from './CSSProperty.js';
import type {CSSRule} from './CSSRule.js';
import type {Target} from './Target.js';

export class CSSStyleDeclaration {
  _cssModel: CSSModel;
  parentRule: CSSRule|null;
  _allProperties!: CSSProperty[];
  styleSheetId!: string|undefined;
  range!: TextUtils.TextRange.TextRange|null;
  cssText!: string|undefined;
  _shorthandValues!: Map<string, string>;
  _shorthandIsImportant!: Set<string>;
  _activePropertyMap!: Map<string, CSSProperty>;
  _leadingProperties!: CSSProperty[]|null;
  type: Type;
  constructor(cssModel: CSSModel, parentRule: CSSRule|null, payload: Protocol.CSS.CSSStyle, type: Type) {
    this._cssModel = cssModel;
    this.parentRule = parentRule;
    this._reinitialize(payload);
    this.type = type;
  }

  rebase(edit: Edit): void {
    if (this.styleSheetId !== edit.styleSheetId || !this.range) {
      return;
    }
    if (edit.oldRange.equal(this.range)) {
      this._reinitialize((edit.payload as Protocol.CSS.CSSStyle));
    } else {
      this.range = this.range.rebaseAfterTextEdit(edit.oldRange, edit.newRange);
      for (let i = 0; i < this._allProperties.length; ++i) {
        this._allProperties[i].rebase(edit);
      }
    }
  }

  _reinitialize(payload: Protocol.CSS.CSSStyle): void {
    this.styleSheetId = payload.styleSheetId;
    this.range = payload.range ? TextUtils.TextRange.TextRange.fromObject(payload.range) : null;

    const shorthandEntries = payload.shorthandEntries;
    this._shorthandValues = new Map();
    this._shorthandIsImportant = new Set();
    for (let i = 0; i < shorthandEntries.length; ++i) {
      this._shorthandValues.set(shorthandEntries[i].name, shorthandEntries[i].value);
      if (shorthandEntries[i].important) {
        this._shorthandIsImportant.add(shorthandEntries[i].name);
      }
    }

    this._allProperties = [];

    if (payload.cssText && this.range) {
      const cssText = new TextUtils.Text.Text(payload.cssText);
      let start: {
        line: number,
        column: number,
      }|{
        line: number,
        column: number,
      } = {line: this.range.startLine, column: this.range.startColumn};
      for (const cssProperty of payload.cssProperties) {
        const range = cssProperty.range;
        if (range) {
          parseUnusedText.call(this, cssText, start.line, start.column, range.startLine, range.startColumn);
          start = {line: range.endLine, column: range.endColumn};
        }
        this._allProperties.push(CSSProperty.parsePayload(this, this._allProperties.length, cssProperty));
      }
      parseUnusedText.call(this, cssText, start.line, start.column, this.range.endLine, this.range.endColumn);
    } else {
      for (const cssProperty of payload.cssProperties) {
        this._allProperties.push(CSSProperty.parsePayload(this, this._allProperties.length, cssProperty));
      }
    }

    this._generateSyntheticPropertiesIfNeeded();
    this._computeInactiveProperties();

    this._activePropertyMap = new Map();
    for (const property of this._allProperties) {
      if (!property.activeInStyle()) {
        continue;
      }
      this._activePropertyMap.set(property.name, property);
    }

    this.cssText = payload.cssText;
    this._leadingProperties = null;

    function parseUnusedText(
        this: CSSStyleDeclaration, cssText: TextUtils.Text.Text, startLine: number, startColumn: number,
        endLine: number, endColumn: number): void {
      const tr = new TextUtils.TextRange.TextRange(startLine, startColumn, endLine, endColumn);
      if (!this.range) {
        return;
      }
      const missingText = cssText.extract(tr.relativeTo(this.range.startLine, this.range.startColumn));

      // Try to fit the malformed css into properties.
      const lines = missingText.split('\n');
      let lineNumber = 0;
      let inComment = false;
      for (const line of lines) {
        let column = 0;
        for (const property of line.split(';')) {
          const strippedProperty = stripComments(property, inComment);
          const trimmedProperty = strippedProperty.text.trim();
          inComment = strippedProperty.inComment;

          if (trimmedProperty) {
            let name;
            let value;
            const colonIndex = trimmedProperty.indexOf(':');
            if (colonIndex === -1) {
              name = trimmedProperty;
              value = '';
            } else {
              name = trimmedProperty.substring(0, colonIndex).trim();
              value = trimmedProperty.substring(colonIndex + 1).trim();
            }
            const range = new TextUtils.TextRange.TextRange(lineNumber, column, lineNumber, column + property.length);
            this._allProperties.push(new CSSProperty(
                this, this._allProperties.length, name, value, false, false, false, false, property,
                range.relativeFrom(startLine, startColumn)));
          }
          column += property.length + 1;
        }
        lineNumber++;
      }
    }

    function stripComments(text: string, inComment: boolean): {
      text: string,
      inComment: boolean,
    } {
      let output = '';
      for (let i = 0; i < text.length; i++) {
        if (!inComment && text.substring(i, i + 2) === '/*') {
          inComment = true;
          i++;
        } else if (inComment && text.substring(i, i + 2) === '*/') {
          inComment = false;
          i++;
        } else if (!inComment) {
          output += text[i];
        }
      }
      return {text: output, inComment};
    }
  }

  _generateSyntheticPropertiesIfNeeded(): void {
    if (this.range) {
      return;
    }

    if (!this._shorthandValues.size) {
      return;
    }

    const propertiesSet = new Set<string>();
    for (const property of this._allProperties) {
      propertiesSet.add(property.name);
    }

    const generatedProperties = [];
    // For style-based properties, generate shorthands with values when possible.
    for (const property of this._allProperties) {
      // For style-based properties, try generating shorthands.
      const shorthands = cssMetadata().getShorthands(property.name) || [];
      for (const shorthand of shorthands) {
        if (propertiesSet.has(shorthand)) {
          continue;
        }  // There already is a shorthand this longhands falls under.
        const shorthandValue = this._shorthandValues.get(shorthand);
        if (!shorthandValue) {
          continue;
        }  // Never generate synthetic shorthands when no value is available.

        // Generate synthetic shorthand we have a value for.
        const shorthandImportance = Boolean(this._shorthandIsImportant.has(shorthand));
        const shorthandProperty = new CSSProperty(
            this, this.allProperties().length, shorthand, shorthandValue, shorthandImportance, false, true, false);
        generatedProperties.push(shorthandProperty);
        propertiesSet.add(shorthand);
      }
    }
    this._allProperties = this._allProperties.concat(generatedProperties);
  }

  _computeLeadingProperties(): CSSProperty[] {
    function propertyHasRange(property: CSSProperty): boolean {
      return Boolean(property.range);
    }

    if (this.range) {
      return this._allProperties.filter(propertyHasRange);
    }

    const leadingProperties = [];
    for (const property of this._allProperties) {
      const shorthands = cssMetadata().getShorthands(property.name) || [];
      let belongToAnyShorthand = false;
      for (const shorthand of shorthands) {
        if (this._shorthandValues.get(shorthand)) {
          belongToAnyShorthand = true;
          break;
        }
      }
      if (!belongToAnyShorthand) {
        leadingProperties.push(property);
      }
    }

    return leadingProperties;
  }

  leadingProperties(): CSSProperty[] {
    if (!this._leadingProperties) {
      this._leadingProperties = this._computeLeadingProperties();
    }
    return this._leadingProperties;
  }

  target(): Target {
    return this._cssModel.target();
  }

  cssModel(): CSSModel {
    return this._cssModel;
  }

  _computeInactiveProperties(): void {
    const activeProperties = new Map<string, CSSProperty>();
    for (let i = 0; i < this._allProperties.length; ++i) {
      const property = this._allProperties[i];
      if (property.disabled || !property.parsedOk) {
        property.setActive(false);
        continue;
      }
      const metadata = cssMetadata();
      const canonicalName = metadata.canonicalPropertyName(property.name);
      const longhands = metadata.getLonghands(canonicalName);
      if (longhands) {
        for (const longhand of longhands) {
          const activeLonghand = activeProperties.get(longhand);
          if (activeLonghand && activeLonghand.range && (!activeLonghand.important || property.important)) {
            activeLonghand.setActive(false);
            activeProperties.delete(longhand);
          }
        }
      }
      const activeProperty = activeProperties.get(canonicalName);
      if (!activeProperty) {
        activeProperties.set(canonicalName, property);
      } else if (!property.range) {
        // For some -webkit- properties, the backend returns also the canonical
        // property. e.g. if you set in the css only the property
        // -webkit-background-clip, the backend will return
        // -webkit-background-clip and background-clip.
        // This behavior will invalidate -webkit-background-clip (only visually,
        // the property will be correctly applied)
        // So this is checking if the property is visible or not in the
        // styles panel and if not, it will not deactivate the "activeProperty".
        property.setActive(false);
      } else if (!activeProperty.important || property.important) {
        activeProperty.setActive(false);
        activeProperties.set(canonicalName, property);
      } else {
        property.setActive(false);
      }
    }
  }

  allProperties(): CSSProperty[] {
    return this._allProperties;
  }

  getPropertyValue(name: string): string {
    const property = this._activePropertyMap.get(name);
    return property ? property.value : '';
  }

  isPropertyImplicit(name: string): boolean {
    const property = this._activePropertyMap.get(name);
    return property ? property.implicit : false;
  }

  longhandProperties(name: string): CSSProperty[] {
    const longhands = cssMetadata().getLonghands(name.toLowerCase());
    const result = [];
    for (let i = 0; longhands && i < longhands.length; ++i) {
      const property = this._activePropertyMap.get(longhands[i]);
      if (property) {
        result.push(property);
      }
    }
    return result;
  }

  propertyAt(index: number): CSSProperty|null {
    return (index < this.allProperties().length) ? this.allProperties()[index] : null;
  }

  pastLastSourcePropertyIndex(): number {
    for (let i = this.allProperties().length - 1; i >= 0; --i) {
      if (this.allProperties()[i].range) {
        return i + 1;
      }
    }
    return 0;
  }

  _insertionRange(index: number): TextUtils.TextRange.TextRange {
    const property = this.propertyAt(index);
    if (property && property.range) {
      return property.range.collapseToStart();
    }
    if (!this.range) {
      throw new Error('CSSStyleDeclaration.range is null');
    }
    return this.range.collapseToEnd();
  }

  newBlankProperty(index?: number): CSSProperty {
    index = (typeof index === 'undefined') ? this.pastLastSourcePropertyIndex() : index;
    const property = new CSSProperty(this, index, '', '', false, false, true, false, '', this._insertionRange(index));
    return property;
  }

  setText(text: string, majorChange: boolean): Promise<boolean> {
    if (!this.range || !this.styleSheetId) {
      return Promise.resolve(false);
    }
    return this._cssModel.setStyleText(this.styleSheetId, this.range, text, majorChange);
  }

  insertPropertyAt(index: number, name: string, value: string, userCallback?: ((arg0: boolean) => void)): void {
    this.newBlankProperty(index).setText(name + ': ' + value + ';', false, true).then(userCallback);
  }

  appendProperty(name: string, value: string, userCallback?: ((arg0: boolean) => void)): void {
    this.insertPropertyAt(this.allProperties().length, name, value, userCallback);
  }
}

// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export enum Type {
  Regular = 'Regular',
  Inline = 'Inline',
  Attributes = 'Attributes',
}
