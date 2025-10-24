import { ProgramSourceEntryFile } from '@algorandfoundation/algokit-avm-debugger'
import algosdk from 'algosdk'
import { orderBy, take } from 'lodash'
import * as vscode from 'vscode'
import { MAX_FILES_TO_SHOW, NO_WORKSPACE_ERROR_MESSAGE } from './constants'
import { workspaceFileAccessor } from './fileAccessor'

// NOTE: Changes to 'address' or 'toUint' fields below must be propagated to other algokit repos using similar parsing logic
// Such as: https://github.com/algorandfoundation/algokit-subscriber-ts/pull/102#discussion_r1888287708
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
function parseAlgosdkV2SimulateResponse(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj

  const toBigIntFields = new Set([
    'uint', // General uint fields
  ])

  const addressFields = new Set([
    'snd', // Sender address
    'close', // CloseRemainderTo address (payment tx)
    'aclose', // AssetCloseTo address (asset transfer tx)
    'rekey', // RekeyTo address
    'rcv', // Receiver address (payment tx)
    'arcv', // AssetReceiver address (asset transfer tx)
    'fadd', // FreezeAccount address (asset freeze tx)
    'asnd', // AssetSender address (asset transfer/clawback tx)
    'm', // ManagerAddr (asset config)
    'r', // ReserveAddr (asset config)
    'f', // FreezeAddr (asset config)
    'c', // ClawbackAddr (asset config)
  ])

  const toUintFields = new Set([
    'gh', // GenesisHash - Hash of genesis block
    'apaa', // AppArguments - Application call arguments
    'apap', // ApprovalProgram - Logic for app approval program
    'note', // Note field - Optional data up to 1000 bytes
    'lx', // Lease field - For transaction mutual exclusion
    'grp', // Group field - Transaction group identifier
    'apsu', // ClearStateProgram - Logic for app clear state
    'am', // MetaDataHash - Asset metadata hash (32 bytes)
    'n', // Box name fields in apbx array
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processValue = (key: string, value: any): any => {
    if (typeof value === 'string') {
      if (addressFields.has(key)) {
        try {
          return algosdk.encodeAddress(algosdk.base64ToBytes(value))
        } catch {
          return value
        }
      }
      if (toBigIntFields.has(key)) {
        return BigInt(value)
      }
      if (toUintFields.has(key)) {
        return algosdk.base64ToBytes(value)
      }
    } else if (Array.isArray(value)) {
      if (toUintFields.has(key)) {
        return value.map((item) => (typeof item === 'string' ? algosdk.base64ToBytes(item) : item))
      }
      return value.map((item) => parseAlgosdkV2SimulateResponse(item))
    } else if (typeof value === 'object' && value !== null) {
      return parseAlgosdkV2SimulateResponse(value)
    }
    return value
  }

  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, processValue(key, value)]))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function objectToMapRecursive(obj: any): any {
  if (obj === null || typeof obj !== 'object' || obj instanceof Uint8Array) {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(objectToMapRecursive)
  }

  return new Map(Object.entries(obj).map(([key, value]) => [key, objectToMapRecursive(value)]))
}

function tryParseAlgosdkV2SimulateResponse(rawSimulateTrace: object): algosdk.modelsv2.SimulateResponse {
  const algosdkV2Response = parseAlgosdkV2SimulateResponse(rawSimulateTrace)

  if (algosdkV2Response.version !== 2) {
    throw new Error(`Unsupported simulate response version: ${algosdkV2Response.version}`)
  }

  return algosdk.modelsv2.SimulateResponse.fromEncodingData(objectToMapRecursive(algosdkV2Response))
}

export async function getSimulateTrace(filePath: string): Promise<algosdk.modelsv2.SimulateResponse | null> {
  const traceFileContent = await readFileAsJson<Record<string, unknown>>(filePath)
  if (!traceFileContent) {
    vscode.window.showErrorMessage(`Could not open the simulate trace file at path "${filePath}".`)
    return null
  }
  try {
    return algosdk.decodeJSON(JSON.stringify(traceFileContent), algosdk.modelsv2.SimulateResponse)
  } catch {
    return tryParseAlgosdkV2SimulateResponse(traceFileContent)
  }
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
          const title = txn.applicationCall?.appIndex
            ? `Select source maps for Application with ID: ${txn.applicationCall.appIndex}, hash: ${hash}`
            : `Select source map for Application with hash: ${hash}`
          identifiers[hash] = { hash, title }
        } else if (hash === bytesToBase64(logicSigHash)) {
          let lsigBytes: Uint8Array | undefined = lsig?.logic
          if (typeof lsigBytes === 'string') {
            lsigBytes = new Uint8Array(Buffer.from(lsigBytes, 'base64'))
          }
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

  const sortedEntries = Object.entries(identifiers).sort((a, b) => a[0].localeCompare(b[0]))
  return Object.fromEntries(sortedEntries)
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
    exitIfNoFiles?: boolean
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

  if (options.exitIfNoFiles && fileUris.length === 0) {
    vscode.window.showWarningMessage(options.noFilesErrorMessage)
    return undefined
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
  } catch {
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
