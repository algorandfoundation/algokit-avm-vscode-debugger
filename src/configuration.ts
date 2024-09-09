import algosdk from 'algosdk'
import * as vscode from 'vscode'
import { CancellationToken, DebugConfiguration, WorkspaceFolder } from 'vscode'
import { NO_WORKSPACE_ERROR_MESSAGE } from './constants'
import { workspaceFileAccessor } from './fileAccessor'
import { bytesToBase64, concatIfTruthy, findFilesInWorkspace, readFileAsJson } from './utils'

type SourcesFile = {
  'txn-group-sources'?: {
    'sourcemap-location': string | undefined
    hash: string
  }[]
}

type QuickPickSourceMapItem = {
  title: string
  hash: string
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

const getSourceMapQuickPickItems = (hashes: string[], trace: algosdk.modelsv2.SimulateResponse): Record<string, QuickPickSourceMapItem> => {
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

const getSourceMapType = (uri: vscode.Uri): string => {
  if (uri.path.includes('puya.map')) {
    return 'Puya sourcemap'
  } else if (uri.path.includes('teal.map')) {
    return 'TEAL sourcemap'
  }

  return 'Legacy sourcemap'
}

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
      workspaceFolderPath: folder.uri.path,
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
      const algoKitSourcesDir = vscode.Uri.joinPath(folder.uri, '.algokit', 'sources')
      const defaultSourcesFile = vscode.Uri.joinPath(algoKitSourcesDir, 'sources.avm.json')

      try {
        await vscode.workspace.fs.stat(defaultSourcesFile)
        programSourcesDescriptionFile = defaultSourcesFile.fsPath
      } catch (error) {
        // File doesn't exist, we'll create it later if needed
      }
    }

    const traceFileContent = await readFileAsJson<Record<string, unknown>>(config.simulateTraceFile)
    if (!traceFileContent) {
      vscode.window.showErrorMessage(`Could not open the simulate trace file at path "${config.simulateTraceFile}".`)
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

    let sources = await readFileAsJson<SourcesFile>(programSourcesDescriptionFile)
    if (!sources) {
      vscode.window.showWarningMessage(`Empty program sources description file at "${programSourcesDescriptionFile}".`)
      sources = {}
    }

    const sourcesHashes = await Promise.all(
      (sources['txn-group-sources'] ?? []).map(async (s) => {
        let fileExists: boolean
        try {
          fileExists = (await workspaceFileAccessor.readFile(s['sourcemap-location'])) !== undefined
        } catch (error) {
          fileExists = false
        }
        const shouldInclude = s['sourcemap-location'] !== null && fileExists
        return shouldInclude ? s.hash : null
      }),
    ).then((hashes) => hashes.filter((hash): hash is string => hash !== null))

    const missingHashes = uniqueHashes.reduce((acc, hash) => {
      if (!sourcesHashes.includes(hash)) {
        return acc.concat(hash)
      }

      return acc
    }, [] as string[])

    if (missingHashes.length > 0) {
      const sourceMapFiles = await findFilesInWorkspace(folder, ['**/*.tok.map', '**/*.teal.map', '**/*.puya.map'])
      const identifiers = getSourceMapQuickPickItems(missingHashes, simulateTrace)

      // Group source map files by contract name
      const groupedSourceMaps = await this.groupSourceMapsByContract(sourceMapFiles)

      for (const hash of missingHashes) {
        const ignoreOption = {
          label: 'Ignore sourcemap for this hash',
          detail: "Won't be asked again. Run '> Clear AVM Registry' command to reset choices.",
          iconPath: new vscode.ThemeIcon('close'),
        }

        const quickPickItems = [ignoreOption, ...this.createCategorizedQuickPickItems(groupedSourceMaps)]

        const selectedOption = await vscode.window.showQuickPick(quickPickItems, {
          placeHolder: 'Pick source map or choose to ignore',
          title: identifiers[hash].title,
          matchOnDetail: true,
        })

        if (selectedOption) {
          const isIgnoreOption = selectedOption.label.includes('Ignore')
          if (isIgnoreOption) {
            vscode.window.showInformationMessage(`Sourcemap for hash ${hash} will be ignored.`)
          }
          if (!sources['txn-group-sources']) {
            sources['txn-group-sources'] = []
          }
          sources['txn-group-sources']?.push({
            'sourcemap-location': isIgnoreOption ? null : selectedOption.label,
            hash,
          })
        }
      }

      // Persist updated sources back to the file
      if (!programSourcesDescriptionFile) {
        const algoKitSourcesDir = vscode.Uri.joinPath(folder.uri, '.algokit', 'sources')
        const newSourcesFile = vscode.Uri.joinPath(algoKitSourcesDir, 'sources.avm.json')

        try {
          await vscode.workspace.fs.createDirectory(algoKitSourcesDir)
        } catch (error) {
          // Directory might already exist, ignore the error
        }

        programSourcesDescriptionFile = newSourcesFile.fsPath
      }

      await workspaceFileAccessor.writeFile(programSourcesDescriptionFile, new TextEncoder().encode(JSON.stringify(sources, null, 2)))
    }

    return { ...config, programSourcesDescriptionFile }
  }

  private async groupSourceMapsByContract(sourceMapFiles: vscode.Uri[]): Promise<Record<string, vscode.Uri[]>> {
    const groupedSourceMaps: Record<string, vscode.Uri[]> = { Other: [] }

    for (const uri of sourceMapFiles) {
      const contractFile = vscode.Uri.file(uri.fsPath.replace(/\.(teal\.tok\.map|teal\.map|puya\.map)$/, '.teal'))
      const contractFileExists = await workspaceFileAccessor
        .readFile(contractFile.fsPath)
        .catch(() => false)
        .then((file) => file !== undefined)
      if (contractFileExists) {
        const baseName = workspaceFileAccessor.basename(contractFile.fsPath).replace(/\.(teal|py)$/, '')
        if (!groupedSourceMaps[baseName]) {
          groupedSourceMaps[baseName] = []
        }
        groupedSourceMaps[baseName].push(uri)
      } else {
        groupedSourceMaps['Other'].push(uri)
      }
    }

    return groupedSourceMaps
  }

  private createCategorizedQuickPickItems(groupedSourceMaps: Record<string, vscode.Uri[]>): vscode.QuickPickItem[] {
    const items: vscode.QuickPickItem[] = []

    for (const [category, uris] of Object.entries(groupedSourceMaps)) {
      if (uris.length > 0) {
        items.push({ kind: vscode.QuickPickItemKind.Separator, label: category })
        items.push(
          ...uris.map((uri) => ({
            label: uri.fsPath,
            detail: getSourceMapType(uri),
            description: uri.path.endsWith('.map') ? 'Source map file' : undefined,
            uri,
            iconPath: new vscode.ThemeIcon('file-code'),
          })),
        )
      }
    }

    return items
  }
}
