import { assert } from 'chai'
import * as vscode from 'vscode'

suite('extension', () => {
  test('debugs a hardcoded configuration', async () => {
    const configurationName = 'Debug Slot Machine'
    await vscode.debug.startDebugging(vscode.workspace.workspaceFolders![0], configurationName)
    await vscode.commands.executeCommand('workbench.action.debug.stepInto')
    await vscode.commands.executeCommand('workbench.action.debug.stepInto')
    await vscode.commands.executeCommand('workbench.action.debug.stepInto')

    // await vscode.window.
    await sleep(1000)

    assert.strictEqual(vscode.debug.activeDebugSession!.configuration.name, configurationName)
    assert.strictEqual(vscode.debug.activeDebugSession!.type, 'avm')
    assert.isOk(
      vscode.window.activeTextEditor!.document.fileName.endsWith('/.algokit/sources/slot-machine/slot-machine.teal'),
      'active text editor contains slot-machine.teal file',
    )
  })
})

const sleep = (timeout: number) => new Promise((resolve) => setTimeout(resolve, timeout))
