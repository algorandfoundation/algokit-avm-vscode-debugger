import { browser, expect } from '@wdio/globals'
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
    const configurationName = 'Debug Puya App'
    const workbench = await browser.getWorkbench()
    const workspacePath = await browser.executeWorkbench(async (vscode) => {
      return vscode.workspace.workspaceFolders![0].uri.fsPath
    })
    const sourcesFilePath = path.join(workspacePath, '.algokit', 'sources', 'sources.avm.json')
    await presetSourcesContent(sourcesFilePath, {
      'txn-group-sources': [
        {
          'sourcemap-location': './first_teal_app/approval.teal.tok.map',
          hash: 'bFjB/jPb8ImVYeAJQIL9lTAtu14+4yet0z5LUMnh1Zk=',
        },
        {
          'sourcemap-location': './second_puya_app/contract_approval.puya.map',
          hash: 'DbbtDBEqmyLCjAn3yXEp708hrhHkanuMuZ+039KLp/s=',
        },
        {
          'sourcemap-location': './delegated_puya_lsig/lsig.puya.map',
          hash: 'cFlJEhm1xu42Dpnqg93nIzNIyY6E2H+uSeVXOv7O6Sk=',
        },
        {
          'sourcemap-location': './third_puyats_app/contract_approval.puya.map',
          hash: 'q7Vsqme7lK4RlmnIlh8Fplo6kDtrFKwuYsOGZz1dKlM=',
        },
      ],
    })

    await launchDebugger(configurationName)

    const debugControls = new DebugToolbar(workbench.locatorMap)
    await debugControls.wait()

    const expectedStops = [
      {
        fileName: 'transaction-group-0.json',
        step: 1,
      },
      {
        fileName: 'lsig.py',
        step: 2,
      },
      {
        fileName: 'transaction-group-0.json',
        step: 9,
      },
      {
        fileName: 'approval.teal',
        step: 10,
      },
      {
        fileName: 'inner-transaction-group-0-0.json',
        step: 55,
      },
      {
        fileName: 'contract.py',
        step: 60,
      },
      {
        fileName: 'contract.ts',
        step: 72,
      },
    ]

    let iteration = 0
    for (const expectedStop of expectedStops) {
      while (iteration < expectedStop.step) {
        await stepInto(debugControls)
        iteration++
      }
      const debugInfo = await getDebugInfo()
      expect(debugInfo.openFileName).toContain(expectedStop.fileName)
    }

    await debugControls.stop()
  })

  it('should launch debug session for config with simulate trace file picker', async () => {
    const workspacePath = await browser.executeWorkbench(async (vscode) => {
      return vscode.workspace.workspaceFolders![0].uri.fsPath
    })
    const sourcesFilePath = path.join(workspacePath, '.algokit', 'sources', 'sources.avm.json')

    await presetSourcesContent(sourcesFilePath, {})

    const configurationName = 'Debug Anything'
    const workbench = await browser.getWorkbench()

    await launchDebugger(configurationName)

    const simulateTracePicker = new InputBox(workbench.locatorMap)
    await simulateTracePicker.wait()
    const traceFiles = await simulateTracePicker.getQuickPicks()
    const traceFileLabels = await Promise.all(traceFiles.map((file) => file.getLabel()))
    expect(traceFileLabels).toContain('debug_traces/simulate-response.trace.avm.json')
    expect(traceFileLabels).toContain('Browse...')
    await traceFiles[0].wait()
    await traceFiles[0].select()

    const sourceMapPicker = new InputBox(workbench.locatorMap)
    await sourceMapPicker.wait()
    const categories = await sourceMapPicker.getQuickPicks()
    const categoryLabels = await Promise.all(categories.map((category) => category.getLabel()))
    expect(categoryLabels).toContain('contract_approval.puya.map')
    expect(categoryLabels).toContain('lsig.puya.map')
    expect(categoryLabels).toContain('clear.teal.tok.map')
    expect(categoryLabels).toContain('approval.teal.tok.map')
    expect(categoryLabels).toContain('Browse...')
    expect(categoryLabels).toContain('Ignore sourcemap for this hash')

    await categories[4].wait()
    await categories[4].select()

    await categories[2].wait()
    await categories[2].select()

    await categories[1].wait()
    await categories[1].select()

    await categories[0].wait()
    await categories[0].select()

    const debugControls = new DebugToolbar(workbench.locatorMap)
    await debugControls.wait()
    for (let i = 0; i < 72; i++) {
      await stepInto(debugControls)
    }

    const debugInfo = await getDebugInfo()
    expect(debugInfo.sessionName).toBe(configurationName)
    expect(debugInfo.sessionType).toBe('avm')
    expect(debugInfo.openFileName).toContain('contract.ts')

    await debugControls.stop()
  })

  it('should launch debug session from open simulate trace file', async () => {
    const workbench = await browser.getWorkbench()

    await openFile(simulateTraceFilePath)

    await $('.codicon-debug-alt').waitForClickable()
    await $('.codicon-debug-alt').click()

    const debugControls = new DebugToolbar(workbench.locatorMap)
    await debugControls.wait()
    for (let i = 0; i < 72; i++) {
      await stepInto(debugControls)
    }

    const debugInfo = await getDebugInfo()
    expect(debugInfo.sessionName).toBe('Debug AVM Trace File')
    expect(debugInfo.sessionType).toBe('avm')
    expect(debugInfo.openFileName).toContain('contract.ts')

    await debugControls.stop()
  })
})

const launchDebugger = async (configurationName: string) => {
  await new Promise((resolve) => setTimeout(resolve, 2000))
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
  await stepIntoButton.waitForClickable()
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
