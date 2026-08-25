/// PROTOTYPE. Throwaway.
// Tests the OPFS SAH-Pool *prerequisite* directly, with no Evolu involved.
// SAH-Pool needs createSyncAccessHandle, which only exists inside a worker.
// If Evolu fails but this passes, the fault is Evolu's; if this fails, the
// fault is the WebView's OPFS support and no Evolu config can rescue it.

export type OpfsProbeResult = {
  step: string;
  ok: boolean;
  detail: string;
};

const results: Array<OpfsProbeResult> = [];
const record = (step: string, ok: boolean, detail: unknown) => {
  results.push({ step, ok, detail: String(detail) });
};

const run = async () => {
  record("worker booted", true, `scope=${self.location.href}`);

  record(
    "navigator.storage.getDirectory exists",
    typeof navigator.storage?.getDirectory === "function",
    typeof navigator.storage?.getDirectory,
  );

  let root: FileSystemDirectoryHandle;
  try {
    root = await navigator.storage.getDirectory();
    record("getDirectory() resolved", true, root.name || "(root)");
  } catch (e) {
    record("getDirectory() resolved", false, e);
    return;
  }

  let dir: FileSystemDirectoryHandle;
  try {
    dir = await root.getDirectoryHandle("verelle-probe", { create: true });
    record("create directory", true, "verelle-probe");
  } catch (e) {
    record("create directory", false, e);
    return;
  }

  let handle: FileSystemFileHandle;
  try {
    handle = await dir.getFileHandle("sah.bin", { create: true });
    record("create file handle", true, "sah.bin");
  } catch (e) {
    record("create file handle", false, e);
    return;
  }

  // The load-bearing call. SQLite's SAH-Pool VFS is built entirely on this.
  let sah: FileSystemSyncAccessHandle;
  try {
    sah = await (handle as any).createSyncAccessHandle();
    record("createSyncAccessHandle()", true, "acquired");
  } catch (e) {
    record("createSyncAccessHandle()", false, e);
    return;
  }

  try {
    const payload = new TextEncoder().encode("verelle-sah-probe");
    sah.write(payload, { at: 0 });
    sah.flush();
    const back = new Uint8Array(payload.byteLength);
    sah.read(back, { at: 0 });
    const text = new TextDecoder().decode(back);
    record("sync write + read back", text === "verelle-sah-probe", text);
    record("file size", true, `${sah.getSize()} bytes`);
  } catch (e) {
    record("sync write + read back", false, e);
  } finally {
    try {
      sah.close();
      record("close handle", true, "closed");
    } catch (e) {
      record("close handle", false, e);
    }
  }

  // SAH-Pool opens many handles at once; one working handle does not prove a
  // pool works. Capacitor WebViews have per-origin handle limits.
  try {
    const handles: Array<FileSystemSyncAccessHandle> = [];
    for (let i = 0; i < 12; i++) {
      const h = await dir.getFileHandle(`pool-${i}.bin`, { create: true });
      handles.push(await (h as any).createSyncAccessHandle());
    }
    record("12 concurrent sync handles", true, `${handles.length} open`);
    for (const h of handles) h.close();
  } catch (e) {
    record("12 concurrent sync handles", false, e);
  }
};

void run()
  .catch((e) => {
    record("uncaught", false, e);
  })
  .finally(() => {
    self.postMessage(results);
  });
