const PBKDF2_ITERATIONS = 100_000;
const KEY_ALGO = { name: "AES-GCM", length: 256 };

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const raw = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    raw, KEY_ALGO, true, ["encrypt", "decrypt"]
  );
}

async function encrypt(plaintext, key) {
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct  = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return `${u8ToB64(iv)}:${u8ToB64(new Uint8Array(ct))}`;
}

async function decrypt(ciphertext, key) {
  const [ivB64, ctB64] = ciphertext.split(":");
  const iv  = b64ToU8(ivB64);
  const ct  = b64ToU8(ctB64);
  const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(buf);
}

async function encryptKeyWithPin(vaultKey, pinKey) {
  const rawVaultKey = await crypto.subtle.exportKey("raw", vaultKey);
  return encrypt(u8ToB64(new Uint8Array(rawVaultKey)), pinKey);
}

async function decryptKeyWithPin(blob, pinKey) {
  const rawB64 = await decrypt(blob, pinKey);
  const rawBytes = b64ToU8(rawB64);
  return crypto.subtle.importKey("raw", rawBytes, KEY_ALGO, true, ["encrypt", "decrypt"]);
}

function passwordStrength(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8)  s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

function generateSalt()    { return crypto.getRandomValues(new Uint8Array(16)); }
function u8ToB64(u8)       { return btoa(String.fromCharCode(...u8)); }
function b64ToU8(b64)      { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }
