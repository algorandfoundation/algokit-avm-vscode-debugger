import algosdk from 'algosdk'
import path from 'path'
import * as vscode from 'vscode'
import { CancellationToken, DebugConfiguration, WorkspaceFolder } from 'vscode'
import { DEFAULT_SOURCES_AVM_JSON_FILE, NO_WORKSPACE_ERROR_MESSAGE } from './constants'
import { workspaceFileAccessor } from './fileAccessor'
import {
  findFilesInWorkspace,
  getMissingHashes,
  getSimulateTrace,
  getSourceMapQuickPickItems,
  getUniqueHashes,
  QuickPickWithUri,
  readFileAsJson,
  SourcesFile,
  writeFileAsJson,
} from './utils'

export class AvmDebugConfigProvider implements vscode.DebugConfigurationProvider {
  async resolveDebugConfiguration(
    folder: WorkspaceFolder | undefined,
    config: DebugConfiguration,
    _token: CancellationToken | undefined,
  ): Promise<DebugConfiguration | null> {
    if (!config.simulateTraceFile || !folder) {
      vscode.window.showErrorMessage(
        config.simulateTraceFile ? NO_WORKSPACE_ERROR_MESSAGE : 'Missing property "simulateTraceFile" in debug config.',
      )
      return null
    }

    return { ...config, workspaceFolderPath: folder.uri.path }
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

    const programSourcesDescriptionFile = await this.getProgramSourcesDescriptionFile(folder, config)
    const simulateTrace = await getSimulateTrace(config.simulateTraceFile)
    if (!simulateTrace) return null

    const uniqueHashes = getUniqueHashes(simulateTrace)
    const sources = await this.getSources(programSourcesDescriptionFile)
    const missingHashes = getMissingHashes(uniqueHashes, sources)

    if (missingHashes.length > 0) {
      await this.handleMissingHashes(folder, missingHashes, simulateTrace, sources)
      await this.persistSources(folder, programSourcesDescriptionFile, sources)
    }

    return { ...config, programSourcesDescriptionFile }
  }

  private async getProgramSourcesDescriptionFile(folder: WorkspaceFolder, config: DebugConfiguration): Promise<string> {
    if (config.programSourcesDescriptionFile) return config.programSourcesDescriptionFile

    const settings = vscode.workspace.getConfiguration('avmDebugger')
    const defaultSourcesFile =
      settings.get<string>('defaultSourcemapRegistryFile') || vscode.Uri.joinPath(folder.uri, DEFAULT_SOURCES_AVM_JSON_FILE).fsPath

    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(defaultSourcesFile))
      return defaultSourcesFile
    } catch {
      return defaultSourcesFile // We'll create it later if needed
    }
  }

  private async getSources(filePath: string): Promise<SourcesFile> {
    const sources = await readFileAsJson<SourcesFile>(filePath)
    if (!sources) {
      vscode.window.showWarningMessage(`Empty program sources description file at "${filePath}".`)
      return {}
    }
    return sources
  }

  private async handleMissingHashes(
    folder: WorkspaceFolder,
    missingHashes: string[],
    simulateTrace: algosdk.modelsv2.SimulateResponse,
    sources: SourcesFile,
  ): Promise<void> {
    const sourceMapFiles = await findFilesInWorkspace(folder, ['**/*.tok.map', '**/*.teal.map', '**/*.puya.map'])
    const identifiers = getSourceMapQuickPickItems(missingHashes, simulateTrace)
    const groupedSourceMaps = await this.groupSourceMapsByType(sourceMapFiles)

    for (const hash of missingHashes) {
      const selectedOption = await this.showSourceMapsQuickPick(identifiers[hash].title, groupedSourceMaps)
      if (selectedOption) {
        await this.handleMissingTmplVars(selectedOption, hash)
        this.updateSources(sources, hash, selectedOption)
      }
    }
  }

  private async handleMissingTmplVars(selectedOption: QuickPickWithUri, hash: string): Promise<void> {
    if (!selectedOption.uri) return

    const fileContent: Record<string, unknown> | undefined = await readFileAsJson(selectedOption.uri.fsPath)
    if (!fileContent) {
      vscode.window.showWarningMessage(`Invalid sourcemap file at "${selectedOption.uri.fsPath}".`)
      return
    }

    const tmplVars = fileContent['tmpl-vars'] as string[]
    if (tmplVars && Array.isArray(tmplVars)) {
      selectedOption.tmplVars = await this.showTmplVarsInputs(tmplVars, hash)
    }
  }

  private async showTmplVarsInputs(tmplVars: string[], hash: string): Promise<Record<string, number> | undefined> {
    const result: Record<string, number> = {}

    for (const variable of tmplVars) {
      const value = await vscode.window.showInputBox({
        prompt: `Enter value for template variable "${variable}"`,
        placeHolder: `Value for ${variable}`,
        title: `Template Variables for ${hash}`,
      })

      if (value === undefined) return undefined // User cancelled

      result[variable] = this.calculateByteSize(value)
    }

    return result
  }

  private calculateByteSize(input: string): number {
    // Try parsing as BigInt
    if (/^-?\d+$/.test(input)) {
      try {
        BigInt(input)
        // BigInt is always 8 bytes in AVM
        return 8
      } catch {
        // If parsing as BigInt fails, continue to other checks
      }
    }

    // Check if it's a hex-encoded string (Uint8Array)
    if (/^[0-9A-Fa-f]+$/.test(input)) {
      // Each pair of hex characters represents one byte
      return Math.ceil(input.length / 2)
    }

    // If it's not a BigInt or hex-encoded, treat it as a UTF-8 string
    return new TextEncoder().encode(input).length
  }

  private async showSourceMapsQuickPick(
    title: string,
    groupedSourceMaps: Record<string, vscode.Uri[]>,
  ): Promise<QuickPickWithUri | undefined> {
    const ignoreOption = {
      label: 'Ignore sourcemap for this hash',
      description: "Persistent choice. Reset via '> Clear AVM Registry' command.",
      iconPath: new vscode.ThemeIcon('close'),
    }

    const externalOption = {
      label: 'Browse...',
      description: 'Select external sourcemap file',
      iconPath: new vscode.ThemeIcon('folder-opened'),
    }

    const quickPickItems = [
      ...this.createCategorizedQuickPickItems(groupedSourceMaps),
      { kind: vscode.QuickPickItemKind.Separator, label: 'Other Options' },
      externalOption,
      ignoreOption,
    ]

    const selectedOption = await vscode.window.showQuickPick(quickPickItems, {
      placeHolder: 'Pick source map or choose to ignore',
      title,
      matchOnDetail: true,
    })

    if (!selectedOption) {
      return undefined
    }

    if (selectedOption.label === 'Browse...') {
      const [file] =
        (await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: { 'Sourcemap Files': ['map'] },
          title: 'Select External Sourcemap File',
        })) ?? []

      if (file) {
        return {
          label: workspaceFileAccessor.basename(file.fsPath),
          description: file.fsPath,
          iconPath: new vscode.ThemeIcon('file-code'),
          uri: file,
        }
      }
      return undefined
    }

    return selectedOption
  }

  private updateSources(sources: SourcesFile, hash: string, selectedOption: QuickPickWithUri): void {
    const isIgnoreOption = selectedOption.label.includes('Ignore')
    if (isIgnoreOption) {
      vscode.window.showInformationMessage(`Sourcemap for hash ${hash} will be ignored.`)
    }
    if (!sources['txn-group-sources']) {
      sources['txn-group-sources'] = []
    }
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (isIgnoreOption) {
      sources['txn-group-sources']?.push({
        'sourcemap-location': null,
        hash,
      })
    } else if (selectedOption.uri instanceof vscode.Uri && workspaceRoot) {
      const algoKitSourcesRoot = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), '.algokit', 'sources').fsPath
      const selectedPath = selectedOption.uri.fsPath

      // Calculate relative path from .algokit/sources to the selected file
      let relativePath = path.relative(algoKitSourcesRoot, selectedPath)
      // Ensure the path uses forward slashes
      relativePath = relativePath.replace(/\\/g, '/')

      sources['txn-group-sources']?.push({
        'sourcemap-location': relativePath,
        hash,
        tmplVars: selectedOption.tmplVars,
      })
    }
  }

  private async persistSources(folder: WorkspaceFolder, filePath: string | undefined, sources: SourcesFile): Promise<void> {
    if (!filePath) {
      const algoKitSourcesDir = vscode.Uri.joinPath(folder.uri, '.algokit', 'sources')
      const settings = vscode.workspace.getConfiguration('avmDebugger')
      const defaultSourcesFile =
        settings.get<string>('defaultSourcemapRegistryFile') || vscode.Uri.joinPath(folder.uri, DEFAULT_SOURCES_AVM_JSON_FILE).fsPath
      const newSourcesFile = vscode.Uri.file(defaultSourcesFile)

      try {
        await vscode.workspace.fs.createDirectory(algoKitSourcesDir)
      } catch {
        // Directory might already exist, ignore the error
      }

      filePath = newSourcesFile.fsPath
    }

    await writeFileAsJson(filePath, sources)
  }

  private async groupSourceMapsByType(sourceMapFiles: vscode.Uri[]): Promise<Record<string, vscode.Uri[]>> {
    const groupedSourceMaps: Record<string, vscode.Uri[]> = {
      Puya: [],
      TEAL: [],
    }

    for (const uri of sourceMapFiles) {
      const fileName = uri.fsPath.toLowerCase()
      if (fileName.endsWith('.puya.map')) {
        groupedSourceMaps['Puya'].push(uri)
      } else if (fileName.endsWith('.teal.map') || fileName.endsWith('.tok.map')) {
        groupedSourceMaps['TEAL'].push(uri)
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
            label: workspaceFileAccessor.basename(uri.fsPath),
            description: uri.fsPath,
            uri,
            iconPath: new vscode.ThemeIcon('file-code'),
          })),
        )
      }
    }

    return items
  }
}
