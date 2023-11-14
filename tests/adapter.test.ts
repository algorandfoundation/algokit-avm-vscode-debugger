import * as assert from 'assert';
import * as path from 'path';
import * as algosdk from 'algosdk';
import { DebugProtocol } from '@vscode/debugprotocol';
import { ByteArrayMap } from '../src/debugAdapter/utils';
import { TestFixture, assertVariables, advanceTo, DATA_ROOT } from './testing';

describe('Debug Adapter Tests', () => {
  const fixture = new TestFixture();

  before(async () => await fixture.init());

  afterEach(async () => {
    await fixture.reset();
  });

  after(async () => {
    await fixture.stop();
  });

  describe('general', () => {
    describe('basic', () => {
      it('should produce error for unknown request', async () => {
        let success: boolean;
        try {
          await fixture.client.send('illegal_request');
          success = true;
        } catch (err) {
          success = false;
        }
        assert.strictEqual(success, false);
      });
    });

    describe('initialize', () => {
      it('should return supported features', () => {
        return fixture.client.initializeRequest().then((response) => {
          response.body = response.body || {};
          assert.strictEqual(
            response.body.supportsConfigurationDoneRequest,
            true,
          );
        });
      });

      it("should produce error for invalid 'pathFormat'", async () => {
        let success: boolean;
        try {
          await fixture.client.initializeRequest({
            adapterID: 'teal',
            linesStartAt1: true,
            columnsStartAt1: true,
            pathFormat: 'url',
          });
          success = true;
        } catch (err) {
          success = false;
        }
        assert.strictEqual(success, false);
      });
    });

    describe('launch', () => {
      it('should return error when simulate trace file does not exist', async () => {
        let caughtError: Error | undefined;
        try {
          await fixture.client.launch({
            simulateTraceFile: path.join(
              DATA_ROOT,
              'does-not-exist/simulate-response.json',
            ),
            programSourcesDescriptionFile: path.join(
              DATA_ROOT,
              'app-state-changes/sources.json',
            ),
          });
        } catch (e) {
          caughtError = e as Error;
        }
        if (!caughtError) {
          assert.fail('Expected error');
        }
        assert.ok(
          caughtError.message.includes('Could not read simulate trace file'),
          caughtError.message,
        );
      });

      it('should return error when program sources description files does not exist', async () => {
        let caughtError: Error | undefined;
        try {
          await fixture.client.launch({
            simulateTraceFile: path.join(
              DATA_ROOT,
              'app-state-changes/local-simulate-response.json',
            ),
            programSourcesDescriptionFile: path.join(
              DATA_ROOT,
              'does-not-exist/sources.json',
            ),
          });
        } catch (e) {
          caughtError = e as Error;
        }
        if (!caughtError) {
          assert.fail('Expected error');
        }
        assert.ok(
          caughtError.message.includes(
            'Could not read program sources description file',
          ),
          caughtError.message,
        );
      });

      it('should return error when simulate trace file is invalid', async () => {
        const simulateTraceFile = path.join(
          DATA_ROOT,
          'slot-machine/sources.json', // not a valid simulate trace file
        );
        let caughtError: Error | undefined;
        try {
          await fixture.client.launch({
            simulateTraceFile,
            programSourcesDescriptionFile: path.join(
              DATA_ROOT,
              'app-state-changes/sources.json',
            ),
          });
        } catch (e) {
          caughtError = e as Error;
        }
        if (!caughtError) {
          assert.fail('Expected error');
        }
        assert.ok(
          caughtError.message.includes(
            `Could not parse simulate trace file from '${simulateTraceFile}'`,
          ),
          caughtError.message,
        );
      });

      it('should return error when program sources description files is invalid', async () => {
        const programSourcesDescriptionFile = path.join(
          DATA_ROOT,
          'slot-machine/simulate-response.json', // not a valid program sources description file
        );
        let caughtError: Error | undefined;
        try {
          await fixture.client.launch({
            simulateTraceFile: path.join(
              DATA_ROOT,
              'app-state-changes/local-simulate-response.json',
            ),
            programSourcesDescriptionFile,
          });
        } catch (e) {
          caughtError = e as Error;
        }
        if (!caughtError) {
          assert.fail('Expected error');
        }
        assert.ok(
          caughtError.message.includes(
            `Could not parse program sources description file from '${programSourcesDescriptionFile}': Invalid program sources description file`,
          ),
          caughtError.message,
        );
      });

      it('should run program to the end', async () => {
        await Promise.all([
          fixture.client.configurationSequence(),
          fixture.client.launch({
            simulateTraceFile: path.join(
              DATA_ROOT,
              'app-state-changes/local-simulate-response.json',
            ),
            programSourcesDescriptionFile: path.join(
              DATA_ROOT,
              'app-state-changes/sources.json',
            ),
          }),
          fixture.client.waitForEvent('terminated'),
        ]);
      });

      it('should stop on entry', async () => {
        const ENTRY_LINE = 2;

        await Promise.all([
          fixture.client.configurationSequence(),
          fixture.client.launch({
            simulateTraceFile: path.join(
              DATA_ROOT,
              'app-state-changes/local-simulate-response.json',
            ),
            programSourcesDescriptionFile: path.join(
              DATA_ROOT,
              'app-state-changes/sources.json',
            ),
            stopOnEntry: true,
          }),
          fixture.client.assertStoppedLocation('entry', { line: ENTRY_LINE }),
        ]);
      });
    });

    describe('setBreakpoints', () => {
      it('should stop on a breakpoint', async () => {
        const PROGRAM = path.join(
          DATA_ROOT,
          'app-state-changes/state-changes.teal',
        );
        const BREAKPOINT_LINE = 2;

        await fixture.client.hitBreakpoint(
          {
            simulateTraceFile: path.join(
              DATA_ROOT,
              'app-state-changes/local-simulate-response.json',
            ),
            programSourcesDescriptionFile: path.join(
              DATA_ROOT,
              'app-state-changes/sources.json',
            ),
          },
          { path: PROGRAM, line: BREAKPOINT_LINE },
        );
      });
    });
  });

  describe('Controls', () => {
    interface Location {
      program?: string;
      name: string;
      line: number;
      column: number;
    }

    const expectedStepOverLocationsSteppingTest: Location[] = [
      {
        name: 'transaction-group-0.json',
        line: 2,
        column: 0,
      },
      {
        name: 'transaction-group-0.json',
        line: 18,
        column: 0,
      },
      {
        name: 'transaction-group-0.json',
        line: 19,
        column: 0,
      },
      {
        name: 'transaction-group-0.json',
        line: 23,
        column: 0,
      },
      {
        name: 'transaction-group-0.json',
        line: 33,
        column: 0,
      },
      {
        name: 'transaction-group-0.json',
        line: 34,
        column: 0,
      },
    ];

    let expectedStepOverLocationsSlotMachine: Location[];
    {
      const slotMachinePath = path.join(
        DATA_ROOT,
        'slot-machine/slot-machine.teal',
      );

      const label5Callsub = [
        { line: 97, column: 1 },
        { line: 98, column: 1 },
        { line: 99, column: 1 },
        { line: 100, column: 1 },
        { line: 101, column: 1 },
      ];

      const label6Callsub = [
        { line: 103, column: 1 },
        { line: 104, column: 1 },
        { line: 105, column: 1 },
        { line: 106, column: 1 },
        { line: 107, column: 1 },
        { line: 108, column: 1 },
        { line: 109, column: 1 },
        { line: 110, column: 1 },
        { line: 111, column: 1 },
      ];

      expectedStepOverLocationsSlotMachine = [
        { line: 2, column: 1 },
        { line: 3, column: 1 },
        { line: 4, column: 1 },
        { line: 5, column: 1 },
        { line: 6, column: 1 },
        { line: 7, column: 1 },
        { line: 8, column: 1 },
        { line: 9, column: 1 },
        { line: 10, column: 1 },
        { line: 11, column: 1 },
        { line: 12, column: 1 },
        { line: 13, column: 1 },
        { line: 14, column: 1 },
        { line: 15, column: 1 },
        { line: 16, column: 1 },
        { line: 17, column: 1 },
        { line: 18, column: 1 },
        { line: 20, column: 1 },
        { line: 21, column: 1 },
        { line: 22, column: 1 },
        { line: 23, column: 1 },
        { line: 24, column: 1 },
        { line: 25, column: 1 },
        { line: 26, column: 1 },
        { line: 27, column: 1 },
        { line: 28, column: 1 },
        { line: 29, column: 1 },
        { line: 30, column: 1 },
        { line: 31, column: 1 },
        { line: 32, column: 1 },
        { line: 33, column: 1 },
        { line: 34, column: 1 },
        { line: 35, column: 1 },
        { line: 36, column: 1 },
        { line: 37, column: 1 },
        { line: 38, column: 1 },
        { line: 39, column: 1 },
        { line: 40, column: 1 },
        { line: 41, column: 1 },
        { line: 42, column: 1 },
        { line: 43, column: 1 },
        { line: 44, column: 1 },
        { line: 45, column: 1 },
        { line: 46, column: 1 },
        { line: 20, column: 1 },
        { line: 21, column: 1 },
        { line: 22, column: 1 },
        { line: 23, column: 1 },
        { line: 24, column: 1 },
        { line: 25, column: 1 },
        { line: 26, column: 1 },
        { line: 27, column: 1 },
        { line: 28, column: 1 },
        { line: 29, column: 1 },
        { line: 30, column: 1 },
        { line: 31, column: 1 },
        { line: 32, column: 1 },
        { line: 33, column: 1 },
        { line: 34, column: 1 },
        { line: 35, column: 1 },
        { line: 36, column: 1 },
        { line: 37, column: 1 },
        { line: 38, column: 1 },
        { line: 39, column: 1 },
        { line: 40, column: 1 },
        { line: 41, column: 1 },
        { line: 42, column: 1 },
        { line: 43, column: 1 },
        { line: 44, column: 1 },
        { line: 45, column: 1 },
        { line: 46, column: 1 },
        { line: 20, column: 1 },
        { line: 21, column: 1 },
        { line: 22, column: 1 },
        { line: 23, column: 1 },
        { line: 24, column: 1 },
        { line: 25, column: 1 },
        { line: 26, column: 1 },
        { line: 27, column: 1 },
        { line: 28, column: 1 },
        { line: 29, column: 1 },
        { line: 30, column: 1 },
        { line: 31, column: 1 },
        { line: 32, column: 1 },
        { line: 33, column: 1 },
        { line: 34, column: 1 },
        { line: 35, column: 1 },
        { line: 36, column: 1 },
        { line: 37, column: 1 },
        { line: 38, column: 1 },
        { line: 39, column: 1 },
        { line: 40, column: 1 },
        { line: 41, column: 1 },
        { line: 42, column: 1 },
        { line: 43, column: 1 },
        { line: 44, column: 1 },
        { line: 48, column: 1 },
        { line: 49, column: 1 },
        { line: 50, column: 1 },
        { line: 51, column: 1 },
        { line: 52, column: 1 },
        { line: 53, column: 1 },
        ...label5Callsub,
        { line: 54, column: 1 },
        { line: 55, column: 1 },
        { line: 56, column: 1 },
        ...label6Callsub,
        { line: 57, column: 1 },
        { line: 58, column: 1 },
        { line: 59, column: 1 },
        ...label6Callsub,
        { line: 60, column: 1 },
        { line: 61, column: 1 },
        { line: 62, column: 1 },
        ...label5Callsub,
        { line: 63, column: 1 },
        { line: 64, column: 1 },
        { line: 65, column: 1 },
        ...label6Callsub,
        { line: 66, column: 1 },
        { line: 67, column: 1 },
        { line: 68, column: 1 },
        ...label6Callsub,
        { line: 69, column: 1 },
        { line: 70, column: 1 },
        { line: 71, column: 1 },
        ...label5Callsub,
        { line: 72, column: 1 },
        { line: 73, column: 1 },
        { line: 74, column: 1 },
        ...label6Callsub,
        { line: 75, column: 1 },
        { line: 76, column: 1 },
        { line: 77, column: 1 },
        ...label6Callsub,
        { line: 78, column: 1 },
        { line: 79, column: 1 },
        { line: 80, column: 1 },
        { line: 81, column: 1 },
        { line: 82, column: 1 },
        { line: 83, column: 1 },
        { line: 84, column: 1 },
        { line: 85, column: 1 },
        { line: 86, column: 1 },
        { line: 87, column: 1 },
        { line: 88, column: 1 },
        { line: 89, column: 1 },
        { line: 90, column: 1 },
        { line: 91, column: 1 },
        { line: 92, column: 1 },
        { line: 93, column: 1 },
        { line: 94, column: 1 },
        { line: 95, column: 1 },
        { line: 95, column: 1 },
      ].map((partial) => ({
        ...partial,
        name: 'slot-machine.teal',
        program: slotMachinePath,
      }));
    }

    describe('Step in', () => {
      it('should pause at the correct locations', async () => {
        const simulateTraceFile = path.join(
          DATA_ROOT,
          'stepping-test/simulate-response.json',
        );
        const programSourcesDescriptionFile = path.join(
          DATA_ROOT,
          'stepping-test/sources.json',
        );
        const { client } = fixture;

        await Promise.all([
          client.configurationSequence(),
          client.launch({
            simulateTraceFile,
            programSourcesDescriptionFile,
            stopOnEntry: true,
          }),
          client.assertStoppedLocation('entry', {}),
        ]);

        const lsigPath = path.join(DATA_ROOT, 'stepping-test/lsig.teal');
        const appPath = path.join(DATA_ROOT, 'stepping-test/app.teal');
        const expectedLocations: Location[] = [
          {
            name: 'transaction-group-0.json',
            line: 2,
            column: 0,
          },
          {
            name: 'transaction-group-0.json',
            line: 18,
            column: 0,
          },
          {
            name: 'transaction-group-0.json',
            line: 19,
            column: 0,
          },
          {
            program: lsigPath,
            name: 'lsig.teal',
            line: 2,
            column: 1,
          },
          {
            program: lsigPath,
            name: 'lsig.teal',
            line: 3,
            column: 1,
          },
          {
            program: lsigPath,
            name: 'lsig.teal',
            line: 4,
            column: 1,
          },
          {
            program: lsigPath,
            name: 'lsig.teal',
            line: 5,
            column: 1,
          },
          {
            program: lsigPath,
            name: 'lsig.teal',
            line: 6,
            column: 1,
          },
          {
            program: lsigPath,
            name: 'lsig.teal',
            line: 7,
            column: 1,
          },
          {
            program: lsigPath,
            name: 'lsig.teal',
            line: 7,
            column: 1,
          },
          {
            name: 'transaction-group-0.json',
            line: 23,
            column: 0,
          },
          {
            program: appPath,
            name: 'app.teal',
            line: 2,
            column: 1,
          },
          {
            program: appPath,
            name: 'app.teal',
            line: 3,
            column: 1,
          },
          {
            program: appPath,
            name: 'app.teal',
            line: 5,
            column: 1,
          },
          {
            program: appPath,
            name: 'app.teal',
            line: 12,
            column: 1,
          },
          {
            program: appPath,
            name: 'app.teal',
            line: 13,
            column: 1,
          },
          {
            program: appPath,
            name: 'app.teal',
            line: 14,
            column: 1,
          },
          {
            program: appPath,
            name: 'app.teal',
            line: 8,
            column: 1,
          },
          {
            program: appPath,
            name: 'app.teal',
            line: 9,
            column: 1,
          },
          {
            program: appPath,
            name: 'app.teal',
            line: 9,
            column: 1,
          },
          {
            name: 'transaction-group-0.json',
            line: 33,
            column: 0,
          },
          {
            name: 'transaction-group-0.json',
            line: 34,
            column: 0,
          },
          {
            program: lsigPath,
            name: 'lsig.teal',
            line: 2,
            column: 1,
          },
          {
            program: lsigPath,
            name: 'lsig.teal',
            line: 3,
            column: 1,
          },
          {
            program: lsigPath,
            name: 'lsig.teal',
            line: 4,
            column: 1,
          },
          {
            program: lsigPath,
            name: 'lsig.teal',
            line: 5,
            column: 1,
          },
          {
            program: lsigPath,
            name: 'lsig.teal',
            line: 6,
            column: 1,
          },
          {
            program: lsigPath,
            name: 'lsig.teal',
            line: 7,
            column: 1,
          },
          {
            program: lsigPath,
            name: 'lsig.teal',
            line: 7,
            column: 1,
          },
        ];

        for (let i = 0; i < expectedLocations.length; i++) {
          const expectedLocation = expectedLocations[i];
          const stackTraceResponse = await client.stackTraceRequest({
            threadId: 1,
          });
          const currentFrame = stackTraceResponse.body.stackFrames[0];
          const actualLocation: Location = {
            name: currentFrame.source?.name!,
            line: currentFrame.line,
            column: currentFrame.column,
          };
          if (currentFrame.source?.path) {
            actualLocation.program = currentFrame.source.path;
          }
          assert.deepStrictEqual(actualLocation, expectedLocation);

          // Move to next location
          await client.stepInRequest({ threadId: 1 });
          if (i + 1 < expectedLocations.length) {
            const stoppedEvent = await client.waitForStop();
            assert.strictEqual(stoppedEvent.body.reason, 'step');
          } else {
            await client.waitForEvent('terminated');
          }
        }
      });
    });

    describe('Step over', () => {
      it('should pause at the correct locations in a transaction group', async () => {
        const simulateTraceFile = path.join(
          DATA_ROOT,
          'stepping-test/simulate-response.json',
        );
        const programSourcesDescriptionFile = path.join(
          DATA_ROOT,
          'stepping-test/sources.json',
        );

        const { client } = fixture;

        await Promise.all([
          client.configurationSequence(),
          client.launch({
            simulateTraceFile,
            programSourcesDescriptionFile,
            stopOnEntry: true,
          }),
          client.assertStoppedLocation('entry', {}),
        ]);

        const expectedLocations = expectedStepOverLocationsSteppingTest;

        for (let i = 0; i < expectedLocations.length; i++) {
          const expectedLocation = expectedLocations[i];
          const stackTraceResponse = await client.stackTraceRequest({
            threadId: 1,
          });
          const currentFrame = stackTraceResponse.body.stackFrames[0];
          const actualLocation: Location = {
            name: currentFrame.source?.name!,
            line: currentFrame.line,
            column: currentFrame.column,
          };
          if (currentFrame.source?.path) {
            actualLocation.program = currentFrame.source.path;
          }
          assert.deepStrictEqual(actualLocation, expectedLocation);

          // Move to next location
          await client.nextRequest({ threadId: 1 });
          if (i + 1 < expectedLocations.length) {
            const stoppedEvent = await client.waitForStop();
            assert.strictEqual(stoppedEvent.body.reason, 'step');
          } else {
            await client.waitForEvent('terminated');
          }
        }
      });

      it('should pause at the correct locations in app execution', async () => {
        const simulateTraceFile = path.join(
          DATA_ROOT,
          'slot-machine/simulate-response.json',
        );
        const programSourcesDescriptionFile = path.join(
          DATA_ROOT,
          'slot-machine/sources.json',
        );
        const { client } = fixture;

        const programPath = path.join(
          DATA_ROOT,
          'slot-machine/slot-machine.teal',
        );

        await client.hitBreakpoint(
          { simulateTraceFile, programSourcesDescriptionFile },
          { path: programPath, line: 2 },
        );

        const expectedLocations = expectedStepOverLocationsSlotMachine;

        for (let i = 0; i < expectedLocations.length; i++) {
          const expectedLocation = expectedLocations[i];
          const stackTraceResponse = await client.stackTraceRequest({
            threadId: 1,
          });
          const currentFrame = stackTraceResponse.body.stackFrames[0];
          const actualLocation: Location = {
            name: currentFrame.source?.name!,
            line: currentFrame.line,
            column: currentFrame.column,
          };
          if (currentFrame.source?.path) {
            actualLocation.program = currentFrame.source.path;
          }
          assert.deepStrictEqual(actualLocation, expectedLocation);

          // Move to next location
          await client.nextRequest({ threadId: 1 });
          const stoppedEvent = await client.waitForStop();
          assert.strictEqual(stoppedEvent.body.reason, 'step');
        }

        // Finally, assert that the next step is not in the program
        const stackTraceResponse = await client.stackTraceRequest({
          threadId: 1,
        });
        const currentFrame = stackTraceResponse.body.stackFrames[0];
        assert.notStrictEqual(
          currentFrame.source?.path,
          programPath,
          'Program has step locations beyond expected',
        );
        assert.notStrictEqual(
          currentFrame.source?.name,
          'slot-machine.teal',
          'Program has step locations beyond expected',
        );
      });
    });

    describe('Step out', () => {
      it('should pause at the correct locations', async () => {
        const simulateTraceFile = path.join(
          DATA_ROOT,
          'slot-machine/simulate-response.json',
        );
        const programSourcesDescriptionFile = path.join(
          DATA_ROOT,
          'slot-machine/sources.json',
        );
        const { client } = fixture;

        const fakeRandomPath = path.join(
          DATA_ROOT,
          'slot-machine/fake-random.teal',
        );
        const randomBytePath = path.join(
          DATA_ROOT,
          'slot-machine/random-byte.teal',
        );
        const slotMachinePath = path.join(
          DATA_ROOT,
          'slot-machine/slot-machine.teal',
        );

        await client.hitBreakpoint(
          { simulateTraceFile, programSourcesDescriptionFile },
          { path: fakeRandomPath, line: 13 },
        );

        // clear breakpoint
        await client.setBreakpointsRequest({
          source: { path: fakeRandomPath },
          breakpoints: [],
        });

        interface LocationAndFrameState {
          location: Location;
          frameStates: Array<{
            pc: number;
            stack: Array<number | bigint | Uint8Array>;
          } | null>;
        }

        const expectedLocations: LocationAndFrameState[] = [
          {
            location: {
              program: fakeRandomPath,
              name: 'fake-random.teal',
              line: 13,
              column: 1,
            },
            frameStates: [
              {
                pc: 33,
                stack: [
                  Buffer.from('0000000001fa5f5d23', 'hex'),
                  Buffer.from('counter'),
                ],
              },
              null,
              {
                pc: 45,
                stack: [],
              },
              null,
              {
                pc: 108,
                stack: [],
              },
              null,
            ],
          },
          {
            location: {
              program: randomBytePath,
              name: 'random-byte.teal',
              line: 22,
              column: 1,
            },
            frameStates: [
              {
                pc: 46,
                stack: [],
              },
              null,
              {
                pc: 108,
                stack: [],
              },
              null,
            ],
          },
          {
            location: {
              name: 'inner-transaction-group-0-1.json',
              line: 20,
              column: 0,
            },
            frameStates: [
              null,
              {
                pc: 108,
                stack: [],
              },
              null,
            ],
          },
          {
            location: {
              program: slotMachinePath,
              name: 'slot-machine.teal',
              line: 52,
              column: 1,
            },
            frameStates: [
              {
                pc: 109,
                stack: [],
              },
              null,
            ],
          },
          {
            location: {
              name: 'transaction-group-0.json',
              line: 40,
              column: 0,
            },
            frameStates: [null],
          },
        ];

        for (let i = 0; i < expectedLocations.length; i++) {
          const expectedLocation = expectedLocations[i];
          const stackTraceResponse = await client.stackTraceRequest({
            threadId: 1,
          });
          const currentFrame = stackTraceResponse.body.stackFrames[0];
          const actualLocation: Location = {
            name: currentFrame.source?.name!,
            line: currentFrame.line,
            column: currentFrame.column,
          };
          if (currentFrame.source?.path) {
            actualLocation.program = currentFrame.source.path;
          }
          assert.deepStrictEqual(actualLocation, expectedLocation.location);

          assert.strictEqual(
            stackTraceResponse.body.stackFrames.length,
            expectedLocation.frameStates.length,
          );

          for (
            let frameIndex = 0;
            frameIndex < expectedLocation.frameStates.length;
            frameIndex++
          ) {
            const expectedFrameState = expectedLocation.frameStates[frameIndex];
            const frameId = stackTraceResponse.body.stackFrames[frameIndex].id;

            if (expectedFrameState) {
              await assertVariables(client, expectedFrameState, frameId);
            } else {
              const scopesResponse = await client.scopesRequest({ frameId });
              assert.ok(scopesResponse.success);
              const scopes = scopesResponse.body.scopes;

              const executionScope = scopes.find((scope) =>
                scope.name.startsWith('Program State'),
              );
              assert.strictEqual(executionScope, undefined);
            }
          }

          // Move to next location
          await client.stepOutRequest({ threadId: 1 });
          if (i + 1 < expectedLocations.length) {
            const stoppedEvent = await client.waitForStop();
            assert.strictEqual(stoppedEvent.body.reason, 'step');
          } else {
            await client.waitForEvent('terminated');
          }
        }
      });
    });

    describe('Step back', () => {
      it('should pause at the correct locations in a transaction group', async () => {
        const simulateTraceFile = path.join(
          DATA_ROOT,
          'stepping-test/simulate-response.json',
        );
        const programSourcesDescriptionFile = path.join(
          DATA_ROOT,
          'stepping-test/sources.json',
        );
        const { client } = fixture;

        await Promise.all([
          client.configurationSequence(),
          client.launch({
            simulateTraceFile,
            programSourcesDescriptionFile,
            stopOnEntry: true,
          }),
          client.assertStoppedLocation('entry', {}),
        ]);

        const expectedLocations = expectedStepOverLocationsSteppingTest
          .slice()
          .reverse();

        // Can't set breakpoints on the transaction-group-0.json pseudo file, so let's keep
        // stepping until we reach our starting location.
        const startLocation = expectedLocations[0];
        for (;;) {
          const stackTraceResponse = await client.stackTraceRequest({
            threadId: 1,
          });
          const currentFrame = stackTraceResponse.body.stackFrames[0];
          if (
            currentFrame.source?.name === startLocation.name &&
            currentFrame.line === startLocation.line
          ) {
            break;
          }
          await client.nextRequest({ threadId: 1 });
          const stoppedEvent = await client.waitForStop();
          assert.strictEqual(stoppedEvent.body.reason, 'step');
        }

        for (let i = 0; i < expectedLocations.length; i++) {
          const expectedLocation = expectedLocations[i];
          const stackTraceResponse = await client.stackTraceRequest({
            threadId: 1,
          });
          const currentFrame = stackTraceResponse.body.stackFrames[0];
          const actualLocation: Location = {
            name: currentFrame.source?.name!,
            line: currentFrame.line,
            column: currentFrame.column,
          };
          if (currentFrame.source?.path) {
            actualLocation.program = currentFrame.source.path;
          }
          assert.deepStrictEqual(actualLocation, expectedLocation);

          // Move to next location, in this case backwards
          await client.stepBackRequest({ threadId: 1 });
          const stoppedEvent = await client.waitForStop();
          const expectedStopReason =
            i + 1 === expectedLocations.length ? 'entry' : 'step';
          assert.strictEqual(stoppedEvent.body.reason, expectedStopReason);
        }
      });

      it('should pause at the correct locations in app execution', async () => {
        const simulateTraceFile = path.join(
          DATA_ROOT,
          'slot-machine/simulate-response.json',
        );
        const programSourcesDescriptionFile = path.join(
          DATA_ROOT,
          'slot-machine/sources.json',
        );
        const { client } = fixture;

        const expectedLocations = expectedStepOverLocationsSlotMachine
          .slice()
          .reverse();

        const startLocation = expectedLocations[0];
        await client.hitBreakpoint(
          { simulateTraceFile, programSourcesDescriptionFile },
          {
            path: startLocation.program!,
            line: startLocation.line,
            column: startLocation.column,
          },
        );

        // Reset breakpoints
        await client.setBreakpointsRequest({
          source: { path: startLocation.program! },
          breakpoints: [],
        });

        // Since the first 2 locations are the same (due to before/after opcode execution), the
        // breakpoint only hits the first. Must manually advance to the second.
        assert.deepStrictEqual(expectedLocations[0], expectedLocations[1]);
        await client.nextRequest({ threadId: 1 });
        const stoppedEvent = await client.waitForStop();
        assert.strictEqual(stoppedEvent.body.reason, 'step');

        for (let i = 0; i < expectedLocations.length; i++) {
          const expectedLocation = expectedLocations[i];
          const stackTraceResponse = await client.stackTraceRequest({
            threadId: 1,
          });
          const currentFrame = stackTraceResponse.body.stackFrames[0];
          const actualLocation: Location = {
            name: currentFrame.source?.name!,
            line: currentFrame.line,
            column: currentFrame.column,
          };
          if (currentFrame.source?.path) {
            actualLocation.program = currentFrame.source.path;
          }
          assert.deepStrictEqual(actualLocation, expectedLocation);

          // Move to next location, in this case backwards
          await client.stepBackRequest({ threadId: 1 });
          const stoppedEvent = await client.waitForStop();
          assert.strictEqual(stoppedEvent.body.reason, 'step');
        }

        // Finally, assert that the next step is not in the program
        const stackTraceResponse = await client.stackTraceRequest({
          threadId: 1,
        });
        const currentFrame = stackTraceResponse.body.stackFrames[0];
        assert.notStrictEqual(
          currentFrame.source?.path,
          path.join(DATA_ROOT, 'slot-machine/slot-machine.teal'),
          'Program has step locations beyond expected',
        );
        assert.notStrictEqual(
          currentFrame.source?.name,
          'slot-machine.teal',
          'Program has step locations beyond expected',
        );
      });
    });
  });

  describe('Stack and scratch changes', () => {
    context('LogicSig', () => {
      it('should return variables correctly', async () => {
        const simulateTraceFile = path.join(
          DATA_ROOT,
          'stepping-test/simulate-response.json',
        );
        const programSourcesDescriptionFile = path.join(
          DATA_ROOT,
          'stepping-test/sources.json',
        );

        const { client } = fixture;
        const PROGRAM = path.join(DATA_ROOT, 'stepping-test/lsig.teal');

        await client.hitBreakpoint(
          { simulateTraceFile, programSourcesDescriptionFile },
          { path: PROGRAM, line: 3 },
        );

        await assertVariables(client, {
          pc: 3,
          stack: [0],
          scratch: new Map(),
        });

        await advanceTo(client, { program: PROGRAM, line: 5 });

        await assertVariables(client, {
          pc: 6,
          stack: [1, new Uint8Array(32)],
          scratch: new Map(),
        });

        await advanceTo(client, { program: PROGRAM, line: 7 });

        await assertVariables(client, {
          pc: 9,
          stack: [1, 1],
          scratch: new Map(),
        });
      });
    });
    context('App', () => {
      it('should return variables correctly', async () => {
        const simulateTraceFile = path.join(
          DATA_ROOT,
          'stack-scratch/simulate-response.json',
        );
        const programSourcesDescriptionFile = path.join(
          DATA_ROOT,
          'stack-scratch/sources.json',
        );
        const { client } = fixture;

        const PROGRAM = path.join(
          DATA_ROOT,
          'stack-scratch/stack-scratch.teal',
        );

        await client.hitBreakpoint(
          { simulateTraceFile, programSourcesDescriptionFile },
          { path: PROGRAM, line: 3 },
        );

        await assertVariables(client, {
          pc: 6,
          stack: [1005],
          scratch: new Map(),
        });

        await advanceTo(client, { program: PROGRAM, line: 12 });

        await assertVariables(client, {
          pc: 18,
          stack: [10],
          scratch: new Map(),
        });

        await advanceTo(client, { program: PROGRAM, line: 22 });

        await assertVariables(client, {
          pc: 34,
          stack: [10, 0, 0, 0, 0, 0, 0],
          scratch: new Map(),
        });

        await advanceTo(client, { program: PROGRAM, line: 35 });

        await assertVariables(client, {
          pc: 63,
          stack: [10, 30, Buffer.from('1!'), Buffer.from('5!')],
          scratch: new Map(),
        });

        await advanceTo(client, { program: PROGRAM, line: 36 });

        await assertVariables(client, {
          pc: 80,
          stack: [
            10,
            30,
            Buffer.from('1!'),
            Buffer.from('5!'),
            0,
            2,
            1,
            1,
            5,
            BigInt('18446744073709551615'),
          ],
          scratch: new Map(),
        });

        await advanceTo(client, { program: PROGRAM, line: 37 });

        await assertVariables(client, {
          pc: 82,
          stack: [10, 30, Buffer.from('1!'), Buffer.from('5!'), 0, 2, 1, 1, 5],
          scratch: new Map([[1, BigInt('18446744073709551615')]]),
        });

        await advanceTo(client, { program: PROGRAM, line: 39 });

        await assertVariables(client, {
          pc: 85,
          stack: [10, 30, Buffer.from('1!'), Buffer.from('5!'), 0, 2, 1, 1],
          scratch: new Map([
            [1, BigInt('18446744073709551615')],
            [5, BigInt('18446744073709551615')],
          ]),
        });

        await advanceTo(client, { program: PROGRAM, line: 41 });

        await assertVariables(client, {
          pc: 89,
          stack: [10, 30, Buffer.from('1!'), Buffer.from('5!'), 0, 2, 1, 1],
          scratch: new Map([
            [1, BigInt('18446744073709551615')],
            [5, BigInt('18446744073709551615')],
          ]),
        });

        await advanceTo(client, { program: PROGRAM, line: 13 });

        await assertVariables(client, {
          pc: 21,
          stack: [30],
          scratch: new Map([
            [1, BigInt('18446744073709551615')],
            [5, BigInt('18446744073709551615')],
          ]),
        });
      });
    });
  });

  describe('Global state changes', () => {
    it('should return variables correctly', async () => {
      const simulateTraceFile = path.join(
        DATA_ROOT,
        'app-state-changes/global-simulate-response.json',
      );
      const programSourcesDescriptionFile = path.join(
        DATA_ROOT,
        'app-state-changes/sources.json',
      );

      const { client } = fixture;
      const PROGRAM = path.join(
        DATA_ROOT,
        'app-state-changes/state-changes.teal',
      );

      await client.hitBreakpoint(
        { simulateTraceFile, programSourcesDescriptionFile },
        { path: PROGRAM, line: 3 },
      );

      await assertVariables(client, {
        pc: 6,
        stack: [1050],
        apps: [
          {
            appID: 1050,
            globalState: new ByteArrayMap(),
          },
        ],
      });

      await advanceTo(client, { program: PROGRAM, line: 14 });

      await assertVariables(client, {
        pc: 37,
        stack: [
          Buffer.from('8e169311', 'hex'),
          Buffer.from('8913c1f8', 'hex'),
          Buffer.from('d513c44e', 'hex'),
          Buffer.from('8913c1f8', 'hex'),
        ],
        apps: [
          {
            appID: 1050,
            globalState: new ByteArrayMap(),
          },
        ],
      });

      await advanceTo(client, { program: PROGRAM, line: 31 });

      await assertVariables(client, {
        pc: 121,
        stack: [Buffer.from('global-int-key'), 0xdeadbeef],
        apps: [
          {
            appID: 1050,
            globalState: new ByteArrayMap(),
          },
        ],
      });

      await advanceTo(client, { program: PROGRAM, line: 32 });

      await assertVariables(client, {
        pc: 122,
        stack: [],
        apps: [
          {
            appID: 1050,
            globalState: new ByteArrayMap([
              [Buffer.from('global-int-key'), 0xdeadbeef],
            ]),
          },
        ],
      });

      await advanceTo(client, { program: PROGRAM, line: 35 });

      await assertVariables(client, {
        pc: 156,
        stack: [],
        apps: [
          {
            appID: 1050,
            globalState: new ByteArrayMap<number | bigint | Uint8Array>([
              [Buffer.from('global-int-key'), 0xdeadbeef],
              [Buffer.from('global-bytes-key'), Buffer.from('welt am draht')],
            ]),
          },
        ],
      });
    });
  });

  describe('Local state changes', () => {
    it('should return variables correctly', async () => {
      const simulateTraceFile = path.join(
        DATA_ROOT,
        'app-state-changes/local-simulate-response.json',
      );
      const programSourcesDescriptionFile = path.join(
        DATA_ROOT,
        'app-state-changes/sources.json',
      );

      const { client } = fixture;
      const PROGRAM = path.join(
        DATA_ROOT,
        'app-state-changes/state-changes.teal',
      );

      await client.hitBreakpoint(
        { simulateTraceFile, programSourcesDescriptionFile },
        { path: PROGRAM, line: 3 },
      );

      await assertVariables(client, {
        pc: 6,
        stack: [1054],
        apps: [
          {
            appID: 1054,
            localState: [
              {
                account:
                  'YGOSQB6R5IVQDJHJUHTIZAJNWNIT7VLMWHXFWY2H5HMWPK7QOPXHELNPJ4',
                state: new ByteArrayMap(),
              },
            ],
          },
        ],
      });

      await advanceTo(client, { program: PROGRAM, line: 14 });

      await assertVariables(client, {
        pc: 37,
        stack: [
          Buffer.from('8e169311', 'hex'),
          Buffer.from('8913c1f8', 'hex'),
          Buffer.from('d513c44e', 'hex'),
          Buffer.from('8e169311', 'hex'),
        ],
        apps: [
          {
            appID: 1054,
            localState: [
              {
                account:
                  'YGOSQB6R5IVQDJHJUHTIZAJNWNIT7VLMWHXFWY2H5HMWPK7QOPXHELNPJ4',
                state: new ByteArrayMap(),
              },
            ],
          },
        ],
      });

      await advanceTo(client, { program: PROGRAM, line: 21 });

      await assertVariables(client, {
        pc: 69,
        stack: [
          algosdk.decodeAddress(
            'YGOSQB6R5IVQDJHJUHTIZAJNWNIT7VLMWHXFWY2H5HMWPK7QOPXHELNPJ4',
          ).publicKey,
          Buffer.from('local-int-key'),
          0xcafeb0ba,
        ],
        apps: [
          {
            appID: 1054,
            localState: [
              {
                account:
                  'YGOSQB6R5IVQDJHJUHTIZAJNWNIT7VLMWHXFWY2H5HMWPK7QOPXHELNPJ4',
                state: new ByteArrayMap(),
              },
            ],
          },
        ],
      });

      await advanceTo(client, { program: PROGRAM, line: 22 });

      await assertVariables(client, {
        pc: 70,
        stack: [],
        apps: [
          {
            appID: 1054,
            localState: [
              {
                account:
                  'YGOSQB6R5IVQDJHJUHTIZAJNWNIT7VLMWHXFWY2H5HMWPK7QOPXHELNPJ4',
                state: new ByteArrayMap([
                  [Buffer.from('local-int-key'), 0xcafeb0ba],
                ]),
              },
            ],
          },
        ],
      });

      await advanceTo(client, { program: PROGRAM, line: 26 });

      await assertVariables(client, {
        pc: 96,
        stack: [],
        apps: [
          {
            appID: 1054,
            localState: [
              {
                account:
                  'YGOSQB6R5IVQDJHJUHTIZAJNWNIT7VLMWHXFWY2H5HMWPK7QOPXHELNPJ4',
                state: new ByteArrayMap<number | bigint | Uint8Array>([
                  [Buffer.from('local-int-key'), 0xcafeb0ba],
                  [Buffer.from('local-bytes-key'), Buffer.from('xqcL')],
                ]),
              },
            ],
          },
        ],
      });
    });
  });

  describe('Box state changes', () => {
    it('should return variables correctly', async () => {
      const simulateTraceFile = path.join(
        DATA_ROOT,
        'app-state-changes/box-simulate-response.json',
      );
      const programSourcesDescriptionFile = path.join(
        DATA_ROOT,
        'app-state-changes/sources.json',
      );

      const { client } = fixture;
      const PROGRAM = path.join(
        DATA_ROOT,
        'app-state-changes/state-changes.teal',
      );

      await client.hitBreakpoint(
        { simulateTraceFile, programSourcesDescriptionFile },
        { path: PROGRAM, line: 3 },
      );

      await assertVariables(client, {
        pc: 6,
        stack: [1058],
        apps: [
          {
            appID: 1058,
            boxState: new ByteArrayMap(),
          },
        ],
      });

      await advanceTo(client, { program: PROGRAM, line: 14 });

      await assertVariables(client, {
        pc: 37,
        stack: [
          Buffer.from('8e169311', 'hex'),
          Buffer.from('8913c1f8', 'hex'),
          Buffer.from('d513c44e', 'hex'),
          Buffer.from('d513c44e', 'hex'),
        ],
        apps: [
          {
            appID: 1058,
            boxState: new ByteArrayMap(),
          },
        ],
      });

      await advanceTo(client, { program: PROGRAM, line: 40 });

      await assertVariables(client, {
        pc: 183,
        stack: [Buffer.from('box-key-1'), Buffer.from('box-value-1')],
        apps: [
          {
            appID: 1058,
            boxState: new ByteArrayMap(),
          },
        ],
      });

      await advanceTo(client, { program: PROGRAM, line: 41 });

      await assertVariables(client, {
        pc: 184,
        stack: [],
        apps: [
          {
            appID: 1058,
            boxState: new ByteArrayMap([
              [Buffer.from('box-key-1'), Buffer.from('box-value-1')],
            ]),
          },
        ],
      });

      await advanceTo(client, { program: PROGRAM, line: 46 });

      await assertVariables(client, {
        pc: 198,
        stack: [],
        apps: [
          {
            appID: 1058,
            boxState: new ByteArrayMap([
              [Buffer.from('box-key-1'), Buffer.from('box-value-1')],
              [Buffer.from('box-key-2'), Buffer.from('')],
            ]),
          },
        ],
      });
    });
  });

  describe('Source mapping', () => {
    interface SourceInfo {
      path: string;
      validBreakpoints: DebugProtocol.BreakpointLocation[];
    }

    const testSources: SourceInfo[] = [
      {
        path: path.join(DATA_ROOT, 'sourcemap-test/sourcemap-test.teal'),
        validBreakpoints: [
          { line: 4, column: 1 },
          { line: 4, column: 20 },
          { line: 4, column: 27 },
          { line: 4, column: 31 },
          { line: 7, column: 5 },
          { line: 7, column: 12 },
          { line: 7, column: 19 },
          { line: 8, column: 5 },
          { line: 8, column: 12 },
          { line: 8, column: 19 },
          { line: 12, column: 5 },
          { line: 13, column: 5 },
        ],
      },
      {
        path: path.join(DATA_ROOT, 'sourcemap-test/lib.teal'),
        validBreakpoints: [
          { line: 2, column: 22 },
          { line: 2, column: 26 },
        ],
      },
    ];

    it('should return correct breakpoint locations', async () => {
      const { client } = fixture;

      await Promise.all([
        client.configurationSequence(),
        client.launch({
          simulateTraceFile: path.join(
            DATA_ROOT,
            'sourcemap-test/simulate-response.json',
          ),
          programSourcesDescriptionFile: path.join(
            DATA_ROOT,
            'sourcemap-test/sources.json',
          ),
          stopOnEntry: true,
        }),
        client.assertStoppedLocation('entry', {}),
      ]);

      for (const source of testSources) {
        const response = await client.breakpointLocationsRequest({
          source: {
            path: source.path,
          },
          line: 0,
          endLine: 100,
        });
        assert.ok(response.success);

        const actualBreakpointLocations = response.body.breakpoints.slice();
        // Sort the response so that it's easier to compare
        actualBreakpointLocations.sort((a, b) => {
          if (a.line === b.line) {
            return (a.column ?? 0) - (b.column ?? 0);
          }
          return a.line - b.line;
        });

        assert.deepStrictEqual(
          actualBreakpointLocations,
          source.validBreakpoints,
        );
      }
    });

    it('should correctly set and stop at valid breakpoints', async () => {
      const { client } = fixture;

      await Promise.all([
        client.configurationSequence(),
        client.launch({
          simulateTraceFile: path.join(
            DATA_ROOT,
            'sourcemap-test/simulate-response.json',
          ),
          programSourcesDescriptionFile: path.join(
            DATA_ROOT,
            'sourcemap-test/sources.json',
          ),
          stopOnEntry: true,
        }),
        client.assertStoppedLocation('entry', {}),
      ]);

      for (const source of testSources) {
        const result = await client.setBreakpointsRequest({
          source: { path: source.path },
          breakpoints: source.validBreakpoints,
        });
        assert.ok(result.success);

        assert.ok(result.body.breakpoints.every((bp) => bp.verified));
        const actualBreakpointLocations = result.body.breakpoints.map((bp) => ({
          line: bp.line,
          column: bp.column,
        }));
        assert.deepStrictEqual(
          actualBreakpointLocations,
          source.validBreakpoints,
        );
      }

      // The breakpoints will not necessarily be hit in order, since PCs map to different
      // places in the source file, so we will keep track of which breakpoints have been hit.
      const seenBreakpointLocation: boolean[][] = testSources.map((source) =>
        source.validBreakpoints.map(() => false),
      );

      while (
        seenBreakpointLocation.some((sourceBreakpoints) =>
          sourceBreakpoints.some((seen) => !seen),
        )
      ) {
        await client.continueRequest({ threadId: 1 });
        const stoppedResponse = await client.assertStoppedLocation(
          'breakpoint',
          {},
        );
        const stoppedFrame = stoppedResponse.body.stackFrames[0];
        let found = false;
        for (
          let sourceIndex = 0;
          sourceIndex < testSources.length;
          sourceIndex++
        ) {
          const source = testSources[sourceIndex];
          if (source.path !== stoppedFrame.source?.path) {
            continue;
          }
          for (let i = 0; i < source.validBreakpoints.length; i++) {
            if (
              source.validBreakpoints[i].line === stoppedFrame.line &&
              source.validBreakpoints[i].column === stoppedFrame.column
            ) {
              assert.strictEqual(
                seenBreakpointLocation[sourceIndex][i],
                false,
                `Breakpoint ${i} was hit twice. Line: ${stoppedFrame.line}, Column: ${stoppedFrame.column}, Path: ${source.path}`,
              );
              seenBreakpointLocation[sourceIndex][i] = true;
              found = true;
              break;
            }
          }
        }
        assert.ok(
          found,
          `Breakpoint at path ${stoppedFrame.source?.path}, line ${stoppedFrame.line}, column ${stoppedFrame.column} was not expected`,
        );
      }
    });

    it('should correctly handle invalid breakpoints and not stop at them', async () => {
      const { client } = fixture;

      await Promise.all([
        client.configurationSequence(),
        client.launch({
          simulateTraceFile: path.join(
            DATA_ROOT,
            'sourcemap-test/simulate-response.json',
          ),
          programSourcesDescriptionFile: path.join(
            DATA_ROOT,
            'sourcemap-test/sources.json',
          ),
          stopOnEntry: true,
        }),
        client.assertStoppedLocation('entry', {}),
      ]);

      const result = await client.setBreakpointsRequest({
        source: {
          path: path.join(DATA_ROOT, 'sourcemap-test/sourcemap-test.teal'),
        },
        breakpoints: [
          { line: 0, column: 0 },
          { line: 100, column: 0 },
          { line: 0, column: 100 },
          { line: 100, column: 100 },
        ],
      });
      assert.ok(result.success);

      assert.ok(result.body.breakpoints.every((bp) => !bp.verified));

      await Promise.all([
        client.continueRequest({ threadId: 1 }),
        client.waitForEvent('terminated'),
      ]);
    });
  });

  describe('Errors Reporting', () => {
    it('should correctly report an inner app error', async () => {
      const simulateTraceFile = path.join(
        DATA_ROOT,
        'errors/inner-app/app-reject-simulate-response.json',
      );
      const programSourcesDescriptionFile = path.join(
        DATA_ROOT,
        'errors/inner-app/sources.json',
      );
      const { client } = fixture;

      const program = path.join(DATA_ROOT, 'errors/inner-app/inner.teal');

      await Promise.all([
        client.configurationSequence(),
        client.launch({
          simulateTraceFile,
          programSourcesDescriptionFile,
          stopOnEntry: true,
        }),
        client.assertStoppedLocation('entry', {}),
      ]);

      await client.continueRequest({ threadId: 1 });
      await client.assertStoppedLocation('exception', {
        path: program,
        line: 7,
        column: 1,
      });
      const stoppedEvent = await client.waitForStop();
      assert.ok(
        stoppedEvent.body.text?.includes(
          'logic eval error: logic eval error: assert failed pc=10',
        ),
        stoppedEvent.body.text,
      );
      await assertVariables(client, {
        pc: 10,
        stack: [],
      });

      // Cannot walk forward over the error
      await client.nextRequest({ threadId: 1 });
      await client.assertStoppedLocation('exception', {
        path: program,
        line: 7,
        column: 1,
      });
      await assertVariables(client, {
        pc: 10,
        stack: [],
      });

      // Can walk backwards
      await client.stepBackRequest({ threadId: 1 });
      await client.assertStoppedLocation('step', {
        path: program,
        line: 7,
        column: 1,
      });
      await assertVariables(client, {
        pc: 10, // We're at the same pc, but before the opcode ran, hence the stack value
        stack: [0],
      });

      // And backwards again
      await client.stepBackRequest({ threadId: 1 });
      await client.assertStoppedLocation('step', {
        path: program,
        line: 6,
        column: 1,
      });
      await assertVariables(client, {
        pc: 9,
        stack: [new Uint8Array(8)],
      });

      // Walking forward hits the error again
      await client.continueRequest({ threadId: 1 });
      await client.assertStoppedLocation('exception', {
        path: program,
        line: 7,
        column: 1,
      });
      await assertVariables(client, {
        pc: 10,
        stack: [],
      });
    });

    it('should correctly report an inner transaction error', async () => {
      const simulateTraceFile = path.join(
        DATA_ROOT,
        'errors/inner-app/overspend-simulate-response.json',
      );
      const programSourcesDescriptionFile = path.join(
        DATA_ROOT,
        'errors/inner-app/sources.json',
      );
      const { client } = fixture;

      await Promise.all([
        client.configurationSequence(),
        client.launch({
          simulateTraceFile,
          programSourcesDescriptionFile,
          stopOnEntry: true,
        }),
        client.assertStoppedLocation('entry', {}),
      ]);

      await client.continueRequest({ threadId: 1 });

      let stoppedEvent = await client.waitForStop();
      assert.strictEqual(stoppedEvent.body.reason, 'exception');
      assert.ok(
        stoppedEvent.body.text?.includes('logic eval error: overspend'),
        stoppedEvent.body.text,
      );
      let stackTraceResponse = await client.stackTraceRequest({
        threadId: 1,
      });
      let currentFrame = stackTraceResponse.body.stackFrames[0];
      assert.strictEqual(
        currentFrame.source?.name,
        'inner-transaction-group-0-0.json',
      );
      assert.strictEqual(currentFrame.line, 2);

      // Cannot walk forward over the error
      await client.nextRequest({ threadId: 1 });
      stoppedEvent = await client.waitForStop();
      assert.strictEqual(stoppedEvent.body.reason, 'exception');
      stackTraceResponse = await client.stackTraceRequest({
        threadId: 1,
      });
      currentFrame = stackTraceResponse.body.stackFrames[0];
      assert.strictEqual(
        currentFrame.source?.name,
        'inner-transaction-group-0-0.json',
      );
      assert.strictEqual(currentFrame.line, 2);

      // Can walk backwards
      await client.stepBackRequest({ threadId: 1 });
      stoppedEvent = await client.waitForStop();
      assert.strictEqual(stoppedEvent.body.reason, 'step');
      stackTraceResponse = await client.stackTraceRequest({
        threadId: 1,
      });
      currentFrame = stackTraceResponse.body.stackFrames[0];
      assert.strictEqual(
        currentFrame.source?.name,
        'inner-transaction-group-0-0.json',
      );
      assert.strictEqual(currentFrame.line, 2);

      // And backwards again
      await client.stepBackRequest({ threadId: 1 });
      await client.assertStoppedLocation('step', {
        path: path.join(DATA_ROOT, 'errors/inner-app/outer.teal'),
        line: 12,
        column: 1,
      });

      // Walking forward hits the error again
      await client.continueRequest({ threadId: 1 });
      stoppedEvent = await client.waitForStop();
      assert.strictEqual(stoppedEvent.body.reason, 'exception');
      stackTraceResponse = await client.stackTraceRequest({
        threadId: 1,
      });
      currentFrame = stackTraceResponse.body.stackFrames[0];
      assert.strictEqual(
        currentFrame.source?.name,
        'inner-transaction-group-0-0.json',
      );
      assert.strictEqual(currentFrame.line, 2);
    });

    it('should correctly report a LogicSig error', async () => {
      const simulateTraceFile = path.join(
        DATA_ROOT,
        'errors/logicsig/simulate-response.json',
      );
      const programSourcesDescriptionFile = path.join(
        DATA_ROOT,
        'errors/logicsig/sources.json',
      );
      const { client } = fixture;

      const program = path.join(DATA_ROOT, 'errors/logicsig/lsig-err.teal');

      await Promise.all([
        client.configurationSequence(),
        client.launch({
          simulateTraceFile,
          programSourcesDescriptionFile,
          stopOnEntry: true,
        }),
        client.assertStoppedLocation('entry', {}),
      ]);

      await client.continueRequest({ threadId: 1 });
      await client.assertStoppedLocation('exception', {
        path: program,
        line: 4,
        column: 1,
      });
      const stoppedEvent = await client.waitForStop();
      assert.ok(
        stoppedEvent.body.text?.includes(
          'rejected by logic err=err opcode executed. Details: pc=4',
        ),
        stoppedEvent.body.text,
      );
      await assertVariables(client, {
        pc: 4,
        stack: [0],
      });

      // Cannot walk forward over the error
      await client.nextRequest({ threadId: 1 });
      await client.assertStoppedLocation('exception', {
        path: program,
        line: 4,
        column: 1,
      });
      await assertVariables(client, {
        pc: 4,
        stack: [0],
      });

      // Can walk backwards
      await client.stepBackRequest({ threadId: 1 });
      await client.assertStoppedLocation('step', {
        path: program,
        line: 4,
        column: 1,
      });
      await assertVariables(client, {
        pc: 4, // We're at the same pc, but before the opcode ran
        stack: [0],
      });

      // And backwards again
      await client.stepBackRequest({ threadId: 1 });
      await client.assertStoppedLocation('step', {
        path: program,
        line: 3,
        column: 1,
      });
      await assertVariables(client, {
        pc: 3,
        stack: [2000],
      });

      // Walking forward hits the error again
      await client.continueRequest({ threadId: 1 });
      await client.assertStoppedLocation('exception', {
        path: program,
        line: 4,
        column: 1,
      });
      await assertVariables(client, {
        pc: 4,
        stack: [0],
      });
    });

    it('should step through the LogicSig if it calls a failing app', async () => {
      const simulateTraceFile = path.join(
        DATA_ROOT,
        'errors/app-from-logicsig/simulate-response.json',
      );
      const programSourcesDescriptionFile = path.join(
        DATA_ROOT,
        'errors/app-from-logicsig/sources.json',
      );
      const { client } = fixture;

      const lsigProgram = path.join(
        DATA_ROOT,
        'errors/app-from-logicsig/nine.teal',
      );
      const appProgram = path.join(
        DATA_ROOT,
        'errors/app-from-logicsig/inner.teal',
      );

      await client.hitBreakpoint(
        {
          simulateTraceFile,
          programSourcesDescriptionFile,
        },
        {
          path: lsigProgram,
          line: 2,
          column: 1,
        },
      );

      // clear breakpoint
      await client.setBreakpointsRequest({
        source: { path: lsigProgram },
        breakpoints: [],
      });

      await client.continueRequest({ threadId: 1 });

      await client.assertStoppedLocation('exception', {
        path: appProgram,
        line: 7,
        column: 1,
      });
      const stoppedEvent = await client.waitForStop();
      assert.ok(
        stoppedEvent.body.text?.includes(
          'logic eval error: assert failed pc=10',
        ),
        stoppedEvent.body.text,
      );
    });

    it('should properly handle an error in a transaction before a LogicSig', async () => {
      const simulateTraceFile = path.join(
        DATA_ROOT,
        'errors/logicsig-after-error/simulate-response.json',
      );
      const programSourcesDescriptionFile = path.join(
        DATA_ROOT,
        'errors/logicsig-after-error/sources.json',
      );
      const { client } = fixture;

      const lsigProgram = path.join(
        DATA_ROOT,
        'errors/logicsig-after-error/nine.teal',
      );
      const appProgram = path.join(
        DATA_ROOT,
        'errors/logicsig-after-error/inner.teal',
      );

      await Promise.all([
        client.configurationSequence(),
        client.launch({
          simulateTraceFile,
          programSourcesDescriptionFile,
          stopOnEntry: true,
        }),
        client.assertStoppedLocation('entry', {}),
      ]);

      // Technically the LogicSig program could be executed, since all LogicSigs are processed
      // before transactions, and we have the trace for it. However, in the debugger we interleave
      // LogicSig executions with the rest of the transaction group, so we won't reach it. This test
      // is only here to pin down the behavior, but it might make sense to change this at some point.

      // The breakpoint should not be hit
      await client.setBreakpointsRequest({
        source: { path: lsigProgram },
        breakpoints: [
          {
            line: 2,
            column: 1,
          },
        ],
      });

      await client.continueRequest({ threadId: 1 });

      await client.assertStoppedLocation('exception', {
        path: appProgram,
        line: 7,
        column: 1,
      });

      const stoppedEvent = await client.waitForStop();
      assert.ok(
        stoppedEvent.body.text?.includes(
          'logic eval error: assert failed pc=10',
        ),
        stoppedEvent.body.text,
      );
    });
  });
});
