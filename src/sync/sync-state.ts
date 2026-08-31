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
    }
  | {
      readonly type: "request-abandoned";
      readonly carriesChanges: boolean;
    }
  | { readonly type: "remote-changes-received" }
  | { readonly type: "connection-lost" };

export interface SyncStateMonitor {
  /** The Shared owner's current Relay state. */
  readonly observe: () => Readonly<Ref<SyncState>>;

  /** Marks a local save pending before any network work begins. */
  readonly markLocalChange: () => void;

  /** Marks one or more remote query refreshes applied to the Chart. */
  readonly markChartUpdatesApplied: (updateCount: number) => void;

  /** Applies one fact observed at the encrypted transport seam. */
  readonly handle: (event: SyncTransportEvent) => void;
}

/** Reduces Relay and query-refresh facts to the two states shown on the Chart. */
export function createSyncState(): SyncStateMonitor {
  const state = ref<SyncState>("pending");
  let waitingForChangeRequest = false;
  let inFlightRequests = 0;
  let pendingChartUpdates = 0;
  let relayAcknowledged = false;

  const refresh = () => {
    state.value =
      relayAcknowledged &&
      !waitingForChangeRequest &&
      inFlightRequests === 0 &&
      pendingChartUpdates === 0
        ? "synced"
        : "pending";
  };

  return {
    observe: () => state,
    markLocalChange: () => {
      waitingForChangeRequest = true;
      refresh();
    },
    markChartUpdatesApplied: (updateCount) => {
      pendingChartUpdates = Math.max(0, pendingChartUpdates - updateCount);
      refresh();
    },
    handle: (event) => {
      if (event.type === "remote-changes-received") {
        pendingChartUpdates += 1;
        refresh();
        return;
      }
      if (event.type === "connection-lost") {
        relayAcknowledged = false;
        refresh();
        return;
      }
      if (event.type === "request-sent") {
        state.value = "pending";
        inFlightRequests += 1;
        if (event.carriesChanges) {
          waitingForChangeRequest = false;
        }
        return;
      }
      if (event.type === "request-abandoned") {
        relayAcknowledged = false;
        if (inFlightRequests > 0) inFlightRequests -= 1;
        if (event.carriesChanges) {
          waitingForChangeRequest = true;
        }
        refresh();
        return;
      }
      if (event.type === "request-acknowledged") {
        relayAcknowledged = true;
        if (inFlightRequests > 0) inFlightRequests -= 1;
        refresh();
      }
    },
  };
}
