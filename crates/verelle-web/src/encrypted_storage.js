const DATABASE_NAME = "verelle-browser-vault-v1";
const STORE_NAME = "vault";
const WRAPPING_KEY_RECORD = "nonextractable-wrapping-key";
const STATE_RECORD = "synthetic-observations";
const VERSION = 1;
const ADDITIONAL_DATA = new TextEncoder().encode("verelle/browser-vault/v1");

let writeQueue = Promise.resolve();

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

async function openDatabase() {
  const request = indexedDB.open(DATABASE_NAME, VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME);
    }
  };
  return requestResult(request);
}

async function getRecord(database, key) {
  const transaction = database.transaction(STORE_NAME, "readonly");
  const result = await requestResult(transaction.objectStore(STORE_NAME).get(key));
  await transactionComplete(transaction);
  return result;
}

async function putRecord(database, key, value) {
  const transaction = database.transaction(STORE_NAME, "readwrite");
  await requestResult(transaction.objectStore(STORE_NAME).put(value, key));
  await transactionComplete(transaction);
}

async function deleteRecord(database, key) {
  const transaction = database.transaction(STORE_NAME, "readwrite");
  await requestResult(transaction.objectStore(STORE_NAME).delete(key));
  await transactionComplete(transaction);
}

async function getOrCreateWrappingKey(database) {
  const existing = await getRecord(database, WRAPPING_KEY_RECORD);
  if (existing instanceof CryptoKey) return existing;
  if (existing !== undefined) throw new Error("The browser vault key record is invalid");

  const generated = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  await putRecord(database, WRAPPING_KEY_RECORD, generated);
  return generated;
}

async function saveNow(plaintext) {
  const database = await openDatabase();
  try {
    const key = await getOrCreateWrappingKey(database);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: ADDITIONAL_DATA, tagLength: 128 },
      key,
      new TextEncoder().encode(plaintext),
    );
    await putRecord(database, STATE_RECORD, {
      version: VERSION,
      iv: iv.buffer,
      ciphertext,
    });
  } finally {
    database.close();
  }
}

export async function loadEncryptedState() {
  const database = await openDatabase();
  try {
    const record = await getRecord(database, STATE_RECORD);
    if (record === undefined) return null;
    if (record?.version !== VERSION || !(record.iv instanceof ArrayBuffer) || !(record.ciphertext instanceof ArrayBuffer)) {
      throw new Error("The browser vault record is invalid");
    }
    const key = await getRecord(database, WRAPPING_KEY_RECORD);
    if (!(key instanceof CryptoKey) || key.extractable) {
      throw new Error("The non-extractable browser vault key is unavailable");
    }
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(record.iv),
        additionalData: ADDITIONAL_DATA,
        tagLength: 128,
      },
      key,
      record.ciphertext,
    );
    return new TextDecoder().decode(plaintext);
  } finally {
    database.close();
  }
}

export function saveEncryptedState(plaintext) {
  writeQueue = writeQueue.then(() => saveNow(plaintext));
  return writeQueue;
}

export function clearEncryptedState() {
  writeQueue = writeQueue.then(async () => {
    const database = await openDatabase();
    try {
      await deleteRecord(database, STATE_RECORD);
    } finally {
      database.close();
    }
  });
  return writeQueue;
}
