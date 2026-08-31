import { describe, expect, it } from "vitest";

import { createRemoteQueryRefreshObserver } from "./evolu-deps";

describe("remote Evolu query refresh observation", () => {
  it("does not mistake an interleaved local mutation patch for the remote patch", () => {
    const events: string[] = [];
    const observer = createRemoteQueryRefreshObserver((updateCount) => {
      events.push(`remote:${updateCount}`);
    });

    observer.sent({ type: "Mutate" });
    observer.received({ type: "RefreshQueries" }, () => {
      observer.sent({ type: "Query" });
    });

    observer.received({ type: "OnPatchesByQuery" }, () => {
      events.push("local-applied");
    });
    expect(events).toEqual(["local-applied"]);

    observer.received({ type: "OnPatchesByQuery" }, () => {
      events.push("remote-applied");
    });
    expect(events).toEqual(["local-applied", "remote-applied", "remote:1"]);
  });

  it("lets one later query apply every refresh received before queries exist", () => {
    const appliedCounts: number[] = [];
    const observer = createRemoteQueryRefreshObserver((updateCount) => {
      appliedCounts.push(updateCount);
    });

    observer.received({ type: "RefreshQueries" }, () => undefined);
    observer.received({ type: "RefreshQueries" }, () => undefined);
    observer.sent({ type: "Query" });
    observer.received({ type: "OnPatchesByQuery" }, () => undefined);

    expect(appliedCounts).toEqual([2]);
  });
});
