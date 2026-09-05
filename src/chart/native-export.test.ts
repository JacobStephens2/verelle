import { describe, expect, it, vi } from "vitest";
import { shareOrDownloadFile, type ExportPlatformEnv } from "./native-export";

describe("shareOrDownloadFile", () => {
  const sampleFile = {
    filename: "verelle-chart.csv",
    mimeType: "text/csv",
    content: "Cycle,Cycle Day\n1,1",
  };

  it("uses navigator.share when canShare allows files", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    const canShareMock = vi.fn().mockReturnValue(true);
    const downloadMock = vi.fn();

    const env: ExportPlatformEnv = {
      navigator: {
        canShare: canShareMock,
        share: shareMock,
      },
      downloadFile: downloadMock,
    };

    const result = await shareOrDownloadFile(sampleFile, env);

    expect(canShareMock).toHaveBeenCalled();
    expect(shareMock).toHaveBeenCalled();
    expect(downloadMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, method: "share" });
  });

  it("handles user cancellation of native share gracefully", async () => {
    const abortError = new Error("Share was aborted");
    abortError.name = "AbortError";
    const shareMock = vi.fn().mockRejectedValue(abortError);
    const canShareMock = vi.fn().mockReturnValue(true);
    const downloadMock = vi.fn();

    const env: ExportPlatformEnv = {
      navigator: {
        canShare: canShareMock,
        share: shareMock,
      },
      downloadFile: downloadMock,
    };

    const result = await shareOrDownloadFile(sampleFile, env);

    expect(result).toEqual({ success: false, method: "share", cancelled: true });
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it("falls back to download when navigator.share is unavailable", async () => {
    const downloadMock = vi.fn();

    const env: ExportPlatformEnv = {
      navigator: {},
      downloadFile: downloadMock,
    };

    const result = await shareOrDownloadFile(sampleFile, env);

    expect(downloadMock).toHaveBeenCalled();
    expect(result).toEqual({ success: true, method: "download" });
  });

  it("falls back to download when canShare returns false", async () => {
    const shareMock = vi.fn();
    const canShareMock = vi.fn().mockReturnValue(false);
    const downloadMock = vi.fn();

    const env: ExportPlatformEnv = {
      navigator: {
        canShare: canShareMock,
        share: shareMock,
      },
      downloadFile: downloadMock,
    };

    const result = await shareOrDownloadFile(sampleFile, env);

    expect(shareMock).not.toHaveBeenCalled();
    expect(downloadMock).toHaveBeenCalled();
    expect(result).toEqual({ success: true, method: "download" });
  });
});
