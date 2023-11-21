'use strict';

import * as vscode from 'vscode';
import { AvmDebugConfigProvider } from './configuration';

export function activateAvmDebug(
  context: vscode.ExtensionContext,
  factory: vscode.DebugAdapterDescriptorFactory,
) {
  // register a configuration provider for 'avm' debug type
  const provider = new AvmDebugConfigProvider();
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider('avm', provider),
  );

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('avm', factory),
  );

  if (isDisposable(factory)) {
    // https://vscode-docs.readthedocs.io/en/stable/extensions/patterns-and-principles/#events
    // see events, by the end of subscription, call `dispose()` to release resource.
    context.subscriptions.push(factory);
  }
}

function isDisposable(value: object): value is { dispose(): unknown } {
  return 'dispose' in value;
}
