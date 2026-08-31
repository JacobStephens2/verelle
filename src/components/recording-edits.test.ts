import { describe, expect, it } from "vitest";

import { createRecordingEdits } from "./recording-edits";

describe("recording edits made while a save is pending", () => {
  it("settles only the exact field revisions captured by that save", () => {
    const edits = createRecordingEdits<"monitorReading" | "bleeding">();
    edits.mark(["monitorReading"]);
    const saving = edits.snapshot();

    edits.mark(["monitorReading", "bleeding"]);

    expect([...edits.settle(saving)]).toEqual(["monitorReading", "bleeding"]);
  });

  it("clears saved fields when they were not edited again", () => {
    const edits = createRecordingEdits<"monitorReading">();
    edits.mark(["monitorReading"]);

    expect(edits.settle(edits.snapshot()).size).toBe(0);
  });
});
