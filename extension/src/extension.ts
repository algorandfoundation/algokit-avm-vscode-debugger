'use strict';

import * as vscode from 'vscode';
import { activateAvmDebug } from './activateAvmDebug';
import { ServerDebugAdapterFactory } from './serverDescriptorFactory';
import { InlineDebugAdapterFactory } from './internalDescriptorFactory';

const runMode: 'server' | 'inline' = 'inline';

export function activate(context: vscode.ExtensionContext) {
  switch (runMode) {
    case 'server':
      // run the debug adapter as a server inside the extension and communicate via a socket
      activateAvmDebug(context, new ServerDebugAdapterFactory());
      break;

    case 'inline':
      // run the debug adapter inside the extension and directly talk to it
      activateAvmDebug(context, new InlineDebugAdapterFactory());
      break;
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate() {}
