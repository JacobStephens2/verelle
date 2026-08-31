import {
  createBuffer,
  idBytesTypeValueLength,
  ok,
  type CreateWebSocket,
  type OwnerId,
} from "@evolu/common";
import {
  decodeNonNegativeInt,
  MessageType,
  ownerWriteKeyLength,
  parseProtocolHeader,
  ProtocolErrorCode,
  type ProtocolMessage,
} from "@evolu/common/local-first";

import type { SyncTransportEvent } from "./sync-state";

export interface SyncRequest {
  readonly ownerId: OwnerId;
  readonly carriesChanges: boolean;
}

export interface SyncTransportTracker {
  readonly sent: (message: ProtocolMessage) => void;
  readonly received: (message: ArrayBuffer) => void;
  readonly disconnected: () => void;
}

export interface OwnerSyncTransportEvent {
  readonly type: "SyncTransportEvent";
  readonly ownerId: OwnerId;
  readonly event: SyncTransportEvent;
}

type PublishSyncTransportEvent = (
  ownerId: OwnerId,
  event: SyncTransportEvent,
) => void;

function readProtocolBody(
  message: Uint8Array,
  expectedMessageType:
    | (typeof MessageType)["Request"]
    | (typeof MessageType)["Response"],
): {
  readonly ownerId: OwnerId;
  readonly buffer: ReturnType<typeof createBuffer>;
} | null {
  const header = parseProtocolHeader(message);
  if (!header.ok || header.value.messageType !== expectedMessageType) return null;

  try {
    const buffer = createBuffer(message);
    decodeNonNegativeInt(buffer);
    buffer.shiftN(idBytesTypeValueLength);
    buffer.shift();
    return { ownerId: header.value.ownerId, buffer };
  } catch {
    return null;
  }
}

/** Reads only the public Evolu header and encrypted-message count. */
export function readSyncRequest(message: ProtocolMessage): SyncRequest | null {
  const body = readProtocolBody(message, MessageType.Request);
  if (body === null) return null;

  try {
    const { buffer } = body;
    const hasWriteKey = buffer.shift();
    if (hasWriteKey === 1) buffer.shiftN(ownerWriteKeyLength);
    buffer.shift();
    const messageCount = decodeNonNegativeInt(buffer);

    return {
      ownerId: body.ownerId,
      carriesChanges: messageCount > 0,
    };
  } catch {
    return null;
  }
}

function readSyncResponse(message: Uint8Array): {
  readonly ownerId: OwnerId;
  readonly succeeded: boolean;
  readonly carriesRemoteChanges: boolean;
} | null {
  const body = readProtocolBody(message, MessageType.Response);
  if (body === null) return null;

  try {
    return {
      ownerId: body.ownerId,
      succeeded: body.buffer.shift() === ProtocolErrorCode.NoError,
      carriesRemoteChanges: decodeNonNegativeInt(body.buffer) > 0,
    };
  } catch {
    return null;
  }
}

/** Matches Relay responses to encrypted requests without inspecting content. */
export function createSyncTransportTracker(
  publish: PublishSyncTransportEvent,
): SyncTransportTracker {
  const requestsByOwner = new Map<OwnerId, boolean[]>();
  const observedOwners = new Set<OwnerId>();
  const report: PublishSyncTransportEvent = (ownerId, event) => {
    try {
      publish(ownerId, event);
    } catch {
      // Status is telemetry over an otherwise-working encrypted transport.
      // A platform message-channel fault must never interrupt synchronization.
    }
  };

  return {
    sent: (message) => {
      const request = readSyncRequest(message);
      if (request === null) return;
      observedOwners.add(request.ownerId);
      const requests = requestsByOwner.get(request.ownerId) ?? [];
      requests.push(request.carriesChanges);
      requestsByOwner.set(request.ownerId, requests);
      report(request.ownerId, {
        type: "request-sent",
        carriesChanges: request.carriesChanges,
      });
    },
    received: (message) => {
      const response = readSyncResponse(new Uint8Array(message));
      if (response === null) return;
      const requests = requestsByOwner.get(response.ownerId);
      if (requests === undefined) return;
      const carriesChanges = requests.shift();
      if (carriesChanges === undefined) return;
      if (requests.length === 0) requestsByOwner.delete(response.ownerId);
      report(
        response.ownerId,
        response.succeeded
          ? {
              type: "request-acknowledged",
              carriesChanges,
              carriesRemoteChanges: response.carriesRemoteChanges,
            }
          : { type: "request-abandoned", carriesChanges },
      );
    },
    disconnected: () => {
      for (const [ownerId, requests] of requestsByOwner) {
        for (const carriesChanges of requests) {
          report(ownerId, { type: "request-abandoned", carriesChanges });
        }
      }
      requestsByOwner.clear();
      for (const ownerId of observedOwners) {
        report(ownerId, { type: "connection-lost" });
      }
    },
  };
}

/** Adds acknowledgement observation to Evolu's WebSocket without changing it. */
export const trackWebSocketSync = (
  createWebSocket: CreateWebSocket,
  publish: PublishSyncTransportEvent,
): CreateWebSocket =>
  (url, options = {}) =>
  async (run) => {
    const tracker = createSyncTransportTracker(publish);
    const result = await createWebSocket(url, {
      ...options,
      onClose: (event) => {
        tracker.disconnected();
        options.onClose?.(event);
      },
      onMessage: (data) => {
        if (data instanceof ArrayBuffer) tracker.received(data);
        options.onMessage?.(data);
      },
    })(run);
    if (!result.ok) return result;

    const socket = result.value;
    return ok({
      send: (data) => {
        const sent = socket.send(data);
        if (sent.ok && data instanceof Uint8Array) {
          tracker.sent(data as ProtocolMessage);
        }
        return sent;
      },
      getReadyState: socket.getReadyState,
      isOpen: socket.isOpen,
      [Symbol.asyncDispose]: () => socket[Symbol.asyncDispose](),
    });
  };
