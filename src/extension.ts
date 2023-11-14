'use strict';

import * as vscode from 'vscode';
import { activateTealDebug } from './activateMockDebug';
import {
  TEALDebugAdapterServerDescriptorFactory,
  TEALDebugAdapterExecutableFactory,
} from './descriptorFactory';

const runMode: 'external' | 'server' = 'server';

export function activate(context: vscode.ExtensionContext) {
  switch (runMode) {
    case 'server':
      activateTealDebug(context, new TEALDebugAdapterServerDescriptorFactory());
      break;

    case 'external':
    default:
      activateTealDebug(context, new TEALDebugAdapterExecutableFactory());
      break;
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate() {}
