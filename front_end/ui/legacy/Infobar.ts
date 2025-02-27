// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/* eslint-disable rulesdir/no_underscored_properties */


import type * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';

import * as ARIAUtils from './ARIAUtils.js';
import {Keys} from './KeyboardShortcut.js';
import {createTextButton} from './UIUtils.js';
import {createShadowRootWithCoreStyles} from './utils/create-shadow-root-with-core-styles.js';
import type {Widget} from './Widget.js';

const UIStrings = {
  /**
  *@description Text on a button to close the infobar and never show the infobar in the future
  */
  dontShowAgain: 'Don\'t show again',
  /**
  *@description Text that is usually a hyperlink to more documentation
  */
  learnMore: 'Learn more',
  /**
  *@description Text to close something
  */
  close: 'Close',
};
const str_ = i18n.i18n.registerUIStrings('ui/legacy/Infobar.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

export class Infobar {
  element: HTMLElement;
  _shadowRoot: ShadowRoot;
  _contentElement: HTMLDivElement;
  _mainRow: HTMLElement;
  _detailsRows: HTMLElement;
  _hasDetails: boolean;
  _detailsMessage: string;
  _infoContainer: HTMLElement;
  _infoMessage: HTMLElement;
  _infoText: HTMLElement;
  _actionContainer: HTMLElement;
  // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _disableSetting: Common.Settings.Setting<any>|null;
  _closeContainer: HTMLElement;
  _toggleElement: HTMLButtonElement;
  _closeButton: HTMLElement;
  // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _closeCallback: (() => any)|null;
  _parentView?: Widget;

  // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(type: Type, text: string, actions?: InfobarAction[], disableSetting?: Common.Settings.Setting<any>) {
    this.element = document.createElement('div');
    this.element.classList.add('flex-none');
    this._shadowRoot =
        createShadowRootWithCoreStyles(this.element, {cssFile: 'ui/legacy/infobar.css', delegatesFocus: undefined});

    this._contentElement = this._shadowRoot.createChild('div', 'infobar infobar-' + type) as HTMLDivElement;

    this._mainRow = this._contentElement.createChild('div', 'infobar-main-row');
    this._detailsRows = this._contentElement.createChild('div', 'infobar-details-rows hidden');
    this._hasDetails = false;
    this._detailsMessage = '';

    this._infoContainer = this._mainRow.createChild('div', 'infobar-info-container');

    this._infoMessage = this._infoContainer.createChild('div', 'infobar-info-message');

    // Icon is in separate file and included via CSS.
    this._infoMessage.createChild('div', type + '-icon icon');

    this._infoText = this._infoMessage.createChild('div', 'infobar-info-text');
    this._infoText.textContent = text;
    ARIAUtils.markAsAlert(this._infoText);

    this._actionContainer = this._infoContainer.createChild('div', 'infobar-info-actions');
    if (actions) {
      this._contentElement.setAttribute('role', 'group');

      for (const action of actions) {
        const actionCallback = this._actionCallbackFactory(action);
        let buttonClass = 'infobar-button';
        if (action.highlight) {
          buttonClass += ' primary-button';
        }

        const button = createTextButton(action.text, actionCallback, buttonClass);
        this._actionContainer.appendChild(button);
      }
    }

    this._disableSetting = disableSetting || null;
    if (disableSetting) {
      const disableButton =
          createTextButton(i18nString(UIStrings.dontShowAgain), this._onDisable.bind(this), 'infobar-button');
      this._actionContainer.appendChild(disableButton);
    }

    this._closeContainer = this._mainRow.createChild('div', 'infobar-close-container');
    this._toggleElement = createTextButton(
        i18nString(UIStrings.learnMore), this._onToggleDetails.bind(this), 'link-style devtools-link hidden');
    this._closeContainer.appendChild(this._toggleElement);
    this._closeButton = this._closeContainer.createChild('div', 'close-button', 'dt-close-button');
    // @ts-ignore This is a custom element defined in UIUitls.js that has a `setTabbable` that TS doesn't
    //            know about.
    this._closeButton.setTabbable(true);
    ARIAUtils.setDescription(this._closeButton, i18nString(UIStrings.close));
    self.onInvokeElement(this._closeButton, this.dispose.bind(this));

    if (type !== Type.Issue) {
      this._contentElement.tabIndex = 0;
    }
    ARIAUtils.setAccessibleName(this._contentElement, text);
    this._contentElement.addEventListener('keydown', event => {
      if (event.keyCode === Keys.Esc.code) {
        this.dispose();
        event.consume();
        return;
      }

      if (event.target !== this._contentElement) {
        return;
      }

      if (event.key === 'Enter' && this._hasDetails) {
        this._onToggleDetails();
        event.consume();
        return;
      }
    });

    this._closeCallback = null;
  }

  // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static create(type: Type, text: string, actions?: InfobarAction[], disableSetting?: Common.Settings.Setting<any>):
      Infobar|null {
    if (disableSetting && disableSetting.get()) {
      return null;
    }
    return new Infobar(type, text, actions, disableSetting);
  }

  dispose(): void {
    this.element.remove();
    this._onResize();
    if (this._closeCallback) {
      this._closeCallback.call(null);
    }
  }

  setText(text: string): void {
    this._infoText.textContent = text;
    this._onResize();
  }

  // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setCloseCallback(callback: (() => any)|null): void {
    this._closeCallback = callback;
  }

  setParentView(parentView: Widget): void {
    this._parentView = parentView;
  }

  _actionCallbackFactory(action: InfobarAction): () => void {
    if (!action.delegate) {
      return action.dismiss ? this.dispose.bind(this) : (): void => {};
    }

    if (!action.dismiss) {
      return action.delegate;
    }

    return ((): void => {
             if (action.delegate) {
               action.delegate();
             }
             this.dispose();
           }).bind(this);
  }

  _onResize(): void {
    if (this._parentView) {
      this._parentView.doResize();
    }
  }

  _onDisable(): void {
    if (this._disableSetting) {
      this._disableSetting.set(true);
    }
    this.dispose();
  }

  _onToggleDetails(): void {
    this._detailsRows.classList.remove('hidden');
    this._toggleElement.remove();
    this._onResize();
    ARIAUtils.alert(this._detailsMessage);
  }

  createDetailsRowMessage(message?: string): Element {
    this._hasDetails = true;
    this._detailsMessage = message || '';
    this._toggleElement.classList.remove('hidden');
    const infobarDetailsRow = this._detailsRows.createChild('div', 'infobar-details-row');
    const detailsRowMessage = infobarDetailsRow.createChild('span', 'infobar-row-message');
    detailsRowMessage.textContent = this._detailsMessage;
    return detailsRowMessage;
  }
}
export interface InfobarAction {
  text: string;
  highlight: boolean;
  delegate: (() => void)|null;
  dismiss: boolean;
}

// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export enum Type {
  Warning = 'warning',
  Info = 'info',
  Issue = 'issue',
}
