'use strict';

import * as vscode from 'vscode';
import { FileAccessor } from '../../src';

export const workspaceFileAccessor: FileAccessor = {
  isWindows: typeof process !== 'undefined' && process.platform === 'win32',
  readFile(path: string): Promise<Uint8Array> {
    const uri = pathToUri(path);
    return thenableToPromise(vscode.workspace.fs.readFile(uri));
  },
  writeFile(path: string, contents: Uint8Array): Promise<void> {
    const uri = pathToUri(path);
    return thenableToPromise(vscode.workspace.fs.writeFile(uri, contents));
  },
  basename(path: string): string {
    const uri = pathToUri(path);
    const lastSlash = uri.path.lastIndexOf('/');
    if (lastSlash === -1) {
      return path;
    }
    return uri.path.substring(lastSlash + 1);
  },
};

function pathToUri(path: string) {
  try {
    return vscode.Uri.file(path);
  } catch (e) {
    return vscode.Uri.parse(path, true);
  }
}

function thenableToPromise<T>(t: Thenable<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    t.then(resolve, reject);
  });
}
