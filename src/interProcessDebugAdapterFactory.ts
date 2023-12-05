import * as vscode from 'vscode'

export class InterProcessDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
  port: number

  constructor(port: number) {
    this.port = port
  }

  createDebugAdapterDescriptor(
    _session: vscode.DebugSession,
    _executable: vscode.DebugAdapterExecutable | undefined,
  ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    return new vscode.DebugAdapterServer(this.port)
  }
}
