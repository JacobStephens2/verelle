/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope | SharedWorkerGlobalScope;

import { installPolyfills } from "@evolu/common/polyfills";
installPolyfills();

import { createWebSocket, ok, waitForAbort } from "@evolu/common";
import type {
  SharedWorkerInput,
  SharedWorkerOutput,
} from "@evolu/common/local-first";
import { initSharedWorker } from "@evolu/common/local-first";
import {
  createOneTabSharedWorkerSelfPolyfill,
  createRun,
  createSharedWorkerSelf,
  createWorkerDeps,
} from "@evolu/web";

import type { SharedWorkerUnsupported } from "./evolu-deps";
import type { OwnerSyncTransportEvent } from "./sync-transport";
import { trackWebSocketSync } from "./sync-transport";

const trackedWebSocket = trackWebSocketSync(createWebSocket, (ownerId, event) => {
  // Verelle always selects Evolu's one-tab DedicatedWorker path before these
  // deps are created. Reuse that worker's existing message port instead of
  // adding a second cross-realm channel only for status telemetry.
  if (!("postMessage" in self)) return;
  const message: OwnerSyncTransportEvent = {
    type: "SyncTransportEvent",
    ownerId,
    event,
  };
  self.postMessage(message);
});

const run = createRun({
  ...createWorkerDeps(),
  createWebSocket: trackedWebSocket,
  lockManager: globalThis.navigator.locks,
});

void run(async (run) => {
  if ("onconnect" in self) {
    await using _ = await run.ok(initSharedWorker(createSharedWorkerSelf(self)));
    return await run(waitForAbort);
  }

  using workerSelf = createOneTabSharedWorkerSelfPolyfill<
    SharedWorkerInput,
    SharedWorkerOutput
  >(self);

  await globalThis.navigator.locks.request(
    "evolu-one-tab-sharedworker-polyfill",
    { ifAvailable: true, mode: "exclusive" },
    async (lock) => {
      if (!lock) {
        const message: SharedWorkerUnsupported = {
          type: "SharedWorkerUnsupported",
        };
        self.postMessage(message);
        return;
      }

      await using _ = await run.ok(initSharedWorker(workerSelf));
      await run(waitForAbort);
    },
  );

  return ok();
});
