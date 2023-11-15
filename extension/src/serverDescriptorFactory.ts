'use strict';

import * as Net from 'net';
import * as vscode from 'vscode';
import { ProviderResult } from 'vscode';
import { AvmDebugSession } from '../../src';
import { workspaceFileAccessor } from './fileAccessor';

export class ServerDebugAdapterFactory
  implements vscode.DebugAdapterDescriptorFactory
{
  private server?: Net.Server;

  createDebugAdapterDescriptor(
    _session: vscode.DebugSession,
    _executable: vscode.DebugAdapterExecutable | undefined,
  ): ProviderResult<vscode.DebugAdapterDescriptor> {
    if (!this.server) {
      this.server = Net.createServer((socket) => {
        const session = new AvmDebugSession(workspaceFileAccessor);
        session.setRunAsServer(true);
        session.start(socket as NodeJS.ReadableStream, socket);
      }).listen(0);
    }

    return new vscode.DebugAdapterServer(
      (this.server.address() as Net.AddressInfo).port,
    );
  }

  dispose() {
    if (this.server) {
      this.server.close();
    }
  }
}
