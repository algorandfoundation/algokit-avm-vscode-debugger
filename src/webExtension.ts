import * as vscode from 'vscode'
import { activateAvmDebug } from './activateAvmDebug'
import { InlineDebugAdapterFactory } from './inlineDebugAdapterFactory'

// TODO: NC - This is currently unused, however it may make sense to utilise this, so evaluate a bit later.
export function activate(context: vscode.ExtensionContext) {
  // Inline is the only supported mode for running the debug adapter in the browser.
  activateAvmDebug(context, new InlineDebugAdapterFactory())
}

export function deactivate() {
  // nothing to do
}
