import algosdk from 'algosdk'
import { ProgramSourceEntryFile } from 'avm-debug-adapter'
import { orderBy, take } from 'lodash'
import * as vscode from 'vscode'
import { MAX_FILES_TO_SHOW, NO_WORKSPACE_ERROR_MESSAGE } from './constants'
import { workspaceFileAccessor } from './fileAccessor'

export async function getSimulateTrace(filePath: string): Promise<algosdk.modelsv2.SimulateResponse | null> {
  const traceFileContent = await readFileAsJson<Record<string, unknown>>(filePath)
  if (!traceFileContent) {
    vscode.window.showErrorMessage(`Could not open the simulate trace file at path "${filePath}".`)
    return null
  }
  return algosdk.modelsv2.SimulateResponse.from_obj_for_encoding(traceFileContent)
}

export function getUniqueHashes(simulateTrace: algosdk.modelsv2.SimulateResponse): string[] {
  const hashes = simulateTrace.txnGroups.flatMap((group) =>
    group.txnResults.flatMap((result) => (result.execTrace ? getHashes(result.execTrace) : [])),
  )
  return [...new Set(hashes)]
}

export function getHashes(trace: algosdk.modelsv2.SimulationTransactionExecTrace): string[] {
  const approvalHash = bytesToBase64(trace.approvalProgramHash)
  const clearHash = bytesToBase64(trace.clearStateProgramHash)
  const logicSigHash = bytesToBase64(trace.logicSigHash)
  const hashes = concatIfTruthy<string>([], [approvalHash, clearHash, logicSigHash])

  if (trace.innerTrace) {
    return hashes.concat(trace.innerTrace.flatMap((it) => getHashes(it)))
  }

  return hashes
}

export function getSourceMapQuickPickItems(
  hashes: string[],
  trace: algosdk.modelsv2.SimulateResponse,
): Record<string, QuickPickSourceMapItem> {
  const identifiers: Record<string, QuickPickSourceMapItem> = {}

  trace.txnGroups.forEach((group) => {
    group.txnResults.forEach((result) => {
      if (!result.execTrace) return

      hashes.forEach((hash) => {
        const { execTrace, txnResult } = result
        if (!execTrace) return

        const { approvalProgramHash, clearStateProgramHash, logicSigHash } = execTrace
        const { txn, lsig } = txnResult.txn

        if (hash === bytesToBase64(approvalProgramHash) || hash === bytesToBase64(clearStateProgramHash)) {
          const title = txn.apid
            ? `Select source maps for Application with ID: ${txn.apid}, hash: ${hash}`
            : `Select source map for Application with hash: ${hash}`
          identifiers[hash] = { hash, title }
        } else if (hash === bytesToBase64(logicSigHash)) {
          const lsigBytes = lsig?.l
          const lsigAddr = lsigBytes ? new algosdk.LogicSigAccount(lsigBytes).address() : undefined
          const title = lsigAddr
            ? `Select source maps for Logic Sig with address: ${lsigAddr}, hash: ${hash}`
            : `Select source map for Logic Sig with hash: ${hash}`
          identifiers[hash] = { hash, title }
        } else if (!identifiers[hash]) {
          identifiers[hash] = { hash, title: `Select source map for Application with hash: ${hash}` }
        }
      })
    })
  })

  return identifiers
}

export type QuickPickSourceMapItem = {
  title: string
  hash: string
}

export interface QuickPickWithUri extends vscode.QuickPickItem {
  uri?: vscode.Uri
}

export function getMissingHashes(uniqueHashes: string[], sources: ProgramSourceEntryFile): string[] {
  const sourcesHashes = new Set((sources['txn-group-sources'] ?? []).map((s) => s.hash))
  return uniqueHashes.filter((hash) => !sourcesHashes.has(hash))
}

export async function getWorkspaceFolder(resource?: vscode.Uri): Promise<vscode.WorkspaceFolder | undefined> {
  let workspaceFolder: vscode.WorkspaceFolder | undefined

  if (resource) {
    workspaceFolder = vscode.workspace.getWorkspaceFolder(resource)
  } else {
    workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  }

  if (!workspaceFolder) {
    vscode.window.showErrorMessage(NO_WORKSPACE_ERROR_MESSAGE)
  }

  return workspaceFolder
}

export async function findAndPickFile(
  workspaceFolder: vscode.WorkspaceFolder,
  filePattern: string,
  options: {
    title: string
    placeHolder: string
    noFilesErrorMessage: string
    allowBrowse?: boolean
    fileType?: string
  },
): Promise<string | undefined> {
  const fileUris = await findFilesInWorkspace(workspaceFolder, filePattern)

  const quickPickItems: vscode.QuickPickItem[] = []

  if (fileUris.length === 0) {
    vscode.window.showWarningMessage(options.noFilesErrorMessage)
  } else {
    if (fileUris.length > MAX_FILES_TO_SHOW) {
      vscode.window.showInformationMessage(`More than ${MAX_FILES_TO_SHOW} files were found in the workspace. Results have been truncated.`)
    }

    const getRelativeFilePath = getFilePathRelativeToClosestWorkspace(workspaceFolder)
    const relativeFileUris = take(fileUris, MAX_FILES_TO_SHOW).map(getRelativeFilePath)

    quickPickItems.push(
      { label: 'Workspace Files', kind: vscode.QuickPickItemKind.Separator },
      ...relativeFileUris.map((uri) => ({ label: uri })),
    )
  }

  if (options.allowBrowse) {
    quickPickItems.push(
      { label: 'External Files', kind: vscode.QuickPickItemKind.Separator },
      { label: 'Browse...', description: `Select external ${options.fileType || 'file'}` },
    )
  }

  const selected = await vscode.window.showQuickPick(quickPickItems, {
    title: options.title,
    placeHolder: options.placeHolder,
  })

  if (selected?.label === 'Browse...') {
    const [file] =
      (await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: options.fileType ? { [options.fileType]: [options.fileType.split('.').pop() || ''] } : undefined,
        title: `Select ${options.fileType || 'File'}`,
      })) || []

    return file?.fsPath
  }

  return selected ? selected.label : undefined
}

export const findFilesInWorkspace = async (folder: vscode.WorkspaceFolder, filePattern: string | string[] = []) => {
  const patterns = Array.isArray(filePattern) ? filePattern : [filePattern]

  const filesPromises = patterns.map((pattern) =>
    vscode.workspace.findFiles(new vscode.RelativePattern(folder, pattern), '**/node_modules/**'),
  )

  const filesArrays = await Promise.all(filesPromises)
  const allFiles = Array.from(new Set(filesArrays.flat()))

  return orderBy(allFiles, ['fsPath'], ['desc'])
}

export const getFilePathRelativeToClosestWorkspace = (folder: vscode.WorkspaceFolder) => (fileUri: vscode.Uri) => {
  // In a multi-root workspace, a file can exist in both a parent and child workspace folder.
  // When this happens we want to include the workspace folder name in the path.
  const workspaceFolderClosetToFile = vscode.workspace.getWorkspaceFolder(fileUri) ?? folder
  const includeWorkspaceFolder = folder.index !== workspaceFolderClosetToFile.index
  return vscode.workspace.asRelativePath(fileUri, includeWorkspaceFolder)
}

export const workspaceFolderFromPath = (path: string) => {
  // The debugger can't be started without a workspace folder, so this should never be undefined.
  return vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(path))!
}

export const readFileAsJson = async <T>(fsPath: string) => {
  try {
    const bytes = await workspaceFileAccessor.readFile(fsPath)
    return JSON.parse(new TextDecoder().decode(bytes)) as T
  } catch (_e) {
    return undefined
  }
}

export const writeFileAsJson = async <T>(fsPath: string, data: T) => {
  await workspaceFileAccessor.writeFile(fsPath, new TextEncoder().encode(JSON.stringify(data, null, 2)))
}

export const bytesToBase64 = (bytes?: Uint8Array) => (bytes ? Buffer.from(bytes).toString('base64') : undefined)

export const concatIfTruthy = <T>(array: T[], items: Array<T | undefined>) => {
  const truthyItems = items.filter((item): item is T => !!item)
  return truthyItems.length > 0 ? array.concat(truthyItems) : array
}
