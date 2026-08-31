import {
  exhaustiveCheck,
  type ConsoleDep,
  type CreateMessageChannel,
  type ReloadApp,
} from "@evolu/common";
import type {
  CreateDbWorker,
  DbWorkerInit,
  EvoluDeps,
  SharedWorker as CommonSharedWorker,
  SharedWorkerInput,
  SharedWorkerOutput,
} from "@evolu/common/local-first";
import { createEvoluDeps as createCommonEvoluDeps } from "@evolu/common/local-first";
import {
  createBroadcastChannel,
  createMessageChannel,
  createSharedWorker,
  createWorker,
  installOneTabSharedWorkerPolyfill,
} from "@evolu/web";

import type { OwnerSyncTransportEvent } from "./sync-transport";

export interface SharedWorkerUnsupported {
  readonly type: "SharedWorkerUnsupported";
}

interface SyncTransportEventDep {
  readonly onSyncTransportEvent: (message: OwnerSyncTransportEvent) => void;
}

interface EvoluQueriesRefreshedDep {
  readonly onEvoluQueriesRefreshed: () => void;
}

type VerelleSharedWorkerOutput =
  | SharedWorkerOutput
  | SharedWorkerUnsupported
  | OwnerSyncTransportEvent;

const reloadApp: ReloadApp = (url) => {
  if (typeof document !== "undefined") location.replace(url ?? "/");
};

/**
 * Evolu's web dependencies with two status observations: the Shared worker
 * reports encrypted Relay acknowledgements, and the page reports when the
 * resulting query patches have been applied to the Chart.
 */
export const createVerelleEvoluDeps = (
  deps: Partial<ConsoleDep> &
    Partial<SyncTransportEventDep> &
    Partial<EvoluQueriesRefreshedDep> = {},
): EvoluDeps => {
  installOneTabSharedWorkerPolyfill();

  const createDbWorker: CreateDbWorker = () =>
    createWorker<DbWorkerInit, never>(
      new Worker(new URL("./evolu-db.worker.ts", import.meta.url), {
        type: "module",
      }),
    );

  const webSharedWorker = createSharedWorker<
    SharedWorkerInput,
    VerelleSharedWorkerOutput
  >(
    new SharedWorker(new URL("./evolu-shared.worker.ts", import.meta.url), {
      type: "module",
    }),
  );
  let onSharedWorkerMessage: ((message: SharedWorkerOutput) => void) | null = null;
  const commonPort = webSharedWorker.port as unknown as CommonSharedWorker["port"];
  const sharedWorker: CommonSharedWorker = {
    [Symbol.dispose]: () => webSharedWorker[Symbol.dispose](),
    port: {
      postMessage: commonPort.postMessage,
      native: commonPort.native,
      [Symbol.dispose]: () => commonPort[Symbol.dispose](),
      get onMessage() {
        return onSharedWorkerMessage;
      },
      set onMessage(listener) {
        onSharedWorkerMessage = listener;
        webSharedWorker.port.onMessage = listener
          ? (message: VerelleSharedWorkerOutput) => {
              switch (message.type) {
                case "DbWorkerInit":
                  listener(message);
                  break;
                case "SyncTransportEvent":
                  deps.onSyncTransportEvent?.(message);
                  break;
                case "SharedWorkerUnsupported":
                  globalThis.alert(
                    "Verelle is already open. Close this copy and use the first one.",
                  );
                  break;
                default:
                  exhaustiveCheck(message);
              }
            }
          : null;
      },
    },
  };

  const createObservedMessageChannel: CreateMessageChannel = <Input, Output>() => {
    const channel = createMessageChannel<Input, Output>();
    const nativePort = channel.port1;
    let onMessage: ((message: Output) => void) | null = null;

    return {
      [Symbol.dispose]: () => channel[Symbol.dispose](),
      port1: {
        postMessage: nativePort.postMessage,
        native: nativePort.native,
        [Symbol.dispose]: () => nativePort[Symbol.dispose](),
        get onMessage() {
          return onMessage;
        },
        set onMessage(listener) {
          onMessage = listener;
          nativePort.onMessage = listener
            ? (message) => {
                listener(message);
                if (
                  typeof message === "object" &&
                  message !== null &&
                  "type" in message &&
                  message.type === "OnPatchesByQuery"
                ) {
                  deps.onEvoluQueriesRefreshed?.();
                }
              }
            : null;
        },
      },
      port2: channel.port2,
    };
  };

  return createCommonEvoluDeps({
    ...deps,
    createDbWorker,
    createBroadcastChannel,
    createMessageChannel: createObservedMessageChannel,
    lockManager: globalThis.navigator.locks,
    reloadApp,
    sharedWorker,
  });
};
