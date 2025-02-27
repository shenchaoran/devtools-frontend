// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/*
 * Copyright (C) 2007 Apple Inc.  All rights reserved.
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

/* eslint-disable rulesdir/no_underscored_properties */

import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';

import * as ARIAUtils from './ARIAUtils.js';
import type {Icon} from './Icon.js';
import type {Config} from './InplaceEditor.js';
import {InplaceEditor} from './InplaceEditor.js';  // eslint-disable-line no-unused-vars
import {Keys} from './KeyboardShortcut.js';
import {Tooltip} from './Tooltip.js';
import {deepElementFromPoint, enclosingNodeOrSelfWithNodeNameInArray, isEditing} from './UIUtils.js';
import {appendStyle} from './utils/append-style.js';
import {createShadowRootWithCoreStyles} from './utils/create-shadow-root-with-core-styles.js';

const nodeToParentTreeElementMap = new WeakMap<Node, TreeElement>();

export class TreeOutline extends Common.ObjectWrapper.ObjectWrapper {
  _rootElement: TreeElement;
  _renderSelection: boolean;
  selectedTreeElement: TreeElement|null;
  expandTreeElementsWhenArrowing: boolean;
  _comparator: ((arg0: TreeElement, arg1: TreeElement) => number)|null;
  contentElement: HTMLOListElement;
  _preventTabOrder: boolean;
  _showSelectionOnKeyboardFocus: boolean;
  _focusable: boolean;
  element: HTMLElement;
  _useLightSelectionColor: boolean;
  _treeElementToScrollIntoView: TreeElement|null;
  _centerUponScrollIntoView: boolean;

  constructor() {
    super();
    this._rootElement = this._createRootElement();
    this._renderSelection = false;

    this.selectedTreeElement = null;
    this.expandTreeElementsWhenArrowing = false;
    this._comparator = null;

    this.contentElement = this._rootElement._childrenListNode;
    this.contentElement.addEventListener('keydown', this._treeKeyDown.bind(this), false);

    this._preventTabOrder = false;
    this._showSelectionOnKeyboardFocus = false;
    this._focusable = true;
    this.setFocusable(true);
    this.element = this.contentElement;
    ARIAUtils.markAsTree(this.element);
    this._useLightSelectionColor = false;
    this._treeElementToScrollIntoView = null;
    this._centerUponScrollIntoView = false;
  }

  setShowSelectionOnKeyboardFocus(show: boolean, preventTabOrder?: boolean): void {
    this.contentElement.classList.toggle('hide-selection-when-blurred', show);
    this._preventTabOrder = Boolean(preventTabOrder);
    if (this._focusable) {
      this.contentElement.tabIndex = Boolean(preventTabOrder) ? -1 : 0;
    }
    this._showSelectionOnKeyboardFocus = show;
  }

  _createRootElement(): TreeElement {
    const rootElement = new TreeElement();
    rootElement.treeOutline = this;
    rootElement.root = true;
    rootElement.selectable = false;
    rootElement.expanded = true;
    rootElement._childrenListNode.classList.remove('children');
    return rootElement;
  }

  rootElement(): TreeElement {
    return this._rootElement;
  }

  firstChild(): TreeElement|null {
    return this._rootElement.firstChild();
  }

  _lastDescendent(): TreeElement|null {
    let last = this._rootElement.lastChild();
    while (last && last.expanded && last.childCount()) {
      last = last.lastChild();
    }
    return last;
  }

  appendChild(child: TreeElement, comparator?: ((arg0: TreeElement, arg1: TreeElement) => number)): void {
    this._rootElement.appendChild(child, comparator);
  }

  insertChild(child: TreeElement, index: number): void {
    this._rootElement.insertChild(child, index);
  }

  removeChild(child: TreeElement): void {
    this._rootElement.removeChild(child);
  }

  removeChildren(): void {
    this._rootElement.removeChildren();
  }

  treeElementFromPoint(x: number, y: number): TreeElement|null {
    const node = deepElementFromPoint(this.contentElement.ownerDocument, x, y);
    if (!node) {
      return null;
    }

    const listNode = enclosingNodeOrSelfWithNodeNameInArray(node, ['ol', 'li']);
    if (listNode) {
      return nodeToParentTreeElementMap.get(listNode) || treeElementBylistItemNode.get(listNode) || null;
    }
    return null;
  }

  treeElementFromEvent(event: MouseEvent|null): TreeElement|null {
    return event ? this.treeElementFromPoint(event.pageX, event.pageY) : null;
  }

  setComparator(comparator: ((arg0: TreeElement, arg1: TreeElement) => number)|null): void {
    this._comparator = comparator;
  }

  setFocusable(focusable: boolean): void {
    this._focusable = focusable;
    this.updateFocusable();
  }

  updateFocusable(): void {
    if (this._focusable) {
      this.contentElement.tabIndex = (this._preventTabOrder || Boolean(this.selectedTreeElement)) ? -1 : 0;
      if (this.selectedTreeElement) {
        this.selectedTreeElement._setFocusable(true);
      }
    } else {
      this.contentElement.removeAttribute('tabIndex');
      if (this.selectedTreeElement) {
        this.selectedTreeElement._setFocusable(false);
      }
    }
  }

  focus(): void {
    if (this.selectedTreeElement) {
      this.selectedTreeElement.listItemElement.focus();
    } else {
      this.contentElement.focus();
    }
  }

  useLightSelectionColor(): void {
    this._useLightSelectionColor = true;
  }

  _bindTreeElement(element: TreeElement): void {
    if (element.treeOutline) {
      console.error('Binding element for the second time: ' + new Error().stack);
    }
    element.treeOutline = this;
    element.onbind();
  }

  _unbindTreeElement(element: TreeElement): void {
    if (!element.treeOutline) {
      console.error('Unbinding element that was not bound: ' + new Error().stack);
    }

    element.deselect();
    element.onunbind();
    element.treeOutline = null;
  }

  selectPrevious(): boolean {
    let nextSelectedElement: (TreeElement|null) =
        this.selectedTreeElement && this.selectedTreeElement.traversePreviousTreeElement(true);
    while (nextSelectedElement && !nextSelectedElement.selectable) {
      nextSelectedElement = nextSelectedElement.traversePreviousTreeElement(!this.expandTreeElementsWhenArrowing);
    }
    if (!nextSelectedElement) {
      return false;
    }
    nextSelectedElement.select(false, true);
    return true;
  }

  selectNext(): boolean {
    let nextSelectedElement: (TreeElement|null) =
        this.selectedTreeElement && this.selectedTreeElement.traverseNextTreeElement(true);
    while (nextSelectedElement && !nextSelectedElement.selectable) {
      nextSelectedElement = nextSelectedElement.traverseNextTreeElement(!this.expandTreeElementsWhenArrowing);
    }
    if (!nextSelectedElement) {
      return false;
    }
    nextSelectedElement.select(false, true);
    return true;
  }

  forceSelect(omitFocus: boolean|undefined = false, selectedByUser: boolean|undefined = true): void {
    if (this.selectedTreeElement) {
      this.selectedTreeElement.deselect();
    }
    this._selectFirst(omitFocus, selectedByUser);
  }

  _selectFirst(omitFocus: boolean|undefined = false, selectedByUser: boolean|undefined = true): boolean {
    let first = this.firstChild();
    while (first && !first.selectable) {
      first = first.traverseNextTreeElement(true);
    }
    if (!first) {
      return false;
    }
    first.select(omitFocus, selectedByUser);
    return true;
  }

  _selectLast(): boolean {
    let last = this._lastDescendent();
    while (last && !last.selectable) {
      last = last.traversePreviousTreeElement(true);
    }
    if (!last) {
      return false;
    }
    last.select(false, true);
    return true;
  }

  _treeKeyDown(event: KeyboardEvent): void {
    if (event.shiftKey || event.metaKey || event.ctrlKey || isEditing()) {
      return;
    }

    let handled = false;
    if (!this.selectedTreeElement) {
      if (event.key === 'ArrowUp' && !event.altKey) {
        handled = this._selectLast();
      } else if (event.key === 'ArrowDown' && !event.altKey) {
        handled = this._selectFirst();
      }
    } else if (event.key === 'ArrowUp' && !event.altKey) {
      handled = this.selectPrevious();
    } else if (event.key === 'ArrowDown' && !event.altKey) {
      handled = this.selectNext();
    } else if (event.key === 'ArrowLeft') {
      handled = this.selectedTreeElement.collapseOrAscend(event.altKey);
    } else if (event.key === 'ArrowRight') {
      if (!this.selectedTreeElement.revealed()) {
        this.selectedTreeElement.reveal();
        handled = true;
      } else {
        handled = this.selectedTreeElement.descendOrExpand(event.altKey);
      }
    } else if (event.keyCode === 8 /* Backspace */ || event.keyCode === 46 /* Delete */) {
      handled = this.selectedTreeElement.ondelete();
    } else if (event.key === 'Enter') {
      handled = this.selectedTreeElement.onenter();
    } else if (event.keyCode === Keys.Space.code) {
      handled = this.selectedTreeElement.onspace();
    } else if (event.key === 'Home') {
      handled = this._selectFirst();
    } else if (event.key === 'End') {
      handled = this._selectLast();
    }

    if (handled) {
      event.consume(true);
    }
  }

  _deferredScrollIntoView(treeElement: TreeElement, center: boolean): void {
    const deferredScrollIntoView = (): void => {
      if (!this._treeElementToScrollIntoView) {
        return;
      }

      // This function doesn't use scrollIntoViewIfNeeded because it always
      // scrolls in both directions even if only one is necessary to bring the
      // item into view.
      const itemRect = this._treeElementToScrollIntoView.listItemElement.getBoundingClientRect();
      const treeRect = this.contentElement.getBoundingClientRect();

      // Usually, this.element is the tree container that scrolls. But sometimes
      // (i.e. in the Elements panel), its parent is.
      let scrollParentElement: HTMLElement = this.element;
      while (getComputedStyle(scrollParentElement).overflow === 'visible' && scrollParentElement.parentElement) {
        scrollParentElement = scrollParentElement.parentElement;
      }

      const viewRect = scrollParentElement.getBoundingClientRect();

      const currentScrollX = viewRect.left - treeRect.left;
      const currentScrollY = viewRect.top - treeRect.top + this.contentElement.offsetTop;

      // Only scroll into view on each axis if the item is not visible at all
      // but if we do scroll and _centerUponScrollIntoView is true
      // then we center the top left corner of the item in view.
      let deltaLeft: number = itemRect.left - treeRect.left;
      if (deltaLeft > currentScrollX && deltaLeft < currentScrollX + viewRect.width) {
        deltaLeft = currentScrollX;
      } else if (this._centerUponScrollIntoView) {
        deltaLeft = deltaLeft - viewRect.width / 2;
      }
      let deltaTop: number = itemRect.top - treeRect.top;
      if (deltaTop > currentScrollY && deltaTop < currentScrollY + viewRect.height) {
        deltaTop = currentScrollY;
      } else if (this._centerUponScrollIntoView) {
        deltaTop = deltaTop - viewRect.height / 2;
      }
      scrollParentElement.scrollTo(deltaLeft, deltaTop);
      this._treeElementToScrollIntoView = null;
    };

    if (!this._treeElementToScrollIntoView) {
      this.element.window().requestAnimationFrame(deferredScrollIntoView);
    }
    this._treeElementToScrollIntoView = treeElement;
    this._centerUponScrollIntoView = center;
  }

  onStartedEditingTitle(_treeElement: TreeElement): void {
  }
}

// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export enum Events {
  ElementAttached = 'ElementAttached',
  ElementsDetached = 'ElementsDetached',
  ElementExpanded = 'ElementExpanded',
  ElementCollapsed = 'ElementCollapsed',
  ElementSelected = 'ElementSelected',
}


export class TreeOutlineInShadow extends TreeOutline {
  element: HTMLElement;
  _shadowRoot: ShadowRoot;
  _disclosureElement: Element;
  _renderSelection: boolean;
  constructor() {
    super();
    this.contentElement.classList.add('tree-outline');
    this.element = document.createElement('div');
    this._shadowRoot =
        createShadowRootWithCoreStyles(this.element, {cssFile: 'ui/legacy/treeoutline.css', delegatesFocus: undefined});
    this._disclosureElement = this._shadowRoot.createChild('div', 'tree-outline-disclosure');
    this._disclosureElement.appendChild(this.contentElement);
    this._renderSelection = true;
  }

  registerRequiredCSS(cssFile: string): void {
    appendStyle(this._shadowRoot, cssFile);
  }

  registerCSSFiles(cssFiles: CSSStyleSheet[]): void {
    this._shadowRoot.adoptedStyleSheets = this._shadowRoot.adoptedStyleSheets.concat(cssFiles);
  }

  hideOverflow(): void {
    this._disclosureElement.classList.add('tree-outline-disclosure-hide-overflow');
  }

  makeDense(): void {
    this.contentElement.classList.add('tree-outline-dense');
  }

  onStartedEditingTitle(treeElement: TreeElement): void {
    const selection = this._shadowRoot.getSelection();
    if (selection) {
      selection.selectAllChildren(treeElement.titleElement);
    }
  }
}

export const treeElementBylistItemNode = new WeakMap<Node, TreeElement>();
export class TreeElement {
  treeOutline: TreeOutline|null;
  parent: TreeElement|null;
  previousSibling: TreeElement|null;
  nextSibling: TreeElement|null;
  _boundOnFocus: () => void;
  _boundOnBlur: () => void;
  _listItemNode: HTMLLIElement;
  titleElement: Node;
  _title: string|Node;
  _children: TreeElement[]|null;
  _childrenListNode: HTMLOListElement;
  _hidden: boolean;
  _selectable: boolean;
  expanded: boolean;
  selected: boolean;
  _expandable!: boolean;
  _collapsible: boolean;
  toggleOnClick: boolean;
  button: HTMLButtonElement|null;
  root: boolean;
  _tooltip: string;
  _leadingIconsElement: HTMLElement|null;
  _trailingIconsElement: HTMLElement|null;
  _selectionElement: HTMLElement|null;
  _disableSelectFocus: boolean;
  constructor(title?: string|Node, expandable?: boolean) {
    this.treeOutline = null;
    this.parent = null;
    this.previousSibling = null;
    this.nextSibling = null;
    this._boundOnFocus = this._onFocus.bind(this);
    this._boundOnBlur = this._onBlur.bind(this);
    this._listItemNode = document.createElement('li');

    this.titleElement = this._listItemNode.createChild('span', 'tree-element-title');
    treeElementBylistItemNode.set(this._listItemNode, this);
    this._title = '';
    if (title) {
      this.title = title;
    }
    this._listItemNode.addEventListener('mousedown', (this._handleMouseDown.bind(this) as EventListener), false);
    this._listItemNode.addEventListener('click', (this._treeElementToggled.bind(this) as EventListener), false);
    this._listItemNode.addEventListener('dblclick', this._handleDoubleClick.bind(this), false);
    ARIAUtils.markAsTreeitem(this._listItemNode);

    this._children = null;
    this._childrenListNode = document.createElement('ol');
    nodeToParentTreeElementMap.set(this._childrenListNode, this);
    this._childrenListNode.classList.add('children');
    ARIAUtils.markAsGroup(this._childrenListNode);

    this._hidden = false;
    this._selectable = true;
    this.expanded = false;
    this.selected = false;
    this.setExpandable(expandable || false);
    this._collapsible = true;
    this.toggleOnClick = false;
    this.button = null;
    this.root = false;
    this._tooltip = '';
    this._leadingIconsElement = null;
    this._trailingIconsElement = null;
    this._selectionElement = null;
    this._disableSelectFocus = false;
  }

  static getTreeElementBylistItemNode(node: Node): TreeElement|undefined {
    return treeElementBylistItemNode.get(node);
  }

  hasAncestor(ancestor: TreeElement|null): boolean {
    if (!ancestor) {
      return false;
    }

    let currentNode: (TreeElement|null) = this.parent;
    while (currentNode) {
      if (ancestor === currentNode) {
        return true;
      }
      currentNode = currentNode.parent;
    }

    return false;
  }

  hasAncestorOrSelf(ancestor: TreeElement|null): boolean {
    return this === ancestor || this.hasAncestor(ancestor);
  }

  isHidden(): boolean {
    if (this.hidden) {
      return true;
    }

    let currentNode: (TreeElement|null) = this.parent;
    while (currentNode) {
      if (currentNode.hidden) {
        return true;
      }
      currentNode = currentNode.parent;
    }

    return false;
  }

  children(): TreeElement[] {
    return this._children || [];
  }

  childCount(): number {
    return this._children ? this._children.length : 0;
  }

  firstChild(): TreeElement|null {
    return this._children ? this._children[0] : null;
  }

  lastChild(): TreeElement|null {
    return this._children ? this._children[this._children.length - 1] : null;
  }

  childAt(index: number): TreeElement|null {
    return this._children ? this._children[index] : null;
  }

  indexOfChild(child: TreeElement): number {
    return this._children ? this._children.indexOf(child) : -1;
  }

  appendChild(child: TreeElement, comparator?: ((arg0: TreeElement, arg1: TreeElement) => number)): void {
    if (!this._children) {
      this._children = [];
    }

    let insertionIndex;
    if (comparator) {
      insertionIndex = Platform.ArrayUtilities.lowerBound(this._children, child, comparator);
    } else if (this.treeOutline && this.treeOutline._comparator) {
      insertionIndex = Platform.ArrayUtilities.lowerBound(this._children, child, this.treeOutline._comparator);
    } else {
      insertionIndex = this._children.length;
    }
    this.insertChild(child, insertionIndex);
  }

  insertChild(child: TreeElement, index: number): void {
    if (!this._children) {
      this._children = [];
    }

    if (!child) {
      throw 'child can\'t be undefined or null';
    }

    console.assert(
        !child.parent, 'Attempting to insert a child that is already in the tree, reparenting is not supported.');

    const previousChild = (index > 0 ? this._children[index - 1] : null);
    if (previousChild) {
      previousChild.nextSibling = child;
      child.previousSibling = previousChild;
    } else {
      child.previousSibling = null;
    }

    const nextChild = this._children[index];
    if (nextChild) {
      nextChild.previousSibling = child;
      child.nextSibling = nextChild;
    } else {
      child.nextSibling = null;
    }

    this._children.splice(index, 0, child);

    this.setExpandable(true);
    child.parent = this;

    if (this.treeOutline) {
      this.treeOutline._bindTreeElement(child);
    }
    for (let current = child.firstChild(); this.treeOutline && current;
         current = current.traverseNextTreeElement(false, child, true)) {
      this.treeOutline._bindTreeElement(current);
    }
    child.onattach();
    child._ensureSelection();
    if (this.treeOutline) {
      this.treeOutline.dispatchEventToListeners(Events.ElementAttached, child);
    }
    const nextSibling = child.nextSibling ? child.nextSibling._listItemNode : null;
    this._childrenListNode.insertBefore(child._listItemNode, nextSibling);
    this._childrenListNode.insertBefore(child._childrenListNode, nextSibling);
    if (child.selected) {
      child.select();
    }
    if (child.expanded) {
      child.expand();
    }
  }

  removeChildAtIndex(childIndex: number): void {
    if (!this._children || childIndex < 0 || childIndex >= this._children.length) {
      throw 'childIndex out of range';
    }

    const child = this._children[childIndex];
    this._children.splice(childIndex, 1);

    const parent = child.parent;
    if (this.treeOutline && this.treeOutline.selectedTreeElement &&
        this.treeOutline.selectedTreeElement.hasAncestorOrSelf(child)) {
      if (child.nextSibling) {
        child.nextSibling.select(true);
      } else if (child.previousSibling) {
        child.previousSibling.select(true);
      } else if (parent) {
        parent.select(true);
      }
    }

    if (child.previousSibling) {
      child.previousSibling.nextSibling = child.nextSibling;
    }
    if (child.nextSibling) {
      child.nextSibling.previousSibling = child.previousSibling;
    }
    child.parent = null;

    if (this.treeOutline) {
      this.treeOutline._unbindTreeElement(child);
    }
    for (let current = child.firstChild(); this.treeOutline && current;
         current = current.traverseNextTreeElement(false, child, true)) {
      this.treeOutline._unbindTreeElement(current);
    }

    child._detach();
    if (this.treeOutline) {
      this.treeOutline.dispatchEventToListeners(Events.ElementsDetached);
    }
  }

  removeChild(child: TreeElement): void {
    if (!child) {
      throw 'child can\'t be undefined or null';
    }
    if (child.parent !== this) {
      return;
    }

    const childIndex = this._children ? this._children.indexOf(child) : -1;
    if (childIndex === -1) {
      throw 'child not found in this node\'s children';
    }

    this.removeChildAtIndex(childIndex);
  }

  removeChildren(): void {
    if (!this.root && this.treeOutline && this.treeOutline.selectedTreeElement &&
        this.treeOutline.selectedTreeElement.hasAncestorOrSelf(this)) {
      this.select(true);
    }

    if (this._children) {
      for (const child of this._children) {
        child.previousSibling = null;
        child.nextSibling = null;
        child.parent = null;

        if (this.treeOutline) {
          this.treeOutline._unbindTreeElement(child);
        }
        for (let current = child.firstChild(); this.treeOutline && current;
             current = current.traverseNextTreeElement(false, child, true)) {
          this.treeOutline._unbindTreeElement(current);
        }
        child._detach();
      }
    }
    this._children = [];
    if (this.treeOutline) {
      this.treeOutline.dispatchEventToListeners(Events.ElementsDetached);
    }
  }

  get selectable(): boolean {
    if (this.isHidden()) {
      return false;
    }
    return this._selectable;
  }

  set selectable(x: boolean) {
    this._selectable = x;
  }

  get listItemElement(): HTMLLIElement {
    return this._listItemNode;
  }

  get childrenListElement(): HTMLOListElement {
    return this._childrenListNode;
  }

  get title(): string|Node {
    return this._title;
  }

  set title(x: string|Node) {
    if (this._title === x) {
      return;
    }
    this._title = x;

    if (typeof x === 'string') {
      this.titleElement.textContent = x;
      this.tooltip = x;
    } else {
      this.titleElement = x;
      this.tooltip = '';
    }

    this._listItemNode.removeChildren();
    if (this._leadingIconsElement) {
      this._listItemNode.appendChild(this._leadingIconsElement);
    }
    this._listItemNode.appendChild(this.titleElement);
    if (this._trailingIconsElement) {
      this._listItemNode.appendChild(this._trailingIconsElement);
    }
    this._ensureSelection();
  }

  titleAsText(): string {
    if (!this._title) {
      return '';
    }
    if (typeof this._title === 'string') {
      return this._title;
    }
    return this._title.textContent || '';
  }

  startEditingTitle<T>(editingConfig: Config<T>): void {
    InplaceEditor.startEditing((this.titleElement as Element), editingConfig);
    if (this.treeOutline) {
      this.treeOutline.onStartedEditingTitle(this);
    }
  }

  setLeadingIcons(icons: Icon[]): void {
    if (!this._leadingIconsElement && !icons.length) {
      return;
    }
    if (!this._leadingIconsElement) {
      this._leadingIconsElement = document.createElement('div');
      this._leadingIconsElement.classList.add('leading-icons');
      this._leadingIconsElement.classList.add('icons-container');
      this._listItemNode.insertBefore(this._leadingIconsElement, this.titleElement);
      this._ensureSelection();
    }
    this._leadingIconsElement.removeChildren();
    for (const icon of icons) {
      this._leadingIconsElement.appendChild(icon);
    }
  }

  setTrailingIcons(icons: Icon[]): void {
    if (!this._trailingIconsElement && !icons.length) {
      return;
    }
    if (!this._trailingIconsElement) {
      this._trailingIconsElement = document.createElement('div');
      this._trailingIconsElement.classList.add('trailing-icons');
      this._trailingIconsElement.classList.add('icons-container');
      this._listItemNode.appendChild(this._trailingIconsElement);
      this._ensureSelection();
    }
    this._trailingIconsElement.removeChildren();
    for (const icon of icons) {
      this._trailingIconsElement.appendChild(icon);
    }
  }

  get tooltip(): string {
    return this._tooltip;
  }

  set tooltip(x: string) {
    if (this._tooltip === x) {
      return;
    }
    this._tooltip = x;
    Tooltip.install(this._listItemNode, x);
  }

  isExpandable(): boolean {
    return this._expandable;
  }

  setExpandable(expandable: boolean): void {
    if (this._expandable === expandable) {
      return;
    }

    this._expandable = expandable;

    this._listItemNode.classList.toggle('parent', expandable);
    if (!expandable) {
      this.collapse();
      ARIAUtils.unsetExpandable(this._listItemNode);
    } else {
      ARIAUtils.setExpanded(this._listItemNode, false);
    }
  }

  setCollapsible(collapsible: boolean): void {
    if (this._collapsible === collapsible) {
      return;
    }

    this._collapsible = collapsible;

    this._listItemNode.classList.toggle('always-parent', !collapsible);
    if (!collapsible) {
      this.expand();
    }
  }

  get hidden(): boolean {
    return this._hidden;
  }

  set hidden(x: boolean) {
    if (this._hidden === x) {
      return;
    }

    this._hidden = x;

    this._listItemNode.classList.toggle('hidden', x);
    this._childrenListNode.classList.toggle('hidden', x);

    if (x && this.treeOutline && this.treeOutline.selectedTreeElement &&
        this.treeOutline.selectedTreeElement.hasAncestorOrSelf(this)) {
      const hadFocus = this.treeOutline.selectedTreeElement.listItemElement.hasFocus();
      this.treeOutline.forceSelect(!hadFocus, /* selectedByUser */ false);
    }
  }

  invalidateChildren(): void {
    if (this._children) {
      this.removeChildren();
      this._children = null;
    }
  }

  _ensureSelection(): void {
    if (!this.treeOutline || !this.treeOutline._renderSelection) {
      return;
    }
    if (!this._selectionElement) {
      this._selectionElement = document.createElement('div');
      this._selectionElement.classList.add('selection');
      this._selectionElement.classList.add('fill');
    }
    this._listItemNode.insertBefore(this._selectionElement, this.listItemElement.firstChild);
  }

  _treeElementToggled(event: MouseEvent): void {
    const element = (event.currentTarget as Node | null);
    if (!element || treeElementBylistItemNode.get(element) !== this || element.hasSelection()) {
      return;
    }

    console.assert(Boolean(this.treeOutline));
    const showSelectionOnKeyboardFocus = this.treeOutline ? this.treeOutline._showSelectionOnKeyboardFocus : false;
    const toggleOnClick = this.toggleOnClick && (showSelectionOnKeyboardFocus || !this.selectable);
    const isInTriangle = this.isEventWithinDisclosureTriangle(event);
    if (!toggleOnClick && !isInTriangle) {
      return;
    }

    if (this.expanded) {
      if (event.altKey) {
        this.collapseRecursively();
      } else {
        this.collapse();
      }
    } else {
      if (event.altKey) {
        this.expandRecursively();
      } else {
        this.expand();
      }
    }
    event.consume();
  }

  _handleMouseDown(event: MouseEvent): void {
    const element = (event.currentTarget as Node | null);
    if (!element) {
      return;
    }
    if (!this.selectable) {
      return;
    }
    if (treeElementBylistItemNode.get(element) !== this) {
      return;
    }

    if (this.isEventWithinDisclosureTriangle(event)) {
      return;
    }

    this.selectOnMouseDown(event);
  }

  _handleDoubleClick(event: Event): void {
    const element = (event.currentTarget as Node | null);
    if (!element || treeElementBylistItemNode.get(element) !== this) {
      return;
    }

    const handled = this.ondblclick(event);
    if (handled) {
      return;
    }
    if (this._expandable && !this.expanded) {
      this.expand();
    }
  }

  _detach(): void {
    this._listItemNode.remove();
    this._childrenListNode.remove();
  }

  collapse(): void {
    if (!this.expanded || !this._collapsible) {
      return;
    }
    this._listItemNode.classList.remove('expanded');
    this._childrenListNode.classList.remove('expanded');
    ARIAUtils.setExpanded(this._listItemNode, false);
    this.expanded = false;
    this.oncollapse();
    if (this.treeOutline) {
      this.treeOutline.dispatchEventToListeners(Events.ElementCollapsed, this);
    }

    const selectedTreeElement = this.treeOutline && this.treeOutline.selectedTreeElement;
    if (selectedTreeElement && selectedTreeElement.hasAncestor(this)) {
      this.select(/* omitFocus */ true, /* selectedByUser */ true);
    }
  }

  collapseRecursively(): void {
    let item: (TreeElement|null)|this = this;
    while (item) {
      if (item.expanded) {
        item.collapse();
      }
      item = item.traverseNextTreeElement(false, this, true);
    }
  }

  collapseChildren(): void {
    if (!this._children) {
      return;
    }
    for (const child of this._children) {
      child.collapseRecursively();
    }
  }

  expand(): void {
    if (!this._expandable || (this.expanded && this._children)) {
      return;
    }

    // Set this before onpopulate. Since onpopulate can add elements, this makes
    // sure the expanded flag is true before calling those functions. This prevents the possibility
    // of an infinite loop if onpopulate were to call expand.

    this.expanded = true;

    this._populateIfNeeded();
    this._listItemNode.classList.add('expanded');
    this._childrenListNode.classList.add('expanded');
    ARIAUtils.setExpanded(this._listItemNode, true);

    if (this.treeOutline) {
      this.onexpand();
      this.treeOutline.dispatchEventToListeners(Events.ElementExpanded, this);
    }
  }

  async expandRecursively(maxDepth?: number): Promise<void> {
    let item: (TreeElement|null)|this = this;
    const info = {depthChange: 0};
    let depth = 0;

    // The Inspector uses TreeOutlines to represents object properties, so recursive expansion
    // in some case can be infinite, since JavaScript objects can hold circular references.
    // So default to a recursion cap of 3 levels, since that gives fairly good results.
    if (maxDepth === undefined || isNaN(maxDepth)) {
      maxDepth = 3;
    }

    while (item) {
      await item._populateIfNeeded();

      if (depth < maxDepth) {
        item.expand();
      }

      item = item.traverseNextTreeElement(false, this, (depth >= maxDepth), info);
      depth += info.depthChange;
    }
  }

  collapseOrAscend(altKey: boolean): boolean {
    if (this.expanded && this._collapsible) {
      if (altKey) {
        this.collapseRecursively();
      } else {
        this.collapse();
      }
      return true;
    }

    if (!this.parent || this.parent.root) {
      return false;
    }

    if (!this.parent.selectable) {
      this.parent.collapse();
      return true;
    }

    let nextSelectedElement: (TreeElement|null)|TreeElement = this.parent;
    while (nextSelectedElement && !nextSelectedElement.selectable) {
      nextSelectedElement = nextSelectedElement.parent;
    }

    if (!nextSelectedElement) {
      return false;
    }
    nextSelectedElement.select(false, true);
    return true;
  }

  descendOrExpand(altKey: boolean): boolean {
    if (!this._expandable) {
      return false;
    }

    if (!this.expanded) {
      if (altKey) {
        this.expandRecursively();
      } else {
        this.expand();
      }
      return true;
    }

    let nextSelectedElement = this.firstChild();
    while (nextSelectedElement && !nextSelectedElement.selectable) {
      nextSelectedElement = nextSelectedElement.nextSibling;
    }

    if (!nextSelectedElement) {
      return false;
    }
    nextSelectedElement.select(false, true);
    return true;
  }

  reveal(center?: boolean): void {
    let currentAncestor: (TreeElement|null) = this.parent;
    while (currentAncestor && !currentAncestor.root) {
      if (!currentAncestor.expanded) {
        currentAncestor.expand();
      }
      currentAncestor = currentAncestor.parent;
    }

    if (this.treeOutline) {
      this.treeOutline._deferredScrollIntoView(this, Boolean(center));
    }
  }

  revealed(): boolean {
    let currentAncestor: (TreeElement|null) = this.parent;
    while (currentAncestor && !currentAncestor.root) {
      if (!currentAncestor.expanded) {
        return false;
      }
      currentAncestor = currentAncestor.parent;
    }

    return true;
  }

  selectOnMouseDown(event: MouseEvent): void {
    if (this.select(false, true)) {
      event.consume(true);
    }

    if (this._listItemNode.draggable && this._selectionElement && this.treeOutline) {
      const marginLeft = this.treeOutline.element.getBoundingClientRect().left -
          this._listItemNode.getBoundingClientRect().left - this.treeOutline.element.scrollLeft;
      // By default the left margin extends far off screen. This is not a problem except when dragging an element.
      // Setting the margin once here should be fine, because we believe the left margin should never change.
      this._selectionElement.style.setProperty('margin-left', marginLeft + 'px');
    }
  }

  select(omitFocus?: boolean, selectedByUser?: boolean): boolean {
    omitFocus = omitFocus || this._disableSelectFocus;
    if (!this.treeOutline || !this.selectable || this.selected) {
      if (!omitFocus) {
        this.listItemElement.focus();
      }
      return false;
    }
    // Wait to deselect this element so that focus only changes once
    const lastSelected = this.treeOutline.selectedTreeElement;
    this.treeOutline.selectedTreeElement = null;

    if (this.treeOutline._rootElement === this) {
      if (lastSelected) {
        lastSelected.deselect();
      }
      if (!omitFocus) {
        this.listItemElement.focus();
      }
      return false;
    }

    this.selected = true;

    this.treeOutline.selectedTreeElement = this;
    this.treeOutline.updateFocusable();
    if (!omitFocus || this.treeOutline.contentElement.hasFocus()) {
      this.listItemElement.focus();
    }

    this._listItemNode.classList.add('selected');
    ARIAUtils.setSelected(this._listItemNode, true);
    this.treeOutline.dispatchEventToListeners(Events.ElementSelected, this);
    if (lastSelected) {
      lastSelected.deselect();
    }
    return this.onselect(selectedByUser);
  }

  _setFocusable(focusable: boolean): void {
    if (focusable) {
      this._listItemNode.setAttribute('tabIndex', (this.treeOutline && this.treeOutline._preventTabOrder) ? '-1' : '0');
      this._listItemNode.addEventListener('focus', this._boundOnFocus, false);
      this._listItemNode.addEventListener('blur', this._boundOnBlur, false);
    } else {
      this._listItemNode.removeAttribute('tabIndex');
      this._listItemNode.removeEventListener('focus', this._boundOnFocus, false);
      this._listItemNode.removeEventListener('blur', this._boundOnBlur, false);
    }
  }

  _onFocus(): void {
    if (!this.treeOutline || this.treeOutline._useLightSelectionColor) {
      return;
    }
    if (!this.treeOutline.contentElement.classList.contains('hide-selection-when-blurred')) {
      this._listItemNode.classList.add('force-white-icons');
    }
  }

  _onBlur(): void {
    if (!this.treeOutline || this.treeOutline._useLightSelectionColor) {
      return;
    }
    if (!this.treeOutline.contentElement.classList.contains('hide-selection-when-blurred')) {
      this._listItemNode.classList.remove('force-white-icons');
    }
  }

  revealAndSelect(omitFocus?: boolean): void {
    this.reveal(true);
    this.select(omitFocus);
  }

  deselect(): void {
    const hadFocus = this._listItemNode.hasFocus();
    this.selected = false;
    this._listItemNode.classList.remove('selected');
    ARIAUtils.clearSelected(this._listItemNode);
    this._setFocusable(false);

    if (this.treeOutline && this.treeOutline.selectedTreeElement === this) {
      this.treeOutline.selectedTreeElement = null;
      this.treeOutline.updateFocusable();
      if (hadFocus) {
        this.treeOutline.focus();
      }
    }
  }

  async _populateIfNeeded(): Promise<void> {
    if (this.treeOutline && this._expandable && !this._children) {
      this._children = [];
      await this.onpopulate();
    }
  }

  async onpopulate(): Promise<void> {
    // Overridden by subclasses.
  }

  onenter(): boolean {
    return false;
  }

  ondelete(): boolean {
    return false;
  }

  onspace(): boolean {
    return false;
  }

  onbind(): void {
  }

  onunbind(): void {
  }

  onattach(): void {
  }

  onexpand(): void {
  }

  oncollapse(): void {
  }

  ondblclick(_e: Event): boolean {
    return false;
  }

  onselect(_selectedByUser?: boolean): boolean {
    return false;
  }

  traverseNextTreeElement(skipUnrevealed: boolean, stayWithin?: TreeElement|null, dontPopulate?: boolean, info?: {
    depthChange: number,
  }): TreeElement|null {
    if (!dontPopulate) {
      this._populateIfNeeded();
    }

    if (info) {
      info.depthChange = 0;
    }

    let element: (TreeElement|null)|this =
        skipUnrevealed ? (this.revealed() ? this.firstChild() : null) : this.firstChild();
    if (element && (!skipUnrevealed || (skipUnrevealed && this.expanded))) {
      if (info) {
        info.depthChange = 1;
      }
      return element;
    }

    if (this === stayWithin) {
      return null;
    }

    element = skipUnrevealed ? (this.revealed() ? this.nextSibling : null) : this.nextSibling;
    if (element) {
      return element;
    }

    element = this;
    while (element && !element.root &&
           !(skipUnrevealed ? (element.revealed() ? element.nextSibling : null) : element.nextSibling) &&
           element.parent !== stayWithin) {
      if (info) {
        info.depthChange -= 1;
      }
      element = element.parent;
    }

    if (!element || element.root) {
      return null;
    }

    return (skipUnrevealed ? (element.revealed() ? element.nextSibling : null) : element.nextSibling);
  }

  traversePreviousTreeElement(skipUnrevealed: boolean, dontPopulate?: boolean): TreeElement|null {
    let element: (TreeElement|null) =
        skipUnrevealed ? (this.revealed() ? this.previousSibling : null) : this.previousSibling;
    if (!dontPopulate && element) {
      element._populateIfNeeded();
    }

    while (element &&
           (skipUnrevealed ? (element.revealed() && element.expanded ? element.lastChild() : null) :
                             element.lastChild())) {
      if (!dontPopulate) {
        element._populateIfNeeded();
      }
      element =
          (skipUnrevealed ? (element.revealed() && element.expanded ? element.lastChild() : null) :
                            element.lastChild());
    }

    if (element) {
      return element;
    }

    if (!this.parent || this.parent.root) {
      return null;
    }

    return this.parent;
  }

  isEventWithinDisclosureTriangle(event: MouseEvent): boolean {
    const arrowToggleWidth = 10;
    // FIXME: We should not use getComputedStyle(). For that we need to get rid of using ::before for disclosure triangle. (http://webk.it/74446)
    const paddingLeftValue = window.getComputedStyle(this._listItemNode).paddingLeft;
    console.assert(paddingLeftValue.endsWith('px'));
    const computedLeftPadding = parseFloat(paddingLeftValue);
    const left = this._listItemNode.totalOffsetLeft() + computedLeftPadding;
    return event.pageX >= left && event.pageX <= left + arrowToggleWidth && this._expandable;
  }

  setDisableSelectFocus(toggle: boolean): void {
    this._disableSelectFocus = toggle;
  }
}
