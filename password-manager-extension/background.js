importScripts("crypto.js");

let sessionKey = null;
let lockTimer  = null;
let lockedAt   = null;

const LOCK_AFTER_MS = 5 * 60 * 1000;

function resetLockTimer() {
  clearTimeout(lockTimer);
  lockedAt  = Date.now();
  lockTimer = setTimeout(autoLock, LOCK_AFTER_MS);
}
function autoLock() {
  sessionKey = null; lockTimer = null; lockedAt = null;
  chrome.runtime.sendMessage({ action: "SESSION_EXPIRED" }).catch(() => {});
}
function clearSession() {
  clearTimeout(lockTimer);
  sessionKey = null; lockTimer = null; lockedAt = null;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse).catch(err => sendResponse({ error: err.message }));
  return true;
});

async function handleMessage(msg, sender) {
  switch (msg.action) {

    case "STORE_SESSION_KEY": {
      const rawKey = b64ToU8(msg.keyB64);
      sessionKey = await crypto.subtle.importKey(
        "raw", rawKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
      );
      resetLockTimer();
      return { ok: true };
    }

    case "CLEAR_SESSION_KEY":  clearSession(); return { ok: true };

    case "GET_SESSION_STATUS": {
      if (!sessionKey) return { unlocked: false, secondsRemaining: 0 };
      const remaining = Math.max(0, Math.ceil((LOCK_AFTER_MS - (Date.now() - lockedAt)) / 1000));
      return { unlocked: true, secondsRemaining: remaining };
    }

    case "GET_SETTINGS":      return getSettings();
    case "SAVE_SETTINGS":     return saveSettings(msg.settings);
    case "GET_ALL":           resetLockTimer(); return getAllCredentials();
    case "SAVE_CREDENTIAL":   resetLockTimer(); return saveCredential(msg.entry);
    case "DELETE_CREDENTIAL": resetLockTimer(); return deleteCredential(msg.id);

    case "AUTOFILL_REQUEST": {
      const all = await getAllCredentials();
      const matches = all.filter(e => hostnameMatch(e.hostname, msg.hostname));
      return {
        matches: matches.map(m => ({ id: m.id, hostname: m.hostname, username: m.username, label: m.label }))
      };
    }

    case "GET_CREDENTIAL_FOR_FILL": {
      if (!sessionKey) return { error: "Locked." };
      resetLockTimer();
      const all  = await getAllCredentials();
      const cred = all.find(e => e.id === msg.id);
      if (!cred) return { error: "Not found." };
      const plaintextPassword = await decrypt(cred.password, sessionKey);
      return { username: cred.username, plaintextPassword };
    }

    case "SAVE_PENDING_CREDENTIAL": {
      const { hostname, username } = msg.entry;

      const all = await getAllCredentials();
      const normalise = s => (s || "").toLowerCase().replace(/^www\./, "");
      const isDuplicate = all.some(
        e => normalise(e.hostname) === normalise(hostname) &&
             (e.username || "").toLowerCase() === (username || "").toLowerCase()
      );
      if (isDuplicate) return { ok: true, skipped: true };

      await new Promise(resolve =>
        chrome.storage.local.set({ pendingCredential: msg.entry }, resolve)
      );
      return { ok: true };
    }

    case "GET_PENDING_CREDENTIAL": {
      const result = await new Promise(resolve =>
        chrome.storage.local.get(["pendingCredential"], r => resolve(r.pendingCredential || null))
      );
      return { entry: result };
    }

    case "CLEAR_PENDING_CREDENTIAL":
      await new Promise(resolve => chrome.storage.local.remove(["pendingCredential"], resolve));
      return { ok: true };

    case "RE_ENCRYPT_ALL": {
      const oldKey = await crypto.subtle.importKey(
        "raw", b64ToU8(msg.oldKeyB64), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
      );
      const newKey = await crypto.subtle.importKey(
        "raw", b64ToU8(msg.newKeyB64), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
      );
      const all = await getAllCredentials();
      for (const cred of all) {
        const plain   = await decrypt(cred.password, oldKey);
        cred.password = await encrypt(plain, newKey);
      }
      await new Promise(resolve => chrome.storage.local.set({ credentials: all }, resolve));
      return { ok: true };
    }

    default: throw new Error(`Unknown action: ${msg.action}`);
  }
}

function getSettings() {
  return new Promise(resolve =>
    chrome.storage.local.get(["vaultSettings"], r => resolve(r.vaultSettings || { hasVault: false }))
  );
}
function saveSettings(settings) {
  return new Promise(resolve =>
    chrome.storage.local.set({ vaultSettings: settings }, () => resolve({ ok: true }))
  );
}
function getAllCredentials() {
  return new Promise(resolve =>
    chrome.storage.local.get(["credentials"], r => resolve(r.credentials || []))
  );
}
async function saveCredential(entry) {
  const all = await getAllCredentials();
  const idx = all.findIndex(e => e.id === entry.id);
  if (idx >= 0) {
    all[idx] = entry;
  } else {
    entry.id = entry.id || crypto.randomUUID();
    all.push(entry);
  }
  return new Promise(resolve =>
    chrome.storage.local.set({ credentials: all }, () => resolve({ ok: true, id: entry.id }))
  );
}
async function deleteCredential(id) {
  const all = await getAllCredentials();
  return new Promise(resolve =>
    chrome.storage.local.set({ credentials: all.filter(e => e.id !== id) }, () => resolve({ ok: true }))
  );
}
function hostnameMatch(stored, current) {
  if (!stored || !current) return false;
  return stored.toLowerCase().replace(/^www\./, "") === current.toLowerCase().replace(/^www\./, "");
}
