<div align="center">
<a href="https://github.com/algorandfoundation/algokit-avm-vscode-debugger"><img src="https://bafkreidtmbarmzvewlbrsz7lwwusi276lvltp6xqxvatce32ch3zc4f7eq.ipfs.nftstorage.link/" width=60%></a>
</div>

<p align="center">
    <a target="_blank" href="https://github.com/algorandfoundation/algokit-avm-vscode-debugger/blob/main/docs/algokit.md"><img src="https://img.shields.io/badge/docs-repository-00dc94?logo=github&style=flat.svg" /></a>
    <a target="_blank" href="https://developer.algorand.org/algokit/"><img src="https://img.shields.io/badge/learn-AlgoKit-00dc94?logo=algorand&mac=flat.svg" /></a>
    <a target="_blank" href="https://developer.algorand.org/algokit/"><img src="https://img.shields.io/badge/download-Extension-00dc94?logo=visualstudiocode&mac=flat.svg" /></a>
    <br />
    <a target="_blank" href="https://github.com/algorandfoundation/algokit-avm-vscode-debugger"><img src="https://img.shields.io/github/stars/algorandfoundation/algokit-avm-vscode-debugger?color=00dc94&logo=star&style=flat" /></a>
    <a target="_blank" href="https://developer.algorand.org/algokit/"><img  src="https://vbr.wocr.tk/badge?page_id=algorandfoundation%2Falgokit-avm-vscode-debugger&color=%2300dc94&style=flat" /></a>
</p>

---

AlgoKit AVM VS Code Debugger extension provides a convenient way to debug any Algorand Smart Contracts written in TEAL. It is built on top of the official [AVM Debug Adapter](https://github.com/algorand/avm-debugger) provided by [Algorand Technologies](https://www.algorand.com/). Additionally, a set of companion utilities are provided in [TypeScript](https://github.com/algorandfoundation/algokit-utils-ts/blob/main/docs/capabilities/debugging.md) and [Python](https://github.com/algorandfoundation/algokit-utils-py/blob/main/docs/source/capabilities/debugging.md) version of `algokit-utils`, making it easier for developers to setup required pre-requisites and run the debugger.

> To skip straight to the list of features, go to [Features](#features).

## Getting Started

### Prerequisites

Before you can use the AVM Debugger extension, you need to ensure that you have the following installed:

- [Visual Studio Code](https://code.visualstudio.com/download): Version 1.80.0 or higher. You can check your version by going to `Help > About` in VS Code.
- [Node.js](https://nodejs.org/en/download/): Version 18.x or higher, the extension is built with Node.js. Check your Node.js version by running `node -v` in your terminal/command prompt.

### Installation

#### Via VS Code Marketplace

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=algorandfoundation.algokit-avm-debugger). {TODO: TWEAK URL}
2. Follow next steps in [Usage](#usage) section.

#### For Development

To install the extension for development, follow these steps:

1. Clone the repository:
   ```
   git clone https://github.com/MakerXStudio/algokit-vscode-debugger.git
   ```
2. Navigate into the cloned repository:
   ```
   cd algokit-vscode-debugger
   ```
3. Install the dependencies:
   ```
   npm install
   ```
4. Build the extension:
   ```
   npm run build
   ```
5. Open the repository in VS Code and install `.vsix` artifact.
6. Follow next steps in [Usage](#usage) section.

### Usage

In order to use the AVM Debugger extension you need:
1. TEAL Source Maps. A `.json` file that maps the compiled TEAL source maps to the original source code. See example [here](./examples/multiRootWorkspace/slot-machine/.algokit/sources/sources.avm.json).
2. Simulate Traces. A `.json` file that contains the traces obtained from algod's [`simulate` endpoint](https://developer.algorand.org/docs/get-details/dapps/smart-contracts/debugging/?from_query=simulate#simulate). Serves as an entrypoint for the debugger. See example [here](./examples/multiRootWorkspace/slot-machine/debug_traces/simulate-response.trace.avm.json).

#### a. With `algokit-utils` from an `algokit init` generated project (recommended)

If you are aiming to debug TEAL code in a project generated via [`algokit init`](https://github.com/algorandfoundation/algokit-cli/blob/main/docs/features/init.md) follow the steps below:

```py
# Place this code in a project entrypoint (e.g. main.py)
from algokit_utils.config import config
config.configure(debug=True, trace_all=True)
```

```ts
// Place this code in a project entrypoint (e.g. index.ts)
import { config } from 'algokit-utils-ts';
config.configure({ debug: true, traceAll: true });
```

#### b. With `algokit-utils` in a custom project

Alternatively if you are using `algokit-utils` in a project that is not generated via `algokit init` refer to the set of following utilities:

- [`algokit-utils-py`](https://github.com/algorandfoundation/algokit-utils-py/blob/feat/debugger-support/docs/source/capabilities/debugging.md#debugging-utilities)
- [`algokit-utils-ts`](https://github.com/algorandfoundation/algokit-utils-ts/blob/feat/debugger-support/docs/capabilities/debugging.md#debugging-utilities).

Depending on the language you are using, you can use the following utilities to generate `source maps` for your TEAL as well as debug `traces` obtained from algod's `simulate` endpoint (which is also an entrypoint for this debugger extension). Additionally, you can use the utilities as a reference to implement your own utilities in other languages or if you aim obtaining the source maps and traces without `algokit-utils`.


## Features

This document outlines the features supported by the AVM debugger. Screenshots and features are based on the VS Code client.

Feature | Description | Screenshot
--- | --- | ---
View transaction groups | Every execution starts with a top level transaction group. | ![A transaction group being debugged](images/transaction%20group.png)
Step into programs | LogicSig and application programs associated with transactions can be stepped into. Source maps show the original source code. | ![A program being debugged](images/app%20call.png)
Step into inner transactions | The debugger can step into inner transactions spawned by an application. The entire call stack can be seen and inspected. | ![An inner transaction group being debugged](images/inner%20transaction%20group.png)
Step-by-step debugging | Supports step into, over, out, and back. |
Breakpoint support | Breakpoints can be set in program source files. The debugger pauses when code corresponding to a breakpoint is about to be executed. | ![Breakpoints in program code](images/breakpoints.png)
Error reporting | Execution errors are reported by the debugger. The debugger will not allow you to advance after an error, but you can step backwards to inspect what happened prior to the error. | ![An error in the debugger](images/error.png)
Inspect program state | The debugger allows inspection of the state of the program being debugged, including the PC (program counter), stack, and scratch space. Byte arrays can be displayed in various formats. | ![Inspecting program state](images/program%20state%20variables.png)
Watch values | Specific values can be added to the watch list. Negative indexing is supported to look up values relative to the top of the stack. | ![Watched values](images/watch%20values.png)
Inspect application state | The debugger allows inspection and watching of any available application state from the execution. | ![Inspecting application state variables](images/app%20state%20variables%20expanded.png)

## Contact

If you have any issues or feature requests, please [open an issue](https://github.com/algorandfoundation/algokit-avm-vscode-debugger/issues/new).
