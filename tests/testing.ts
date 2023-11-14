import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs/promises';
import { DebugClient } from './client';
import { BasicServer } from '../src/debugAdapter/basicServer';
import { FileAccessor, ByteArrayMap } from '../src/debugAdapter/utils';

export const PROJECT_ROOT = path.join(__dirname, '../');
const DEBUG_CLIENT_PATH = path.join(
  PROJECT_ROOT,
  'out/src/debugAdapter/debugAdapter.js',
);
export const DATA_ROOT = path.join(PROJECT_ROOT, 'sampleWorkspace/');

export const testFileAccessor: FileAccessor = {
  isWindows: typeof process !== 'undefined' && process.platform === 'win32',
  async readFile(path: string): Promise<Uint8Array> {
    return await fs.readFile(path);
  },
  async writeFile(path: string, contents: Uint8Array) {
    return await fs.writeFile(path, contents);
  },
};

export class TestFixture {
  private _client: DebugClient | undefined;
  private _server: BasicServer | undefined;

  public get client(): DebugClient {
    if (!this._client) {
      throw new Error('Not initialized');
    }
    return this._client;
  }

  private get server(): BasicServer {
    if (!this._server) {
      throw new Error('Not initialized');
    }
    return this._server;
  }

  public async init() {
    this._server = new BasicServer(testFileAccessor);

    this._client = new DebugClient('node', DEBUG_CLIENT_PATH, 'teal');
    await this._client.start(this._server.port());

    // If you want to invoke the debug adapter separately in a child process and
    // communicate through stdin/stdout, use this instead:
    // this._client = new DebugClient(
    //   'node',
    //   DEBUG_CLIENT_PATH,
    //   'teal',
    //   undefined,
    //   true,
    // );
    // await this._client.start();
  }

  public async reset() {
    await this.client.disconnectRequest();
  }

  public async stop() {
    await this.client.stop();
    this.server.dispose();
    this._client = undefined;
    this._server = undefined;
  }
}

export function assertAvmValuesEqual(
  actual: { value: string; type?: string },
  expectedValue: number | bigint | Uint8Array,
) {
  if (expectedValue instanceof Uint8Array) {
    assert.strictEqual(actual.type, 'byte[]');
    assert.ok(actual.value.startsWith('0x'));
    const actualBytes = Buffer.from(actual.value.slice(2), 'hex');
    assert.deepStrictEqual(
      new Uint8Array(actualBytes),
      new Uint8Array(expectedValue),
    );
  } else if (
    typeof expectedValue === 'number' ||
    typeof expectedValue === 'bigint'
  ) {
    assert.strictEqual(actual.type, 'uint64');
    assert.strictEqual(BigInt(actual.value), BigInt(expectedValue));
  } else {
    throw new Error(`Improper expected value: ${expectedValue}`);
  }
}

export async function assertVariables(
  dc: DebugClient,
  {
    pc,
    stack,
    scratch,
    apps,
  }: {
    pc?: number;
    stack?: Array<number | bigint | Uint8Array>;
    scratch?: Map<number, number | bigint | Uint8Array>;
    apps?: Array<{
      appID: number;
      globalState?: ByteArrayMap<number | bigint | Uint8Array>;
      localState?: Array<{
        account: string;
        state: ByteArrayMap<number | bigint | Uint8Array>;
      }>;
      boxState?: ByteArrayMap<number | bigint | Uint8Array>;
    }>;
  },
  frameId?: number,
) {
  if (typeof frameId === 'undefined') {
    const stackResponse = await dc.stackTraceRequest({ threadId: 1 });
    assert.ok(stackResponse.success);
    frameId = stackResponse.body.stackFrames[0].id;
  }

  const scopesResponse = await dc.scopesRequest({ frameId });
  assert.ok(scopesResponse.success);
  const scopes = scopesResponse.body.scopes;

  const executionScope = scopes.find((scope) =>
    scope.name.startsWith('Program State'),
  );
  assert.ok(executionScope);

  const executionScopeResponse = await dc.variablesRequest({
    variablesReference: executionScope.variablesReference,
  });
  assert.ok(executionScopeResponse.success);
  const executionScopeVariables = executionScopeResponse.body.variables;

  const onChainScope = scopes.find((scope) => scope.name === 'On-chain State');
  assert.ok(onChainScope);

  const onChainScopeResponse = await dc.variablesRequest({
    variablesReference: onChainScope.variablesReference,
  });
  assert.ok(onChainScopeResponse.success);
  const onChainScopeVariables = onChainScopeResponse.body.variables;

  const appStateVariable = onChainScopeVariables.find(
    (variable) => variable.name === 'app',
  );
  assert.ok(appStateVariable);

  const appStateVariableResponse = await dc.variablesRequest({
    variablesReference: appStateVariable.variablesReference,
  });
  assert.ok(appStateVariableResponse.success);
  const appStates = appStateVariableResponse.body.variables;

  if (typeof pc !== 'undefined') {
    const pcVariable = executionScopeVariables.find(
      (variable) => variable.name === 'pc',
    );
    assert.ok(pcVariable);
    assert.strictEqual(pcVariable.type, 'uint64');
    assert.strictEqual(pcVariable.value, pc.toString());

    await assertEvaluationEquals(dc, frameId, 'pc', {
      value: pc.toString(),
      type: 'uint64',
    });
  }

  if (typeof stack !== 'undefined') {
    const stackParentVariable = executionScopeVariables.find(
      (variable) => variable.name === 'stack',
    );
    assert.ok(stackParentVariable);

    const stackVariableResponse = await dc.variablesRequest({
      variablesReference: stackParentVariable.variablesReference,
    });
    assert.ok(stackVariableResponse.success);
    const stackVariables = stackVariableResponse.body.variables;

    assert.strictEqual(stackVariables.length, stack.length);

    for (let i = 0; i < stack.length; i++) {
      assert.strictEqual(stackVariables[i].name, i.toString());
      assertAvmValuesEqual(stackVariables[i], stack[i]);
    }

    await Promise.all(
      stack.map(async (expectedValue, i) => {
        if (expectedValue instanceof Uint8Array) {
          await assertEvaluationEquals(dc, frameId!, `stack[${i}]`, {
            value: '0x' + Buffer.from(expectedValue).toString('hex'),
            type: 'byte[]',
          });
        } else if (
          typeof expectedValue === 'number' ||
          typeof expectedValue === 'bigint'
        ) {
          await assertEvaluationEquals(dc, frameId!, `stack[${i}]`, {
            value: expectedValue.toString(),
            type: 'uint64',
          });
        } else {
          throw new Error(`Improper expected stack value: ${expectedValue}`);
        }
      }),
    );
  }

  if (typeof scratch !== 'undefined') {
    for (const key of scratch.keys()) {
      if (key < 0 || key > 255) {
        assert.fail(`Invalid scratch key: ${key}`);
      }
    }

    const scratchParentVariable = executionScopeVariables.find(
      (variable) => variable.name === 'scratch',
    );
    assert.ok(scratchParentVariable);

    const scratchVariableResponse = await dc.variablesRequest({
      variablesReference: scratchParentVariable.variablesReference,
    });
    assert.ok(scratchVariableResponse.success);
    const scratchVariables = scratchVariableResponse.body.variables;

    assert.strictEqual(scratchVariables.length, 256);

    for (let i = 0; i < 256; i++) {
      assert.strictEqual(scratchVariables[i].name, i.toString());
      let expectedValue = scratch.get(i);
      if (typeof expectedValue === 'undefined') {
        expectedValue = 0;
      }
      assertAvmValuesEqual(scratchVariables[i], expectedValue);
    }

    await Promise.all(
      scratchVariables.map(async (actual, i) => {
        let expectedValue = scratch.get(i);
        if (typeof expectedValue === 'undefined') {
          expectedValue = 0;
        }

        if (expectedValue instanceof Uint8Array) {
          await assertEvaluationEquals(dc, frameId!, `scratch[${i}]`, {
            value: '0x' + Buffer.from(expectedValue).toString('hex'),
            type: 'byte[]',
          });
        } else if (
          typeof expectedValue === 'number' ||
          typeof expectedValue === 'bigint'
        ) {
          await assertEvaluationEquals(dc, frameId!, `scratch[${i}]`, {
            value: expectedValue.toString(),
            type: 'uint64',
          });
        } else {
          throw new Error(`Improper expected scratch value: ${expectedValue}`);
        }
      }),
    );
  }

  if (typeof apps !== 'undefined') {
    for (const expectedAppState of apps) {
      const { appID, globalState, localState, boxState } = expectedAppState;
      const appState = appStates.find(
        (variable) => variable.name === appID.toString(),
      );
      assert.ok(appState, `Expected app state for app ID ${appID} not found`);

      const appStateResponse = await dc.variablesRequest({
        variablesReference: appState.variablesReference,
      });
      assert.ok(appStateResponse.success);
      const appStateVariables = appStateResponse.body.variables;

      if (typeof globalState !== 'undefined') {
        const globalStateVariable = appStateVariables.find(
          (variable) => variable.name === 'global',
        );
        assert.ok(globalStateVariable);

        const globalStateResponse = await dc.variablesRequest({
          variablesReference: globalStateVariable.variablesReference,
        });
        assert.ok(globalStateResponse.success);
        const globalStateVariables = globalStateResponse.body.variables;

        for (const [key, expectedValue] of globalState.entries()) {
          const keyStr = '0x' + Buffer.from(key).toString('hex');
          const actual = globalStateVariables.find(
            (variable) => variable.name === keyStr,
          );
          assert.ok(actual, `Expected global state key "${keyStr}" not found`);
          assertAvmValuesEqual(actual, expectedValue);
        }

        assert.strictEqual(globalStateVariables.length, globalState.size);
      }

      if (typeof localState !== 'undefined') {
        const localStateVariable = appStateVariables.find(
          (variable) => variable.name === 'local',
        );
        assert.ok(localStateVariable);

        const localStateResponse = await dc.variablesRequest({
          variablesReference: localStateVariable.variablesReference,
        });
        assert.ok(localStateResponse.success);
        const localStateAccounts = localStateResponse.body.variables;

        for (const expectedAccountState of localState) {
          const accountLocalState = localStateAccounts.find(
            (variable) => variable.name === expectedAccountState.account,
          );
          assert.ok(
            accountLocalState,
            `Expected local state for account ${expectedAccountState.account} not found`,
          );

          const accountLocalStateResponse = await dc.variablesRequest({
            variablesReference: accountLocalState.variablesReference,
          });
          assert.ok(accountLocalStateResponse.success);
          const accountLocalStateVariables =
            accountLocalStateResponse.body.variables;

          for (const [
            key,
            expectedValue,
          ] of expectedAccountState.state.entries()) {
            const keyStr = '0x' + Buffer.from(key).toString('hex');
            const actual = accountLocalStateVariables.find(
              (variable) => variable.name === keyStr,
            );
            assert.ok(actual, `Expected local state key "${keyStr}" not found`);
            assertAvmValuesEqual(actual, expectedValue);
          }

          assert.strictEqual(
            accountLocalStateVariables.length,
            expectedAccountState.state.size,
          );
        }

        assert.strictEqual(localStateAccounts.length, localState.length);
      }

      if (typeof boxState !== 'undefined') {
        const boxStateVariable = appStateVariables.find(
          (variable) => variable.name === 'box',
        );
        assert.ok(boxStateVariable);

        const boxStateResponse = await dc.variablesRequest({
          variablesReference: boxStateVariable.variablesReference,
        });
        assert.ok(boxStateResponse.success);
        const boxStateVariables = boxStateResponse.body.variables;

        for (const [key, expectedValue] of boxState.entries()) {
          const keyStr = '0x' + Buffer.from(key).toString('hex');
          const actual = boxStateVariables.find(
            (variable) => variable.name === keyStr,
          );
          assert.ok(actual, `Expected box state key "${keyStr}" not found`);
          assertAvmValuesEqual(actual, expectedValue);
        }

        assert.strictEqual(boxStateVariables.length, boxState.size);
      }
    }
  }
}

export async function advanceTo(
  dc: DebugClient,
  args: { program: string; line: number; column?: number },
) {
  const breakpointResponse = await dc.setBreakpointsRequest({
    source: { path: args.program },
    breakpoints: [
      {
        line: args.line,
        column: args.column,
      },
    ],
  });

  assert.ok(breakpointResponse.success);
  assert.strictEqual(breakpointResponse.body.breakpoints.length, 1);
  const bp = breakpointResponse.body.breakpoints[0];
  assert.ok(bp.verified);

  const continueResponse = await dc.continueRequest({ threadId: 0 });
  assert.ok(continueResponse.success);

  await dc.assertStoppedLocation('breakpoint', {
    path: args.program,
    line: args.line,
    column: args.column,
  });
}

export async function assertEvaluationEquals(
  dc: DebugClient,
  frameId: number,
  expression: string,
  expected: { value: string; type?: string },
) {
  const response = await dc.evaluateRequest({ expression, frameId });
  assert.ok(response.success);
  assert.strictEqual(
    response.body.result,
    expected.value,
    `Expected "${expression}" to evaluate to "${expected.value}", but got "${response.body.result}"`,
  );
  if (expected.type) {
    assert.strictEqual(
      response.body.type,
      expected.type,
      `Expected "${expression}" to have type "${expected.type}", but got "${response.body.type}"`,
    );
  }
}
