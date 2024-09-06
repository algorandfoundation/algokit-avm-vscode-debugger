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
import { workspaceFileAccessor } from './fileAccessor'
import { findFilesInWorkspace, getFilePathRelativeToClosestWorkspace, workspaceFolderFromPath } from './utils'

export function activateAvmDebug(context: vscode.ExtensionContext, factory: vscode.DebugAdapterDescriptorFactory) {
  const provider = new AvmDebugConfigProvider()
  context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('avm', provider))
  context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('avm', factory))

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.avmDebugger.debugOpenTraceFile', async (resource: vscode.Uri) => {
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
    vscode.commands.registerCommand('extension.avmDebugger.clearAvmDebugRegistry', async () => {
      const config = vscode.workspace.getConfiguration('avmDebugger')
      let sourcesFilePath = config.get<string>('programSourcesDescriptionFile')

      if (!sourcesFilePath) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (!workspaceFolder) {
          vscode.window.showErrorMessage(NO_WORKSPACE_ERROR_MESSAGE)
          return
        }

        const sourcesFiles = await findFilesInWorkspace(workspaceFolder, SOURCES_FILE_PATTERN)

        if (sourcesFiles.length === 0) {
          vscode.window.showErrorMessage(
            `No program sources description files (with name ${SOURCES_FILE_NAME}) were found in the workspace.`,
          )
          return
        }

        if (sourcesFiles.length === 1) {
          sourcesFilePath = sourcesFiles[0].fsPath
        } else {
          const quickPickItems = sourcesFiles.map((uri) => ({
            label: getFilePathRelativeToClosestWorkspace(workspaceFolder)(uri),
            uri,
          }))
          const selected = await vscode.window.showQuickPick(quickPickItems, {
            title: 'Select program sources description file to clear',
            placeHolder: 'Please select a file to clear',
          })
          if (!selected) return
          sourcesFilePath = selected.uri.fsPath
        }
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
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (!workspaceFolder) {
          vscode.window.showErrorMessage(NO_WORKSPACE_ERROR_MESSAGE)
          return
        }

        const sourcesFiles = await findFilesInWorkspace(workspaceFolder, SOURCES_FILE_PATTERN)

        if (sourcesFiles.length === 0) {
          vscode.window.showErrorMessage(
            `No program sources description files (with name ${SOURCES_FILE_NAME}) were found in the workspace.`,
          )
          return
        }

        let defaultPath: vscode.Uri
        if (sourcesFiles.length === 1) {
          defaultPath = sourcesFiles[0]
        } else {
          const quickPickItems = sourcesFiles.map((uri) => ({
            label: uri.fsPath,
            uri,
          }))
          const selected = await vscode.window.showQuickPick(quickPickItems, {
            title: 'Program sources description file',
            placeHolder: 'Please select a program sources description file',
          })
          defaultPath = selected ? selected.uri : sourcesFiles[0]
        }
        const document = await vscode.workspace.openTextDocument(defaultPath)
        await vscode.window.showTextDocument(document)
      }

      vscode.window.showInformationMessage('AVM Debug Registry opened for editing.')
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.avmDebugger.getSimulateTraceFile', async (config) => {
      const workspaceFolder = workspaceFolderFromPath(config.workspaceFolderPath)
      const traceUris = await findFilesInWorkspace(workspaceFolder, SIMULATE_TRACE_FILE_PATTERN)

      const quickPickItems: vscode.QuickPickItem[] = [
        { label: 'External Files', kind: vscode.QuickPickItemKind.Separator },
        { label: 'Browse...', description: 'Select external simulate trace file' },
      ]

      if (traceUris.length === 0) {
        vscode.window.showWarningMessage(
          `No simulate trace files (with extension ${SIMULATE_TRACE_FILE_EXTENSION}) were found in the workspace.`,
        )
      } else {
        if (traceUris.length > MAX_FILES_TO_SHOW) {
          vscode.window.showInformationMessage(
            `More than ${MAX_FILES_TO_SHOW} simulate trace files were found in the workspace. Results have been truncated.`,
          )
        }

        const getRelativeFilePath = getFilePathRelativeToClosestWorkspace(workspaceFolder)
        const relativeTraceUris = take(traceUris, MAX_FILES_TO_SHOW).map(getRelativeFilePath)

        quickPickItems.unshift(
          { label: 'Workspace Files', kind: vscode.QuickPickItemKind.Separator },
          ...relativeTraceUris.map((uri) => ({ label: uri })),
        )
      }

      const selected = await vscode.window.showQuickPick(quickPickItems, {
        title: 'Simulate trace file',
        placeHolder: 'Please select a simulate trace file to debug or browse for an external file',
      })

      if (selected?.label === 'Browse...') {
        const [file] =
          (await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { 'Simulate Trace Files': [SIMULATE_TRACE_FILE_EXTENSION.slice(1)] },
            title: 'Select Simulate Trace File',
          })) ?? []

        if (file?.fsPath.endsWith(SIMULATE_TRACE_FILE_EXTENSION)) {
          return file.fsPath
        } else {
          vscode.window.showErrorMessage(`Selected file must have the extension *${SIMULATE_TRACE_FILE_EXTENSION}`)
          return undefined
        }
      }

      return selected ? selected.label : undefined
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.avmDebugger.getProgramSourcesDescriptionFile', async (config) => {
      const workspaceFolder = workspaceFolderFromPath(config.workspaceFolderPath)
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
