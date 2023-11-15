import * as algosdk from 'algosdk';
import { ByteArrayMap } from './utils';

export class AppState {
  globalState: ByteArrayMap<algosdk.modelsv2.AvmValue>;
  localState: Map<string, ByteArrayMap<algosdk.modelsv2.AvmValue>>;
  boxState: ByteArrayMap<algosdk.modelsv2.AvmValue>;

  constructor() {
    this.globalState = new ByteArrayMap<algosdk.modelsv2.AvmValue>();
    this.localState = new Map<
      string,
      ByteArrayMap<algosdk.modelsv2.AvmValue>
    >();
    this.boxState = new ByteArrayMap<algosdk.modelsv2.AvmValue>();
  }

  public globalStateArray(): algosdk.modelsv2.AvmKeyValue[] {
    return createAvmKvArray(this.globalState);
  }

  public localStateArray(account: string): algosdk.modelsv2.AvmKeyValue[] {
    const map = this.localState.get(account);
    if (!map) {
      return [];
    }
    return createAvmKvArray(map);
  }

  public boxStateArray(): algosdk.modelsv2.AvmKeyValue[] {
    return createAvmKvArray(this.boxState);
  }

  public clone(): AppState {
    const clone = new AppState();
    clone.globalState = this.globalState.clone();
    clone.localState = new Map(
      Array.from(this.localState.entries(), ([key, value]) => [
        key,
        value.clone(),
      ]),
    );
    clone.boxState = this.boxState.clone();
    return clone;
  }

  public static fromAppInitialState(
    initialState: algosdk.modelsv2.ApplicationInitialStates,
  ): AppState {
    const state = new AppState();

    if (initialState.appGlobals) {
      for (const { key, value } of initialState.appGlobals.kvs) {
        state.globalState.set(key, value);
      }
    }

    for (const appLocal of initialState.appLocals || []) {
      const map = new ByteArrayMap<algosdk.modelsv2.AvmValue>();
      for (const { key, value } of appLocal.kvs) {
        map.set(key, value);
      }
      state.localState.set(appLocal.account!, map);
    }

    if (initialState.appBoxes) {
      for (const { key, value } of initialState.appBoxes.kvs) {
        state.boxState.set(key, value);
      }
    }

    return state;
  }
}

function createAvmKvArray(
  map: ByteArrayMap<algosdk.modelsv2.AvmValue>,
): algosdk.modelsv2.AvmKeyValue[] {
  return Array.from(map.entriesHex())
    .sort()
    .map(
      ([key, value]) =>
        new algosdk.modelsv2.AvmKeyValue({
          key: algosdk.hexToBytes(key),
          value,
        }),
    );
}
