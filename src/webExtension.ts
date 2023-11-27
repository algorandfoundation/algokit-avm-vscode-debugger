import * as vscode from 'vscode'
import { activateAvmDebug } from './activateAvmDebug'
import { InlineDebugAdapterFactory } from './inlineDebugAdapterFactory'

// TODO: NC - This is currently unused, however it would be nice to support VS Code in the browser.
export function activate(context: vscode.ExtensionContext) {
  // Inline is the only supported mode for running the debug adapter in the browser.
  activateAvmDebug(context, new InlineDebugAdapterFactory())
}

export function deactivate() {
  // nothing to do
}
