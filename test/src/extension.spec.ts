import { $, browser, expect } from '@wdio/globals'
import fs from 'fs'
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
    const workspacePath = await browser.executeWorkbench(async (vscode) => {
      return vscode.workspace.workspaceFolders![0].uri.fsPath
    })
    const sourcesFilePath = path.join(workspacePath, '.algokit', 'sources', 'sources.avm.json')
    await presetSourcesContent(sourcesFilePath, {
      'txn-group-sources': [
        {
          'sourcemap-location': './slot-machine/fake-random.teal.tok.map',
          hash: '88rrCGDJdARk4rasK5FN8BzmKTqHW5WRzYiRWmtA7HY=',
        },
        {
          'sourcemap-location': null,
          hash: 'nN5LNX4rlRXfN0ax9hH0TsYh1XDhOSLnANPnrWSdATw=',
        },
      ],
    })

    await launchDebugger(configurationName)

    const simulateTracePicker = new InputBox(workbench.locatorMap)
    await simulateTracePicker.wait()
    const traceFiles = await simulateTracePicker.getQuickPicks()
    await traceFiles[0].wait()
    await traceFiles[0].select()

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
    const workspacePath = await browser.executeWorkbench(async (vscode) => {
      return vscode.workspace.workspaceFolders![0].uri.fsPath
    })
    const sourcesFilePath = path.join(workspacePath, '.algokit', 'sources', 'sources.avm.json')

    await presetSourcesContent(sourcesFilePath, {
      'txn-group-sources': [
        {
          'sourcemap-location': './slot-machine/fake-random.teal.tok.map',
          hash: '88rrCGDJdARk4rasK5FN8BzmKTqHW5WRzYiRWmtA7HY=',
        },
        {
          'sourcemap-location': null,
          hash: 'nN5LNX4rlRXfN0ax9hH0TsYh1XDhOSLnANPnrWSdATw=',
        },
      ],
    })

    const configurationName = 'Debug Anything'
    const workbench = await browser.getWorkbench()

    await launchDebugger(configurationName)

    const simulateTracePicker = new InputBox(workbench.locatorMap)
    await simulateTracePicker.wait()
    const traceFiles = await simulateTracePicker.getQuickPicks()
    const traceFileLabels = await Promise.all(traceFiles.map((file) => file.getLabel()))
    expect(traceFileLabels).toContain('debug_traces/simulate-response.trace.avm.json')
    expect(traceFileLabels).toContain('debug_traces/simulate-response-2.trace.avm.json')
    expect(traceFileLabels).toContain('Browse...')
    await traceFiles[0].wait()
    await traceFiles[0].select()

    const sourceMapPicker = new InputBox(workbench.locatorMap)
    await sourceMapPicker.wait()
    const categories = await sourceMapPicker.getQuickPicks()
    const categoryLabels = await Promise.all(categories.map((category) => category.getLabel()))
    expect(categoryLabels).toContain('slot-machine.teal.tok.map')
    expect(categoryLabels).toContain('random-byte.teal.tok.map')
    expect(categoryLabels).toContain('fake-random.teal.tok.map')
    expect(categoryLabels).toContain('Browse...')
    expect(categoryLabels).toContain('Ignore sourcemap for this hash')

    await categories[0].wait()
    await categories[0].select()

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

const presetSourcesContent = async (filePath: string, content: object) => {
  try {
    await fs.promises.writeFile(filePath, JSON.stringify(content))
  } catch (error) {
    console.error(`Failed to preset sources content: ${error}`)
  }
}
