import * as assert from 'assert';
import { SpawnOptions } from 'child_process';
import { DebugClient as DebugClientBase } from '@vscode/debugadapter-testsupport';
import { DebugProtocol } from '@vscode/debugprotocol';
import { ILaunchRequestArguments } from '../src/debugSession';
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

  hitBreakpoint(
    launchArgs: ILaunchRequestArguments,
    location: ILocation,
    expectedStopLocation?: IPartialLocation | undefined,
    expectedBPLocation?: IPartialLocation | undefined,
  ): Promise<void> {
    if (launchArgs.stopOnEntry) {
      throw new Error("Can't hit breakpoint when stopOnEntry is true");
    }
    return super.hitBreakpoint(
      launchArgs,
      location,
      expectedStopLocation,
      expectedBPLocation,
    );
  }
}
