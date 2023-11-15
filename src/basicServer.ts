import * as Net from 'net';
import { AvmDebugSession } from './debugSession';
import { FileAccessor } from './fileAccessor';

export class BasicServer {
  private server: Net.Server;

  constructor(fileAccessor: FileAccessor) {
    this.server = Net.createServer((socket) => {
      const session = new AvmDebugSession(fileAccessor);
      session.setRunAsServer(true);
      session.start(socket as NodeJS.ReadableStream, socket);
      socket.on('error', (err) => {
        throw err;
      });
    }).listen(0);
    this.server.on('error', (err) => {
      throw err;
    });
  }

  port(): number {
    return (this.server.address() as Net.AddressInfo).port;
  }

  dispose() {
    if (this.server) {
      this.server.close();
    }
  }
}
