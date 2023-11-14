# TEAL Debug Adapter for VS Code

## Summary

This repo contains a TEAL debugger which adheres to the [Debug Adapter Protocol](https://microsoft.github.io/debug-adapter-protocol/).
This protocol is used by a variety of clients, and this repo specifically
implements a client for VS Code.

Unlike traditional debuggers, which typically execute code as it is being
debugged, this debugger operates on an execution trace. The trace is created by
the [algod simulate API](https://developer.algorand.org/docs/rest-apis/algod/#post-v2transactionssimulate).
This debugger is not responsible for compiling programs, assembling transaction groups, or executing
transactions/programs. It is only responsible for debugging the execution trace, which must already
exist.

This code is based on the [`vscode-mock-debug`](https://github.com/microsoft/vscode-mock-debug) repo.

<!--## Using the VS Code Extension

* Install the **TEAL Debug** extension in VS Code.
* Create a new 'program' file `readme.md` and enter several lines of arbitrary text.
* Switch to the debug viewlet and press the gear dropdown.
* Select the debug environment "Mock Debug".
* Press the green 'play' button to start debugging.

You can now 'step through' the `readme.md` file, set and hit breakpoints, and run into exceptions (if the word exception appears in a line).
-->

## Build and Run

1. Clone the repo.
2. Open the project folder in VS Code.
3. Press `F5` to build and launch TEAL Debug in another VS Code window.
4. In the explorer view of the new window open the file `stack-scratch.teal`
5. Set some breakpoints
6. From the editor's "Run and Debug" toolbar dropdown menu select "Debug File"
