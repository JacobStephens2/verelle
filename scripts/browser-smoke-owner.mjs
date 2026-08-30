import { randomBytes } from "node:crypto";

const createOwnerSecrets = () => ({
  deviceOwner: randomBytes(32).toString("base64"),
  sharedOwner: randomBytes(32).toString("base64"),
});

/** Installs a factory in the page so every storage check uses one scanner. */
function installOwnerMaterialScanner() {
  Object.defineProperty(globalThis, "__VERELLE_BROWSER_SMOKE_CREATE_OWNER_SCANNER__", {
    value: (encodedSecrets, textMaterials = []) => {
      const textEncoder = new TextEncoder();
      const needles = [
        ...encodedSecrets.flatMap((encoded) => {
          const unpadded = encoded.replace(/=+$/u, "");
          const bytes = Uint8Array.from(
            globalThis.atob(encoded),
            (character) => character.charCodeAt(0),
          );
          const hex = [...bytes]
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
          return [
            bytes,
            textEncoder.encode(encoded),
            textEncoder.encode(unpadded),
            textEncoder.encode(hex),
          ];
        }),
        ...textMaterials.map((value) => textEncoder.encode(value)),
      ];
      const bytesContain = (haystack, needle) => {
        if (needle.length === 0 || haystack.length < needle.length) return false;
        outer: for (
          let start = 0;
          start <= haystack.length - needle.length;
          start += 1
        ) {
          for (let offset = 0; offset < needle.length; offset += 1) {
            if (haystack[start + offset] !== needle[offset]) continue outer;
          }
          return true;
        }
        return false;
      };
      const scanBytes = (bytes) =>
        needles.some((needle) => bytesContain(bytes, needle));
      const scanText = (value) => scanBytes(textEncoder.encode(value));
      const containsOwnerMaterial = async (value, seen = new WeakSet()) => {
        if (typeof value === "string") return scanText(value);
        if (value instanceof Blob) {
          return scanBytes(new Uint8Array(await value.arrayBuffer()));
        }
        if (value instanceof ArrayBuffer) return scanBytes(new Uint8Array(value));
        if (ArrayBuffer.isView(value)) {
          return scanBytes(
            new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
          );
        }
        if (value === null || typeof value !== "object" || seen.has(value)) {
          return false;
        }
        seen.add(value);
        if (value instanceof Map) {
          for (const [key, entry] of value) {
            if (
              (await containsOwnerMaterial(key, seen)) ||
              (await containsOwnerMaterial(entry, seen))
            ) {
              return true;
            }
          }
          return false;
        }
        if (value instanceof Set) {
          for (const entry of value) {
            if (await containsOwnerMaterial(entry, seen)) return true;
          }
          return false;
        }
        for (const key of Reflect.ownKeys(value)) {
          if (
            scanText(String(key)) ||
            (await containsOwnerMaterial(value[key], seen))
          ) {
            return true;
          }
        }
        return false;
      };

      return { containsOwnerMaterial, scanBytes, scanText };
    },
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

/**
 * Installs a reload-stable, process-memory-only stand-in for the native
 * OwnerSecrets plugin. Each page gets its own store, just as each phone does.
 */
export async function installBrowserSmokeOwner(page, options = {}) {
  let ownerSecrets = createOwnerSecrets();

  await page.exposeFunction("__verelleBrowserSmokeLoadOwners", () => ownerSecrets);
  await page.exposeFunction(
    "__verelleBrowserSmokeReplaceSharedOwner",
    (sharedOwner) => {
      ownerSecrets = { ...ownerSecrets, sharedOwner };
    },
  );

  const encodedOwnerSecrets = [
    ...Object.values(ownerSecrets),
    ...(options.additionalEncodedOwnerSecrets ?? []),
  ];
  await page.evaluateOnNewDocument(installOwnerMaterialScanner);
  await page.evaluateOnNewDocument((encodedSecrets) => {
    const { containsOwnerMaterial } =
      globalThis.__VERELLE_BROWSER_SMOKE_CREATE_OWNER_SCANNER__(encodedSecrets);
    const violations = [];
    const report = (surface) => {
      if (!violations.includes(surface)) violations.push(surface);
    };
    const reportIfContains = (surface, ...values) => {
      void Promise.all(values.map((value) => containsOwnerMaterial(value))).then(
        (matches) => {
          if (matches.some(Boolean)) report(surface);
        },
      );
    };
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      reportIfContains(
        this === globalThis.localStorage ? "localStorage" : "sessionStorage",
        key,
        value,
      );
      return originalSetItem.call(this, key, value);
    };

    const originalOpen = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name, ...args) {
      reportIfContains("IndexedDB database name", name);
      return originalOpen.call(this, name, ...args);
    };
    for (const method of ["add", "put"]) {
      const original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function (value, key) {
        reportIfContains(`IndexedDB ${method}`, value, key);
        return original.call(this, value, key);
      };
    }

    const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
    if (cookieDescriptor?.set !== undefined) {
      Object.defineProperty(Document.prototype, "cookie", {
        ...cookieDescriptor,
        set(value) {
          reportIfContains("cookie", value);
          cookieDescriptor.set.call(this, value);
        },
      });
    }

    if (globalThis.Cache !== undefined) {
      const originalPut = Cache.prototype.put;
      Cache.prototype.put = function (request, response) {
        reportIfContains("Cache Storage", request, response);
        return originalPut.call(this, request, response);
      };
    }

    if (globalThis.FileSystemWritableFileStream !== undefined) {
      const originalWrite = FileSystemWritableFileStream.prototype.write;
      FileSystemWritableFileStream.prototype.write = function (data) {
        reportIfContains("origin-private file system", data);
        return originalWrite.call(this, data);
      };
    }

    Object.defineProperty(globalThis, "__VERELLE_BROWSER_SMOKE_OWNER_STORE__", {
      value: Object.freeze({
        loadOrCreate: () => globalThis.__verelleBrowserSmokeLoadOwners(),
        replaceSharedOwner: ({ sharedOwner }) =>
          globalThis.__verelleBrowserSmokeReplaceSharedOwner(sharedOwner),
      }),
      configurable: false,
      enumerable: false,
      writable: false,
    });
    Object.defineProperty(globalThis, "__VERELLE_BROWSER_SMOKE_STORAGE_VIOLATIONS__", {
      value: violations,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  }, encodedOwnerSecrets);

  return {
    initialOwnerSecrets: { ...ownerSecrets },
    currentOwnerSecrets: () => ({ ...ownerSecrets }),
  };
}

/**
 * Searches every script-accessible persistence surface, including the OPFS
 * files written by Evolu's Worker, for raw, base64, hex, or mnemonic material.
 */
export async function findOwnerMaterialInBrowserStorage(page, materials) {
  const encodedSecrets = materials.encodedOwnerSecrets;
  const textMaterials = materials.textMaterials ?? [];
  const violations = await page.evaluate(async (encoded, text) => {
    const scanner =
      globalThis.__VERELLE_BROWSER_SMOKE_CREATE_OWNER_SCANNER__(encoded, text);
    const found = [
      ...(globalThis.__VERELLE_BROWSER_SMOKE_STORAGE_VIOLATIONS__ ?? []),
    ];
    const report = (surface) => {
      if (!found.includes(surface)) found.push(surface);
    };
    const scanBytes = (bytes, surface) => {
      if (scanner.scanBytes(bytes)) report(surface);
    };
    const scanText = (value, surface) => {
      if (scanner.scanText(value)) report(surface);
    };
    const requestResult = (request) =>
      new Promise((resolve, reject) => {
        request.addEventListener("success", () => resolve(request.result), { once: true });
        request.addEventListener("error", () => reject(request.error), { once: true });
      });
    const transactionDone = (transaction) =>
      new Promise((resolve, reject) => {
        transaction.addEventListener("complete", () => resolve(), { once: true });
        transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
        transaction.addEventListener("error", () => reject(transaction.error), { once: true });
      });
    const scanValue = async (value, surface) => {
      if (await scanner.containsOwnerMaterial(value)) report(surface);
    };
    const scanStorage = (storage, surface) => {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key === null) continue;
        scanText(key, surface);
        scanText(storage.getItem(key) ?? "", surface);
      }
    };
    const scanIndexedDb = async (factory, surface) => {
      if (factory?.databases === undefined) return;
      for (const info of await factory.databases()) {
        if (info.name === undefined) continue;
        scanText(info.name, surface);
        const database = await requestResult(factory.open(info.name));
        try {
          const storeNames = [...database.objectStoreNames];
          if (storeNames.length === 0) continue;
          const transaction = database.transaction(storeNames, "readonly");
          const done = transactionDone(transaction);
          const scans = storeNames.flatMap((storeName) => {
            scanText(storeName, surface);
            const store = transaction.objectStore(storeName);
            return [requestResult(store.getAllKeys()), requestResult(store.getAll())];
          });
          for (const values of await Promise.all(scans)) {
            await scanValue(values, surface);
          }
          await done;
        } finally {
          database.close();
        }
      }
    };
    const scanCaches = async (cacheStorage, surface) => {
      if (cacheStorage === undefined) return;
      for (const cacheName of await cacheStorage.keys()) {
        scanText(cacheName, surface);
        const cache = await cacheStorage.open(cacheName);
        for (const request of await cache.keys()) {
          await scanValue(
            { url: request.url, method: request.method, headers: [...request.headers] },
            surface,
          );
          const response = await cache.match(request);
          if (response !== undefined) {
            await scanValue(
              { headers: [...response.headers], body: await response.clone().arrayBuffer() },
              surface,
            );
          }
        }
      }
    };
    const scanDirectory = async (directory, surface) => {
      if (directory === undefined) return;
      for await (const [name, handle] of directory.entries()) {
        scanText(name, surface);
        if (handle.kind === "directory") {
          await scanDirectory(handle, surface);
        } else {
          const file = await handle.getFile();
          scanBytes(new Uint8Array(await file.arrayBuffer()), surface);
        }
      }
    };

    scanStorage(globalThis.localStorage, "localStorage");
    scanStorage(globalThis.sessionStorage, "sessionStorage");
    scanText(globalThis.document.cookie, "cookies");
    if (globalThis.cookieStore !== undefined) {
      await scanValue(await globalThis.cookieStore.getAll(), "Cookie Store");
    }
    await scanIndexedDb(globalThis.indexedDB, "IndexedDB");
    await scanCaches(globalThis.caches, "Cache Storage");
    await scanDirectory(
      await globalThis.navigator.storage.getDirectory?.(),
      "origin-private file system",
    );

    if (globalThis.navigator.storageBuckets !== undefined) {
      for (const bucketName of await globalThis.navigator.storageBuckets.keys()) {
        scanText(bucketName, "Storage Buckets");
        const bucket = await globalThis.navigator.storageBuckets.open(bucketName);
        await scanIndexedDb(bucket.indexedDB, `Storage Bucket ${bucketName} IndexedDB`);
        await scanCaches(bucket.caches, `Storage Bucket ${bucketName} Cache Storage`);
        await scanDirectory(
          await bucket.getDirectory?.(),
          `Storage Bucket ${bucketName} file system`,
        );
      }
    }

    return found;
  }, encodedSecrets, textMaterials);

  return violations;
}
