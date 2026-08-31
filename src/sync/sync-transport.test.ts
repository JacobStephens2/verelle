import {
  createBuffer,
  createSharedOwner,
  NonNegativeInt,
  ok,
  ownerIdToOwnerIdBytes,
  testOwnerSecret,
  type CreateWebSocket,
} from "@evolu/common";
import {
  encodeNonNegativeInt,
  MessageType,
  protocolVersion,
  SubscriptionFlags,
  type ProtocolMessage,
} from "@evolu/common/local-first";
import { describe, expect, it } from "vitest";

import {
  createSyncTransportTracker,
  readSyncRequest,
  trackWebSocketSync,
} from "./sync-transport";
import type { SyncTransportEvent } from "./sync-state";

const owner = createSharedOwner(testOwnerSecret);

function requestWithMessageCount(messageCount: number): ProtocolMessage {
  const buffer = createBuffer();
  encodeNonNegativeInt(buffer, protocolVersion);
  buffer.extend(ownerIdToOwnerIdBytes(owner.id));
  buffer.extend([MessageType.Request, 1]);
  buffer.extend(owner.writeKey);
  buffer.extend([SubscriptionFlags.None]);
  encodeNonNegativeInt(buffer, NonNegativeInt.orThrow(messageCount));
  return buffer.unwrap() as ProtocolMessage;
}

function responseWithMessageCount(messageCount: number): ArrayBuffer {
  const buffer = createBuffer();
  encodeNonNegativeInt(buffer, protocolVersion);
  buffer.extend(ownerIdToOwnerIdBytes(owner.id));
  buffer.extend([MessageType.Response, 0]);
  encodeNonNegativeInt(buffer, NonNegativeInt.orThrow(messageCount));
  return buffer.unwrap().slice().buffer;
}

describe("the encrypted sync transport", () => {
  it("distinguishes a sync probe from a request carrying changes", () => {
    expect(readSyncRequest(requestWithMessageCount(0))).toEqual({
      ownerId: owner.id,
      carriesChanges: false,
    });
    expect(readSyncRequest(requestWithMessageCount(2))).toEqual({
      ownerId: owner.id,
      carriesChanges: true,
    });
  });

  it("matches a successful Relay response to the request it acknowledges", () => {
    const events: SyncTransportEvent[] = [];
    const tracker = createSyncTransportTracker((ownerId, event) => {
      if (ownerId === owner.id) events.push(event);
    });

    tracker.sent(requestWithMessageCount(2));
    tracker.received(responseWithMessageCount(0));

    expect(events).toEqual([
      { type: "request-sent", carriesChanges: true },
      {
        type: "request-acknowledged",
        carriesChanges: true,
        carriesRemoteChanges: false,
      },
    ]);
  });

  it("abandons unanswered requests when the Relay connection closes", () => {
    const events: SyncTransportEvent[] = [];
    const tracker = createSyncTransportTracker((ownerId, event) => {
      if (ownerId === owner.id) events.push(event);
    });

    tracker.sent(requestWithMessageCount(1));
    tracker.disconnected();

    expect(events).toEqual([
      { type: "request-sent", carriesChanges: true },
      { type: "request-abandoned", carriesChanges: true },
      { type: "connection-lost" },
    ]);
  });

  it("reports when an already-synced owner loses its Relay connection", () => {
    const events: SyncTransportEvent[] = [];
    const tracker = createSyncTransportTracker((ownerId, event) => {
      if (ownerId === owner.id) events.push(event);
    });

    tracker.sent(requestWithMessageCount(0));
    tracker.received(responseWithMessageCount(0));
    tracker.disconnected();

    expect(events.at(-1)).toEqual({ type: "connection-lost" });
  });

  it("reports when a Relay response carries remote changes", () => {
    const events: SyncTransportEvent[] = [];
    const tracker = createSyncTransportTracker((ownerId, event) => {
      if (ownerId === owner.id) events.push(event);
    });

    tracker.sent(requestWithMessageCount(0));
    tracker.received(responseWithMessageCount(2));

    expect(events.at(-1)).toEqual({
      type: "request-acknowledged",
      carriesChanges: false,
      carriesRemoteChanges: true,
    });
  });

  it("never lets status reporting interrupt the encrypted transport", () => {
    const tracker = createSyncTransportTracker(() => {
      throw new Error("the status channel is unavailable");
    });

    expect(() => tracker.sent(requestWithMessageCount(1))).not.toThrow();
    expect(() => tracker.disconnected()).not.toThrow();
  });

  it("marks a remote response pending before Evolu starts applying it", async () => {
    const order: string[] = [];
    let receive: ((data: string | ArrayBuffer | Blob) => void) | undefined;
    const createWebSocket: CreateWebSocket = (_url, options) => async () => {
      receive = options?.onMessage;
      return ok({
        send: () => ok(),
        getReadyState: () => "open" as const,
        isOpen: () => true,
        [Symbol.asyncDispose]: async () => undefined,
      });
    };
    const tracked = await trackWebSocketSync(createWebSocket, (_ownerId, event) => {
      order.push(`status:${event.type}`);
    })("wss://relay.test", {
      onMessage: () => order.push("evolu"),
    })(undefined as never);
    if (!tracked.ok) throw new Error("The test WebSocket did not open");

    tracked.value.send(requestWithMessageCount(0));
    order.length = 0;
    receive?.(responseWithMessageCount(1));

    expect(order).toEqual(["status:request-acknowledged", "evolu"]);
  });
});
