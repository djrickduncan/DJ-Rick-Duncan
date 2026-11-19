// Runs INSIDE TikTok's live page (in the app's built-in TikTok browser).
// Reads new chat lines, finds the chat box, and posts a message only when the app asks.
// TikTok changes its page often, so everything here is best-effort with fallbacks,
// plus a "teach me the chat box" mode and a debug dump to fix things quickly.
(() => {
  if (window.__copilot) {
    window.__copilot.rescan();
    return;
  }

  const send = (obj) => {
    try {
      window.CopilotBridge.post(JSON.stringify(obj));
    } catch (e) {
      /* not in the app */
    }
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => Boolean(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  const EDITABLE = '[contenteditable="true"], [contenteditable="plaintext-only"], textarea, input[type="text"], input:not([type])';

  // Desktop layout (chat beside the video) even on a phone screen.
  function wideLayout() {
    let m = document.querySelector('meta[name="viewport"]');
    if (!m) {
      m = document.createElement('meta');
      m.name = 'viewport';
      document.head.appendChild(m);
    }
    if (m.content !== 'width=1280') m.content = 'width=1280';
  }

  // The live's sound would otherwise play out of the phone and confuse the music listener.
  function mute() {
    document.querySelectorAll('video, audio').forEach((v) => {
      v.muted = true;
      v.volume = 0;
    });
  }

  // ---------- reading the chat ----------
  const ROOT_SELECTORS = [
    '[data-e2e="chat-room"]',
    '[class*="DivChatRoomContent"]',
    '[class*="ChatRoomContent"]',
    '[class*="DivChatRoom"]',
    '[class*="ChatRoom"]',
    '[class*="chat-room"]',
  ];
  function findChatRoot() {
    for (const s of ROOT_SELECTORS) {
      const el = document.querySelector(s);
      if (el) return { el, selector: s };
    }
    return null;
  }

  const SYSTEM = [
    [/^(.{1,40}?)\s+joined\b/i, 'join'],
    [/^(.{1,40}?)\s+(?:followed|is following|started following)\s+(?:the host|the LIVE creator|the creator|you)/i, 'follow'],
    [/^(.{1,40}?)\s+shared\s+(?:the|this)\s+LIVE/i, 'share'],
    [/^(.{1,40}?)\s+sent\s+(.{1,40})$/i, 'gift'],
  ];
  const NAME_SEL = '[data-e2e="message-owner-name"], [data-e2e*="nickname" i], [data-e2e*="owner" i], [class*="Nickname"], [class*="nickname"], [class*="UserName"], [class*="Username"], [class*="Author"]';
  const TEXT_SEL = '[data-e2e*="content" i], [data-e2e*="comment" i], [class*="CommentText"], [class*="Comment"], [class*="Content"]';

  function handleFrom(node) {
    const a = node.querySelector('a[href*="/@"]');
    const m = a && a.getAttribute('href').match(/\/@([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function parse(node) {
    const raw = (node.innerText || '').trim();
    if (!raw || raw.length > 500) return null;
    const lines = raw.split('\n').map((s) => s.trim()).filter(Boolean);
    const flat = lines.join(' ');
    const handle = handleFrom(node);
    for (const [re, type] of SYSTEM) {
      const m = flat.match(re);
      if (m) return { type, nickname: m[1], uniqueId: handle || m[1], detail: type === 'gift' ? m[2] : '' };
    }
    const nameEl = node.querySelector(NAME_SEL);
    let nickname = nameEl ? nameEl.innerText.trim() : '';
    let text = '';
    const textEl = [...node.querySelectorAll(TEXT_SEL)].find((el) => el !== nameEl && !el.contains(nameEl));
    if (textEl) text = textEl.innerText.trim();
    if (!nickname && lines.length >= 2) {
      nickname = lines[0];
      text = lines.slice(1).join(' ');
    }
    if (nickname && !text) text = flat.slice(flat.indexOf(nickname) + nickname.length).replace(/^[:\s·]+/, '').trim();
    if (!nickname) {
      const m = flat.match(/^([^:]{1,40}):\s*(.+)$/);
      if (m) {
        nickname = m[1];
        text = m[2];
      }
    }
    nickname = nickname.replace(/[:·]\s*$/, '').trim();
    if (!nickname || !text) return null;
    return { type: 'chat', nickname, uniqueId: handle || nickname, text };
  }

  const recent = new Map(); // dedupe re-rendered rows
  const samples = []; // last few raw rows, for the debug dump
  function report(node) {
    if (node.nodeType !== 1) return;
    if (samples.length >= 8) samples.shift();
    samples.push(node.outerHTML.slice(0, 700));
    const ev = parse(node);
    if (!ev) return;
    const key = `${ev.type}|${ev.nickname}|${ev.text || ev.detail || ''}`;
    const now = Date.now();
    if (recent.has(key) && now - recent.get(key) < 20000) return;
    recent.set(key, now);
    if (recent.size > 400) recent.delete(recent.keys().next().value);
    send({ type: 'event', event: ev });
  }

  let observed = null;
  let observer = null;
  function attach() {
    const found = findChatRoot();
    if (!found || found.el === observed) return;
    observer?.disconnect();
    observed = found.el;
    observer = new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) report(n);
    });
    observer.observe(found.el, { childList: true, subtree: true });
  }

  // ---------- the chat box ----------
  function findInput() {
    const saved = localStorage.getItem('copilot.inputSelector');
    if (saved) {
      try {
        const el = document.querySelector(saved);
        if (visible(el)) return el;
      } catch (e) {
        /* bad selector */
      }
    }
    const score = (el) => {
      const label = [el.getAttribute('placeholder'), el.getAttribute('aria-label'), el.getAttribute('data-e2e'),
        el.getAttribute('data-placeholder'), (el.parentElement && el.parentElement.innerText || '').slice(0, 80), String(el.className)]
        .join(' ').toLowerCase();
      let s = 0;
      if (/say something|add comment|comment|chat|message|nice/.test(label)) s += 5;
      if (el.closest(ROOT_SELECTORS.join(',')) || el.closest('[class*="Chat"], [class*="chat"]')) s += 3;
      if (el.isContentEditable) s += 1;
      if (/search/.test(label)) s -= 20;
      return s;
    };
    const candidates = [...document.querySelectorAll(EDITABLE)].filter(visible).sort((a, b) => score(b) - score(a));
    return candidates[0] && score(candidates[0]) > 0 ? candidates[0] : null;
  }

  function findSendButton(input) {
    let scope = input;
    for (let i = 0; i < 4 && scope.parentElement; i++) scope = scope.parentElement;
    const btns = [...scope.querySelectorAll('[data-e2e*="send" i], [aria-label*="send" i], [aria-label*="post" i], button[type="submit"]')]
      .filter((b) => visible(b) && !/like/i.test(b.getAttribute('data-e2e') || ''));
    return btns[0] || null;
  }

  const currentText = (el) => (el.isContentEditable ? el.innerText : el.value || '').trim();

  function pressEnter(el) {
    for (const type of ['keydown', 'keypress', 'keyup']) {
      el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    }
  }

  function typeInto(el, text) {
    el.focus();
    if (el.isContentEditable) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('delete');
      document.execCommand('insertText', false, text);
      if (!currentText(el).includes(text.slice(0, 12))) {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      }
    } else {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  async function post(text, id) {
    try {
      const el = findInput();
      if (!el) return send({ type: 'postResult', id, ok: false, reason: 'no-input' });
      el.scrollIntoView({ block: 'center' });
      el.click();
      await sleep(150);
      typeInto(el, text);
      await sleep(300);
      if (!currentText(el).includes(text.slice(0, 12))) return send({ type: 'postResult', id, ok: false, reason: 'could-not-type' });
      const btn = findSendButton(el);
      if (btn) btn.click();
      else pressEnter(el);
      await sleep(800);
      if (currentText(el).includes(text.slice(0, 12))) {
        pressEnter(el);
        await sleep(800);
      }
      const sent = !currentText(el).includes(text.slice(0, 12));
      send({ type: 'postResult', id, ok: sent, reason: sent ? '' : 'not-sent' });
    } catch (e) {
      send({ type: 'postResult', id, ok: false, reason: String(e && e.message || e) });
    }
  }

  // ---------- teach me the chat box ----------
  function selectorFor(el) {
    const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
    if (el.getAttribute('data-e2e')) return `[data-e2e="${el.getAttribute('data-e2e')}"]`;
    if (el.id && !/\d{3,}/.test(el.id)) return `#${esc(el.id)}`;
    if (el.getAttribute('placeholder')) return `${el.tagName.toLowerCase()}[placeholder="${el.getAttribute('placeholder')}"]`;
    const anc = el.closest('[data-e2e]');
    const tag = el.isContentEditable ? '[contenteditable="true"]' : el.tagName.toLowerCase();
    if (anc && anc !== el) return `[data-e2e="${anc.getAttribute('data-e2e')}"] ${tag}`;
    const parts = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const i = [...n.parentElement.children].filter((c) => c.tagName === n.tagName).indexOf(n) + 1;
      parts.unshift(`${n.tagName.toLowerCase()}:nth-of-type(${i})`);
    }
    return `body > ${parts.join(' > ')}`;
  }

  function calibrate() {
    const banner = document.createElement('div');
    banner.textContent = '👆 Tap the chat box (where you would type a comment)';
    banner.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;padding:18px;font:600 28px system-ui;text-align:center;background:#ff2d6f;color:#fff';
    document.body.appendChild(banner);
    const handler = (e) => {
      if (e.target === banner) return;
      document.removeEventListener('pointerdown', handler, true);
      banner.remove();
      const t = e.target;
      const el = t.closest(EDITABLE) || t.querySelector(EDITABLE) || (t.parentElement && t.parentElement.querySelector(EDITABLE)) ||
        (t.parentElement && t.parentElement.parentElement && t.parentElement.parentElement.querySelector(EDITABLE)) || t;
      const selector = selectorFor(el);
      localStorage.setItem('copilot.inputSelector', selector);
      send({ type: 'calibrated', selector, editable: Boolean(el.matches && el.matches(EDITABLE)) });
    };
    document.addEventListener('pointerdown', handler, true);
  }

  // ---------- status + debug ----------
  function viewers() {
    const el = document.querySelector('[data-e2e*="viewer" i], [class*="ViewerCount"], [class*="viewer-count"]');
    if (!el) return 0;
    const m = el.innerText.replace(/,/g, '').match(/([\d.]+)\s*([KkMm]?)/);
    if (!m) return 0;
    return Math.round(parseFloat(m[1]) * (/k/i.test(m[2]) ? 1000 : /m/i.test(m[2]) ? 1e6 : 1));
  }

  function state() {
    const bodyText = (document.body && document.body.innerText || '').slice(0, 6000);
    return {
      type: 'state',
      url: location.href,
      isLivePage: /\/live/.test(location.pathname),
      chatRoot: Boolean(findChatRoot()),
      input: Boolean(findInput()),
      loggedIn: !document.querySelector('[data-e2e="top-login-button"], [data-e2e="nav-login-button"]'),
      ended: /LIVE has ended|live has ended|This LIVE has ended|isn't live right now/i.test(bodyText),
      viewers: viewers(),
    };
  }

  function debug() {
    const input = findInput();
    send({
      type: 'debug',
      data: {
        ...state(),
        rootSelector: (findChatRoot() || {}).selector || null,
        savedInputSelector: localStorage.getItem('copilot.inputSelector'),
        input: input ? input.outerHTML.slice(0, 400) : null,
        editables: [...document.querySelectorAll(EDITABLE)].filter(visible).slice(0, 6).map((e) => e.outerHTML.slice(0, 300)),
        dataE2e: [...new Set([...document.querySelectorAll('[data-e2e]')].map((e) => e.getAttribute('data-e2e')))].slice(0, 120),
        recentRows: samples,
      },
    });
  }

  function rescan() {
    wideLayout();
    mute();
    attach();
  }

  window.__copilot = { post, calibrate, debug, rescan };
  rescan();
  setInterval(rescan, 2000);
  setInterval(() => send(state()), 4000);
  send(state());
})();
