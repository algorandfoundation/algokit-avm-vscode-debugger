import { take } from 'lodash'
import * as vscode from 'vscode'
import { AvmDebugConfigProvider } from './configuration'
import {
  MAX_FILES_TO_SHOW,
  NO_WORKSPACE_ERROR_MESSAGE,
  SIMULATE_TRACE_FILE_EXTENSION,
  SIMULATE_TRACE_FILE_PATTERN,
  SOURCES_FILE_NAME,
  SOURCES_FILE_PATTERN,
} from './constants'
import { findFilesInWorkspace, getFilePathRelativeToClosestWorkspace, workspaceFolderFromFsPath } from './utils'

export function activateAvmDebug(context: vscode.ExtensionContext, factory: vscode.DebugAdapterDescriptorFactory) {
  const provider = new AvmDebugConfigProvider()
  context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('avm', provider))
  context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('avm', factory))

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.avmDebug.debugOpenTraceFile', async (resource: vscode.Uri) => {
      let targetResource = resource
      if (!targetResource && vscode.window.activeTextEditor) {
        targetResource = vscode.window.activeTextEditor.document.uri
      }
      if (targetResource) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(targetResource)
        if (!workspaceFolder) {
          vscode.window.showErrorMessage(NO_WORKSPACE_ERROR_MESSAGE)
          return undefined
        }

        await vscode.debug.startDebugging(workspaceFolder, {
          type: 'avm',
          name: 'Debug AVM Trace File',
          request: 'launch',
          simulateTraceFile: targetResource.fsPath,
          stopOnEntry: true,
        })
      }
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.avmDebug.getSimulateTraceFile', async (config) => {
      const workspaceFolder = workspaceFolderFromFsPath(config.workspaceFolderFsPath)
      const traceUris = await findFilesInWorkspace(workspaceFolder, SIMULATE_TRACE_FILE_PATTERN)

      if (traceUris.length === 0) {
        vscode.window.showErrorMessage(
          `No simulate trace files (with extension ${SIMULATE_TRACE_FILE_EXTENSION}) were found in the workspace.`,
        )
        return undefined
      }

      if (traceUris.length > MAX_FILES_TO_SHOW) {
        vscode.window.showInformationMessage(
          `More than ${MAX_FILES_TO_SHOW} simulate trace files were found in the workspace. Results have been truncated.`,
        )
      }

      const getRelativeFilePath = getFilePathRelativeToClosestWorkspace(workspaceFolder)
      const relativeTraceUris = take(traceUris, MAX_FILES_TO_SHOW).map(getRelativeFilePath)

      return await vscode.window.showQuickPick(relativeTraceUris, {
        title: 'Simulate trace file',
        placeHolder: 'Please select a simulate trace file to debug',
        canPickMany: false,
      })
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.avmDebug.getProgramSourcesDescriptionFile', async (config) => {
      const workspaceFolder = workspaceFolderFromFsPath(config.workspaceFolderFsPath)
      const sourcesUris = await findFilesInWorkspace(workspaceFolder, SOURCES_FILE_PATTERN)

      if (sourcesUris.length === 0) {
        vscode.window.showErrorMessage(`No program sources description files (with name ${SOURCES_FILE_NAME}) were found in the workspace.`)
        return undefined
      }

      if (sourcesUris.length > MAX_FILES_TO_SHOW) {
        vscode.window.showInformationMessage(
          `More than ${MAX_FILES_TO_SHOW} simulate trace files were found in the workspace. Results have been truncated.`,
        )
      }

      const getRelativeFilePath = getFilePathRelativeToClosestWorkspace(workspaceFolder)
      const relativeSourcesUris = take(sourcesUris, MAX_FILES_TO_SHOW).map(getRelativeFilePath)

      return await vscode.window.showQuickPick(relativeSourcesUris, {
        title: 'Program sources description file',
        placeHolder: 'Please select a program sources description file',
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
