import { orderBy } from 'lodash'
import * as vscode from 'vscode'
import { workspaceFileAccessor } from './fileAccessor'

export const findFilesInWorkspace = async (folder: vscode.WorkspaceFolder, filePattern: string) => {
  const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, filePattern), '**/node_modules/**')
  return orderBy(files, ['fsPath'], ['desc'])
}

export const getFilePathRelativeToClosestWorkspace = (folder: vscode.WorkspaceFolder) => (fileUri: vscode.Uri) => {
  // In a multi-root workspace, a file can exist in both a parent and child workspace folder.
  // When this happens we want to include the workspace folder name in the path.
  const workspaceFolderClosetToFile = vscode.workspace.getWorkspaceFolder(fileUri) ?? folder
  const includeWorkspaceFolder = folder.index !== workspaceFolderClosetToFile.index
  return vscode.workspace.asRelativePath(fileUri, includeWorkspaceFolder)
}

export const workspaceFolderFromPath = (path: string) => {
  // The debugger can't be started without a workspace folder, so this should never be undefined.
  return vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(path))!
}

export const readFileAsJson = async <T>(fsPath: string) => {
  try {
    const bytes = await workspaceFileAccessor.readFile(fsPath)
    return JSON.parse(new TextDecoder().decode(bytes)) as T
  } catch (_e) {
    return undefined
  }
}

export const bytesToBase64 = (bytes?: Uint8Array) => (bytes ? Buffer.from(bytes).toString('base64') : undefined)

export const concatIfTruthy = <T>(array: T[], items: Array<T | undefined>) => {
  const truthyItems = items.filter((item): item is T => !!item)
  return truthyItems.length > 0 ? array.concat(truthyItems) : array
}
