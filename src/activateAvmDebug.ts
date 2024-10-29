import * as vscode from 'vscode'
import { AvmDebugConfigProvider } from './configuration'
import { SIMULATE_TRACE_FILE_EXTENSION, SIMULATE_TRACE_FILE_PATTERN, SOURCES_FILE_NAME, SOURCES_FILE_PATTERN } from './constants'
import { workspaceFileAccessor } from './fileAccessor'
import { findAndPickFile, getWorkspaceFolder, workspaceFolderFromPath } from './utils'

export function activateAvmDebug(context: vscode.ExtensionContext, factory: vscode.DebugAdapterDescriptorFactory) {
  const provider = new AvmDebugConfigProvider()
  context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('avm', provider))
  context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('avm', factory))

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.avmDebugger.debugOpenTraceFile', async (resource: vscode.Uri) => {
      const targetResource = resource || vscode.window.activeTextEditor?.document.uri
      const workspaceFolder = await getWorkspaceFolder(targetResource)
      if (!workspaceFolder) return

      await vscode.debug.startDebugging(workspaceFolder, {
        type: 'avm',
        name: 'Debug AVM Trace File',
        request: 'launch',
        simulateTraceFile: targetResource?.fsPath,
        stopOnEntry: true,
      })
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.avmDebugger.clearAvmDebugRegistry', async () => {
      const config = vscode.workspace.getConfiguration('avmDebugger')
      let sourcesFilePath = config.get<string>('programSourcesDescriptionFile')

      if (!sourcesFilePath) {
        const workspaceFolder = await getWorkspaceFolder()
        if (!workspaceFolder) return

        sourcesFilePath = await findAndPickFile(workspaceFolder, SOURCES_FILE_PATTERN, {
          title: 'Select program sources description file to clear',
          placeHolder: 'Please select a file to clear',
          noFilesErrorMessage: `No program sources description files (with name ${SOURCES_FILE_NAME}) were found in the workspace.`,
        })
        if (!sourcesFilePath) return
      }

      const confirmation = await vscode.window.showWarningMessage(
        `Are you sure you want to clear the content of ${sourcesFilePath}?`,
        { modal: true },
        'Yes',
      )

      if (confirmation === 'Yes') {
        await workspaceFileAccessor.writeFile(sourcesFilePath, new TextEncoder().encode(JSON.stringify({}, null, 2)))
        vscode.window.showInformationMessage('AVM Debug Registry cleared.')
      }
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.avmDebugger.editAvmDebugRegistry', async () => {
      const config = vscode.workspace.getConfiguration('avmDebugger')
      const currentFile = config.get<string>('programSourcesDescriptionFile')

      if (currentFile) {
        const document = await vscode.workspace.openTextDocument(currentFile)
        await vscode.window.showTextDocument(document)
      } else {
        const workspaceFolder = await getWorkspaceFolder()
        if (!workspaceFolder) return

        const sourcesFilePath = await findAndPickFile(workspaceFolder, SOURCES_FILE_PATTERN, {
          title: 'Program sources description file',
          placeHolder: 'Please select a program sources description file',
          noFilesErrorMessage: `No program sources description files (with name ${SOURCES_FILE_NAME}) were found in the workspace.`,
        })
        if (!sourcesFilePath) return

        const document = await vscode.workspace.openTextDocument(sourcesFilePath)
        await vscode.window.showTextDocument(document)
      }

      vscode.window.showInformationMessage('AVM Debug Registry opened for editing.')
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.avmDebugger.getSimulateTraceFile', async (config) => {
      const workspaceFolder = workspaceFolderFromPath(config.workspaceFolderPath)
      return findAndPickFile(workspaceFolder, SIMULATE_TRACE_FILE_PATTERN, {
        title: 'Simulate trace file',
        placeHolder: 'Please select a simulate trace file to debug or browse for an external file',
        noFilesErrorMessage: `No simulate trace files (with extension ${SIMULATE_TRACE_FILE_EXTENSION}) were found in the workspace.`,
        allowBrowse: true,
        fileType: SIMULATE_TRACE_FILE_EXTENSION,
      })
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.avmDebugger.getProgramSourcesDescriptionFile', async (config) => {
      const workspaceFolder = workspaceFolderFromPath(config.workspaceFolderPath)
      return findAndPickFile(workspaceFolder, SOURCES_FILE_PATTERN, {
        title: 'Program sources description file',
        placeHolder: 'Please select a program sources description file',
        noFilesErrorMessage: `No program sources description files (with name ${SOURCES_FILE_NAME}) were found in the workspace.`,
      })
    }),
  )

  if (isDisposable(factory)) {
    context.subscriptions.push(factory)
  }
}

function isDisposable(value: object): value is { dispose(): unknown } {
  return 'dispose' in value
}
