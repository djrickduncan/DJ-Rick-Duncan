/* Follow-Up — capture people you meet at shows, tag them, and follow up.
 * All data lives on this device in IndexedDB. No server, no LinkedIn API.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- utils
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => ymd(new Date());
  const addDays = (n, from) => { const d = from ? parseYmd(from) : new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  const dayDiff = (s) => Math.round((parseYmd(s) - parseYmd(today())) / 86400000);

  function fmtDay(date) {
    const d = typeof date === 'string' && date.length === 10 ? parseYmd(date) : new Date(date);
    const opts = { weekday: 'short', day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('en-GB', opts);
  }
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  function dueInfo(c) {
    if (!c.followUp || c.status === 'done') return null;
    const n = dayDiff(c.followUp);
    if (n < 0) return { cls: 'is-overdue', text: n === -1 ? 'Overdue 1 day' : 'Overdue ' + -n + ' days' };
    if (n === 0) return { cls: 'is-today', text: 'Follow up today' };
    if (n === 1) return { cls: '', text: 'Tomorrow' };
    if (n < 7) return { cls: '', text: parseYmd(c.followUp).toLocaleDateString('en-GB', { weekday: 'long' }) };
    return { cls: '', text: fmtDay(c.followUp) };
  }

  // First letter of the first and last word, skipping emoji and punctuation.
  function initials(name) {
    const words = String(name || '').split(/\s+/)
      .map((w) => (w.match(/[\p{L}\p{N}]/u) || [''])[0]).filter(Boolean);
    if (!words.length) return '?';
    return (words[0] + (words.length > 1 ? words[words.length - 1] : '')).toUpperCase();
  }
  const firstName = (name) => String(name || '').trim().split(/\s+/).find((w) => /\p{L}/u.test(w)) || 'there';

  const STATUS = { new: 'New', messaged: 'Messaged', meeting: 'Meeting booked', done: 'Done' };

  // LinkedIn profile URL -> { slug, url }
  function parseLinkedIn(text) {
    const m = String(text || '').match(/linkedin\.com\/in\/([^/?#\s]+)/i);
    if (!m) return null;
    let slug = m[1];
    try { slug = decodeURIComponent(slug); } catch (e) { /* keep raw */ }
    slug = slug.toLowerCase();
    return { slug, url: 'https://www.linkedin.com/in/' + encodeURIComponent(slug) + '/' };
  }

  // "jane-smith-4a1b2c3d" -> "Jane Smith" (best guess, user can edit)
  function nameFromSlug(slug) {
    const parts = slug.split('-').filter(Boolean);
    if (parts.length > 1 && /\d/.test(parts[parts.length - 1])) parts.pop();
    return parts.filter((p) => !/^\d+$/.test(p))
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }

  // vCard / MECARD (business-card QR codes)
  function parseCard(text) {
    const out = {};
    if (/^BEGIN:VCARD/i.test(text)) {
      text.split(/\r?\n/).forEach((line) => {
        const i = line.indexOf(':'); if (i < 0) return;
        const key = line.slice(0, i).split(';')[0].toUpperCase();
        const val = line.slice(i + 1).trim();
        if (key === 'FN') out.name = val;
        else if (key === 'N' && !out.name) out.name = val.split(';').reverse().filter(Boolean).join(' ');
        else if (key === 'ORG') out.company = val.split(';')[0];
        else if (key === 'TITLE') out.role = val;
        else if (key === 'EMAIL' && !out.email) out.email = val;
        else if (key === 'TEL' && !out.phone) out.phone = val;
        else if (key === 'URL' && !out.url) out.url = val;
      });
      return out;
    }
    if (/^MECARD:/i.test(text)) {
      text.slice(7).split(';').forEach((part) => {
        const i = part.indexOf(':'); if (i < 0) return;
        const key = part.slice(0, i).toUpperCase(), val = part.slice(i + 1);
        if (key === 'N') out.name = val.split(',').reverse().join(' ').trim();
        else if (key === 'TEL') out.phone = val;
        else if (key === 'EMAIL') out.email = val;
        else if (key === 'URL') out.url = val;
        else if (key === 'ORG') out.company = val;
      });
      return out;
    }
    return null;
  }

  // ---------------------------------------------------------------- native (Android app build)
  // When packaged with Capacitor (see /app-android) these call native Android APIs.
  // In the browser they fall back to web APIs.
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const plug = (name) => (isNative && window.capacitorExports ? window.capacitorExports.registerPlugin(name) : null);
  const Native = {
    LN: plug('LocalNotifications'), Share: plug('Share'), FS: plug('Filesystem'), Launcher: plug('AppLauncher')
  };
  function openExternal(url) {
    if (Native.Launcher) return Native.Launcher.openUrl({ url: url }).catch(() => { location.href = url; });
    window.open(url, '_blank', 'noopener');
  }
  const canShare = () => isNative || 'share' in navigator;
  async function shareText(text) {
    if (Native.Share) return Native.Share.share({ text: text, dialogTitle: 'Send message' });
    return navigator.share({ text: text });
  }
  function hashId(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h) % 2000000000 + 1;
  }

  // ---------------------------------------------------------------- IndexedDB
  const DB_NAME = 'followup', DB_VER = 1;
  let dbp;
  function db() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains('contacts')) d.createObjectStore('contacts', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const s = t.objectStore(store);
      const r = fn(s);
      t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  const dbAll = () => tx('contacts', 'readonly', (s) => s.getAll());
  const dbPut = (c) => tx('contacts', 'readwrite', (s) => s.put(c));
  const dbPutMany = (list) => tx('contacts', 'readwrite', (s) => { list.forEach((c) => s.put(c)); });
  const dbDel = (id) => tx('contacts', 'readwrite', (s) => s.delete(id));
  const dbClear = () => tx('contacts', 'readwrite', (s) => s.clear());
  const kvGet = (k) => tx('kv', 'readonly', (s) => s.get(k));
  const kvSet = (k, v) => tx('kv', 'readwrite', (s) => s.put(v, k));

  // ---------------------------------------------------------------- state
  const DEFAULT_TEMPLATES = [
    { id: 't1', name: 'Day after', body: 'Hi {first}, great to meet you at {event}! As promised, I\'d love to set up a proper chat. Are you free for a quick call or coffee next week?' },
    { id: 't2', name: 'With my link', body: 'Hi {first}, Rick here (Just:DJ). Good to connect at {event}. Here\'s my EPK as mentioned: {mylink}\n\nWhen would suit you to talk about working together?' },
    { id: 't3', name: 'Chase-up', body: 'Hi {first}, just bumping this. Still keen to arrange the meeting we talked about at {event}. What day works best for you?' }
  ];
  const DEFAULT_SETTINGS = { myUrl: '', myLink: '', defaultFollow: 1, reminderTime: '09:00', templates: DEFAULT_TEMPLATES };
  const PRESET_TAGS = ['Promoter', 'Venue', 'Booking', 'Artist', 'Brand', 'Media', 'Hot lead'];

  let contacts = [];
  let settings = Object.assign({}, DEFAULT_SETTINGS);
  let currentEvent = '';
  let currentView = 'due';
  const tagFilter = new Set();      // tags the All list is filtered by (contact must have all of them)
  const NO_TAGS = '\u0000untagged';
  let selecting = false;
  const selected = new Set();       // contact ids picked in Select mode
  let visibleIds = [];              // ids currently shown in the All list

  const byId = (id) => contacts.find((c) => c.id === id);
  const bySlug = (slug) => slug && contacts.find((c) => c.slug === slug);

  async function save(c, logText) {
    c.updatedAt = new Date().toISOString();
    if (logText) (c.log = c.log || []).push({ at: c.updatedAt, text: logText });
    await dbPut(c);
    const i = contacts.findIndex((x) => x.id === c.id);
    if (i >= 0) contacts[i] = c; else contacts.push(c);
    requestPersist();
    renderAll();
  }
  async function saveSettings() { await kvSet('settings', settings); }

  function knownEvents() {
    const seen = new Map();
    contacts.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).forEach((c) => {
      if (c.event && !seen.has(c.event.toLowerCase())) seen.set(c.event.toLowerCase(), c.event);
    });
    return Array.from(seen.values());
  }
  function knownTags() {
    const set = new Set(PRESET_TAGS);
    contacts.forEach((c) => (c.tags || []).forEach((t) => set.add(t)));
    return Array.from(set);
  }

  // ---------------------------------------------------------------- rendering
  function contactCard(c, showDue, selectable) {
    const due = showDue ? dueInfo(c) : null;
    const sub = [c.role, c.company].filter(Boolean).join(' · ');
    const avatar = c.photo ? '<img src="' + esc(c.photo) + '" alt="" />' : esc(initials(c.name));
    const isSel = selectable && selected.has(c.id);
    return '<button class="contact' + (isSel ? ' is-selected' : '') + '" type="button" data-id="' + esc(c.id) + '"' +
      (selectable ? ' aria-pressed="' + isSel + '"' : '') + '>' +
      (selectable ? '<span class="check" aria-hidden="true">✓</span>' : '') +
      '<span class="avatar">' + avatar + '</span>' +
      '<span class="contact-main">' +
        '<span class="contact-name">' + esc(c.name || 'Unnamed') + ' <span class="status status-' + esc(c.status) + '">' + esc(STATUS[c.status] || c.status) + '</span></span>' +
        (sub ? '<span class="contact-sub">' + esc(sub) + '</span>' : '') +
        (c.note ? '<span class="contact-note">' + esc(c.note) + '</span>' : '') +
        '<span class="contact-meta">' +
          (c.event ? '<span class="tag tag-event">' + esc(c.event) + '</span>' : '') +
          (c.tags || []).map((t) => '<span class="tag">' + esc(t) + '</span>').join('') +
          (due ? '<span class="due-badge ' + due.cls + '">' + esc(due.text) + '</span>' : '') +
        '</span>' +
      '</span></button>';
  }

  function dueBuckets() {
    const t = today(), week = addDays(7), recent = addDays(-14);
    const b = { overdue: [], today: [], week: [], later: [], unscheduled: [] };
    contacts.forEach((c) => {
      if (c.status === 'done') return;
      if (!c.followUp) {
        if (c.status === 'new' && c.createdAt.slice(0, 10) >= recent) b.unscheduled.push(c);
        return;
      }
      if (c.followUp < t) b.overdue.push(c);
      else if (c.followUp === t) b.today.push(c);
      else if (c.followUp <= week) b.week.push(c);
      else b.later.push(c);
    });
    const byDate = (a, z) => (a.followUp || '').localeCompare(z.followUp || '') || z.createdAt.localeCompare(a.createdAt);
    Object.values(b).forEach((l) => l.sort(byDate));
    b.unscheduled.sort((a, z) => z.createdAt.localeCompare(a.createdAt));
    return b;
  }

  function renderDue() {
    const b = dueBuckets();
    const groups = [
      ['overdue', 'Overdue', 'is-overdue'], ['today', 'Today', 'is-today'],
      ['week', 'Next 7 days', ''], ['later', 'Later', ''], ['unscheduled', 'Met recently, no follow-up date', '']
    ];
    let html = '';
    groups.forEach(([k, label, cls]) => {
      if (!b[k].length) return;
      html += '<h3 class="group-head ' + cls + '"><span>' + label + '</span><span>' + b[k].length + '</span></h3>';
      html += b[k].map((c) => contactCard(c, true)).join('');
    });
    if (!html) {
      html = contacts.length
        ? '<div class="empty"><strong>All caught up</strong>Nobody is waiting on a follow-up.</div>'
        : '<div class="empty"><strong>No contacts yet</strong>At your next show, set the event above, then tap <b>Met someone</b> and scan their LinkedIn QR code.</div>';
    }
    $('#dueList').innerHTML = html;
    const n = b.overdue.length + b.today.length;
    $('#dueCount').hidden = !n;
    $('#dueCount').textContent = n;
    if ('setAppBadge' in navigator) { (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {}); }
  }

  function renderList() {
    const q = $('#searchInput').value.trim().toLowerCase();
    const ev = $('#eventFilter').value, st = $('#statusFilter').value;
    const list = contacts.filter((c) => {
      if (ev && c.event !== ev) return false;
      if (st && c.status !== st) return false;
      if (tagFilter.has(NO_TAGS) && (c.tags || []).length) return false;
      for (const t of tagFilter) { if (t !== NO_TAGS && !(c.tags || []).includes(t)) return false; }
      if (!q) return true;
      return [c.name, c.company, c.role, c.note, c.event, c.email, (c.tags || []).join(' ')]
        .join(' ').toLowerCase().includes(q);
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    let html = '', lastDay = '';
    list.forEach((c) => {
      const day = ymd(new Date(c.createdAt));
      if (day !== lastDay) {
        lastDay = day;
        const evs = Array.from(new Set(list.filter((x) => ymd(new Date(x.createdAt)) === day && x.event).map((x) => x.event)));
        const count = list.filter((x) => ymd(new Date(x.createdAt)) === day).length;
        html += '<h3 class="group-head"><span>' + esc(fmtDay(day)) + (evs.length ? ' · ' + esc(evs.join(', ')) : '') + '</span><span>' + count + '</span></h3>';
      }
      html += contactCard(c, true, selecting);
    });
    visibleIds = list.map((c) => c.id);
    $('#listCount').textContent = list.length + (list.length === 1 ? ' person' : ' people') +
      (tagFilter.size ? ' tagged ' + Array.from(tagFilter).map((t) => t === NO_TAGS ? '(no tags)' : '"' + t + '"').join(' + ') : '');
    $('#selectBtn').textContent = selecting ? 'Done' : 'Select';
    renderTagFilter();
    updateSelectBar();
    $('#allList').innerHTML = html || '<div class="empty"><strong>' + (contacts.length ? 'No matches' : 'No contacts yet') + '</strong></div>';

    const sel = $('#eventFilter'), cur = sel.value;
    sel.innerHTML = '<option value="">All events</option>' + knownEvents().map((e) => '<option' + (e === cur ? ' selected' : '') + '>' + esc(e) + '</option>').join('');
  }

  function renderTagFilter() {
    const counts = new Map();
    let untagged = 0;
    contacts.forEach((c) => {
      if (!(c.tags || []).length) untagged++;
      (c.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
    });
    Array.from(tagFilter).forEach((t) => { if (t !== NO_TAGS && !counts.has(t)) tagFilter.delete(t); });
    const tags = Array.from(counts.keys()).sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b));
    const chip = (val, label, n) => '<button type="button" class="chip' + (tagFilter.has(val) ? ' is-on' : '') + '" data-ftag="' + esc(val) + '">' +
      esc(label) + '<span class="chip-count">' + n + '</span></button>';
    $('#tagFilter').innerHTML = (tagFilter.size ? '<button type="button" class="chip chip-clear" data-ftag="">Clear</button>' : '') +
      tags.map((t) => chip(t, t, counts.get(t))).join('') +
      (untagged && contacts.length ? chip(NO_TAGS, 'No tags', untagged) : '');
    $('#tagFilter').hidden = !tags.length && !untagged;
  }

  // ---------------------------------------------------------------- multi-select
  function setSelecting(on, firstId, fromBack) {
    if (on && !selecting) pushNav('select');
    else if (!on && selecting && !fromBack) popNav('select');
    selecting = on;
    selected.clear();
    if (on && firstId) selected.add(firstId);
    document.body.classList.toggle('selecting', on);
    $('#selectBar').hidden = !on;
    renderList();
  }
  function updateSelectBar() {
    if (!selecting) return;
    const n = selected.size;
    $('#selectCount').textContent = n + ' selected';
    const allShown = visibleIds.length && visibleIds.every((id) => selected.has(id));
    $('#selectAllBtn').textContent = allShown ? 'Select none' : 'Select all (' + visibleIds.length + ')';
    $$('[data-bulk]').forEach((b) => { b.disabled = !n; b.style.opacity = n ? '' : '0.45'; });
  }
  function toggleSelected(id, card) {
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    if (card) { card.classList.toggle('is-selected', selected.has(id)); card.setAttribute('aria-pressed', selected.has(id)); }
    updateSelectBar();
  }
  const selectedContacts = () => contacts.filter((c) => selected.has(c.id));

  async function saveMany(list, logText) {
    const now = new Date().toISOString();
    list.forEach((c) => { c.updatedAt = now; (c.log = c.log || []).push({ at: now, text: logText }); });
    await dbPutMany(list);
    renderAll();
  }

  function openBulkTag() {
    const list = selectedContacts(); const n = list.length;
    const counts = new Map();
    list.forEach((c) => (c.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
    const add = new Set(), remove = new Set();
    const addChips = () => knownTags().map((t) => '<button type="button" class="chip' + (add.has(t) ? ' is-on' : '') + '" data-add="' + esc(t) + '">' + esc(t) +
      (counts.get(t) ? '<span class="chip-count">' + counts.get(t) + '/' + n + '</span>' : '') + '</button>').join('');
    const body = openSheet('Tag ' + n + (n === 1 ? ' person' : ' people'),
      '<div class="bulk-section"><label class="field" style="margin-bottom:6px"><span class="field-label">Create a new list</span>' +
        '<input class="input" id="bNew" placeholder="e.g. Target: Ibiza promoters" autocapitalize="sentences" /></label>' +
        '<span class="field-hint">Lists are tags: filter by it any time on the All tab.</span></div>' +
      '<div class="bulk-section"><span class="field-label">Add to all ' + n + '</span><div class="chips" id="bAdd">' + addChips() + '</div></div>' +
      (counts.size ? '<div class="bulk-section"><span class="field-label">Remove from all ' + n + '</span><div class="chips" id="bRemove">' +
        Array.from(counts.keys()).map((t) => '<button type="button" class="chip" data-remove="' + esc(t) + '">' + esc(t) + '<span class="chip-count">' + counts.get(t) + '/' + n + '</span></button>').join('') +
      '</div></div>' : '') +
      '<div class="sheet-actions"><button class="btn btn-ghost" id="bCancel" type="button">Cancel</button><button class="btn" id="bApply" type="button">Apply</button></div>');
    $('#bAdd', body).addEventListener('click', (e) => {
      const b = e.target.closest('[data-add]'); if (!b) return;
      const t = b.dataset.add; if (add.has(t)) add.delete(t); else { add.add(t); remove.delete(t); }
      b.classList.toggle('is-on', add.has(t));
      const r = $('[data-remove="' + CSS.escape(t) + '"]', body); if (r) r.classList.remove('is-on');
    });
    const rem = $('#bRemove', body);
    if (rem) rem.addEventListener('click', (e) => {
      const b = e.target.closest('[data-remove]'); if (!b) return;
      const t = b.dataset.remove; if (remove.has(t)) remove.delete(t); else { remove.add(t); add.delete(t); }
      b.classList.toggle('is-on', remove.has(t));
      const a = $('[data-add="' + CSS.escape(t) + '"]', body); if (a) a.classList.remove('is-on');
    });
    $('#bNew', body).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#bApply', body).click(); } });
    $('#bCancel', body).onclick = closeSheet;
    $('#bApply', body).onclick = async () => {
      const fresh = $('#bNew', body).value.trim();
      if (fresh) add.add(fresh);
      if (!add.size && !remove.size) { toast('Pick a tag to add or remove'); return; }
      list.forEach((c) => {
        const set = new Set(c.tags || []);
        add.forEach((t) => set.add(t)); remove.forEach((t) => set.delete(t));
        c.tags = Array.from(set);
      });
      const parts = [];
      if (add.size) parts.push('Tagged ' + Array.from(add).join(', '));
      if (remove.size) parts.push('Removed tag ' + Array.from(remove).join(', '));
      await saveMany(list, parts.join('; '));
      closeSheet();
      const showTag = fresh || (add.size === 1 ? Array.from(add)[0] : '');
      setSelecting(false);
      if (showTag) toast(parts.join('; ') + ' (' + n + ')', 'View list', () => { tagFilter.clear(); tagFilter.add(showTag); renderList(); window.scrollTo(0, 0); });
      else toast(parts.join('; ') + ' (' + n + ')');
    };
    setTimeout(() => $('#bNew', body).focus(), 50);
  }

  function openBulkFollow() {
    const list = selectedContacts(); const n = list.length;
    const body = openSheet('Follow-up for ' + n + (n === 1 ? ' person' : ' people'),
      '<div class="chips" id="bfChips">' + followChips(addDays(1)) + '</div>' +
      '<input type="date" class="input" id="bfDate" value="' + addDays(1) + '" style="margin-top:10px" aria-label="Follow-up date" />' +
      '<p class="muted small">Sets the same follow-up date for everyone selected. Choose None to clear it.</p>' +
      '<div class="sheet-actions"><button class="btn btn-ghost" id="bfCancel" type="button">Cancel</button><button class="btn" id="bfApply" type="button">Set date</button></div>');
    $('#bfChips', body).addEventListener('click', (e) => {
      const b = e.target.closest('[data-follow]'); if (!b) return;
      $('#bfDate', body).value = b.dataset.follow;
      $$('[data-follow]', body).forEach((x) => x.classList.toggle('is-on', x === b));
    });
    $('#bfCancel', body).onclick = closeSheet;
    $('#bfApply', body).onclick = async () => {
      const d = $('#bfDate', body).value;
      list.forEach((c) => { c.followUp = d; });
      await saveMany(list, d ? 'Follow-up set for ' + fmtDay(d) : 'Follow-up cleared');
      closeSheet(); setSelecting(false);
      toast(d ? n + ' follow-ups set for ' + fmtDay(d) : 'Cleared ' + n + ' follow-ups');
    };
  }

  function openBulkStatus() {
    const list = selectedContacts(); const n = list.length;
    const body = openSheet('Status for ' + n + (n === 1 ? ' person' : ' people'),
      '<div class="btn-row" id="bsList" style="flex-direction:column">' +
        Object.keys(STATUS).map((k) => '<button class="btn btn-ghost" type="button" data-st="' + k + '">' + STATUS[k] + '</button>').join('') +
      '</div>');
    $('#bsList', body).addEventListener('click', async (e) => {
      const b = e.target.closest('[data-st]'); if (!b) return;
      list.forEach((c) => { c.status = b.dataset.st; });
      await saveMany(list, 'Status: ' + STATUS[b.dataset.st]);
      closeSheet(); setSelecting(false);
      toast(n + ' marked ' + STATUS[b.dataset.st]);
    });
  }

  async function bulkDelete() {
    const list = selectedContacts(); const n = list.length;
    if (!confirm('Delete ' + n + (n === 1 ? ' contact' : ' contacts') + '?')) return;
    const copies = list.map((c) => Object.assign({}, c));
    await tx('contacts', 'readwrite', (s) => { list.forEach((c) => s.delete(c.id)); });
    const ids = new Set(list.map((c) => c.id));
    contacts = contacts.filter((c) => !ids.has(c.id));
    setSelecting(false); renderAll();
    toast('Deleted ' + n, 'Undo', async () => { await dbPutMany(copies); contacts = contacts.concat(copies); renderAll(); });
  }

  function renderEventPill() {
    $('#eventPillName').textContent = currentEvent || 'No event set';
    $('#eventPill').classList.toggle('is-empty', !currentEvent);
  }

  function renderSettings() {
    $('#myUrlInput').value = settings.myUrl || '';
    $('#myLinkInput').value = settings.myLink || '';
    $('#defaultFollowInput').value = String(settings.defaultFollow);
    $('#reminderTimeField').hidden = !isNative;
    $('#reminderTimeInput').value = settings.reminderTime || '09:00';
    $('#templatesEditor').innerHTML = settings.templates.map((t) =>
      '<div class="template-item" data-tid="' + esc(t.id) + '">' +
        '<input class="input input-sm tpl-name" value="' + esc(t.name) + '" aria-label="Template name" />' +
        '<textarea class="input tpl-body" rows="4" aria-label="Template text">' + esc(t.body) + '</textarea>' +
        '<button class="btn btn-ghost btn-sm tpl-del" type="button">Remove</button>' +
      '</div>').join('');
  }

  function renderAll() {
    renderDue();
    renderList();
    renderEventPill();
    scheduleNativeReminders();
  }

  function showView(v) {
    currentView = v;
    ['due', 'all', 'settings'].forEach((k) => { $('#view-' + k).hidden = k !== v; });
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === v));
    if (v !== 'all' && selecting) setSelecting(false);
    $('#addBtn').hidden = v === 'settings';
    if (v === 'settings') renderSettings();
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- toast
  let toastTimer;
  function toast(msg, actionLabel, action) {
    const el = $('#toast');
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (actionLabel ? '<button type="button">' + esc(actionLabel) + '</button>' : '');
    el.hidden = false;
    if (actionLabel) $('button', el).onclick = () => { el.hidden = true; action(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, actionLabel ? 6000 : 3000);
  }

  // ---------------------------------------------------------------- sheet
  let sheetOpen = false;
  function openSheet(title, html) {
    $('#sheetTitle').textContent = title;
    $('#sheetBody').innerHTML = html;
    $('#sheetBody').scrollTop = 0;
    if (!sheetOpen) {
      sheetOpen = true;
      $('#sheet').hidden = false;
      $('#sheetBackdrop').hidden = false;
      document.body.style.overflow = 'hidden';
      document.body.classList.add('sheet-open');
      pushNav('sheet');
    }
    // Reset after it is visible: a hidden element ignores scrollTop.
    $('#sheetBody').scrollTop = 0;
    return $('#sheetBody');
  }
  function hideSheet() {
    sheetOpen = false;
    $('#sheet').hidden = true;
    $('#sheetBackdrop').hidden = true;
    $('#sheetBody').innerHTML = '';
    document.body.style.overflow = '';
    document.body.classList.remove('sheet-open');
  }
  function closeSheet() {
    if (!sheetOpen) return;
    hideSheet();
    popNav('sheet');
  }

  // Android back button: each open layer (select mode, popup, scanner) adds a history
  // entry, so "back" closes the top layer instead of leaving the app.
  const navStack = [];
  let skipPop = 0, pendingBack = 0;
  function pushNav(kind) { navStack.push(kind); history.pushState({ nav: navStack.length }, ''); }
  function popNav(kind) {
    const i = navStack.lastIndexOf(kind); if (i < 0) return;
    pendingBack += navStack.length - i;
    navStack.length = i;
    clearTimeout(popNav.t);
    popNav.t = setTimeout(() => { const n = pendingBack; pendingBack = 0; if (n) { skipPop++; history.go(-n); } }, 0);
  }
  window.addEventListener('popstate', () => {
    if (skipPop) { skipPop--; return; }
    const kind = navStack.pop();
    if (kind === 'scan') stopScan();
    else if (kind === 'sheet') hideSheet();
    else if (kind === 'select') setSelecting(false, null, true);
  });

  // ---------------------------------------------------------------- contact form
  function followChips(selected) {
    const opts = [[1, 'Tomorrow'], [2, '2 days'], [3, '3 days'], [7, '1 week'], [14, '2 weeks'], [0, 'None']];
    return opts.map(([n, l]) => {
      const val = n ? addDays(n) : '';
      return '<button type="button" class="chip' + (val === selected ? ' is-on' : '') + '" data-follow="' + val + '">' + l + '</button>';
    }).join('');
  }

  function openForm(existing, prefill) {
    const isNew = !existing;
    const c = existing ? Object.assign({}, existing) : Object.assign({
      id: uid(), createdAt: new Date().toISOString(), name: '', url: '', slug: '', company: '', role: '',
      email: '', phone: '', event: currentEvent, tags: [], note: '', status: 'new', photo: '',
      followUp: settings.defaultFollow ? addDays(settings.defaultFollow) : '', source: 'manual', log: []
    }, prefill || {});

    const tagSet = new Set(c.tags || []);
    const tagChips = () => knownTags().concat(Array.from(tagSet).filter((t) => !knownTags().includes(t)))
      .map((t) => '<button type="button" class="chip' + (tagSet.has(t) ? ' is-on' : '') + '" data-tag="' + esc(t) + '">' + esc(t) + '</button>').join('');

    const body = openSheet(isNew ? 'Met someone' : 'Edit contact',
      (isNew ? '<button type="button" class="scan-btn" id="fScan">Scan their QR code</button>' : '') +
      '<p class="scan-result" id="fScanResult" hidden></p>' +
      '<form id="contactForm" autocomplete="off">' +
        '<div class="photo-row">' +
          '<span class="avatar avatar-lg" id="fAvatar">' + (c.photo ? '<img src="' + esc(c.photo) + '" alt="" />' : esc(initials(c.name))) + '</span>' +
          '<div class="btn-row">' +
            '<label class="btn btn-ghost btn-sm btn-file">' + (c.photo ? 'Retake photo' : 'Add photo') +
              '<input type="file" id="fPhoto" accept="image/*" capture="environment" hidden /></label>' +
            (c.photo ? '<button type="button" class="btn btn-ghost btn-sm" id="fPhotoDel">Remove</button>' : '') +
          '</div>' +
        '</div>' +
        '<label class="field"><span class="field-label">Name</span><input class="input" id="fName" value="' + esc(c.name) + '" autocapitalize="words" /></label>' +
        '<div class="field-row">' +
          '<label class="field"><span class="field-label">Company</span><input class="input" id="fCompany" value="' + esc(c.company) + '" /></label>' +
          '<label class="field"><span class="field-label">Role</span><input class="input" id="fRole" value="' + esc(c.role) + '" /></label>' +
        '</div>' +
        '<label class="field"><span class="field-label">Note: what did you promise, how will you remember them?</span>' +
          '<textarea class="input" id="fNote" rows="3" placeholder="e.g. Runs Friday nights at Fabric, wants a vinyl set in March. Red jacket.">' + esc(c.note) + '</textarea>' +
          '<span class="field-hint">Tip: tap the mic on your keyboard to dictate.</span></label>' +
        '<div class="field"><span class="field-label">Follow up</span>' +
          '<div class="chips" id="fFollowChips">' + followChips(c.followUp) + '</div>' +
          '<input type="date" class="input" id="fFollow" value="' + esc(c.followUp) + '" style="margin-top:8px" aria-label="Follow-up date" /></div>' +
        '<div class="field"><span class="field-label">Tags</span><div class="chips" id="fTags">' + tagChips() + '</div>' +
          '<input class="input input-sm" id="fTagNew" placeholder="Add a tag and press Enter" style="margin-top:8px" /></div>' +
        '<label class="field"><span class="field-label">Event</span><input class="input" id="fEvent" list="eventsList" value="' + esc(c.event) + '" />' +
          '<datalist id="eventsList">' + knownEvents().map((e) => '<option value="' + esc(e) + '"></option>').join('') + '</datalist></label>' +
        '<details class="field"' + (c.email || c.phone || (!isNew && c.url) ? ' open' : '') + '><summary class="field-label">LinkedIn URL, email, phone</summary>' +
          '<label class="field" style="margin-top:8px"><span class="field-label">LinkedIn / web link</span><input class="input" id="fUrl" type="url" inputmode="url" value="' + esc(c.url) + '" placeholder="https://www.linkedin.com/in/…" /></label>' +
          '<div class="field-row">' +
            '<label class="field"><span class="field-label">Email</span><input class="input" id="fEmail" type="email" inputmode="email" value="' + esc(c.email) + '" /></label>' +
            '<label class="field"><span class="field-label">Phone</span><input class="input" id="fPhone" type="tel" inputmode="tel" value="' + esc(c.phone) + '" /></label>' +
          '</div>' +
        '</details>' +
        '<div class="sheet-actions">' +
          '<button type="button" class="btn btn-ghost" id="fCancel">Cancel</button>' +
          '<button type="submit" class="btn">Save</button>' +
        '</div>' +
      '</form>');

    let photo = c.photo;

    function applyScan(text) {
      const res = $('#fScanResult', body);
      const li = parseLinkedIn(text);
      const card = !li && parseCard(text);
      if (li) {
        const dup = bySlug(li.slug);
        if (dup && dup.id !== c.id) {
          res.hidden = false;
          res.innerHTML = 'You already saved ' + esc(dup.name || li.slug) + '. <button type="button" class="btn btn-ghost btn-sm" id="fOpenDup">Open them</button>';
          $('#fOpenDup', body).onclick = () => openDetail(dup.id);
          return;
        }
        c.slug = li.slug; c.source = 'scan';
        $('#fUrl', body).value = li.url;
        if (!$('#fName', body).value) { $('#fName', body).value = nameFromSlug(li.slug); c.nameGuessed = true; }
        res.hidden = false; res.textContent = 'LinkedIn profile captured: ' + li.slug + '. Check the name below.';
      } else if (card) {
        if (card.name) $('#fName', body).value = card.name;
        if (card.company) $('#fCompany', body).value = card.company;
        if (card.role) $('#fRole', body).value = card.role;
        if (card.email) $('#fEmail', body).value = card.email;
        if (card.phone) $('#fPhone', body).value = card.phone;
        if (card.url) { $('#fUrl', body).value = card.url; const l2 = parseLinkedIn(card.url); if (l2) c.slug = l2.slug; }
        c.source = 'scan';
        $('details', body).open = true;
        res.hidden = false; res.textContent = 'Contact card captured.';
      } else {
        $('#fUrl', body).value = text;
        $('details', body).open = true;
        res.hidden = false; res.textContent = 'Scanned: ' + text;
      }
      $('#fNote', body).focus();
    }

    if (isNew) $('#fScan', body).onclick = () => startScan(applyScan);
    if (prefill && prefill._scanText) applyScan(prefill._scanText);

    $('#fFollowChips', body).addEventListener('click', (e) => {
      const b = e.target.closest('[data-follow]'); if (!b) return;
      $('#fFollow', body).value = b.dataset.follow;
      $$('[data-follow]', body).forEach((x) => x.classList.toggle('is-on', x === b));
    });
    $('#fFollow', body).addEventListener('change', (e) => {
      $$('[data-follow]', body).forEach((x) => x.classList.toggle('is-on', x.dataset.follow === e.target.value));
    });
    $('#fTags', body).addEventListener('click', (e) => {
      const b = e.target.closest('[data-tag]'); if (!b) return;
      const t = b.dataset.tag;
      if (tagSet.has(t)) tagSet.delete(t); else tagSet.add(t);
      b.classList.toggle('is-on', tagSet.has(t));
    });
    $('#fTagNew', body).addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const t = e.target.value.trim(); if (!t) return;
      tagSet.add(t); e.target.value = '';
      $('#fTags', body).innerHTML = tagChips();
    });
    $('#fPhoto', body).addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { photo = await resizeImage(f, 480); $('#fAvatar', body).innerHTML = '<img src="' + esc(photo) + '" alt="" />'; }
      catch (err) { toast('Could not read that photo'); }
    });
    const del = $('#fPhotoDel', body);
    if (del) del.onclick = () => { photo = ''; $('#fAvatar', body).textContent = initials($('#fName', body).value); };
    $('#fCancel', body).onclick = closeSheet;

    $('#contactForm', body).addEventListener('submit', async (e) => {
      e.preventDefault();
      const pending = $('#fTagNew', body).value.trim(); if (pending) tagSet.add(pending);
      const name = $('#fName', body).value.trim();
      if (name !== c.name) c.nameGuessed = c.nameGuessed && name === nameFromSlug(c.slug || '');
      c.name = name;
      c.company = $('#fCompany', body).value.trim();
      c.role = $('#fRole', body).value.trim();
      c.note = $('#fNote', body).value.trim();
      c.followUp = $('#fFollow', body).value;
      c.tags = Array.from(tagSet);
      c.event = $('#fEvent', body).value.trim();
      c.url = $('#fUrl', body).value.trim();
      c.email = $('#fEmail', body).value.trim();
      c.phone = $('#fPhone', body).value.trim();
      c.photo = photo;
      const li = parseLinkedIn(c.url);
      c.slug = li ? li.slug : '';
      if (!c.name && !c.url && !c.note && !c.photo) { toast('Add at least a name, note, photo or scan'); return; }
      if (isNew && c.slug) {
        const dup = bySlug(c.slug);
        if (dup) { toast('Already saved as ' + (dup.name || c.slug), 'Open', () => openDetail(dup.id)); return; }
      }
      await save(c, isNew ? 'Added' + (c.event ? ' at ' + c.event : '') : 'Edited');
      closeSheet();
      toast(isNew ? 'Saved ' + (c.name || 'contact') : 'Updated');
    });
  }

  function resizeImage(file, max) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        resolve(cv.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }

  // ---------------------------------------------------------------- detail
  function openDetail(id) {
    const c = byId(id); if (!c) return;
    const due = dueInfo(c);
    const sub = [c.role, c.company].filter(Boolean).join(' at ');
    const met = new Date(c.createdAt);
    const metText = c.source === 'linkedin'
      ? 'Connected on LinkedIn ' + fmtDay(c.createdAt)
      : 'Met ' + fmtDay(c.createdAt) + ', ' + fmtTime(met) + (c.event ? ' · ' + c.event : '');

    const body = openSheet(c.name || 'Contact',
      '<div class="detail-head">' +
        '<span class="avatar avatar-lg">' + (c.photo ? '<img src="' + esc(c.photo) + '" alt="" />' : esc(initials(c.name))) + '</span>' +
        '<div><p class="detail-name">' + esc(c.name || 'Unnamed') + '</p>' +
          (sub ? '<p class="detail-sub">' + esc(sub) + '</p>' : '') +
          '<p class="muted small" style="margin:4px 0 0">' + esc(metText) + '</p></div>' +
      '</div>' +
      '<div class="contact-meta">' +
        (c.event ? '<span class="tag tag-event">' + esc(c.event) + '</span>' : '') +
        (c.tags || []).map((t) => '<span class="tag">' + esc(t) + '</span>').join('') +
      '</div>' +
      (c.nameGuessed ? '<p class="small" style="color:var(--warn)">Name was guessed from their LinkedIn link. Tap Edit to fix it, or import your LinkedIn connections (Settings).</p>' : '') +

      '<div class="quick-actions">' +
        '<button class="btn btn-primary-wide" id="dMsg" type="button">Write follow-up message</button>' +
        (c.url ? '<a class="btn btn-ghost" href="' + esc(c.url) + '" target="_blank" rel="noopener">Open LinkedIn</a>' : '') +
        '<button class="btn btn-ghost" id="dCal" type="button">Add to calendar</button>' +
        (c.phone ? '<a class="btn btn-ghost" href="tel:' + esc(c.phone) + '">Call</a>' : '') +
        (c.email ? '<a class="btn btn-ghost" href="mailto:' + esc(c.email) + '">Email</a>' : '') +
      '</div>' +

      '<div class="detail-section"><div class="detail-label">Status</div><div class="chips" id="dStatus">' +
        Object.keys(STATUS).map((k) => '<button type="button" class="chip' + (c.status === k ? ' is-on' : '') + '" data-status="' + k + '">' + STATUS[k] + '</button>').join('') +
      '</div></div>' +

      '<div class="detail-section"><div class="detail-label">Follow up</div>' +
        '<p style="margin:0 0 8px">' + (c.followUp ? '<span class="due-badge ' + (due ? due.cls : '') + '" style="font-size:1rem">' + esc(fmtDay(c.followUp)) + (due ? ' · ' + esc(due.text) : '') + '</span>' : '<span class="muted">No date set</span>') + '</p>' +
        '<div class="chips" id="dSnooze">' +
          '<button type="button" class="chip" data-snooze="1">Tomorrow</button>' +
          '<button type="button" class="chip" data-snooze="3">+3 days</button>' +
          '<button type="button" class="chip" data-snooze="7">+1 week</button>' +
          '<button type="button" class="chip" data-snooze="30">+1 month</button>' +
          (c.followUp ? '<button type="button" class="chip" data-snooze="0">Clear</button>' : '') +
        '</div></div>' +

      (c.note ? '<div class="detail-section"><div class="detail-label">Note</div><div class="detail-note">' + esc(c.note) + '</div></div>' : '') +

      ((c.log || []).length ? '<div class="detail-section"><div class="detail-label">History</div><ul class="log">' +
        c.log.slice().reverse().map((l) => '<li><time>' + esc(fmtDay(l.at)) + ' ' + esc(fmtTime(l.at)) + '</time>' + esc(l.text) + '</li>').join('') +
      '</ul></div>' : '') +

      '<div class="sheet-actions">' +
        '<button class="btn btn-danger" id="dDel" type="button">Delete</button>' +
        '<button class="btn btn-ghost" id="dEdit" type="button">Edit</button>' +
      '</div>');

    $('#dMsg', body).onclick = () => openMessage(c.id);
    $('#dEdit', body).onclick = () => openForm(c);
    $('#dCal', body).onclick = () => openExternal(calendarUrl(c));
    $('#dStatus', body).addEventListener('click', async (e) => {
      const b = e.target.closest('[data-status]'); if (!b || b.dataset.status === c.status) return;
      c.status = b.dataset.status;
      await save(c, 'Status: ' + STATUS[c.status]);
      openDetail(c.id);
    });
    $('#dSnooze', body).addEventListener('click', async (e) => {
      const b = e.target.closest('[data-snooze]'); if (!b) return;
      const n = Number(b.dataset.snooze);
      c.followUp = n ? addDays(n) : '';
      await save(c, n ? 'Follow-up set for ' + fmtDay(c.followUp) : 'Follow-up cleared');
      openDetail(c.id);
    });
    $('#dDel', body).onclick = async () => {
      if (!confirm('Delete ' + (c.name || 'this contact') + '?')) return;
      const copy = Object.assign({}, c);
      await dbDel(c.id);
      contacts = contacts.filter((x) => x.id !== c.id);
      renderAll(); closeSheet();
      toast('Deleted', 'Undo', () => save(copy));
    };
  }

  function calendarUrl(c) {
    const day = c.followUp || addDays(1);
    const start = day.replace(/-/g, ''), end = addDays(1, day).replace(/-/g, '');
    const details = [
      c.note,
      [c.role, c.company].filter(Boolean).join(' at '),
      c.event ? 'Met at ' + c.event : '',
      c.url, c.email, c.phone
    ].filter(Boolean).join('\n');
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + encodeURIComponent('Follow up: ' + (c.name || 'contact')) +
      '&dates=' + start + '/' + end +
      '&details=' + encodeURIComponent(details);
  }

  // ---------------------------------------------------------------- message
  function fillTemplate(body, c) {
    return body
      .replace(/\{first\}/g, firstName(c.name))
      .replace(/\{name\}/g, c.name || '')
      .replace(/\{event\}/g, c.event || 'the show')
      .replace(/\{company\}/g, c.company || 'your company')
      .replace(/\{mylink\}/g, settings.myLink || '');
  }

  function openMessage(id) {
    const c = byId(id); if (!c) return;
    const tpls = settings.templates;
    const pick = c.status === 'messaged' && tpls.find((t) => /chase/i.test(t.name)) || tpls[0];
    const body = openSheet('Message ' + firstName(c.name),
      '<div class="chips" id="mTpls" style="margin-bottom:10px">' +
        tpls.map((t) => '<button type="button" class="chip' + (t === pick ? ' is-on' : '') + '" data-tid="' + esc(t.id) + '">' + esc(t.name) + '</button>').join('') +
      '</div>' +
      '<textarea class="input" id="mText" rows="7">' + esc(pick ? fillTemplate(pick.body, c) : '') + '</textarea>' +
      '<p class="muted small">' + (c.url
        ? 'Tap below: the message is copied and their LinkedIn opens. Tap <b>Message</b> on their profile, then long-press and paste.'
        : 'No LinkedIn link saved. Copy the message, or share it via WhatsApp, SMS or email.') + '</p>' +
      '<div class="btn-row" style="margin-top:6px">' +
        (c.url ? '<button class="btn btn-block" id="mGo" type="button">Copy &amp; open LinkedIn</button>' : '') +
        '<button class="btn btn-ghost" id="mCopy" type="button">Copy only</button>' +
        (canShare() ? '<button class="btn btn-ghost" id="mShare" type="button">Share…</button>' : '') +
      '</div>' +
      '<div class="sheet-actions"><button class="btn btn-ghost" id="mBack" type="button">Back</button></div>');

    $('#mTpls', body).addEventListener('click', (e) => {
      const b = e.target.closest('[data-tid]'); if (!b) return;
      const t = tpls.find((x) => x.id === b.dataset.tid);
      $('#mText', body).value = fillTemplate(t.body, c);
      $$('[data-tid]', body).forEach((x) => x.classList.toggle('is-on', x === b));
    });
    const text = () => $('#mText', body).value;

    async function markSent(how) {
      const wasNew = c.status === 'new';
      if (wasNew) c.status = 'messaged';
      if (!c.followUp || c.followUp <= today()) c.followUp = addDays(7);
      await save(c, 'Messaged (' + how + ')');
      toast((wasNew ? 'Marked as messaged. ' : '') + 'Chase-up set for ' + fmtDay(c.followUp), 'Change', () => openDetail(c.id));
    }

    const go = $('#mGo', body);
    if (go) go.onclick = async () => {
      await copyText(text());
      openExternal(c.url);
      await markSent('LinkedIn');
      openDetail(c.id);
    };
    $('#mCopy', body).onclick = async () => { await copyText(text()); toast('Copied'); };
    const sh = $('#mShare', body);
    if (sh) sh.onclick = async () => {
      try { await shareText(text()); await markSent('shared'); openDetail(c.id); } catch (e) { /* cancelled */ }
    };
    $('#mBack', body).onclick = () => openDetail(c.id);
  }

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e2) { /* ignore */ }
      ta.remove(); return false;
    }
  }

  // ---------------------------------------------------------------- scanner
  let scanning = false, stream = null, detector = null, scanCb = null, rafId = 0;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function startScan(cb) {
    scanCb = cb;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Camera not available. Paste their LinkedIn link instead.'); return;
    }
    try {
      if ('BarcodeDetector' in window) {
        const formats = await window.BarcodeDetector.getSupportedFormats();
        if (formats.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      }
      if (!detector && !window.jsQR) await loadScript('vendor/jsQR.js');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch (e) {
      toast(e && e.name === 'NotAllowedError' ? 'Camera permission denied. Allow it in browser settings.' : 'Could not start the camera.');
      return;
    }
    const video = $('#scanVideo');
    video.srcObject = stream;
    await video.play().catch(() => {});
    scanning = true;
    $('#scanner').hidden = false;
    pushNav('scan');
    $('#scanHint').textContent = 'Point at their LinkedIn QR code';
    tick();
  }

  async function tick() {
    if (!scanning) return;
    const video = $('#scanVideo');
    let value = null;
    if (video.readyState >= 2) {
      try {
        if (detector) {
          const codes = await detector.detect(video);
          if (codes.length) value = codes[0].rawValue;
        } else if (window.jsQR) {
          const cv = $('#scanCanvas');
          const w = 640, h = Math.round(640 * video.videoHeight / video.videoWidth) || 480;
          cv.width = w; cv.height = h;
          const ctx = cv.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(video, 0, 0, w, h);
          const r = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
          if (r) value = r.data;
        }
      } catch (e) { /* frame not ready */ }
    }
    if (value) {
      if (navigator.vibrate) navigator.vibrate(60);
      const cb = scanCb;
      endScan();
      if (cb) cb(value);
      return;
    }
    rafId = setTimeout(() => requestAnimationFrame(tick), 120);
  }

  function endScan() {
    stopScan();
    popNav('scan');
  }

  function stopScan() {
    scanning = false;
    clearTimeout(rafId);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    $('#scanVideo').srcObject = null;
    $('#scanner').hidden = true;
  }

  // ---------------------------------------------------------------- event picker
  function openEventPicker() {
    const evs = knownEvents();
    const body = openSheet('Where are you?',
      '<p class="muted small" style="margin-top:0">Everyone you add is tagged with this event until you change it.</p>' +
      '<label class="field"><span class="field-label">Event / show name</span>' +
        '<input class="input" id="eName" value="' + esc(currentEvent) + '" placeholder="e.g. ADE 2026, Fabric Fri" autocapitalize="words" /></label>' +
      (evs.length ? '<div class="field"><span class="field-label">Recent</span><div class="chips" id="eRecent">' +
        evs.slice(0, 12).map((e) => '<button type="button" class="chip" data-ev="' + esc(e) + '">' + esc(e) + '</button>').join('') + '</div></div>' : '') +
      '<div class="sheet-actions">' +
        '<button class="btn btn-ghost" id="eClear" type="button">Not at an event</button>' +
        '<button class="btn" id="eSet" type="button">Set event</button>' +
      '</div>');
    const setEv = async (v) => {
      currentEvent = v.trim();
      await kvSet('currentEvent', currentEvent);
      renderEventPill(); closeSheet();
      if (currentEvent) toast('New contacts will be tagged "' + currentEvent + '"');
    };
    const rec = $('#eRecent', body);
    if (rec) rec.addEventListener('click', (e) => { const b = e.target.closest('[data-ev]'); if (b) setEv(b.dataset.ev); });
    $('#eSet', body).onclick = () => setEv($('#eName', body).value);
    $('#eClear', body).onclick = () => setEv('');
    $('#eName', body).addEventListener('keydown', (e) => { if (e.key === 'Enter') setEv(e.target.value); });
  }

  // ---------------------------------------------------------------- my QR
  function openMyQr() {
    if (!settings.myUrl) {
      const body = openSheet('Your QR code',
        '<p>Add your LinkedIn profile link once, and this screen shows a QR code people can scan to find you.</p>' +
        '<p class="muted small">In the LinkedIn app: tap your photo, then View profile, then ••• , then Share profile, then Copy link.</p>' +
        '<label class="field"><span class="field-label">Your LinkedIn URL</span><input class="input" id="qUrl" type="url" inputmode="url" placeholder="https://www.linkedin.com/in/your-name" /></label>' +
        '<div class="sheet-actions"><button class="btn" id="qSave" type="button">Save</button></div>');
      $('#qSave', body).onclick = async () => {
        const v = $('#qUrl', body).value.trim(); if (!v) return;
        const li = parseLinkedIn(v);
        settings.myUrl = li ? li.url : v; await saveSettings(); openMyQr();
      };
      return;
    }
    let svg = '';
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(settings.myUrl); qr.make();
      svg = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
    } catch (e) { svg = '<p style="color:#000">Could not draw QR code.</p>'; }
    openSheet('Scan to connect',
      '<div class="myqr">' + svg + '</div>' +
      '<p class="muted small" style="text-align:center;word-break:break-all">' + esc(settings.myUrl) + '</p>' +
      '<p class="small" style="text-align:center">They scan this with their phone camera and your LinkedIn opens. Then tap <b>Met someone</b> to log them while you\'re still talking.</p>');
    if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
  }

  // ---------------------------------------------------------------- CSV import
  function parseCsv(text) {
    const rows = []; let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += ch;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  function parseConnectedOn(s) {
    const m = String(s || '').trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})$/);
    if (m && m[2].toLowerCase() in MONTHS) return new Date(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]), 12);
    const d = new Date(s); return isNaN(d) ? null : d;
  }

  async function importLinkedInCsv(file) {
    const rows = parseCsv(await file.text());
    const hi = rows.findIndex((r) => r[0] && r[0].trim().replace(/^﻿/, '') === 'First Name');
    if (hi < 0) { toast('That doesn\'t look like LinkedIn\'s Connections.csv'); return; }
    const head = rows[hi].map((h) => h.trim().replace(/^﻿/, ''));
    const col = (name) => head.indexOf(name);
    const iF = col('First Name'), iL = col('Last Name'), iU = col('URL'), iE = col('Email Address'),
      iC = col('Company'), iP = col('Position'), iD = col('Connected On');
    const people = rows.slice(hi + 1).filter((r) => r.length > 2 && (r[iF] || r[iU])).map((r) => ({
      name: [r[iF], r[iL]].filter(Boolean).join(' ').trim(),
      li: parseLinkedIn(r[iU] || ''),
      email: iE >= 0 ? (r[iE] || '').trim() : '',
      company: iC >= 0 ? (r[iC] || '').trim() : '',
      role: iP >= 0 ? (r[iP] || '').trim() : '',
      connected: iD >= 0 ? parseConnectedOn(r[iD]) : null
    }));

    const body = openSheet('Import ' + people.length + ' connections',
      '<p>Contacts you scanned are matched by their LinkedIn link and get their name, company and job title filled in.</p>' +
      '<p>Also add connections you <b>didn\'t</b> scan, from:</p>' +
      '<div class="btn-row" id="iRange" style="flex-direction:column">' +
        '<button class="btn" type="button" data-days="7">Last 7 days</button>' +
        '<button class="btn btn-ghost" type="button" data-days="30">Last 30 days</button>' +
        '<button class="btn btn-ghost" type="button" data-days="365">Last 12 months</button>' +
        '<button class="btn btn-ghost" type="button" data-days="-1">All of them</button>' +
        '<button class="btn btn-ghost" type="button" data-days="0">None, only update the ones I scanned</button>' +
      '</div>');

    $('#iRange', body).addEventListener('click', async (e) => {
      const b = e.target.closest('[data-days]'); if (!b) return;
      const days = Number(b.dataset.days);
      const cutoff = days > 0 ? new Date(Date.now() - days * 86400000) : null;
      let updated = 0, added = 0;
      const changed = [];
      const now = new Date().toISOString();
      people.forEach((p) => {
        const ex = p.li && bySlug(p.li.slug);
        if (ex) {
          let ch = false;
          if (p.name && (!ex.name || ex.nameGuessed)) { ex.name = p.name; ex.nameGuessed = false; ch = true; }
          if (p.company && !ex.company) { ex.company = p.company; ch = true; }
          if (p.role && !ex.role) { ex.role = p.role; ch = true; }
          if (p.email && !ex.email) { ex.email = p.email; ch = true; }
          if (ch) { ex.updatedAt = now; (ex.log = ex.log || []).push({ at: now, text: 'Details filled in from LinkedIn' }); changed.push(ex); updated++; }
          return;
        }
        if (days === 0 || !p.connected) return;
        if (cutoff && p.connected < cutoff) return;
        const c = {
          id: uid(), createdAt: p.connected.toISOString(), updatedAt: now,
          name: p.name, url: p.li ? p.li.url : '', slug: p.li ? p.li.slug : '',
          company: p.company, role: p.role, email: p.email, phone: '', event: '', tags: [], note: '',
          status: 'new', photo: '', followUp: '', source: 'linkedin',
          log: [{ at: now, text: 'Imported from LinkedIn' }]
        };
        changed.push(c); contacts.push(c); added++;
      });
      await dbPutMany(changed);
      renderAll(); closeSheet();
      toast('Updated ' + updated + ', added ' + added);
    });
  }

  // ---------------------------------------------------------------- backup
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function exportBackup() {
    const data = { app: 'followup', version: 1, exportedAt: new Date().toISOString(), settings, currentEvent, contacts };
    const name = 'followup-backup-' + today() + '.json';
    const json = JSON.stringify(data);
    if (isNative) {
      try {
        const res = await Native.FS.writeFile({ path: name, data: json, directory: 'CACHE', encoding: 'utf8' });
        await Native.Share.share({ title: 'Follow-Up backup', files: [res.uri], dialogTitle: 'Save backup to…' });
        await kvSet('lastBackup', data.exportedAt);
      } catch (e) { if (!/cancel/i.test(String(e && e.message))) toast('Backup failed: ' + (e && e.message || e)); }
      return;
    }
    const file = typeof File === 'function' ? new File([json], name, { type: 'application/json' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Follow-Up backup' }); await kvSet('lastBackup', data.exportedAt); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    download(name, json, 'application/json');
    await kvSet('lastBackup', data.exportedAt);
  }
  async function restoreBackup(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { toast('Not a valid backup file'); return; }
    if (!data || data.app !== 'followup' || !Array.isArray(data.contacts)) { toast('Not a Follow-Up backup'); return; }
    if (!confirm('Restore ' + data.contacts.length + ' contacts? Contacts with the same ID will be overwritten; others are kept.')) return;
    await dbPutMany(data.contacts);
    if (data.settings) { settings = Object.assign({}, DEFAULT_SETTINGS, data.settings); await saveSettings(); }
    contacts = await dbAll();
    renderAll(); renderSettings();
    toast('Restored ' + data.contacts.length + ' contacts');
  }

  // ---------------------------------------------------------------- notifications
  // Android app: one exact local notification per contact on its follow-up date.
  let schedTimer;
  function scheduleNativeReminders() {
    if (!Native.LN) return;
    clearTimeout(schedTimer);
    schedTimer = setTimeout(async () => {
      try {
        const perm = await Native.LN.checkPermissions();
        if (perm.display !== 'granted') return;
        const pending = await Native.LN.getPending();
        if (pending.notifications.length) await Native.LN.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
        const [hh, mm] = (settings.reminderTime || '09:00').split(':').map(Number);
        const now = Date.now();
        const list = contacts.filter((c) => c.followUp && c.status !== 'done').map((c) => {
          const at = parseYmd(c.followUp); at.setHours(hh, mm, 0, 0);
          return { c: c, at: at };
        }).filter((x) => x.at.getTime() > now).sort((a, b) => a.at - b.at).slice(0, 60);
        if (!list.length) return;
        await Native.LN.schedule({ notifications: list.map((x) => ({
          id: hashId(x.c.id),
          title: 'Follow up with ' + (x.c.name || 'someone'),
          body: x.c.note || (x.c.event ? 'Met at ' + x.c.event : 'Tap to write a message'),
          schedule: { at: x.at, allowWhileIdle: true },
          extra: { cid: x.c.id }
        })) });
      } catch (e) { /* reminders are best-effort */ }
    }, 400);
  }

  async function setupReminders() {
    if (Native.LN) {
      const perm = await Native.LN.requestPermissions();
      updateNotifyBanner();
      if (perm.display !== 'granted') { toast('Notifications are off. Turn them on in Android Settings → Apps → Follow-Up.'); return; }
      scheduleNativeReminders();
      toast('Reminders on: you\'ll get a notification at ' + (settings.reminderTime || '09:00') + ' on each follow-up date.');
      return;
    }
    if (!('Notification' in window)) { toast('Notifications aren\'t supported here. Use "Add to calendar" on a contact.'); return; }
    const perm = await Notification.requestPermission();
    updateNotifyBanner();
    if (perm !== 'granted') { toast('Notifications blocked. You can allow them in site settings.'); return; }
    const ok = await registerPeriodicSync();
    toast(ok ? 'Reminders on. You\'ll get a daily nudge when follow-ups are due.'
             : 'Notifications on. For background reminders, install the app (menu, then Add to Home screen).');
  }
  async function registerPeriodicSync() {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (!('periodicSync' in reg)) return false;
      const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (st.state !== 'granted') return false;
      await reg.periodicSync.register('followups-due', { minInterval: 12 * 60 * 60 * 1000 });
      return true;
    } catch (e) { return false; }
  }
  async function updateNotifyBanner() {
    if (Native.LN) {
      let granted = false;
      try { granted = (await Native.LN.checkPermissions()).display === 'granted'; } catch (e) { /* ignore */ }
      $('#notifyBanner').hidden = granted || !contacts.length;
      return;
    }
    $('#notifyBanner').hidden = !('Notification' in window) || Notification.permission !== 'default' || !contacts.length;
  }

  let persistAsked = false;
  async function requestPersist() {
    if (persistAsked || !navigator.storage || !navigator.storage.persist) return;
    persistAsked = true;
    try { await navigator.storage.persist(); } catch (e) { /* ignore */ }
    updateStorageNote();
  }
  async function updateStorageNote() {
    const el = $('#storageNote');
    const last = await kvGet('lastBackup');
    let txt = contacts.length + ' contacts on this device.';
    if (isNative) txt += ' Stored inside the app (uninstalling deletes them).';
    else if (navigator.storage && navigator.storage.persisted) {
      try { txt += (await navigator.storage.persisted()) ? ' Storage is protected from automatic clearing.' : ' Tip: install the app so Android keeps the data safe.'; } catch (e) { /* ignore */ }
    }
    txt += last ? ' Last backup: ' + fmtDay(last) + '.' : ' No backup yet.';
    el.textContent = txt;
  }

  // ---------------------------------------------------------------- wiring
  function bind() {
    $$('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
    $('#addBtn').addEventListener('click', () => openForm(null));
    $('#eventPill').addEventListener('click', openEventPicker);
    $('#myQrBtn').addEventListener('click', openMyQr);
    $('#sheetClose').addEventListener('click', closeSheet);
    $('#sheetBackdrop').addEventListener('click', closeSheet);
    $('#scanCancel').addEventListener('click', endScan);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (scanning) endScan(); else closeSheet(); } });

    const onListClick = (e) => { const b = e.target.closest('.contact'); if (b) openDetail(b.dataset.id); };
    $('#dueList').addEventListener('click', onListClick);
    let suppressClick = false;
    $('#allList').addEventListener('click', (e) => {
      const b = e.target.closest('.contact'); if (!b) return;
      if (suppressClick) { suppressClick = false; return; }
      if (selecting) toggleSelected(b.dataset.id, b); else openDetail(b.dataset.id);
    });
    // Long-press a contact on the All tab to start selecting
    let pressTimer = null, pressStart = null;
    $('#allList').addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.contact'); if (!b || selecting) return;
      pressStart = { x: e.clientX, y: e.clientY };
      pressTimer = setTimeout(() => {
        pressTimer = null; suppressClick = true;
        if (navigator.vibrate) navigator.vibrate(30);
        setSelecting(true, b.dataset.id);
      }, 500);
    });
    const cancelPress = (e) => {
      // A long-press may or may not be followed by a click (Android usually sends none),
      // so only ignore a click that arrives straight after the finger lifts.
      if (e.type === 'pointerup' && suppressClick) setTimeout(() => { suppressClick = false; }, 350);
      if (!pressTimer) return;
      if (e.type === 'pointermove' && pressStart && Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) < 10) return;
      clearTimeout(pressTimer); pressTimer = null;
    };
    ['pointerup', 'pointercancel', 'pointermove'].forEach((ev) => $('#allList').addEventListener(ev, cancelPress));
    $('#allList').addEventListener('contextmenu', (e) => { if (e.target.closest('.contact')) e.preventDefault(); });

    $('#tagFilter').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ftag]'); if (!b) return;
      const t = b.dataset.ftag;
      if (!t) tagFilter.clear();
      else if (tagFilter.has(t)) tagFilter.delete(t);
      else {
        if (t === NO_TAGS) tagFilter.clear(); else tagFilter.delete(NO_TAGS);
        tagFilter.add(t);
      }
      renderList();
    });
    $('#selectBtn').addEventListener('click', () => setSelecting(!selecting));
    $('#selectDoneBtn').addEventListener('click', () => setSelecting(false));
    $('#selectAllBtn').addEventListener('click', () => {
      const allShown = visibleIds.length && visibleIds.every((id) => selected.has(id));
      if (allShown) visibleIds.forEach((id) => selected.delete(id)); else visibleIds.forEach((id) => selected.add(id));
      renderList();
    });
    $('#selectBar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-bulk]'); if (!b || !selected.size) return;
      ({ tag: openBulkTag, follow: openBulkFollow, status: openBulkStatus, delete: bulkDelete })[b.dataset.bulk]();
    });
    $('#searchInput').addEventListener('input', renderList);
    $('#eventFilter').addEventListener('change', renderList);
    $('#statusFilter').addEventListener('change', renderList);
    $('#enableNotifyBtn').addEventListener('click', setupReminders);

    // settings
    $('#myUrlInput').addEventListener('change', async (e) => {
      const li = parseLinkedIn(e.target.value); settings.myUrl = li ? li.url : e.target.value.trim();
      e.target.value = settings.myUrl; await saveSettings();
    });
    $('#myLinkInput').addEventListener('change', async (e) => { settings.myLink = e.target.value.trim(); await saveSettings(); });
    $('#defaultFollowInput').addEventListener('change', async (e) => { settings.defaultFollow = Number(e.target.value); await saveSettings(); });
    $('#reminderTimeInput').addEventListener('change', async (e) => { settings.reminderTime = e.target.value || '09:00'; await saveSettings(); scheduleNativeReminders(); });

    // In the Android app, links to LinkedIn / phone / email open the right app.
    if (isNative) {
      document.addEventListener('click', (e) => {
        const a = e.target.closest('a[href]'); if (!a) return;
        const href = a.getAttribute('href');
        if (/^(https?:|tel:|mailto:)/i.test(href)) { e.preventDefault(); openExternal(a.href); }
      });
    }
    $('#templatesEditor').addEventListener('input', async (e) => {
      const item = e.target.closest('[data-tid]'); if (!item) return;
      const t = settings.templates.find((x) => x.id === item.dataset.tid); if (!t) return;
      t.name = $('.tpl-name', item).value; t.body = $('.tpl-body', item).value;
      await saveSettings();
    });
    $('#templatesEditor').addEventListener('click', async (e) => {
      if (!e.target.classList.contains('tpl-del')) return;
      if (settings.templates.length <= 1) { toast('Keep at least one template'); return; }
      const id = e.target.closest('[data-tid]').dataset.tid;
      settings.templates = settings.templates.filter((t) => t.id !== id);
      await saveSettings(); renderSettings();
    });
    $('#addTemplateBtn').addEventListener('click', async () => {
      settings.templates.push({ id: uid(), name: 'New template', body: 'Hi {first}, ' });
      await saveSettings(); renderSettings();
    });
    $('#csvInput').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importLinkedInCsv(f); });
    $('#exportBtn').addEventListener('click', () => exportBackup().then(updateStorageNote));
    $('#restoreInput').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) restoreBackup(f); });
    $('#wipeBtn').addEventListener('click', async () => {
      if (!contacts.length) return;
      if (!confirm('Delete all ' + contacts.length + ' contacts from this phone? Export a backup first if unsure.')) return;
      if (!confirm('Really delete everything? This cannot be undone.')) return;
      await dbClear(); contacts = []; renderAll(); updateStorageNote(); toast('All contacts deleted');
    });

    document.addEventListener('visibilitychange', () => { if (!document.hidden) renderDue(); });
  }

  async function init() {
    bind();
    try {
      const s = await kvGet('settings');
      if (s) settings = Object.assign({}, DEFAULT_SETTINGS, s);
      currentEvent = (await kvGet('currentEvent')) || '';
      contacts = (await dbAll()) || [];
    } catch (e) {
      toast('Storage unavailable. Private browsing? Contacts won\'t be saved.');
    }
    const params = new URLSearchParams(location.search);
    showView(params.get('view') === 'all' ? 'all' : 'due');
    renderAll();
    updateNotifyBanner();
    updateStorageNote();

    if (Native.LN) {
      Native.LN.addListener('localNotificationActionPerformed', (ev) => {
        const cid = ev && ev.notification && ev.notification.extra && ev.notification.extra.cid;
        if (cid) { showView('due'); openDetail(cid); }
      });
    }
    if (!isNative && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(() => {
        if ('Notification' in window && Notification.permission === 'granted') registerPeriodicSync();
      }).catch(() => {});
    }
    // Android share target / shortcut: ?add=1 opens the form straight away
    // Shared from the LinkedIn app (Share profile -> Follow-Up) also lands here.
    const shared = params.get('url') || params.get('text');
    if (params.get('add') || shared) {
      history.replaceState(null, '', location.pathname);
      openForm(null, shared ? { _scanText: shared } : null);
    }
  }

  init();
})();
