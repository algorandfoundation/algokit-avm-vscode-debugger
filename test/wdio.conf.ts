import type { Options } from '@wdio/types'
import path from 'path'
import url from 'url'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

export const config: Options.Testrunner = {
  runner: 'local',
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      project: 'test/tsconfig.json',
      transpileOnly: true,
    },
  },
  specs: ['./**/*.spec.ts'],
  maxInstances: 1,
  capabilities: [
    {
      browserName: 'vscode',
      browserVersion: 'stable', // also possible: "insiders" or a specific version e.g. "1.80.0"
      'wdio:vscodeOptions': {
        extensionPath: path.join(__dirname, '..'),
        workspacePath: path.join(__dirname, '..', 'examples', 'workspace'),
      },
    },
  ],
  logLevel: 'warn',
  bail: 0,
  baseUrl: '',
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  services: ['vscode'],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 30000,
  },
}
