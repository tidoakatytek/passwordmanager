(function () {
  "use strict";

  let autofillBannerShown = false;
  let capturedThisPage    = false; 

  async function init() {
    await new Promise(r => setTimeout(r, 600));
    await checkAndOfferAutofill();
    watchForSubmit();
  }

  async function checkAndOfferAutofill() {
    const { username: uField, password: pField } = findLoginFields();
    if (!uField || !pField) return;
    const resp = await sendMessage({ action: "AUTOFILL_REQUEST", hostname: location.hostname });
    if (!resp || !resp.matches || resp.matches.length === 0) return;
    showAutofillBanner(resp.matches, uField, pField);
  }

  function showAutofillBanner(matches, uField, pField) {
    if (autofillBannerShown) return;
    autofillBannerShown = true;

    const host   = makeBannerHost("__pm_autofill__", "top:16px;right:16px;");
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.appendChild(bannerStyle());

    const banner  = el("div", "banner");
    const top     = makeTop("* Password Manager", () => host.remove());
    const lbl     = el("div", "lbl", "Saved for this site:");
    const select  = el("select");

    select.style.backgroundColor = "white";
    select.style.color = "black";
  
    matches.forEach(m => {
      const opt = el("option");
      opt.value       = m.id;
      opt.textContent = `${m.label || m.username} (${m.hostname})`;
      select.appendChild(opt);
    });

    const fillBtn = el("button", "primary-btn", "Autofill");
    const status  = el("div", "status");

    fillBtn.addEventListener("click", async () => {
      fillBtn.disabled    = true;
      fillBtn.textContent = "Filling…";
      const resp = await sendMessage({ action: "GET_CREDENTIAL_FOR_FILL", id: select.value });
      if (resp && resp.username && resp.plaintextPassword) {
        setNativeValue(uField, resp.username);
        setNativeValue(pField, resp.plaintextPassword);
        status.textContent = "✓ Done";
        setTimeout(() => host.remove(), 800);
      } else {
        status.textContent = "Open popup to unlock first";
        fillBtn.disabled    = false;
        fillBtn.textContent = "Autofill";
      }
    });

    banner.append(top, lbl, select, fillBtn, status);
    shadow.appendChild(banner);
  }

  function watchForSubmit() {
    document.addEventListener("submit", onFormSubmit, true);
    document.addEventListener("click",  onButtonClick, true);
  }

  function onFormSubmit(e) {
    tryCapture(e.target);
  }

  function onButtonClick(e) {
    const btn = e.target.closest('button[type="submit"], input[type="submit"]');
    if (!btn) return;
    const form = btn.closest("form") || btn.closest("[role='form']");
    if (form) {
      tryCapture(form);
    } else {
      const { username: uF, password: pF } = findLoginFields();
      if (uF && pF && pF.value) silentCapture(uF.value, pF.value);
    }
  }

  function tryCapture(container) {
    const pwField = [...container.querySelectorAll('input[type="password"]')].find(isVisible);
    if (!pwField || !pwField.value) return;

    const allInputs = [...container.querySelectorAll("input")].filter(isVisible);
    const pwPos     = allInputs.indexOf(pwField);
    let uField      = null;
    for (let i = pwPos - 1; i >= 0; i--) {
      const t = (allInputs[i].type || "text").toLowerCase();
      if (["text", "email", "tel", ""].includes(t)) { uField = allInputs[i]; break; }
    }
    if (uField && uField.value && pwField.value) {
      silentCapture(uField.value, pwField.value);
    }
  }

  async function silentCapture(username, password) {
    if (capturedThisPage) return; 
    capturedThisPage = true;

    await sendMessage({
      action:  "SAVE_PENDING_CREDENTIAL",
      entry:   { hostname: location.hostname, username, password, label: location.hostname }
    });
  }

  function makeBannerHost(id, positionCss) {
    const existing = document.getElementById(id);
    if (existing) existing.remove();
    const host = document.createElement("div");
    host.id = id;
    host.style.cssText = `position:fixed;${positionCss}z-index:2147483647;font-family:system-ui,sans-serif;`;
    document.body.appendChild(host);
    return host;
  }

  function bannerStyle() {
    const s = document.createElement("style");
    s.textContent = `
      .banner{background:#fff;border:1px solid #ccc;border-radius:8px;padding:12px 14px;
              min-width:250px;max-width:300px;box-shadow:0 4px 16px rgba(0,0,0,.12);}
      .top{display:flex;align-items:center;justify-content:space-between;
           margin-bottom:10px;font-size:13px;font-weight:600;color:#111;}
      .close-btn{background:none;border:none;cursor:pointer;font-size:16px;color:#888;
                 padding:0;line-height:1;}
      .close-btn:hover{color:#111;}
      .lbl{font-size:11px;color:#555;margin-bottom:4px;}
      select{width:100%;padding:5px 8px;border:1px solid #ccc;border-radius:5px;
             font-size:12px;margin-bottom:10px;}
      .primary-btn{padding:7px 12px;border-radius:5px;border:none;background:#2563eb;
                   color:#fff;font-size:12px;font-weight:600;cursor:pointer;}
      .primary-btn:hover{background:#1d4ed8;}
      .primary-btn:disabled{background:#aaa;cursor:not-allowed;}
      .status{font-size:11px;color:#555;text-align:center;margin-top:6px;min-height:14px;}
    `;
    return s;
  }

  function makeTop(title, onClose) {
    const top   = el("div", "top", title);
    const close = el("button", "close-btn", "×");
    close.addEventListener("click", onClose);
    top.appendChild(close);
    return top;
  }

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function findLoginFields() {
    const pwField = [...document.querySelectorAll('input[type="password"]')].find(isVisible) || null;
    if (!pwField) return {};
    const allInputs = [...document.querySelectorAll("input")].filter(isVisible);
    const pwPos     = allInputs.indexOf(pwField);
    let uField      = null;
    for (let i = pwPos - 1; i >= 0; i--) {
      const t = (allInputs[i].type || "text").toLowerCase();
      if (["text", "email", "tel", ""].includes(t)) { uField = allInputs[i]; break; }
    }
    return { username: uField, password: pwField };
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
  }

  function setNativeValue(element, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(element, value);
    element.dispatchEvent(new Event("input",  { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.focus();
  }

  function sendMessage(message) {
    return new Promise(resolve => {
      try { chrome.runtime.sendMessage(message, resolve); } catch { resolve(null); }
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "TRIGGER_AUTOFILL") {
      autofillBannerShown = false;
      checkAndOfferAutofill().then(() => sendResponse({ ok: true }));
      return true;
    }
  });

  init();
})();
