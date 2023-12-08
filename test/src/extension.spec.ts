import { $, browser, expect } from '@wdio/globals'
import url from 'node:url'
import path from 'path'
import { DebugToolbar, InputBox } from 'wdio-vscode-service'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

const simulateTraceFilePath = url
  .pathToFileURL(path.join(__dirname, '..', '..', 'examples', 'workspace', 'debug_traces', 'simulate-response.trace.avm.json'))
  .toString()

describe('extension', () => {
  it('should launch debug session for config with hardcoded paths', async () => {
    const configurationName = 'Debug Slot Machine'
    const workbench = await browser.getWorkbench()

    await launchDebugger(configurationName)

    const debugControls = new DebugToolbar(workbench.locatorMap)
    await debugControls.wait()
    await stepInto(debugControls)
    await stepInto(debugControls)
    await stepInto(debugControls)

    const debugInfo = await getDebugInfo()
    expect(debugInfo.sessionName).toBe(configurationName)
    expect(debugInfo.sessionType).toBe('avm')
    expect(debugInfo.openFileName).toContain('slot-machine.teal')

    await debugControls.stop()
  })

  it('should launch debug session for config with simulate trace file picker', async () => {
    const configurationName = 'Debug Anything'
    const workbench = await browser.getWorkbench()

    await launchDebugger(configurationName)

    const simulateTracePicker = new InputBox(workbench.locatorMap)
    await simulateTracePicker.wait()
    expect((await simulateTracePicker.getQuickPicks()).length).toBe(2)
    await simulateTracePicker.selectQuickPick(0)

    const debugControls = new DebugToolbar(workbench.locatorMap)
    await debugControls.wait()
    await stepInto(debugControls)
    await stepInto(debugControls)
    await stepInto(debugControls)

    const debugInfo = await getDebugInfo()
    expect(debugInfo.sessionName).toBe(configurationName)
    expect(debugInfo.sessionType).toBe('avm')
    expect(debugInfo.openFileName).toContain('slot-machine.teal')

    await debugControls.stop()
  })

  it('should launch debug session from open simulate trace file', async () => {
    const workbench = await browser.getWorkbench()

    await openFile(simulateTraceFilePath)
    await $('.codicon-debug-alt').click()

    const debugControls = new DebugToolbar(workbench.locatorMap)
    await debugControls.wait()
    await stepInto(debugControls)
    await stepInto(debugControls)
    await stepInto(debugControls)

    const debugInfo = await getDebugInfo()
    expect(debugInfo.sessionName).toBe('Debug AVM Trace File')
    expect(debugInfo.sessionType).toBe('avm')
    expect(debugInfo.openFileName).toContain('slot-machine.teal')

    await debugControls.stop()
  })
})

const launchDebugger = async (configurationName: string) => {
  await browser.executeWorkbench((vscode, configurationName) => {
    const workspaceFolder = vscode.workspace.workspaceFolders![0]
    vscode.debug.startDebugging(workspaceFolder, configurationName)
  }, configurationName)
}

const getDebugInfo = async () => {
  await browser.pause(1000)
  return await browser.executeWorkbench((vscode) => {
    const sessionName = vscode.debug.activeDebugSession!.configuration.name as string
    const sessionType = vscode.debug.activeDebugSession!.type as string
    const openFileName = vscode.window.activeTextEditor!.document.fileName as string
    vscode.commands.executeCommand('workbench.action.closeAllEditors')
    return { sessionName, sessionType, openFileName }
  })
}

const stepInto = async (toolbar: DebugToolbar) => {
  // The built-in step-into command doesn't work, as it's using the wrong selector
  const stepIntoButton = await toolbar.button$('step-into')
  await stepIntoButton.click()
}

const openFile = async (simulateTraceFilePath: string) => {
  await browser.executeWorkbench(async (vscode, simulateTraceFilePath) => {
    const path = vscode.Uri.parse(simulateTraceFilePath).path
    const doc = await vscode.workspace.openTextDocument(path)
    await vscode.window.showTextDocument(doc)
  }, simulateTraceFilePath)
}
