import * as vscode from 'vscode'
import { activateAvmDebug } from './activateAvmDebug'
import { InlineDebugAdapterFactory } from './inlineDebugAdapterFactory'
import { InterProcessDebugAdapterFactory } from './interProcessDebugAdapterFactory'

export function activate(context: vscode.ExtensionContext) {
  const debugAdapterPort = vscode.workspace.getConfiguration('avmDebugger').get<number | null>('debugAdapter.port') ?? undefined
  if (debugAdapterPort) {
    activateAvmDebug(context, new InterProcessDebugAdapterFactory(debugAdapterPort))
    return
  }

  activateAvmDebug(context, new InlineDebugAdapterFactory())
}

export function deactivate() {
  // no op
}
