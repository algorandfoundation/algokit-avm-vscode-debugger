import * as vscode from 'vscode'
import { activateAvmDebug } from './activateAvmDebug'
import { InlineDebugAdapterFactory } from './inlineDebugAdapterFactory'

export function activate(context: vscode.ExtensionContext) {
  activateAvmDebug(context, new InlineDebugAdapterFactory())
}

export function deactivate() {
  // no op
}
