import { browser, expect } from '@wdio/globals'
import { DebugToolbar, InputBox } from 'wdio-vscode-service'

describe('VS Code Extension Testing', () => {
  it('should be able to load VSCode 1', async () => {
    const configurationName = 'Debug Slot Machine'
    const workbench = await browser.getWorkbench()

    // await wait(4000)
    // const notifs = await workbench.getNotifications()
    // await Promise.all(notifs.map((n) => n.dismiss()))

    const title = await workbench.getTitleBar().getTitle()
    expect(title).toContain('[Extension Development Host]')

    await browser.executeWorkbench((vscode, configurationName) => {
      const workspaceFolder = vscode.workspace.workspaceFolders![0]
      console.log('>>> workspaceFolder', workspaceFolder)
      console.log('>>> configurationName', configurationName)

      const resss = vscode.debug.startDebugging(workspaceFolder, configurationName)
      console.log('>>> debug started', resss)
    }, configurationName)

    const debugControls = new DebugToolbar(workbench.locatorMap)
    await debugControls.wait()
    await (await debugControls.button$('step-into')).click()
    await (await debugControls.button$('step-into')).click()
    await (await debugControls.button$('step-into')).click()

    await browser.pause(1000)
    const result = await browser.executeWorkbench((vscode) => {
      const sessionName = vscode.debug.activeDebugSession!.configuration.name as string
      const sessionType = vscode.debug.activeDebugSession!.type as string
      const openFileName = vscode.window.activeTextEditor!.document.fileName as string
      vscode.commands.executeCommand('workbench.action.closeActiveEditor')
      return { sessionName, sessionType, openFileName }
    })

    expect(result.sessionName).toBe(configurationName)
    expect(result.sessionType).toBe('avm')
    expect(result.openFileName).toContain('/.algokit/sources/slot-machine/slot-machine.teal')

    await debugControls.stop()
  })

  it('should be able to load VSCode 2', async () => {
    const configurationName = 'Debug Anything'
    const workbench = await browser.getWorkbench()

    // await wait(4000)
    // const notifs = await workbench.getNotifications()
    // await Promise.all(notifs.map((n) => n.dismiss()))

    const title = await workbench.getTitleBar().getTitle()
    expect(title).toContain('[Extension Development Host]')

    await browser.executeWorkbench((vscode, configurationName) => {
      const workspaceFolder = vscode.workspace.workspaceFolders![0]
      console.log('>>> workspaceFolder', workspaceFolder)
      console.log('>>> configurationName', configurationName)

      const resss = vscode.debug.startDebugging(workspaceFolder, configurationName)
      console.log('>>> debug started', resss)
    }, configurationName)

    // const myInput = (await $('.quick-input-widget')) as unknown as InputBox
    // await myInput.wait()
    // await myInput.selectQuickPick(0)
    // const item = await myInput.findQuickPick(0)
    // await item!.select()

    const simulateTracePicker = new InputBox(workbench.locatorMap)
    await simulateTracePicker.wait()
    await simulateTracePicker.selectQuickPick(0)

    const debugControls = new DebugToolbar(workbench.locatorMap)
    await debugControls.wait()
    await (await debugControls.button$('step-into')).click()
    await (await debugControls.button$('step-into')).click()
    await (await debugControls.button$('step-into')).click()

    // const ev = new EditorView(workbench.locatorMap)
    // await ev
    // const active = await ev.getActiveTab()
    // const test = await active.getTitle()

    // const activeTextEditor = new TextEditor(workbench.locatorMap)
    // await activeTextEditor.wait()
    // const openFileName = await activeTextEditor.getFilePath()

    await browser.pause(1000)
    const result = await browser.executeWorkbench((vscode) => {
      const sessionName = vscode.debug.activeDebugSession!.configuration.name as string
      const sessionType = vscode.debug.activeDebugSession!.type as string
      const openFileName = vscode.window.activeTextEditor!.document.fileName as string
      vscode.commands.executeCommand('workbench.action.closeActiveEditor')
      return { sessionName, sessionType, openFileName }
    })

    expect(result.sessionName).toBe(configurationName)
    expect(result.sessionType).toBe('avm')
    expect(result.openFileName).toContain('/.algokit/sources/slot-machine/slot-machine.teal')

    await debugControls.stop()
  })
})
