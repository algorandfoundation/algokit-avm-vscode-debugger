import { defineConfig } from '@vscode/test-cli'

export default defineConfig({
  files: 'test-dist/**/*.spec.js',
  workspaceFolder: './examples/workspace',
  mocha: {
    ui: 'tdd',
    timeout: 5000,
  },
})
