import algosdk from 'algosdk'
import * as vscode from 'vscode'
import { CancellationToken, DebugConfiguration, WorkspaceFolder } from 'vscode'
import { NO_WORKSPACE_ERROR_MESSAGE, SOURCES_FILE_PATTERN } from './constants'
import { bytesToBase64, concatIfTruthy, findFilesInWorkspace, readFileAsJson } from './utils'

export class AvmDebugConfigProvider implements vscode.DebugConfigurationProvider {
  async resolveDebugConfiguration(
    folder: WorkspaceFolder | undefined,
    config: DebugConfiguration,
    _token: CancellationToken | undefined,
  ): Promise<DebugConfiguration | null> {
    if (!config.simulateTraceFile) {
      vscode.window.showErrorMessage('Missing property "simulateTraceFile" in debug config.')
      return null
    }

    if (!folder) {
      vscode.window.showErrorMessage(NO_WORKSPACE_ERROR_MESSAGE)
      return null
    }

    return {
      ...config,
      workspaceFolderFsPath: folder.uri.fsPath,
    }
  }

  async resolveDebugConfigurationWithSubstitutedVariables(
    folder: WorkspaceFolder | undefined,
    config: DebugConfiguration,
    _token: CancellationToken | undefined,
  ): Promise<DebugConfiguration | null> {
    if (!folder) {
      vscode.window.showErrorMessage(NO_WORKSPACE_ERROR_MESSAGE)
      return null
    }

    let programSourcesDescriptionFile: string | undefined = config.programSourcesDescriptionFile

    if (!programSourcesDescriptionFile) {
      const workspaceFolder = folder
      const sourcesUris = await findFilesInWorkspace(workspaceFolder, SOURCES_FILE_PATTERN)

      if (sourcesUris.length === 1) {
        programSourcesDescriptionFile = sourcesUris[0].fsPath
      } else {
        const pickedSource = await vscode.commands.executeCommand<string | undefined>(
          'extension.avmDebug.getProgramSourcesDescriptionFile',
          config,
        )
        if (!pickedSource) {
          return null
        }
        programSourcesDescriptionFile = vscode.Uri.joinPath(workspaceFolder.uri, pickedSource).fsPath
      }
    }

    const traceFileContent = await readFileAsJson<Record<string, unknown>>(config.simulateTraceFile)
    if (!traceFileContent) {
      vscode.window.showErrorMessage(`Could not open the simulate trace file at path "${config.simulateTraceFile}".`)
      return null
    }

    const sources = await readFileAsJson<SourcesFile>(programSourcesDescriptionFile)
    if (!sources) {
      vscode.window.showErrorMessage(`Could not open the program sources description file at path "${programSourcesDescriptionFile}".`)
      return null
    }

    const simulateTrace = algosdk.modelsv2.SimulateResponse.from_obj_for_encoding(traceFileContent)

    const hashes = simulateTrace.txnGroups.flatMap((group) => {
      return group.txnResults.reduce((acc, result) => {
        const hashes = result.execTrace ? getHashes(result.execTrace) : []

        return [...acc, ...hashes]
      }, [] as string[])
    })
    const uniqueHashes = [...new Set(hashes)]
    const sourcesHashes = sources['txn-group-sources']?.map((s) => s.hash) ?? []

    const missingHashes = uniqueHashes.reduce((acc, hash) => {
      if (!sourcesHashes.includes(hash)) {
        return acc.concat(hash)
      }

      return acc
    }, [] as string[])

    if (missingHashes.length > 0) {
      vscode.window.showInformationMessage(
        `The following program hashes don't have a corresponding source mapping and won't be debuggable:\n ${missingHashes
          .map((hash) => `"${hash}"`)
          .join(', ')}.`,
      )
    }

    return { ...config, programSourcesDescriptionFile }
  }
}

type SourcesFile = {
  'txn-group-sources'?: {
    'sourcemap-location': string
    hash: string
  }[]
}

const getHashes = (trace: algosdk.modelsv2.SimulationTransactionExecTrace): string[] => {
  const approvalHash = bytesToBase64(trace.approvalProgramHash)
  const clearHash = bytesToBase64(trace.clearStateProgramHash)
  const logicSigHash = bytesToBase64(trace.logicSigHash)
  const hashes = concatIfTruthy<string>([], [approvalHash, clearHash, logicSigHash])

  if (trace.innerTrace) {
    return hashes.concat(trace.innerTrace.flatMap((it) => getHashes(it)))
  }

  return hashes
}
