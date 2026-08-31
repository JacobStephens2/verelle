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
  | { readonly type: "connection-lost" };

export interface SyncStateMonitor {
  /** The Shared owner's current Relay state. */
  readonly observe: () => Readonly<Ref<SyncState>>;

  /** Marks a local save pending before any network work begins. */
  readonly markLocalChange: () => void;

  /** Applies one fact observed at the encrypted transport seam. */
  readonly handle: (event: SyncTransportEvent) => void;
}

/** Reduces Relay request/response facts to the two states shown on the Chart. */
export function createSyncState(): SyncStateMonitor {
  const state = ref<SyncState>("pending");
  let waitingForChangeRequest = false;
  let inFlightChangeRequests = 0;

  return {
    observe: () => state,
    markLocalChange: () => {
      waitingForChangeRequest = true;
      state.value = "pending";
    },
    handle: (event) => {
      if (event.type === "connection-lost") {
        state.value = "pending";
        return;
      }
      if (event.type === "request-sent" && event.carriesChanges) {
        waitingForChangeRequest = false;
        inFlightChangeRequests += 1;
        return;
      }
      if (event.type === "request-abandoned" && event.carriesChanges) {
        if (inFlightChangeRequests > 0) inFlightChangeRequests -= 1;
        waitingForChangeRequest = true;
        state.value = "pending";
        return;
      }
      if (event.type === "request-acknowledged") {
        if (event.carriesChanges && inFlightChangeRequests > 0) {
          inFlightChangeRequests -= 1;
        }
        if (!waitingForChangeRequest && inFlightChangeRequests === 0) {
          state.value = "synced";
        }
      }
    },
  };
}
