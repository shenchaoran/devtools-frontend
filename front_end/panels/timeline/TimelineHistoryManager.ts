// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/* eslint-disable rulesdir/no_underscored_properties */

import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as UI from '../../ui/legacy/legacy.js';

import type {PerformanceModel} from './PerformanceModel.js';
import {TimelineEventOverviewCPUActivity, TimelineEventOverviewFrames, TimelineEventOverviewNetwork, TimelineEventOverviewResponsiveness} from './TimelineEventOverview.js';

const UIStrings = {
  /**
  *@description Screen reader label for the Timeline History dropdown button
  *@example {example.com #3} PH1
  *@example {Show recent timeline sessions} PH2
  */
  currentSessionSS: 'Current Session: {PH1}. {PH2}',
  /**
  *@description Text that shows there is no recording
  */
  noRecordings: '(no recordings)',
  /**
  *@description Text in Timeline History Manager of the Performance panel
  *@example {2s} PH1
  */
  sAgo: '({PH1} ago)',
  /**
  *@description Text in Timeline History Manager of the Performance panel
  */
  moments: 'moments',
  /**
   * @description Text in Timeline History Manager of the Performance panel.
   * Placeholder is a number and the 'm' is the short form for 'minutes'.
   * @example {2} PH1
   */
  sM: '{PH1} m',
  /**
   * @description Text in Timeline History Manager of the Performance panel.
   * Placeholder is a number and the 'h' is the short form for 'hours'.
   * @example {2} PH1
   */
  sH: '{PH1} h',
  /**
  *@description Text in Timeline History Manager of the Performance panel
  *@example {example.com} PH1
  *@example {2} PH2
  */
  sD: '{PH1} #{PH2}',
  /**
  *@description Accessible label for the timeline session selection menu
  */
  selectTimelineSession: 'Select Timeline Session',
};
const str_ = i18n.i18n.registerUIStrings('panels/timeline/TimelineHistoryManager.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class TimelineHistoryManager {
  _recordings: PerformanceModel[];
  _action: UI.ActionRegistration.Action;
  _nextNumberByDomain: Map<string, number>;
  _button: ToolbarButton;
  _allOverviews: {
    constructor: typeof TimelineEventOverviewResponsiveness,
    height: number,
  }[];
  _totalHeight: number;
  _enabled: boolean;
  _lastActiveModel: PerformanceModel|null;
  constructor() {
    this._recordings = [];
    this._action =
        (UI.ActionRegistry.ActionRegistry.instance().action('timeline.show-history') as UI.ActionRegistration.Action);
    this._nextNumberByDomain = new Map();
    this._button = new ToolbarButton(this._action);

    UI.ARIAUtils.markAsMenuButton(this._button.element);
    this.clear();

    this._allOverviews = [
      {constructor: TimelineEventOverviewResponsiveness, height: 3},
      {constructor: TimelineEventOverviewFrames, height: 16},
      {constructor: TimelineEventOverviewCPUActivity, height: 20},
      {constructor: TimelineEventOverviewNetwork, height: 8},
    ];
    this._totalHeight = this._allOverviews.reduce((acc, entry) => acc + entry.height, 0);
    this._enabled = true;
    this._lastActiveModel = null;
  }

  addRecording(performanceModel: PerformanceModel): void {
    this._lastActiveModel = performanceModel;
    this._recordings.unshift(performanceModel);
    this._buildPreview(performanceModel);
    const modelTitle = this._title(performanceModel);
    this._button.setText(modelTitle);
    const buttonTitle = this._action.title();
    UI.ARIAUtils.setAccessibleName(
        this._button.element, i18nString(UIStrings.currentSessionSS, {PH1: modelTitle, PH2: buttonTitle}));
    this._updateState();
    if (this._recordings.length <= maxRecordings) {
      return;
    }
    const lruModel = this._recordings.reduce((a, b) => lastUsedTime(a) < lastUsedTime(b) ? a : b);
    this._recordings.splice(this._recordings.indexOf(lruModel), 1);
    lruModel.dispose();

    function lastUsedTime(model: PerformanceModel): number {
      const data = TimelineHistoryManager._dataForModel(model);
      if (!data) {
        throw new Error('Unable to find data for model');
      }
      return data.lastUsed;
    }
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    this._updateState();
  }

  button(): ToolbarButton {
    return this._button;
  }

  clear(): void {
    this._recordings.forEach(model => model.dispose());
    this._recordings = [];
    this._lastActiveModel = null;
    this._updateState();
    this._button.setText(i18nString(UIStrings.noRecordings));
    this._nextNumberByDomain.clear();
  }

  async showHistoryDropDown(): Promise<PerformanceModel|null> {
    if (this._recordings.length < 2 || !this._enabled) {
      return null;
    }

    // DropDown.show() function finishes when the dropdown menu is closed via selection or losing focus
    const model =
        await DropDown.show(this._recordings, (this._lastActiveModel as PerformanceModel), this._button.element);
    if (!model) {
      return null;
    }
    const index = this._recordings.indexOf(model);
    if (index < 0) {
      console.assert(false, 'selected recording not found');
      return null;
    }
    this._setCurrentModel(model);
    return model;
  }

  cancelIfShowing(): void {
    DropDown.cancelIfShowing();
  }

  navigate(direction: number): PerformanceModel|null {
    if (!this._enabled || !this._lastActiveModel) {
      return null;
    }
    const index = this._recordings.indexOf(this._lastActiveModel);
    if (index < 0) {
      return null;
    }
    const newIndex = Platform.NumberUtilities.clamp(index + direction, 0, this._recordings.length - 1);
    const model = this._recordings[newIndex];
    this._setCurrentModel(model);
    return model;
  }

  _setCurrentModel(model: PerformanceModel): void {
    const data = TimelineHistoryManager._dataForModel(model);
    if (!data) {
      throw new Error('Unable to find data for model');
    }
    data.lastUsed = Date.now();
    this._lastActiveModel = model;
    const modelTitle = this._title(model);
    const buttonTitle = this._action.title();
    this._button.setText(modelTitle);
    UI.ARIAUtils.setAccessibleName(
        this._button.element, i18nString(UIStrings.currentSessionSS, {PH1: modelTitle, PH2: buttonTitle}));
  }

  _updateState(): void {
    this._action.setEnabled(this._recordings.length > 1 && this._enabled);
  }

  static _previewElement(performanceModel: PerformanceModel): Element {
    const data = TimelineHistoryManager._dataForModel(performanceModel);
    if (!data) {
      throw new Error('Unable to find data for model');
    }
    const startedAt = performanceModel.recordStartTime();
    data.time.textContent =
        startedAt ? i18nString(UIStrings.sAgo, {PH1: TimelineHistoryManager._coarseAge(startedAt)}) : '';
    return data.preview;
  }

  static _coarseAge(time: number): string {
    const seconds = Math.round((Date.now() - time) / 1000);
    if (seconds < 50) {
      return i18nString(UIStrings.moments);
    }
    const minutes = Math.round(seconds / 60);
    if (minutes < 50) {
      return i18nString(UIStrings.sM, {PH1: minutes});
    }
    const hours = Math.round(minutes / 60);
    return i18nString(UIStrings.sH, {PH1: hours});
  }

  _title(performanceModel: PerformanceModel): string {
    const data = TimelineHistoryManager._dataForModel(performanceModel);
    if (!data) {
      throw new Error('Unable to find data for model');
    }
    return data.title;
  }

  _buildPreview(performanceModel: PerformanceModel): HTMLDivElement {
    const parsedURL = Common.ParsedURL.ParsedURL.fromString(performanceModel.timelineModel().pageURL());
    const domain = parsedURL ? parsedURL.host : '';
    const sequenceNumber = this._nextNumberByDomain.get(domain) || 1;
    const title = i18nString(UIStrings.sD, {PH1: domain, PH2: sequenceNumber});
    this._nextNumberByDomain.set(domain, sequenceNumber + 1);
    const timeElement = document.createElement('span');

    const preview = document.createElement('div');
    preview.classList.add('preview-item');
    preview.classList.add('vbox');
    const data = {preview: preview, title: title, time: timeElement, lastUsed: Date.now()};
    modelToPerformanceData.set(performanceModel, data);

    preview.appendChild(this._buildTextDetails(performanceModel, title, timeElement));
    const screenshotAndOverview = preview.createChild('div', 'hbox');
    screenshotAndOverview.appendChild(this._buildScreenshotThumbnail(performanceModel));
    screenshotAndOverview.appendChild(this._buildOverview(performanceModel));
    return data.preview;
  }

  _buildTextDetails(performanceModel: PerformanceModel, title: string, timeElement: Element): Element {
    const container = document.createElement('div');
    container.classList.add('text-details');
    container.classList.add('hbox');
    const nameSpan = container.createChild('span', 'name');
    nameSpan.textContent = title;
    UI.ARIAUtils.setAccessibleName(nameSpan, title);
    const tracingModel = performanceModel.tracingModel();
    const duration =
        i18n.TimeUtilities.millisToString(tracingModel.maximumRecordTime() - tracingModel.minimumRecordTime(), false);
    const timeContainer = container.createChild('span', 'time');
    timeContainer.appendChild(document.createTextNode(duration));
    timeContainer.appendChild(timeElement);
    return container;
  }

  _buildScreenshotThumbnail(performanceModel: PerformanceModel): Element {
    const container = document.createElement('div');
    container.classList.add('screenshot-thumb');
    const thumbnailAspectRatio = 3 / 2;
    container.style.width = this._totalHeight * thumbnailAspectRatio + 'px';
    container.style.height = this._totalHeight + 'px';
    const filmStripModel = performanceModel.filmStripModel();
    const frames = filmStripModel.frames();
    const lastFrame = frames[frames.length - 1];
    if (!lastFrame) {
      return container;
    }
    lastFrame.imageDataPromise()
        .then(data => UI.UIUtils.loadImageFromData(data))
        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(image => image && container.appendChild((image as any)));
    return container;
  }

  _buildOverview(performanceModel: PerformanceModel): Element {
    const container = document.createElement('div');

    container.style.width = previewWidth + 'px';
    container.style.height = this._totalHeight + 'px';
    const canvas = (container.createChild('canvas') as HTMLCanvasElement);
    canvas.width = window.devicePixelRatio * previewWidth;
    canvas.height = window.devicePixelRatio * this._totalHeight;

    const ctx = canvas.getContext('2d');
    let yOffset = 0;
    for (const overview of this._allOverviews) {
      const timelineOverview = new overview.constructor();
      timelineOverview.setCanvasSize(previewWidth, overview.height);
      timelineOverview.setModel(performanceModel);
      timelineOverview.update();
      const sourceContext = timelineOverview.context();
      const imageData = sourceContext.getImageData(0, 0, sourceContext.canvas.width, sourceContext.canvas.height);
      if (ctx) {
        ctx.putImageData(imageData, 0, yOffset);
      }
      yOffset += overview.height * window.devicePixelRatio;
    }
    return container;
  }

  static _dataForModel(model: PerformanceModel): PreviewData|null {
    return modelToPerformanceData.get(model) || null;
  }
}

export const maxRecordings = 5;
export const previewWidth = 450;
const modelToPerformanceData = new WeakMap<PerformanceModel, {
  preview: Element,
  title: string,
  time: Element,
  lastUsed: number,
}>();

export class DropDown implements UI.ListControl.ListDelegate<PerformanceModel> {
  _glassPane: UI.GlassPane.GlassPane;
  _listControl: UI.ListControl.ListControl<PerformanceModel>;
  _focusRestorer: UI.UIUtils.ElementFocusRestorer;
  _selectionDone: ((arg0: PerformanceModel|null) => void)|null;

  constructor(models: PerformanceModel[]) {
    this._glassPane = new UI.GlassPane.GlassPane();
    this._glassPane.setSizeBehavior(UI.GlassPane.SizeBehavior.MeasureContent);
    this._glassPane.setOutsideClickCallback(() => this._close(null));
    this._glassPane.setPointerEventsBehavior(UI.GlassPane.PointerEventsBehavior.BlockedByGlassPane);
    this._glassPane.setAnchorBehavior(UI.GlassPane.AnchorBehavior.PreferBottom);
    this._glassPane.element.addEventListener('blur', () => this._close(null));

    const shadowRoot = UI.Utils.createShadowRootWithCoreStyles(this._glassPane.contentElement, {
      cssFile: 'panels/timeline/timelineHistoryManager.css',
      delegatesFocus: undefined,
    });
    const contentElement = shadowRoot.createChild('div', 'drop-down');

    const listModel = new UI.ListModel.ListModel<PerformanceModel>();
    this._listControl =
        new UI.ListControl.ListControl<PerformanceModel>(listModel, this, UI.ListControl.ListMode.NonViewport);
    this._listControl.element.addEventListener('mousemove', this._onMouseMove.bind(this), false);
    listModel.replaceAll(models);

    UI.ARIAUtils.markAsMenu(this._listControl.element);
    UI.ARIAUtils.setAccessibleName(this._listControl.element, i18nString(UIStrings.selectTimelineSession));
    contentElement.appendChild(this._listControl.element);
    contentElement.addEventListener('keydown', this._onKeyDown.bind(this), false);
    contentElement.addEventListener('click', this._onClick.bind(this), false);

    this._focusRestorer = new UI.UIUtils.ElementFocusRestorer(this._listControl.element);
    this._selectionDone = null;
  }

  static show(models: PerformanceModel[], currentModel: PerformanceModel, anchor: Element):
      Promise<PerformanceModel|null> {
    if (DropDown._instance) {
      return Promise.resolve((null as PerformanceModel | null));
    }
    const instance = new DropDown(models);
    return instance._show(anchor, currentModel);
  }

  static cancelIfShowing(): void {
    if (!DropDown._instance) {
      return;
    }
    DropDown._instance._close(null);
  }

  _show(anchor: Element, currentModel: PerformanceModel): Promise<PerformanceModel|null> {
    DropDown._instance = this;
    this._glassPane.setContentAnchorBox(anchor.boxInWindow());
    this._glassPane.show((this._glassPane.contentElement.ownerDocument as Document));
    this._listControl.element.focus();
    this._listControl.selectItem(currentModel);

    return new Promise(fulfill => {
      this._selectionDone = fulfill;
    });
  }

  _onMouseMove(event: Event): void {
    const node = (event.target as HTMLElement).enclosingNodeOrSelfWithClass('preview-item');
    const listItem = node && this._listControl.itemForNode(node);
    if (!listItem) {
      return;
    }
    this._listControl.selectItem(listItem);
  }

  _onClick(event: Event): void {
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // @ts-expect-error
    if (!(event.target).enclosingNodeOrSelfWithClass('preview-item')) {
      return;
    }
    this._close(this._listControl.selectedItem());
  }

  _onKeyDown(event: Event): void {
    switch ((event as KeyboardEvent).key) {
      case 'Tab':
      case 'Escape':
        this._close(null);
        break;
      case 'Enter':
        this._close(this._listControl.selectedItem());
        break;
      default:
        return;
    }
    event.consume(true);
  }

  _close(model: PerformanceModel|null): void {
    if (this._selectionDone) {
      this._selectionDone(model);
    }
    this._focusRestorer.restore();
    this._glassPane.hide();
    DropDown._instance = null;
  }

  createElementForItem(item: PerformanceModel): Element {
    const element = TimelineHistoryManager._previewElement(item);
    UI.ARIAUtils.markAsMenuItem(element);
    element.classList.remove('selected');
    return element;
  }

  heightForItem(_item: PerformanceModel): number {
    console.assert(false, 'Should not be called');
    return 0;
  }

  isItemSelectable(_item: PerformanceModel): boolean {
    return true;
  }

  selectedItemChanged(
      from: PerformanceModel|null, to: PerformanceModel|null, fromElement: Element|null,
      toElement: Element|null): void {
    if (fromElement) {
      fromElement.classList.remove('selected');
    }
    if (toElement) {
      toElement.classList.add('selected');
    }
  }

  updateSelectedItemARIA(_fromElement: Element|null, _toElement: Element|null): boolean {
    return false;
  }

  static _instance: DropDown|null = null;
}


export class ToolbarButton extends UI.Toolbar.ToolbarItem {
  _contentElement: HTMLElement;

  constructor(action: UI.ActionRegistration.Action) {
    const element = document.createElement('button');
    element.classList.add('history-dropdown-button');
    super(element);
    UI.Utils.appendStyle(this.element, 'panels/timeline/historyToolbarButton.css');
    this._contentElement = this.element.createChild('span', 'content');
    const dropdownArrowIcon = UI.Icon.Icon.create('smallicon-triangle-down');
    this.element.appendChild(dropdownArrowIcon);
    this.element.addEventListener('click', () => void action.execute(), false);
    this.setEnabled(action.enabled());
    action.addEventListener(UI.ActionRegistration.Events.Enabled, event => this.setEnabled((event.data as boolean)));
    this.setTitle(action.title());
  }

  setText(text: string): void {
    this._contentElement.textContent = text;
  }
}

export interface PreviewData {
  preview: Element;
  time: Element;
  lastUsed: number;
  title: string;
}
