export interface FileExportData {
  readonly filename: string;
  readonly mimeType: string;
  readonly content: string;
}

export interface ExportResult {
  readonly success: boolean;
  readonly method: "share" | "download";
  readonly cancelled?: boolean;
  readonly error?: unknown;
}

export interface ExportPlatformEnv {
  readonly navigator?: {
    canShare?: (data?: ShareData) => boolean;
    share?: (data?: ShareData) => Promise<void>;
  };
  readonly downloadFile?: (blob: Blob, filename: string) => void;
}

function defaultDownloadFile(blob: Blob, filename: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * Shares a file using the device's native share sheet (iOS/Android) where available,
 * falling back to browser download.
 */
export async function shareOrDownloadFile(
  fileData: FileExportData,
  env?: ExportPlatformEnv,
): Promise<ExportResult> {
  const nav = env?.navigator ?? (typeof navigator !== "undefined" ? navigator : undefined);
  const download = env?.downloadFile ?? defaultDownloadFile;

  const blob = new Blob([fileData.content], { type: fileData.mimeType });

  if (nav?.share && typeof File !== "undefined") {
    try {
      const file = new File([blob], fileData.filename, { type: fileData.mimeType });
      const shareData: ShareData = {
        files: [file],
        title: fileData.filename,
      };

      if (!nav.canShare || nav.canShare(shareData)) {
        await nav.share(shareData);
        return { success: true, method: "share" };
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return { success: false, method: "share", cancelled: true };
      }
      // Fall through to download if native sharing throws a non-abort error
    }
  }

  try {
    download(blob, fileData.filename);
    return { success: true, method: "download" };
  } catch (err: unknown) {
    return { success: false, method: "download", error: err };
  }
}
