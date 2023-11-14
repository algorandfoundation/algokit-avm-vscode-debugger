'use strict';

import * as vscode from 'vscode';
import { TEALDebugAdapterDescriptorFactory } from './descriptorFactory';
import { TealDebugConfigProvider } from './configuration';

export function activateTealDebug(
  context: vscode.ExtensionContext,
  factory: TEALDebugAdapterDescriptorFactory,
) {
  // register a configuration provider for 'teal' debug type
  const provider = new TealDebugConfigProvider();
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider('teal', provider),
  );

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('teal', factory),
  );
  // https://vscode-docs.readthedocs.io/en/stable/extensions/patterns-and-principles/#events
  // see events, by the end of subscription, call `dispose()` to release resource.
  context.subscriptions.push(factory);
}
