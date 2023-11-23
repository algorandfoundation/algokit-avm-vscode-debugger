import * as vscode from 'vscode'
import { activateAvmDebug } from './activateAvmDebug'
import { InlineDebugAdapterFactory } from './inlineDebugAdapterFactory'
import { ServerDebugAdapterFactory } from './serverDebugAdapterFactory'

// TODO: NC - Dynamically resolve this, so we can switch from server mode to inline mode
const runMode: 'server' | 'inline' = 'inline'

export function activate(context: vscode.ExtensionContext) {
  switch (runMode) {
    case 'server':
      // run the debug adapter as a server inside the extension and communicate via a socket
      activateAvmDebug(context, new ServerDebugAdapterFactory())
      break

    case 'inline':
      // run the debug adapter inside the extension and directly talk to it
      activateAvmDebug(context, new InlineDebugAdapterFactory())
      break
  }
}

export function deactivate() {
  // no op
}
