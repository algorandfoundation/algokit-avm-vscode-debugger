import { FileAccessor } from '@algorandfoundation/algokit-avm-debugger'
import * as vscode from 'vscode'

export const workspaceFileAccessor: FileAccessor = {
  isWindows: typeof process !== 'undefined' && process.platform === 'win32',
  readFile(path: string): Promise<Uint8Array> {
    const uri = vscode.Uri.file(path)
    return thenableToPromise(vscode.workspace.fs.readFile(uri))
  },
  writeFile(path: string, contents: Uint8Array): Promise<void> {
    const uri = vscode.Uri.file(path)
    return thenableToPromise(vscode.workspace.fs.writeFile(uri, contents))
  },
  basename(path: string): string {
    const uri = vscode.Uri.file(path)
    const lastSlash = uri.path.lastIndexOf('/')
    if (lastSlash === -1) {
      return path
    }
    return uri.path.substring(lastSlash + 1)
  },
  filePathRelativeTo(base: string, filePath: string): string {
    // Check if filePath is an absolute path
    if (this.isWindows) {
      if (filePath.match(/^[a-zA-Z]:[\\/]/)) {
        return filePath
      }
    } else {
      if (filePath.startsWith('/')) {
        return filePath
      }
    }

    // Create a Uri object with the base path
    let baseUri = vscode.Uri.file(base)
    if (!baseUri.path.endsWith('/')) {
      // If the base path is not a directory, get its parent directory
      baseUri = vscode.Uri.joinPath(baseUri, '..')
    }

    // Resolve the file path against the base Uri
    const fullUri = vscode.Uri.joinPath(baseUri, filePath)

    return fullUri.fsPath
  },
}

function thenableToPromise<T>(t: Thenable<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    t.then(resolve, reject)
  })
}
