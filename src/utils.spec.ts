import fs from 'fs/promises'
import path from 'path'
import { describe, expect, it, vi } from 'vitest'
import { getSimulateTrace } from './utils'

vi.mock('vscode', () => {
  return {
    Uri: {
      parse: vi.fn((path) => ({ path })),
    },
    window: {
      showErrorMessage: vi.fn(),
    },
    workspace: {
      getWorkspaceFolder: vi.fn(),
    },
  }
})

vi.mock('./fileAccessor', () => ({
  workspaceFileAccessor: {
    readFile: async (filePath: string) => {
      const content = await fs.readFile(filePath, 'utf-8')
      return new TextEncoder().encode(content)
    },
  },
}))

describe('Should successfully parse algosdk v2 simulate traces', () => {
  it.each([
    ['app-state-changes/debug_traces/box-simulate-response.trace.avm.json'],
    ['app-state-changes/debug_traces/global-simulate-response.trace.avm.json'],
    ['app-state-changes/debug_traces/local-simulate-response.trace.avm.json'],
    ['puya/debug_traces/simulate-response.trace.avm.json'],
    ['puya_and_teal/debug_traces/simulate-response.trace.avm.json'],
    ['recursive-app/debug_traces/simulate-response.trace.avm.json'],
    ['slot-machine/debug_traces/simulate-response.trace.avm.json'],
    ['sourcemap-test/debug_traces/simulate-response.trace.avm.json'],
    ['stepping-test/debug_traces/simulate-response.trace.avm.json'],
    ['errors/debug_traces/app.trace.avm.json'],
    ['errors/debug_traces/app-from-logicsig.trace.avm.json'],
    ['errors/debug_traces/inner-app-overspend.trace.avm.json'],
  ])('should successfully parse simulate trace from %s', async (filePath) => {
    // Setup
    const fullPath = path.join(__dirname, '..', 'examples', 'multiRootWorkspace', filePath)

    // Execute
    const result = await getSimulateTrace(fullPath)

    // Assert
    expect(result).toBeTruthy()
    expect(result?.version).toBe(2)
    expect(result?.txnGroups).toBeDefined()
    expect(Array.isArray(result?.txnGroups)).toBe(true)
    expect(result?.txnGroups.length).toBeGreaterThan(0)
    expect(result?.execTraceConfig).toBeDefined()
  })
})
