let sessionKey     = null;
let allCredentials = [];
let editingId      = null;
let currentTab     = null;
let filterText     = "";
let pendingSaveEntry = null; 

document.addEventListener("DOMContentLoaded", async () => {
  currentTab = await getCurrentTab();
  render();

  const settings = await msg("GET_SETTINGS");
  if (!settings.hasVault) {
    showScreen("setup");
    return;
  }

  const pending = await msg("GET_PENDING_CREDENTIAL");
  if (pending && pending.entry) {
    pendingSaveEntry = pending.entry;
    render();
    showScreen("save-prompt");
    return;
  }

  showScreen("unlock");
});

function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const el = document.getElementById(`screen-${name}`);
  if (el) el.classList.add("active");
}

function render() {
  document.getElementById("app").innerHTML =
    `<div id="toast"></div>` +
    renderSetupScreen() +
    renderUnlockScreen() +
    renderResetScreen() +
    renderVaultScreen() +
    renderFormScreen() +
    renderSavePromptScreen();
  bindEvents();
}

function renderSetupScreen() {
  return `
  <div id="screen-setup" class="screen">
    <div class="auth-wrap">
      <div class="auth-icon">*</div>
      <div class="auth-title">Password Manager</div>
      <div class="auth-sub">Create your master password and a recovery PIN. The PIN is permanent and cannot be changed — store it somewhere safe.</div>

      <div class="input-group">
        <label>Master password</label>
        <div class="pw-field-wrap">
          <input type="password" id="setup-pw" placeholder="Choose a strong password" autocomplete="new-password">
          <button class="pw-toggle" id="toggle-setup-pw">show</button>
        </div>
        <div class="strength-bar"><div class="strength-fill" id="setup-strength-bar"></div></div>
        <div class="hint" id="setup-strength-label"></div>
      </div>

      <div class="input-group">
        <label>Confirm password</label>
        <input type="password" id="setup-pw2" placeholder="Repeat password" autocomplete="new-password">
      </div>

      <div class="input-group">
        <label>Recovery PIN (4–12 digits, permanent)</label>
        <input type="password" id="setup-pin" placeholder="e.g. 8 digits" inputmode="numeric" maxlength="12" autocomplete="off">
        <div class="hint">This PIN lets you reset your master password. It cannot be changed later.</div>
      </div>

      <div class="input-group">
        <label>Confirm PIN</label>
        <input type="password" id="setup-pin2" placeholder="Repeat PIN" inputmode="numeric" maxlength="12" autocomplete="off">
        <div class="hint err" id="setup-hint"></div>
      </div>

      <button class="btn btn-primary btn-full" id="btn-setup">Create account</button>
    </div>
  </div>`;
}

function renderUnlockScreen() {
  return `
  <div id="screen-unlock" class="screen">
    <div class="auth-wrap">
      <div class="auth-icon">*</div>
      <div class="auth-title">Password Manager</div>
      <div class="auth-sub">Enter your master password to unlock.</div>
      <div class="input-group">
        <label>Master password</label>
        <div class="pw-field-wrap">
          <input type="password" id="unlock-pw" placeholder="Master password" autocomplete="current-password">
          <button class="pw-toggle" id="toggle-unlock-pw">show</button>
        </div>
        <div class="hint err" id="unlock-hint"></div>
      </div>
      <button class="btn btn-primary btn-full" id="btn-unlock">Unlock</button>
      <button class="btn btn-ghost btn-full" style="margin-top:8px" id="btn-go-reset">Forgot password? Use PIN</button>
    </div>
  </div>`;
}

function renderResetScreen() {
  return `
  <div id="screen-reset" class="screen">
    <div class="auth-wrap">
      <div class="auth-icon">*</div>
      <div class="auth-title">Reset master password</div>
      <div class="auth-sub">Enter your recovery PIN, then choose a new master password.</div>

      <div class="input-group">
        <label>Recovery PIN</label>
        <input type="password" id="reset-pin" placeholder="Your PIN" inputmode="numeric" maxlength="12" autocomplete="off">
      </div>

      <div class="input-group">
        <label>New master password</label>
        <div class="pw-field-wrap">
          <input type="password" id="reset-pw" placeholder="New password" autocomplete="new-password">
          <button class="pw-toggle" id="toggle-reset-pw">show</button>
        </div>
        <div class="strength-bar"><div class="strength-fill" id="reset-strength-bar"></div></div>
        <div class="hint" id="reset-strength-label"></div>
      </div>

      <div class="input-group">
        <label>Confirm new password</label>
        <input type="password" id="reset-pw2" placeholder="Repeat new password" autocomplete="new-password">
        <div class="hint err" id="reset-hint"></div>
      </div>

      <button class="btn btn-primary btn-full" id="btn-reset">Set new password</button>
      <button class="btn btn-ghost btn-full" style="margin-top:8px" id="btn-reset-cancel">Cancel</button>
    </div>
  </div>`;
}

function renderVaultScreen() {
  const hostname = getHostname();
  const filtered = allCredentials.filter(c =>
    !filterText ||
    (c.label || "").toLowerCase().includes(filterText) ||
    (c.hostname || "").toLowerCase().includes(filterText) ||
    (c.username || "").toLowerCase().includes(filterText)
  );
  const currentSiteMatches = allCredentials.filter(c => hostname && hostnameMatch(c.hostname, hostname));

  return `
  <div id="screen-vault" class="screen">
    <div class="header">
      <h1>* Password Manager</h1>
      <div class="row">
        <span id="session-timer"></span>
        ${currentSiteMatches.length > 0 ? `<button class="btn btn-ghost btn-sm" id="btn-autofill">Fill</button>` : ""}
        <button class="btn btn-ghost btn-sm" id="btn-lock">Lock</button>
      </div>
    </div>
    <div class="body">
      ${hostname ? `
        <div class="site-bar">
          <strong>${escHtml(hostname)}</strong>
          ${currentSiteMatches.length > 0
            ? `<span class="match"> — ${currentSiteMatches.length} saved</span>`
            : " — no saved passwords"}
        </div>` : ""}
      <div class="search-wrap">
        <input type="text" placeholder="Search…" id="search-input" value="${escHtml(filterText)}">
      </div>
      ${filtered.length === 0
        ? `<div class="empty">${filterText ? "No results." : "No passwords saved yet.<br>Click Add to get started."}</div>`
        : `<div class="cred-list">${filtered.map(renderCredItem).join("")}</div>`}
    </div>
    <div class="footer">
      <button class="btn btn-primary btn-full" id="btn-add">+ Add password</button>
    </div>
  </div>`;
}

function renderCredItem(c) {
  return `
  <div class="cred-item" data-id="${c.id}">
    <div class="cred-icon">${(c.label || c.hostname || "?")[0].toUpperCase()}</div>
    <div class="cred-info">
      <div class="cred-label">${escHtml(c.label || c.hostname)}</div>
      <div class="cred-user">${escHtml(c.username)}</div>
    </div>
    <div class="cred-actions">
      <button class="btn-icon copy-user-btn" data-id="${c.id}" title="Copy username">U</button>
      <button class="btn-icon copy-pw-btn"   data-id="${c.id}" title="Copy password">P</button>
    </div>
  </div>`;
}

function renderFormScreen() {
  const c        = editingId ? allCredentials.find(x => x.id === editingId) : null;
  const hostname = getHostname();

  return `
  <div id="screen-form" class="screen">
    <div class="header">
      <h1>${c ? "Edit" : "Add"} password</h1>
      <button class="btn-icon" id="btn-form-cancel">&#x2715;</button>
    </div>
    <div class="body">
      <div class="input-group">
        <label>Label / Site name</label>
        <input type="text" id="form-label" placeholder="e.g. GitHub" value="${escHtml(c?.label || "")}">
      </div>
      <div class="input-group">
        <label>Hostname</label>
        <input type="text" id="form-hostname" placeholder="github.com" value="${escHtml(c?.hostname || hostname)}">
      </div>
      <div class="input-group">
        <label>Username / Email</label>
        <input type="text" id="form-username" placeholder="you@example.com" value="${escHtml(c?.username || "")}">
      </div>
      <div class="input-group">
        <label>Password</label>
        <div class="pw-field-wrap">
          <input type="password" id="form-password" placeholder="••••••••" value="${escHtml(c?._plainPw || "")}">
          <button class="pw-toggle" id="toggle-form-pw">show</button>
        </div>
        <div class="gen-row">
          <button class="gen-btn" id="btn-generate">Generate strong password</button>
          <span class="strength-label-inline" id="form-strength-label"></span>
        </div>
        <div class="strength-bar"><div class="strength-fill" id="form-strength-bar"></div></div>
      </div>
    </div>
    <div class="footer" style="display:flex;gap:8px;align-items:center">
      ${c ? `<button class="btn btn-danger btn-sm" id="btn-delete" data-id="${c.id}">Delete</button>` : ""}
      <div class="spacer"></div>
      <button class="btn btn-ghost btn-sm" id="btn-form-cancel2">Cancel</button>
      <button class="btn btn-primary btn-sm" id="btn-save">Save</button>
    </div>
  </div>`;
}

function renderSavePromptScreen() {
  const entry    = pendingSaveEntry;
  const hostname = entry ? escHtml(entry.hostname) : "this site";
  const username = entry ? escHtml(entry.username) : "";

  return `
  <div id="screen-save-prompt" class="screen">
    <div class="header">
      <h1>Save password?</h1>
    </div>
    <div class="body">
      <p style="font-size:13px;color:#333;margin-bottom:6px;">
        New credentials detected for <strong>${hostname}</strong>.
      </p>
      ${username ? `<p style="font-size:12px;color:#555;margin-bottom:14px;">Username: <strong>${username}</strong></p>` : ""}
      <p style="font-size:12px;color:#555;margin-bottom:14px;">Unlock your vault to save.</p>
      <div class="input-group">
        <label>Master password</label>
        <div class="pw-field-wrap">
          <input type="password" id="save-unlock-pw" placeholder="Master password" autocomplete="current-password">
          <button class="pw-toggle" id="toggle-save-unlock-pw">show</button>
        </div>
        <div class="hint err" id="save-unlock-hint"></div>
      </div>
      <button class="btn btn-primary btn-full" id="btn-save-unlock">Unlock &amp; save</button>
    </div>
    <div class="footer" style="display:flex;gap:8px">
      <div class="spacer"></div>
      <button class="btn btn-ghost btn-sm" id="btn-save-ignore">Ignore</button>
    </div>
  </div>`;
}

function bindEvents() {
  // Setup
  on("btn-setup",         "click",   doSetup);
  on("toggle-setup-pw",   "click",   () => togglePw("setup-pw", "toggle-setup-pw"));
  on("setup-pw",          "input",   e  => updateStrengthBar(e.target.value, "setup-strength-bar", "setup-strength-label"));
  on("setup-pw",          "keydown", e  => { if (e.key === "Enter") focusEl("setup-pw2"); });
  on("setup-pw2",         "keydown", e  => { if (e.key === "Enter") focusEl("setup-pin"); });

  // Unlock
  on("btn-unlock",        "click",   doUnlock);
  on("toggle-unlock-pw",  "click",   () => togglePw("unlock-pw", "toggle-unlock-pw"));
  on("unlock-pw",         "keydown", e  => { if (e.key === "Enter") doUnlock(); });
  on("btn-go-reset",      "click",   () => showScreen("reset"));

  // Reset
  on("btn-reset",         "click",   doReset);
  on("btn-reset-cancel",  "click",   () => showScreen("unlock"));
  on("toggle-reset-pw",   "click",   () => togglePw("reset-pw", "toggle-reset-pw"));
  on("reset-pw",          "input",   e  => updateStrengthBar(e.target.value, "reset-strength-bar", "reset-strength-label"));

  // Vault
  on("btn-add",           "click",   () => openForm(null));
  on("btn-lock",          "click",   doLock);
  on("btn-autofill",      "click",   triggerAutofill);
  on("search-input",      "input",   e  => doSearch(e.target.value));

  document.querySelectorAll(".cred-item").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.closest(".cred-actions")) return;
      openForm(el.dataset.id);
    });
  });
  document.querySelectorAll(".copy-user-btn").forEach(el =>
    el.addEventListener("click", e => { e.stopPropagation(); copyUsername(el.dataset.id); })
  );
  document.querySelectorAll(".copy-pw-btn").forEach(el =>
    el.addEventListener("click", e => { e.stopPropagation(); copyPassword(el.dataset.id); })
  );

  // Form
  on("btn-save",          "click",   doSave);
  on("btn-form-cancel",   "click",   () => showScreen("vault"));
  on("btn-form-cancel2",  "click",   () => showScreen("vault"));
  on("toggle-form-pw",    "click",   () => togglePw("form-password", "toggle-form-pw"));
  on("form-password",     "input",   e  => updateStrengthBar(e.target.value, "form-strength-bar", "form-strength-label"));
  on("btn-generate",      "click",   generatePassword);
  on("btn-delete",        "click",   e  => doDelete(e.target.closest("[data-id]").dataset.id));

  // Save-prompt
  on("btn-save-unlock",       "click",   doSavePromptUnlock);
  on("btn-save-ignore",       "click",   doSaveIgnore);
  on("toggle-save-unlock-pw", "click",   () => togglePw("save-unlock-pw", "toggle-save-unlock-pw"));
}

function on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}
function focusEl(id) { document.getElementById(id)?.focus(); }

async function doSetup() {
  const pw    = document.getElementById("setup-pw").value;
  const pw2   = document.getElementById("setup-pw2").value;
  const pin   = document.getElementById("setup-pin").value;
  const pin2  = document.getElementById("setup-pin2").value;
  const hint  = document.getElementById("setup-hint");

  if (pw.length < 8)       { hint.textContent = "Password must be at least 8 characters."; return; }
  if (pw !== pw2)           { hint.textContent = "Passwords don't match."; return; }
  if (pin.length < 4)       { hint.textContent = "PIN must be at least 4 digits."; return; }
  if (!/^\d+$/.test(pin))   { hint.textContent = "PIN must be digits only."; return; }
  if (pin !== pin2)          { hint.textContent = "PINs don't match."; return; }

  const salt     = generateSalt();
  sessionKey     = await deriveKey(pw, salt);

  const pinSalt  = generateSalt();
  const pinKey   = await deriveKey(pin, pinSalt);
  const recoveryBlob = await encryptKeyWithPin(sessionKey, pinKey);

  await sendKeyToBackground(sessionKey);
  await msg("SAVE_SETTINGS", {
    settings: {
      hasVault:     true,
      saltB64:      u8ToB64(salt),
      pinSaltB64:   u8ToB64(pinSalt),
      recoveryBlob,            
    }
  });

  allCredentials = [];
  filterText     = "";
  render();
  showScreen("vault");
  startSessionTimer();
  toast("Account created ✓");
}

async function doUnlock() {
  const pw   = document.getElementById("unlock-pw").value;
  const hint = document.getElementById("unlock-hint");
  if (!pw) { hint.textContent = "Enter your master password."; return; }

  const settings = await msg("GET_SETTINGS");
  const salt     = b64ToU8(settings.saltB64);

  try {
    const candidateKey = await deriveKey(pw, salt);
    const raw = await msg("GET_ALL");
    if (raw.length > 0) await decrypt(raw[0].password, candidateKey); // verify key
    sessionKey = candidateKey;
    await sendKeyToBackground(sessionKey);
    await loadCredentials();
    filterText = "";
    render();
    showScreen("vault");
    startSessionTimer();
  } catch {
    hint.textContent = "Wrong password. Try again.";
  }
}

async function doReset() {
  const pin   = document.getElementById("reset-pin").value;
  const newPw = document.getElementById("reset-pw").value;
  const newPw2= document.getElementById("reset-pw2").value;
  const hint  = document.getElementById("reset-hint");

  if (!pin)             { hint.textContent = "Enter your PIN."; return; }
  if (newPw.length < 8) { hint.textContent = "New password must be at least 8 characters."; return; }
  if (newPw !== newPw2) { hint.textContent = "Passwords don't match."; return; }

  const settings = await msg("GET_SETTINGS");

  try {
    const pinSalt    = b64ToU8(settings.pinSaltB64);
    const pinKey     = await deriveKey(pin, pinSalt);
    const oldVaultKey = await decryptKeyWithPin(settings.recoveryBlob, pinKey);

    const newSalt    = generateSalt();
    const newVaultKey = await deriveKey(newPw, newSalt);

    const oldRaw = await crypto.subtle.exportKey("raw", oldVaultKey);
    const newRaw = await crypto.subtle.exportKey("raw", newVaultKey);
    await msg("RE_ENCRYPT_ALL", {
      oldKeyB64: u8ToB64(new Uint8Array(oldRaw)),
      newKeyB64: u8ToB64(new Uint8Array(newRaw)),
    });

    const newRecoveryBlob = await encryptKeyWithPin(newVaultKey, pinKey);
    await msg("SAVE_SETTINGS", {
      settings: {
        ...settings,
        saltB64:      u8ToB64(newSalt),
        recoveryBlob: newRecoveryBlob,
      }
    });

    sessionKey = newVaultKey;
    await sendKeyToBackground(sessionKey);
    await loadCredentials();
    filterText = "";
    render();
    showScreen("vault");
    startSessionTimer();
    toast("Password reset ✓");

  } catch {
    hint.textContent = "Incorrect PIN. Try again.";
  }
}

async function doSavePromptUnlock() {
  const pw   = document.getElementById("save-unlock-pw").value;
  const hint = document.getElementById("save-unlock-hint");
  if (!pw) { hint.textContent = "Enter your master password."; return; }

  const settings = await msg("GET_SETTINGS");
  const salt     = b64ToU8(settings.saltB64);

  try {
    const candidateKey = await deriveKey(pw, salt);
    const raw = await msg("GET_ALL");
    if (raw.length > 0) await decrypt(raw[0].password, candidateKey); 
    sessionKey = candidateKey;
    await sendKeyToBackground(sessionKey);

    const pending = await msg("GET_PENDING_CREDENTIAL");
    if (pending && pending.entry) {
      await saveEntryFromPending(pending.entry);
    }
    await msg("CLEAR_PENDING_CREDENTIAL");
    pendingSaveEntry = null;
    await loadCredentials();
    filterText = "";
    render();
    showScreen("vault");
    startSessionTimer();
    toast("Password saved ✓");
  } catch {
    hint.textContent = "Wrong password. Try again.";
  }
}

async function saveEntryFromPending(entry) {
  const { hostname, username, password: plainPw, label } = entry;
  const encryptedPw = await encrypt(plainPw, sessionKey);
  await msg("SAVE_CREDENTIAL", {
    entry: { label: label || hostname, hostname, username, password: encryptedPw }
  });
}

async function doSaveIgnore() {
  await msg("CLEAR_PENDING_CREDENTIAL");
  pendingSaveEntry = null;
  render();
  showScreen("unlock");
}

async function loadCredentials() {
  const raw = await msg("GET_ALL");
  allCredentials = raw.map(c => ({ ...c, _plainPw: null }));
}

async function openForm(id) {
  editingId = id || null;
  if (id) {
    const c = allCredentials.find(x => x.id === id);
    if (c && !c._plainPw) c._plainPw = await decrypt(c.password, sessionKey);
  }
  render();
  showScreen("form");
}

async function doSave() {
  const label    = document.getElementById("form-label").value.trim();
  const hostname = document.getElementById("form-hostname").value.trim();
  const username = document.getElementById("form-username").value.trim();
  const plainPw  = document.getElementById("form-password").value;

  if (!hostname || !username || !plainPw) { toast("Fill in all fields."); return; }

  const encryptedPw = await encrypt(plainPw, sessionKey);
  const entry = { id: editingId || undefined, label: label || hostname, hostname, username, password: encryptedPw };

  await msg("SAVE_CREDENTIAL", { entry });
  await loadCredentials();
  filterText = "";
  render();
  showScreen("vault");
  toast("Saved ✓");
}

async function doDelete(id) {
  if (!confirm("Delete this password?")) return;
  await msg("DELETE_CREDENTIAL", { id });
  await loadCredentials();
  render();
  showScreen("vault");
  toast("Deleted.");
}

function doLock() {
  sessionKey = null; allCredentials = []; filterText = "";
  msg("CLEAR_SESSION_KEY");
  render();
  showScreen("unlock");
}

function doSearch(value) {
  filterText = value.toLowerCase();
  render();
  showScreen("vault");
  const inp = document.getElementById("search-input");
  if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
}

async function copyUsername(id) {
  const c = allCredentials.find(x => x.id === id);
  if (!c) return;
  await navigator.clipboard.writeText(c.username);
  toast("Username copied!");
}

async function copyPassword(id) {
  const c = allCredentials.find(x => x.id === id);
  if (!c) return;
  if (!c._plainPw) c._plainPw = await decrypt(c.password, sessionKey);
  await navigator.clipboard.writeText(c._plainPw);
  toast("Password copied!");
}

async function triggerAutofill() {
  if (!currentTab) return;
  await chrome.tabs.sendMessage(currentTab.id, { action: "TRIGGER_AUTOFILL" });
  window.close();
}

function generatePassword() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+";
  const arr   = new Uint8Array(18);
  crypto.getRandomValues(arr);
  const pw = Array.from(arr).map(b => chars[b % chars.length]).join("");
  const inp = document.getElementById("form-password");
  if (inp) { inp.type = "text"; inp.value = pw; updateStrengthBar(pw, "form-strength-bar", "form-strength-label"); }
}

function updateStrengthBar(pw, barId, labelId) {
  const bar   = document.getElementById(barId);
  const label = document.getElementById(labelId);
  const s     = passwordStrength(pw);
  const pcts  = ["0%", "25%", "50%", "75%", "100%"];
  const cols  = ["#ccc", "#ef4444", "#f59e0b", "#3b82f6", "#16a34a"];
  const names = ["", "Weak", "Fair", "Good", "Strong"];
  if (bar)   { bar.style.width = pcts[s]; bar.style.background = cols[s]; }
  if (label) { label.textContent = names[s]; label.style.color = cols[s]; }
}

function togglePw(inputId, btnId) {
  const el  = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if (!el) return;
  const show = el.type === "password";
  el.type = show ? "text" : "password";
  if (btn) btn.textContent = show ? "hide" : "show";
}

function getHostname() {
  try { return currentTab ? new URL(currentTab.url).hostname : ""; } catch { return ""; }
}

function hostnameMatch(stored, current) {
  if (!stored || !current) return false;
  return stored.toLowerCase().replace(/^www\./, "") === current.toLowerCase().replace(/^www\./, "");
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function toast(text, duration = 2000) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), duration);
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function msg(action, extra = {}) {
  return new Promise(resolve => chrome.runtime.sendMessage({ action, ...extra }, resolve));
}

async function sendKeyToBackground(key) {
  const raw   = await crypto.subtle.exportKey("raw", key);
  const keyB64 = u8ToB64(new Uint8Array(raw));
  await msg("STORE_SESSION_KEY", { keyB64 });
}

let timerInterval = null;

async function startSessionTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(async () => {
    const el = document.getElementById("session-timer");
    if (!el) { clearInterval(timerInterval); return; }
    const status = await msg("GET_SESSION_STATUS");
    if (!status || !status.unlocked) { clearInterval(timerInterval); return; }
    const m = Math.floor(status.secondsRemaining / 60);
    const s = String(status.secondsRemaining % 60).padStart(2, "0");
    el.textContent = `${m}:${s}`;
    el.style.color = status.secondsRemaining <= 60 ? "#dc2626" : "#aaa";
  }, 1000);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "SESSION_EXPIRED") {
    clearInterval(timerInterval);
    sessionKey = null; allCredentials = []; filterText = "";
    render();
    showScreen("unlock");
    toast("Locked after 5 min inactivity");
  }
});
