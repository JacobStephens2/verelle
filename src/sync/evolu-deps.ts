import {
  exhaustiveCheck,
  type ConsoleDep,
  type CreateMessageChannel,
  type MessagePort,
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

interface RemoteEvoluQueriesRefreshedDep {
  readonly onRemoteEvoluQueriesRefreshed: (updateCount: number) => void;
}

type VerelleSharedWorkerOutput =
  | SharedWorkerOutput
  | SharedWorkerUnsupported
  | OwnerSyncTransportEvent;

const reloadApp: ReloadApp = (url) => {
  if (typeof document !== "undefined") location.replace(url ?? "/");
};

interface RemoteQueryRefreshObserver {
  readonly sent: (message: unknown) => void;
  readonly received: (message: unknown, apply: () => void) => void;
}

function hasType(message: unknown, type: string): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === type
  );
}

/** Correlates each remote RefreshQueries request with its applied query patch. */
export function createRemoteQueryRefreshObserver(
  onApplied: (updateCount: number) => void,
): RemoteQueryRefreshObserver {
  let refreshesAwaitingQuery = 0;
  const remoteRefreshCountsByPatch: number[] = [];

  return {
    sent: (message) => {
      if (hasType(message, "Query")) {
        remoteRefreshCountsByPatch.push(refreshesAwaitingQuery);
        refreshesAwaitingQuery = 0;
      } else if (hasType(message, "Mutate")) {
        remoteRefreshCountsByPatch.push(0);
      }
    },
    received: (message, apply) => {
      if (hasType(message, "RefreshQueries")) refreshesAwaitingQuery += 1;
      apply();
      if (!hasType(message, "OnPatchesByQuery")) return;

      const updateCount = remoteRefreshCountsByPatch.shift() ?? 0;
      if (updateCount > 0) onApplied(updateCount);
    },
  };
}

function interceptMessagePort<Input, SourceOutput, Output>(
  port: MessagePort<Input, SourceOutput>,
  intercept: (
    message: SourceOutput,
    listener: (message: Output) => void,
  ) => void,
  observeSent?: (message: Input) => void,
): MessagePort<Input, Output> {
  let onMessage: ((message: Output) => void) | null = null;

  return {
    postMessage: (message, transfer) => {
      observeSent?.(message);
      port.postMessage(message, transfer);
    },
    native: port.native as MessagePort<Input, Output>["native"],
    [Symbol.dispose]: () => port[Symbol.dispose](),
    get onMessage() {
      return onMessage;
    },
    set onMessage(listener) {
      onMessage = listener;
      port.onMessage = listener
        ? (message) => {
            intercept(message, listener);
          }
        : null;
    },
  };
}

/**
 * Evolu's web dependencies with two status observations: the Shared worker
 * reports encrypted Relay acknowledgements, and the page reports when the
 * resulting query patches have been applied to the Chart.
 */
export const createVerelleEvoluDeps = (
  deps: Partial<ConsoleDep> &
    Partial<SyncTransportEventDep> &
    Partial<RemoteEvoluQueriesRefreshedDep> = {},
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
  const sharedWorker: CommonSharedWorker = {
    [Symbol.dispose]: () => webSharedWorker[Symbol.dispose](),
    port: interceptMessagePort(webSharedWorker.port, (message, listener) => {
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
    }),
  };

  const createObservedMessageChannel: CreateMessageChannel = <Input, Output>() => {
    const channel = createMessageChannel<Input, Output>();
    const remoteQueries = createRemoteQueryRefreshObserver((updateCount) => {
      deps.onRemoteEvoluQueriesRefreshed?.(updateCount);
    });

    return {
      [Symbol.dispose]: () => channel[Symbol.dispose](),
      port1: interceptMessagePort<Input, Output, Output>(
        channel.port1,
        (message, listener) => {
          remoteQueries.received(message, () => listener(message));
        },
        remoteQueries.sent,
      ),
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
