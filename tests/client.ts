import * as assert from 'assert';
import { SpawnOptions } from 'child_process';
import { DebugClient as DebugClientBase } from '@vscode/debugadapter-testsupport';
import { DebugProtocol } from '@vscode/debugprotocol';
import { ILaunchRequestArguments } from '../src/debugAdapter/debugRequestHandlers';
import {
  ILocation,
  IPartialLocation,
} from '@vscode/debugadapter-testsupport/lib/debugClient';

export class DebugClient extends DebugClientBase {
  private lastStoppedEvent: DebugProtocol.StoppedEvent | undefined;

  constructor(
    debugAdapterRuntime: string,
    debugAdapterExecutable: string,
    debugType: string,
    spawnOptions?: SpawnOptions,
    enableStderr?: boolean,
  ) {
    super(
      debugAdapterRuntime,
      debugAdapterExecutable,
      debugType,
      spawnOptions,
      enableStderr,
    );

    this.on('stopped', (event) => {
      this.lastStoppedEvent = event;
    });
    this.on('continued', () => {
      this.lastStoppedEvent = undefined;
    });
  }

  launch(
    launchArgs: ILaunchRequestArguments,
  ): Promise<DebugProtocol.LaunchResponse> {
    return super.launch(launchArgs);
  }

  disconnectRequest(
    args?: DebugProtocol.DisconnectArguments | undefined,
  ): Promise<DebugProtocol.DisconnectResponse> {
    // Clear lastStoppedEvent
    this.lastStoppedEvent = undefined;
    return super.disconnectRequest(args);
  }

  continueRequest(
    args: DebugProtocol.ContinueArguments,
  ): Promise<DebugProtocol.ContinueResponse> {
    // Optimistically clear the last stopped event. It's important to do this before we send the
    // request, otherwise we might miss a stopped event that happens immediately after.
    this.lastStoppedEvent = undefined;
    return super.continueRequest(args);
  }

  nextRequest(
    args: DebugProtocol.NextArguments,
  ): Promise<DebugProtocol.NextResponse> {
    // Optimistically clear the last stopped event. It's important to do this before we send the
    // request, otherwise we might miss a stopped event that happens immediately after.
    this.lastStoppedEvent = undefined;
    return super.nextRequest(args);
  }

  stepInRequest(
    args: DebugProtocol.StepInArguments,
  ): Promise<DebugProtocol.StepInResponse> {
    // Optimistically clear the last stopped event. It's important to do this before we send the
    // request, otherwise we might miss a stopped event that happens immediately after.
    this.lastStoppedEvent = undefined;
    return super.stepInRequest(args);
  }

  stepOutRequest(
    args: DebugProtocol.StepOutArguments,
  ): Promise<DebugProtocol.StepOutResponse> {
    // Optimistically clear the last stopped event. It's important to do this before we send the
    // request, otherwise we might miss a stopped event that happens immediately after.
    this.lastStoppedEvent = undefined;
    return super.stepOutRequest(args);
  }

  stepBackRequest(
    args: DebugProtocol.StepBackArguments,
  ): Promise<DebugProtocol.StepBackResponse> {
    // Optimistically clear the last stopped event. It's important to do this before we send the
    // request, otherwise we might miss a stopped event that happens immediately after.
    this.lastStoppedEvent = undefined;
    return super.stepBackRequest(args);
  }

  reverseContinueRequest(
    args: DebugProtocol.ReverseContinueArguments,
  ): Promise<DebugProtocol.ReverseContinueResponse> {
    // Optimistically clear the last stopped event. It's important to do this before we send the
    // request, otherwise we might miss a stopped event that happens immediately after.
    this.lastStoppedEvent = undefined;
    return super.reverseContinueRequest(args);
  }

  async waitForStop(): Promise<DebugProtocol.StoppedEvent> {
    if (typeof this.lastStoppedEvent !== 'undefined') {
      return Promise.resolve(this.lastStoppedEvent);
    }
    const event = await this.waitForEvent('stopped');
    return event as DebugProtocol.StoppedEvent;
  }

  async assertStoppedLocation(
    reason: string,
    expected: {
      path?: string | RegExp;
      line?: number;
      column?: number;
    },
  ): Promise<DebugProtocol.StackTraceResponse> {
    const stoppedEvent = await this.waitForStop();
    assert.strictEqual(stoppedEvent.body.reason, reason);

    const stackTraceResponse = await this.stackTraceRequest({
      threadId: stoppedEvent.body.threadId!,
    });

    const frame = stackTraceResponse.body.stackFrames[0];
    if (typeof expected.path === 'string' || expected.path instanceof RegExp) {
      this.assertPath(
        frame.source?.path!,
        expected.path,
        `stopped location: path mismatch: ${frame.source?.path} vs ${expected.path}`,
      );
    }
    if (typeof expected.line === 'number') {
      assert.strictEqual(
        frame.line,
        expected.line,
        `stopped location: line mismatch: ${frame.line} vs ${expected.line}`,
      );
    }
    if (typeof expected.column === 'number') {
      assert.strictEqual(
        frame.column,
        expected.column,
        `stopped location: column mismatch: ${frame.column} vs ${expected.column}`,
      );
    }
    return stackTraceResponse;
  }

  breakpointLocationsRequest(
    args: DebugProtocol.BreakpointLocationsArguments,
  ): Promise<DebugProtocol.BreakpointLocationsResponse> {
    return this.send(
      'breakpointLocations',
      args,
    ) as Promise<DebugProtocol.BreakpointLocationsResponse>;
  }

  async hitBreakpoint(
    launchArgs: ILaunchRequestArguments,
    location: ILocation,
    expectedStopLocation?: IPartialLocation | undefined,
    expectedBPLocation?: IPartialLocation | undefined,
  ): Promise<void> {
    if (launchArgs.stopOnEntry) {
      throw new Error("Can't hit breakpoint when stopOnEntry is true");
    }
    // Can't call into super.hitBreakpoint because there is a race between setting the breakpoint
    // and sending the launch request. Any breakpoints set before launch will be marked 'unverified',
    // which will cause super.hitBreakpoint to fail.
    await Promise.all([
      this.configurationSequence(),
      this.launch({
        ...launchArgs,
        stopOnEntry: true,
      }),
      this.assertStoppedLocation('entry', {}),
    ]);

    const setBreakpointsResponse = await this.setBreakpointsRequest({
      breakpoints: [{ line: location.line, column: location.column }],
      source: { path: location.path },
    });

    const bp = setBreakpointsResponse.body.breakpoints[0];
    const verified =
      typeof location.verified === 'boolean' ? location.verified : true;
    assert.strictEqual(
      bp.verified,
      verified,
      'breakpoint verification mismatch: verified',
    );
    const actualLocation = {
      column: bp.column,
      line: bp.line,
      path: bp.source && bp.source.path,
    };
    // assertPartialLocationsEqual(actualLocation, expectedBPLocation || location);
    const expectedLocation = expectedBPLocation || location;
    if (actualLocation.path) {
      this.assertPath(
        actualLocation.path,
        expectedLocation.path!,
        'breakpoint verification mismatch: path',
      );
    }
    if (typeof actualLocation.line === 'number') {
      assert.strictEqual(
        actualLocation.line,
        expectedLocation.line,
        'breakpoint verification mismatch: line',
      );
    }
    if (
      typeof expectedLocation.column === 'number' &&
      typeof actualLocation.column === 'number'
    ) {
      assert.strictEqual(
        actualLocation.column,
        expectedLocation.column,
        'breakpoint verification mismatch: column',
      );
    }

    await this.continueRequest({ threadId: 1 });
    await this.assertStoppedLocation(
      'breakpoint',
      expectedStopLocation || location,
    );
  }
}
