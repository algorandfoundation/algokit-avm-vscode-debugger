# AlgoKit AVM Visual Studio Code Debugger Extension for Contributors

## Setup

### Initial Setup

1. Clone this repository.
1. Run `npm i` to install the dependencies.
1. Open the repository root in VS Code.
1. Install recommended extensions.

### Run/Debug the AVM Debugger Extension

1. Run either the "Launch in workspace" or "Launch in multi-root workspace" configurations via the "Run and Debug" pane.
1. A new "Extension Development Host" VS Code instance will be launched. If launching the multi-root workspace, then reload this VS Code instance as a workspace.
1. Initiate an AVM debug session using the configurations in the "Run and Debug" pane inside the "Extension Development Host" VS Code instance.

### Create and Install a Test Extension Package

1. Run `npm run build`.
1. Run `npm run package` to produce a `.vsix` package in the project root.
1. Open a repository containing artefacts you'd like to debug in VS Code and install the `.vsix` package.
1. Follow the steps in the [Readme Usage section](./README.md#usage) section.

### Debug the AVM Debug Adapter and Debugger

1. Uncomment `"avmDebugger.debugAdapter.port": 4711` in `settings.json` and `sample.code-workspace` located in the example workspaces in this repository.
1. Clone the [avm-debugger](https://github.com/algorand/avm-debugger).
1. Run `npm i` inside the `avm-debugger` repository to install the dependencies.
1. Open the `avm-debugger` repository root in VS Code.
1. Run the "Server" configuration via the "Run and Debug" pane, which starts the debug adapter on port 4711.
1. Run the steps in [Run/Debug the AVM Debugger Extension](#rundebug-the-avm-debugger-extension).

## Commits

We are using the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/#summary) standard for commit messages. This allows us to automatically generate release notes and version numbers. We do this via [Semantic Release](https://semantic-release.gitbook.io/semantic-release/) and [GitHub actions](.github/workflows/cd.yaml).
