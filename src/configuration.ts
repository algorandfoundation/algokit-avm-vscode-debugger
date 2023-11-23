import * as path from 'path'
import * as vscode from 'vscode'
import { CancellationToken, DebugConfiguration, ProviderResult, WorkspaceFolder } from 'vscode'

export class AvmDebugConfigProvider implements vscode.DebugConfigurationProvider {
  resolveDebugConfiguration(
    _folder: WorkspaceFolder | undefined,
    config: DebugConfiguration,
    _token?: CancellationToken,
  ): ProviderResult<DebugConfiguration> {
    if (!config.simulateTraceFile) {
      vscode.window.showErrorMessage('Missing property "simulateTraceFile" in debug config')
      return null
    }

    return config
  }

  resolveDebugConfigurationWithSubstitutedVariables(
    _folder: WorkspaceFolder | undefined,
    config: DebugConfiguration,
    _token?: CancellationToken,
  ) {
    if (!config.programSourcesDescriptionFile) {
      try {
        const dirPath = path.dirname(config.simulateTraceFile)
        config.programSourcesDescriptionFile = path.join(dirPath, 'sources.json')
      } catch (e: unknown) {
        vscode.window.showErrorMessage(`Could not resolve "simulateTraceFile" in path ${config.simulateTraceFile}`)
      }
    }

    return config
  }
}
