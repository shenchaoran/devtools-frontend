// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
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

import * as TextUtils from '../../models/text_utils/text_utils.js';
import * as Common from '../common/common.js';
import * as Platfrom from '../platform/platform.js';
import type * as Protocol from '../../generated/protocol.js';

import type {NetworkRequest} from './NetworkRequest.js';
import {Events} from './NetworkRequest.js';                                       // eslint-disable-line no-unused-vars
import type {ResourceTreeFrame, ResourceTreeModel} from './ResourceTreeModel.js';

export class Resource implements TextUtils.ContentProvider.ContentProvider {
  _resourceTreeModel: ResourceTreeModel;
  _request: NetworkRequest|null;
  _url!: string;
  _documentURL: string;
  _frameId: string;
  _loaderId: string;
  _type: Common.ResourceType.ResourceType;
  _mimeType: string;
  _isGenerated: boolean;
  _lastModified: Date|null;
  _contentSize: number|null;
  _content!: string|null;
  _contentLoadError!: string|null;
  _contentEncoded!: boolean;
  _pendingContentCallbacks: ((arg0: Object|null) => void)[];
  _parsedURL?: Common.ParsedURL.ParsedURL;
  _contentRequested?: boolean;

  constructor(
      resourceTreeModel: ResourceTreeModel, request: NetworkRequest|null, url: string, documentURL: string,
      frameId: string, loaderId: string, type: Common.ResourceType.ResourceType, mimeType: string,
      lastModified: Date|null, contentSize: number|null) {
    this._resourceTreeModel = resourceTreeModel;
    this._request = request;
    this.url = url;

    this._documentURL = documentURL;
    this._frameId = frameId;
    this._loaderId = loaderId;
    this._type = type || Common.ResourceType.resourceTypes.Other;
    this._mimeType = mimeType;
    this._isGenerated = false;

    this._lastModified = lastModified && Platfrom.DateUtilities.isValid(lastModified) ? lastModified : null;
    this._contentSize = contentSize;
    this._pendingContentCallbacks = [];
    if (this._request && !this._request.finished) {
      this._request.addEventListener(Events.FinishedLoading, this._requestFinished, this);
    }
  }

  lastModified(): Date|null {
    if (this._lastModified || !this._request) {
      return this._lastModified;
    }
    const lastModifiedHeader = this._request.responseLastModified();
    const date = lastModifiedHeader ? new Date(lastModifiedHeader) : null;
    this._lastModified = date && Platfrom.DateUtilities.isValid(date) ? date : null;
    return this._lastModified;
  }

  contentSize(): number|null {
    if (typeof this._contentSize === 'number' || !this._request) {
      return this._contentSize;
    }
    return this._request.resourceSize;
  }

  get request(): NetworkRequest|null {
    return this._request;
  }

  get url(): string {
    return this._url;
  }

  set url(x: string) {
    this._url = x;
    this._parsedURL = new Common.ParsedURL.ParsedURL(x);
  }

  get parsedURL(): Common.ParsedURL.ParsedURL|undefined {
    return this._parsedURL;
  }

  get documentURL(): string {
    return this._documentURL;
  }

  get frameId(): Protocol.Page.FrameId {
    return this._frameId;
  }

  get loaderId(): Protocol.Network.LoaderId {
    return this._loaderId;
  }

  get displayName(): string {
    return this._parsedURL ? this._parsedURL.displayName : '';
  }

  resourceType(): Common.ResourceType.ResourceType {
    return this._request ? this._request.resourceType() : this._type;
  }

  get mimeType(): string {
    return this._request ? this._request.mimeType : this._mimeType;
  }

  get content(): string|null {
    return this._content;
  }

  get isGenerated(): boolean {
    return this._isGenerated;
  }

  set isGenerated(val: boolean) {
    this._isGenerated = val;
  }

  contentURL(): string {
    return this._url;
  }

  contentType(): Common.ResourceType.ResourceType {
    if (this.resourceType() === Common.ResourceType.resourceTypes.Document &&
        this.mimeType.indexOf('javascript') !== -1) {
      return Common.ResourceType.resourceTypes.Script;
    }
    return this.resourceType();
  }

  async contentEncoded(): Promise<boolean> {
    await this.requestContent();
    return this._contentEncoded;
  }

  requestContent(): Promise<TextUtils.ContentProvider.DeferredContent> {
    if (typeof this._content !== 'undefined') {
      return Promise.resolve({content: (this._content as string), isEncoded: this._contentEncoded});
    }

    return new Promise(resolve => {
      this._pendingContentCallbacks.push((resolve as (arg0: Object|null) => void));
      if (!this._request || this._request.finished) {
        this._innerRequestContent();
      }
    });
  }

  canonicalMimeType(): string {
    return this.contentType().canonicalMimeType() || this.mimeType;
  }

  async searchInContent(query: string, caseSensitive: boolean, isRegex: boolean):
      Promise<TextUtils.ContentProvider.SearchMatch[]> {
    if (!this.frameId) {
      return [];
    }
    if (this.request) {
      return this.request.searchInContent(query, caseSensitive, isRegex);
    }
    const result = await this._resourceTreeModel.target().pageAgent().invoke_searchInResource(
        {frameId: this.frameId, url: this.url, query, caseSensitive, isRegex});
    return result.result || [];
  }

  async populateImageSource(image: HTMLImageElement): Promise<void> {
    const {content} = await this.requestContent();
    const encoded = this._contentEncoded;
    image.src = TextUtils.ContentProvider.contentAsDataURL(content, this._mimeType, encoded) || this._url;
  }

  _requestFinished(): void {
    if (this._request) {
      this._request.removeEventListener(Events.FinishedLoading, this._requestFinished, this);
    }
    if (this._pendingContentCallbacks.length) {
      this._innerRequestContent();
    }
  }

  async _innerRequestContent(): Promise<void> {
    if (this._contentRequested) {
      return;
    }
    this._contentRequested = true;

    let loadResult: {
      content: string,
      isEncoded: boolean,
    }|{
      content: null,
      error: string,
      isEncoded: false,
    }|{
      content: string,
      isEncoded: boolean,
    }|null = null;
    if (this.request) {
      const contentData = await this.request.contentData();
      if (!contentData.error) {
        this._content = contentData.content;
        this._contentEncoded = contentData.encoded;
        loadResult = {content: (contentData.content as string), isEncoded: contentData.encoded};
      }
    }
    if (!loadResult) {
      const response = await this._resourceTreeModel.target().pageAgent().invoke_getResourceContent(
          {frameId: this.frameId, url: this.url});
      const protocolError = response.getError();
      if (protocolError) {
        this._contentLoadError = protocolError;
        this._content = null;
        loadResult = {content: null, error: protocolError, isEncoded: false};
      } else {
        this._content = response.content;
        this._contentLoadError = null;
        loadResult = {content: response.content, isEncoded: response.base64Encoded};
      }
      this._contentEncoded = response.base64Encoded;
    }

    if (this._content === null) {
      this._contentEncoded = false;
    }

    for (const callback of this._pendingContentCallbacks.splice(0)) {
      callback(loadResult);
    }

    delete this._contentRequested;
  }

  hasTextContent(): boolean {
    if (this._type.isTextType()) {
      return true;
    }
    if (this._type === Common.ResourceType.resourceTypes.Other) {
      return Boolean(this._content) && !this._contentEncoded;
    }
    return false;
  }

  frame(): ResourceTreeFrame|null {
    return this._resourceTreeModel.frameForId(this._frameId);
  }

  statusCode(): number {
    return this._request ? this._request.statusCode : 0;
  }
}
