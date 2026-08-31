import { describe, expect, it } from "vitest";

import { createSyncState } from "./sync-state";

describe("Shared owner sync state", () => {
  it("stays pending until the Relay acknowledges the initial sync", () => {
    const sync = createSyncState();

    expect(sync.observe().value).toBe("pending");

    sync.handle({ type: "request-sent", carriesChanges: false });
    expect(sync.observe().value).toBe("pending");

    sync.handle({
      type: "request-acknowledged",
      carriesChanges: false,
    });
    expect(sync.observe().value).toBe("synced");
  });

  it("does not call a local change synced after an unrelated acknowledgement", () => {
    const sync = createSyncState();
    sync.handle({ type: "request-sent", carriesChanges: false });
    sync.handle({
      type: "request-acknowledged",
      carriesChanges: false,
    });

    sync.markLocalChange();
    sync.handle({ type: "request-sent", carriesChanges: false });
    sync.handle({
      type: "request-acknowledged",
      carriesChanges: false,
    });

    expect(sync.observe().value).toBe("pending");

    sync.handle({ type: "request-sent", carriesChanges: true });
    sync.handle({
      type: "request-acknowledged",
      carriesChanges: true,
    });
    expect(sync.observe().value).toBe("synced");
  });

  it("waits for every in-flight change request", () => {
    const sync = createSyncState();
    sync.handle({ type: "request-sent", carriesChanges: false });
    sync.handle({
      type: "request-acknowledged",
      carriesChanges: false,
    });

    sync.markLocalChange();
    sync.handle({ type: "request-sent", carriesChanges: true });
    sync.markLocalChange();
    sync.handle({ type: "request-sent", carriesChanges: true });

    sync.handle({
      type: "request-acknowledged",
      carriesChanges: true,
    });
    expect(sync.observe().value).toBe("pending");

    sync.handle({
      type: "request-acknowledged",
      carriesChanges: true,
    });
    expect(sync.observe().value).toBe("synced");
  });

  it("keeps an abandoned change pending until reconnect sends it again", () => {
    const sync = createSyncState();
    sync.handle({ type: "request-sent", carriesChanges: false });
    sync.handle({
      type: "request-acknowledged",
      carriesChanges: false,
    });

    sync.markLocalChange();
    sync.handle({ type: "request-sent", carriesChanges: true });
    sync.handle({ type: "request-abandoned", carriesChanges: true });
    expect(sync.observe().value).toBe("pending");

    sync.handle({ type: "request-sent", carriesChanges: true });
    sync.handle({
      type: "request-acknowledged",
      carriesChanges: true,
    });
    expect(sync.observe().value).toBe("synced");
  });

  it("marks a disconnected Chart pending until reconnect finishes syncing", () => {
    const sync = createSyncState();
    sync.handle({ type: "request-sent", carriesChanges: false });
    sync.handle({
      type: "request-acknowledged",
      carriesChanges: false,
    });
    expect(sync.observe().value).toBe("synced");

    sync.handle({ type: "connection-lost" });
    expect(sync.observe().value).toBe("pending");

    sync.handle({ type: "request-sent", carriesChanges: false });
    sync.handle({
      type: "request-acknowledged",
      carriesChanges: false,
    });
    expect(sync.observe().value).toBe("synced");
  });

  it("waits for a response's remote changes to publish onto the Chart", () => {
    const sync = createSyncState();
    sync.markChartUpdatesApplied(1);
    expect(sync.observe().value).toBe("pending");

    sync.handle({ type: "request-sent", carriesChanges: false });
    sync.handle({
      type: "request-acknowledged",
      carriesChanges: false,
    });
    sync.handle({ type: "remote-changes-received" });
    expect(sync.observe().value).toBe("pending");

    sync.markChartUpdatesApplied(1);
    expect(sync.observe().value).toBe("synced");
  });

  it("waits for a follow-up sync round after publishing remote changes", () => {
    const sync = createSyncState();

    sync.handle({ type: "request-sent", carriesChanges: false });
    sync.handle({
      type: "request-acknowledged",
      carriesChanges: false,
    });
    sync.handle({ type: "remote-changes-received" });
    sync.handle({ type: "request-sent", carriesChanges: false });

    sync.markChartUpdatesApplied(1);
    expect(sync.observe().value).toBe("pending");

    sync.handle({
      type: "request-acknowledged",
      carriesChanges: false,
    });
    expect(sync.observe().value).toBe("synced");
  });

  it("shows an unsolicited Relay broadcast as pending until it reaches the Chart", () => {
    const sync = createSyncState();
    sync.handle({ type: "request-sent", carriesChanges: false });
    sync.handle({
      type: "request-acknowledged",
      carriesChanges: false,
    });

    sync.handle({ type: "remote-changes-received" });
    expect(sync.observe().value).toBe("pending");

    sync.markChartUpdatesApplied(1);
    expect(sync.observe().value).toBe("synced");
  });

  it("waits for every broadcast to reach the Chart", () => {
    const sync = createSyncState();
    sync.handle({ type: "request-sent", carriesChanges: false });
    sync.handle({
      type: "request-acknowledged",
      carriesChanges: false,
    });

    sync.handle({ type: "remote-changes-received" });
    sync.handle({ type: "remote-changes-received" });
    sync.markChartUpdatesApplied(1);
    expect(sync.observe().value).toBe("pending");

    sync.markChartUpdatesApplied(1);
    expect(sync.observe().value).toBe("synced");
  });

  it("shows a change-free refresh as pending until its acknowledgement", () => {
    const sync = createSyncState();
    sync.handle({ type: "request-sent", carriesChanges: false });
    sync.handle({
      type: "request-acknowledged",
      carriesChanges: false,
    });

    sync.handle({ type: "request-sent", carriesChanges: false });
    expect(sync.observe().value).toBe("pending");
  });
});
