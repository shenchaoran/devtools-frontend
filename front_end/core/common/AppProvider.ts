// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/* eslint-disable rulesdir/no_underscored_properties */

import * as Root from '../root/root.js';  // eslint-disable-line no-unused-vars

import type {App} from './App.js';

/**
 * @interface
 */
export interface AppProvider {
  createApp(): App;
}

const registeredAppProvider: AppProviderRegistration[] = [];

export function registerAppProvider(registration: AppProviderRegistration): void {
  registeredAppProvider.push(registration);
}
export function getRegisteredAppProviders(): AppProviderRegistration[] {
  return registeredAppProvider
      .filter(
          provider => Root.Runtime.Runtime.isDescriptorEnabled({experiment: undefined, condition: provider.condition}))
      .sort((firstProvider, secondProvider) => {
        const order1 = firstProvider.order || 0;
        const order2 = secondProvider.order || 0;
        return order1 - order2;
      });
}
export interface AppProviderRegistration {
  loadAppProvider: () => Promise<AppProvider>;
  condition?: Root.Runtime.ConditionName;
  order: number;
}
