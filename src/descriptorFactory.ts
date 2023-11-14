'use strict';

import * as Net from 'net';
import * as vscode from 'vscode';
import { ProviderResult } from 'vscode';
import { AvmDebugSession } from './debugAdapter/debugRequestHandlers';
import { workspaceFileAccessor } from './fileAccessor';

export interface TEALDebugAdapterDescriptorFactory
  extends vscode.DebugAdapterDescriptorFactory {
  dispose();
}

export class TEALDebugAdapterExecutableFactory
  implements TEALDebugAdapterDescriptorFactory
{
  createDebugAdapterDescriptor(
    _session: vscode.DebugSession,
    executable: vscode.DebugAdapterExecutable | undefined,
  ): ProviderResult<vscode.DebugAdapterDescriptor> {
    // param "executable" contains the executable optionally specified in the package.json (if any)

    // use the executable specified in the package.json if it exists or determine it based on some other information (e.g. the session)

    // TODO: IMPLEMENT HERE
    if (!executable) {
      const command = 'absolute path to my DA executable';
      const args = ['some args', 'another arg'];
      const options = {
        cwd: 'working directory for executable',
        env: { envVariable: 'some value' },
      };
      executable = new vscode.DebugAdapterExecutable(command, args, options);
    }

    // make VS Code launch the DA executable
    return executable;
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  dispose() {}
}

export class TEALDebugAdapterServerDescriptorFactory
  implements TEALDebugAdapterDescriptorFactory
{
  private server?: Net.Server;

  async createDebugAdapterDescriptor(
    _session: vscode.DebugSession,
    _executable: vscode.DebugAdapterExecutable | undefined,
  ): Promise<vscode.DebugAdapterDescriptor> {
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
