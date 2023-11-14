'use strict';

import * as vscode from 'vscode';
import {
  WorkspaceFolder,
  DebugConfiguration,
  ProviderResult,
  CancellationToken,
} from 'vscode';

export class TealDebugConfigProvider
  implements vscode.DebugConfigurationProvider
{
  /**
   * Massage a debug configuration just before a debug session is being launched,
   * e.g. add all missing attributes to the debug configuration.
   */
  resolveDebugConfiguration(
    _folder: WorkspaceFolder | undefined,
    config: DebugConfiguration,
    _token?: CancellationToken,
  ): ProviderResult<DebugConfiguration> {
    // Check necessary part, we do need these 2 files for debug
    if (!config.simulateTraceFile) {
      vscode.window.showErrorMessage(
        'Missing property "simulateTraceFile" in debug config',
      );
      return null;
    }

    if (!config.programSourcesDescriptionFile) {
      vscode.window.showErrorMessage(
        'Missing property "programSourcesDescriptionFile" in debug config',
      );
      return null;
    }

    return config;
  }
}
