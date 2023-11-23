import * as vscode from 'vscode'
import { AvmDebugConfigProvider } from './configuration'

export function activateAvmDebug(context: vscode.ExtensionContext, factory: vscode.DebugAdapterDescriptorFactory) {
  const provider = new AvmDebugConfigProvider()
  context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('avm', provider))
  context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('avm', factory))
  context.subscriptions.push(
    vscode.commands.registerCommand('extension.avmDebug.getSimulateTraceFile', async (_config) => {
      // TODO: NC - Handle when there are no trace files to be found in the workspace
      // TODO: NC - What if there are hundreds of trace files? Do we want to paginate?

      const traceUris = await vscode.workspace.findFiles('**/*.trace', '**/node_modules/**')
      const traceFiles = traceUris.map((traceUri) => vscode.workspace.asRelativePath(traceUri))
      return await vscode.window.showQuickPick(traceFiles, {
        placeHolder: 'Please select a simulate trace file to debug',
        canPickMany: false,
      })
    }),
  )

  if (isDisposable(factory)) {
    // https://vscode-docs.readthedocs.io/en/stable/extensions/patterns-and-principles/#events
    // see events, by the end of subscription, call `dispose()` to release resource.
    context.subscriptions.push(factory)
  }
}

function isDisposable(value: object): value is { dispose(): unknown } {
  return 'dispose' in value
}
