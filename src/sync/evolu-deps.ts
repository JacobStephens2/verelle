import { exhaustiveCheck, type ConsoleDep, type ReloadApp } from "@evolu/common";
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

interface SharedWorkerUnsupportedDep {
  readonly onSharedWorkerUnsupported: () => void;
}

interface SyncTransportEventDep {
  readonly onSyncTransportEvent: (message: OwnerSyncTransportEvent) => void;
}

type VerelleSharedWorkerOutput =
  | SharedWorkerOutput
  | SharedWorkerUnsupported
  | OwnerSyncTransportEvent;

const reloadApp: ReloadApp = (url) => {
  if (typeof document !== "undefined") location.replace(url ?? "/");
};

/**
 * Evolu's web dependencies with one deliberate addition: the Shared worker
 * reports encrypted request acknowledgements for the Chart sync indicator.
 */
export const createVerelleEvoluDeps = (
  deps: Partial<ConsoleDep> &
    Partial<SharedWorkerUnsupportedDep> &
    Partial<SyncTransportEventDep> = {},
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
                  if (deps.onSharedWorkerUnsupported) {
                    deps.onSharedWorkerUnsupported();
                  } else {
                    globalThis.alert(
                      "Verelle is already open. Close this copy and use the first one.",
                    );
                  }
                  break;
                default:
                  exhaustiveCheck(message);
              }
            }
          : null;
      },
    },
  };

  return createCommonEvoluDeps({
    ...deps,
    createDbWorker,
    createBroadcastChannel,
    createMessageChannel,
    lockManager: globalThis.navigator.locks,
    reloadApp,
    sharedWorker,
  });
};
