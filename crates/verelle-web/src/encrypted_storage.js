const DATABASE_NAME = "verelle-browser-vault-v1";
const STORE_NAME = "vault";
const WRAPPING_KEY_RECORD = "nonextractable-wrapping-key";
const STATE_RECORD = "synthetic-observations";
const DEVICE_PRIVATE_KEY_RECORD = "device-signing-private-key";
const DEVICE_PUBLIC_KEY_RECORD = "device-signing-public-key";
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
  const completed = transactionComplete(transaction);
  const result = await requestResult(transaction.objectStore(STORE_NAME).get(key));
  await completed;
  return result;
}

async function putRecord(database, key, value) {
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const completed = transactionComplete(transaction);
  await requestResult(transaction.objectStore(STORE_NAME).put(value, key));
  await completed;
}

async function deleteRecord(database, key) {
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const completed = transactionComplete(transaction);
  await requestResult(transaction.objectStore(STORE_NAME).delete(key));
  await completed;
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

async function getOrCreateDeviceSigningKey(database) {
  const privateKey = await getRecord(database, DEVICE_PRIVATE_KEY_RECORD);
  const publicKey = await getRecord(database, DEVICE_PUBLIC_KEY_RECORD);
  if (privateKey instanceof CryptoKey && publicKey instanceof CryptoKey) {
    if (privateKey.extractable || privateKey.type !== "private" || publicKey.type !== "public") {
      throw new Error("The browser device signing key is invalid");
    }
    return { privateKey, publicKey };
  }
  if (privateKey !== undefined || publicKey !== undefined) {
    throw new Error("The browser device signing key is incomplete");
  }
  const generated = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"],
  );
  await putRecord(database, DEVICE_PRIVATE_KEY_RECORD, generated.privateKey);
  await putRecord(database, DEVICE_PUBLIC_KEY_RECORD, generated.publicKey);
  return generated;
}

function bytesToBase64url(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64urlToBytes(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function devicePublicKey() {
  const database = await openDatabase();
  try {
    const { publicKey } = await getOrCreateDeviceSigningKey(database);
    return bytesToBase64url(await crypto.subtle.exportKey("spki", publicKey));
  } finally {
    database.close();
  }
}

export async function signDeviceMessage(messageBase64url) {
  const database = await openDatabase();
  try {
    const { privateKey } = await getOrCreateDeviceSigningKey(database);
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      base64urlToBytes(messageBase64url),
    );
    return bytesToBase64url(signature);
  } finally {
    database.close();
  }
}

export function destroyBrowserVault() {
  writeQueue = writeQueue.then(async () => {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const completed = transactionComplete(transaction);
      const store = transaction.objectStore(STORE_NAME);
      store.delete(STATE_RECORD);
      store.delete(DEVICE_PRIVATE_KEY_RECORD);
      store.delete(DEVICE_PUBLIC_KEY_RECORD);
      await completed;
    } finally {
      database.close();
    }
  });
  return writeQueue;
}
