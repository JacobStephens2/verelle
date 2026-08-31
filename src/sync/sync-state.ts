import { ref, type Ref } from "vue";

export type SyncState = "pending" | "synced";

export type SyncTransportEvent =
  | {
      readonly type: "request-sent";
      readonly carriesChanges: boolean;
    }
  | {
      readonly type: "request-acknowledged";
      readonly carriesChanges: boolean;
      readonly carriesRemoteChanges: boolean;
    }
  | {
      readonly type: "request-abandoned";
      readonly carriesChanges: boolean;
    }
  | { readonly type: "connection-lost" };

export interface SyncStateMonitor {
  /** The Shared owner's current Relay state. */
  readonly observe: () => Readonly<Ref<SyncState>>;

  /** Marks a local save pending before any network work begins. */
  readonly markLocalChange: () => void;

  /** Marks query refresh completion after remote changes were applied. */
  readonly markChartCurrent: () => void;

  /** Applies one fact observed at the encrypted transport seam. */
  readonly handle: (event: SyncTransportEvent) => void;
}

/** Reduces Relay and query-refresh facts to the two states shown on the Chart. */
export function createSyncState(): SyncStateMonitor {
  const state = ref<SyncState>("pending");
  let waitingForChangeRequest = false;
  let inFlightChangeRequests = 0;
  let waitingForChartUpdate = false;
  let relayAcknowledged = false;

  const refresh = () => {
    state.value =
      relayAcknowledged &&
      !waitingForChangeRequest &&
      inFlightChangeRequests === 0 &&
      !waitingForChartUpdate
        ? "synced"
        : "pending";
  };

  return {
    observe: () => state,
    markLocalChange: () => {
      waitingForChangeRequest = true;
      refresh();
    },
    markChartCurrent: () => {
      waitingForChartUpdate = false;
      refresh();
    },
    handle: (event) => {
      if (event.type === "connection-lost") {
        relayAcknowledged = false;
        refresh();
        return;
      }
      if (event.type === "request-sent") {
        state.value = "pending";
        if (event.carriesChanges) {
          waitingForChangeRequest = false;
          inFlightChangeRequests += 1;
        }
        return;
      }
      if (event.type === "request-abandoned") {
        relayAcknowledged = false;
        if (event.carriesChanges) {
          if (inFlightChangeRequests > 0) inFlightChangeRequests -= 1;
          waitingForChangeRequest = true;
        }
        refresh();
        return;
      }
      if (event.type === "request-acknowledged") {
        relayAcknowledged = true;
        if (event.carriesChanges && inFlightChangeRequests > 0) {
          inFlightChangeRequests -= 1;
        }
        if (event.carriesRemoteChanges) waitingForChartUpdate = true;
        refresh();
      }
    },
  };
}
