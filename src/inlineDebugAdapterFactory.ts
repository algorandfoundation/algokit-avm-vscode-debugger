import { AvmDebugSession } from '@algorandfoundation/algokit-avm-debugger'
import * as vscode from 'vscode'
import { ProviderResult } from 'vscode'
import { workspaceFileAccessor } from './fileAccessor'

export class InlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
  createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<vscode.DebugAdapterDescriptor> {
    return new vscode.DebugAdapterInlineImplementation(new AvmDebugSession(workspaceFileAccessor))
  }
}
