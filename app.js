/* ===== 敲石工坊 · 主逻辑 ===== */
(function () {
  'use strict';

  /* ---------- 小工具 ---------- */
  const $ = (id) => document.getElementById(id);

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fmtDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 轻量哈希（本地小应用够用）
  function hashStr(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  }

  function b64u(s) { return btoa(unescape(encodeURIComponent(s))); }
  function b64d(s) { return decodeURIComponent(escape(atob(s))); }

  /* ---------- 本地存储 ---------- */
  const VERSION = 'stoneMates.v1';
  const SESSION_KEY = 'stoneMates.session';

  function stateKey(u) { return VERSION + '.' + String(u).toLowerCase(); }

  function defaultState(u) {
    return {
      account: { username: u, salt: '', hash: '' },
      schedule: [],
      scheduleUpdatedAt: Date.now(),
      completions: {},
      completionsUpdatedAt: Date.now(),
      checkedDays: [],
      checkedUpdatedAt: Date.now(),
      strikes: 0,
      strikesUpdatedAt: Date.now(),
      credit: 0,
      buddy: null,
    };
  }

  function loadState(u) {
    try {
      const s = JSON.parse(localStorage.getItem(stateKey(u)));
      if (s && s.account && s.account.username) {
        // 清理已被删除安排留下的完成记录
        const ids = new Set((s.schedule || []).map((i) => i.id));
        for (const k in s.completions) {
          s.completions[k] = (s.completions[k] || []).filter((id) => ids.has(id));
        }
        s.schedule = (s.schedule || []).map((i) => ({ id: String(i.id), text: String(i.text || ''), time: String(i.time || '') }));
        return s;
      }
    } catch (e) { }
    const s = defaultState(u);
    return s;
  }

  function saveState() {
    if (!state) return;
    localStorage.setItem(stateKey(state.account.username), JSON.stringify(state));
  }

  function randomHex(len) {
    let s = '';
    const chars = '0123456789abcdef';
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * 16)];
    return s;
  }

  /* ---------- 全局状态 ---------- */
  let state = null;
  let authMode = 'login';
  let calOffset = 0;
  let lastToday = todayStr();

  // P2P
  let peer = null;
  let currentConn = null;
  let connOpen = false;
  let connecting = false;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let pushTimer = null;
  let peerLibFailed = false;
  let pairWaitCallback = null;

  /* ---------- 提示 / 弹窗 ---------- */
  function toast(msg, ms) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 320);
    }, ms || 2600);
    while (box.children.length > 4) box.firstChild.remove();
  }
  function openModal(title, html) {
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = html;
    $('modal').classList.remove('hidden');
  }

  function closeModal() {
    $('modal').classList.add('hidden');
    $('modalBody').innerHTML = '';
  }

  function confetti() {
    const layer = $('confettiLayer');
    const colors = ['#f59e0b', '#22c55e', '#38bdf8', '#f472b6', '#a78bfa', '#fbbf24'];
    for (let i = 0; i < 42; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = 1.2 + Math.random() * 1.4 + 's';
      c.style.animationDelay = Math.random() * 0.5 + 's';
      c.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
      layer.appendChild(c);
      setTimeout(() => c.remove(), 3300);
    }
  }

  /* ---------- 账户 ---------- */
  function setAuthMode(m) {
    authMode = m;
    $('authTabLogin').classList.toggle('active', m === 'login');
    $('authTabReg').classList.toggle('active', m === 'reg');
    $('authBtn').textContent = m === 'login' ? '登录' : '注册';
    $('authPass').placeholder = m === 'login' ? '密码' : '密码（至少 4 位）';
    $('authErr').textContent = '';
  }

  function doAuth() {
    const u = $('authUser').value.trim().toLowerCase();
    const p = $('authPass').value;
    const err = $('authErr');
    if (!/^[\w\u4e00-\u9fa5-]{2,16}$/.test(u)) { err.textContent = '用户名需为 2-16 位（字母/数字/中文/_-）'; return; }
    if (authMode === 'reg') {
      if (p.length < 4) { err.textContent = '密码至少 4 位'; return; }
      if (localStorage.getItem(stateKey(u))) { err.textContent = '用户名已存在，直接登录吧'; return; }
      const s = defaultState(u);
      s.account.salt = randomHex(8);
      s.account.hash = hashStr(s.account.salt + ':' + p);
      localStorage.setItem(stateKey(u), JSON.stringify(s));
      login(u);
    } else {
      const raw = localStorage.getItem(stateKey(u));
      if (!raw) { err.textContent = '用户不存在，先注册一个吧'; return; }
      let s;
      try { s = JSON.parse(raw); } catch (e) { err.textContent = '本地数据损坏'; return; }
      if (!s.account || s.account.hash !== hashStr(s.account.salt + ':' + p)) { err.textContent = '密码不正确'; return; }
      login(u);
    }
  }

  function login(u) {
    localStorage.setItem(SESSION_KEY, u);
    enterApp(u);
  }

  function logout() {
    destroyPeer();
    clearInterval(heartbeatTimer);
    clearTimeout(reconnectTimer);
    state = null;
    localStorage.removeItem(SESSION_KEY);
    $('appView').classList.add('hidden');
    $('authView').classList.remove('hidden');
    $('authUser').value = '';
    $('authPass').value = '';
    $('authErr').textContent = '';
  }

  /* ---------- 快照 / 合并 ---------- */
  function buildSnap() {
    return {
      v: 1,
      u: state.account.username,
      s: state.schedule,
      su: state.scheduleUpdatedAt,
      c: state.completions,
      cu: state.completionsUpdatedAt,
      d: state.checkedDays,
      du: state.checkedUpdatedAt,
      k: state.strikes,
      ku: state.strikesUpdatedAt,
    };
  }

  function mergeBuddySnapshot(d) {
    if (!d || d.v !== 1 || !d.u) { toast('同步码无效'); return false; }
    if (d.u === state.account.username) { toast('不能导入自己的同步码'); return false; }
    if (!state.buddy) state.buddy = { username: d.u };
    const b = state.buddy;
    if (b.username && b.username !== d.u) {
      b.username = d.u;
      b.schedule = b.scheduleUpdatedAt = b.completions = b.completionsUpdatedAt = undefined;
      b.checkedDays = [];
    }
    b.username = d.u;
    if (!b.scheduleUpdatedAt || d.su >= b.scheduleUpdatedAt) {
      b.schedule = (d.s || []).map((i) => ({ id: String(i.id), text: String(i.text || ''), time: String(i.time || '') }));
      b.scheduleUpdatedAt = d.su;
    }
    if (!b.completionsUpdatedAt || d.cu >= b.completionsUpdatedAt) {
      b.completions = d.c || {};
      b.completionsUpdatedAt = d.cu;
    }
    if (d.k != null && (!b.strikesUpdatedAt || d.ku >= b.strikesUpdatedAt)) {
      b.strikes = d.k;
      b.strikesUpdatedAt = d.ku;
    }
    if (Array.isArray(d.d) && d.d.length) {
      const set = new Set(b.checkedDays || []);
      d.d.forEach((x) => set.add(x));
      b.checkedDays = [...set].sort();
    }
    b.lastSeen = Date.now();
    saveState();
    return true;
  }
  /* ---------- P2P 同步 ---------- */
  const PEER_URLS = [
    'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js',
    'https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.5/peerjs.min.js',
  ];

  function loadPeerLib(cb) {
    if (window.Peer) { cb(true); return; }
    if (peerLibFailed) { cb(false); return; }
    let i = 0;
    const tryNext = () => {
      if (i >= PEER_URLS.length) { peerLibFailed = true; cb(false); return; }
      const s = document.createElement('script');
      s.src = PEER_URLS[i++];
      s.onload = () => cb(true);
      s.onerror = tryNext;
      document.head.appendChild(s);
    };
    tryNext();
  }

  function destroyPeer() {
    clearTimeout(reconnectTimer);
    try { if (currentConn) currentConn.close(); } catch (e) { }
    try { if (peer) peer.destroy(); } catch (e) { }
    currentConn = null;
    peer = null;
    connOpen = false;
    connecting = false;
  }

  function send(msg) {
    if (currentConn && currentConn.open) {
      try { currentConn.send(msg); } catch (e) { }
    }
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      if (connOpen) send({ t: 'snap', d: buildSnap() });
    }, 400);
  }

  function scheduleReconnect() {
    if (!state || !state.buddy || !state.buddy.pairCode) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      if (!state) return;
      if (connOpen || connecting) return;
      if (!state.buddy || !state.buddy.pairCode) return;
      const role = state.buddy.role === 'host' ? 'host' : 'join';
      if (role === 'host') hostPair(state.buddy.pairCode, { silent: true });
      else joinPair(state.buddy.pairCode, { silent: true });
    }, 20000);
  }

  function setupConn(conn, code, role, opts) {
    opts = opts || {};
    if (currentConn && currentConn !== conn) { try { currentConn.close(); } catch (e) { } }
    currentConn = conn;
    connOpen = false;

    conn.on('open', () => {
      connOpen = true;
      connecting = false;
      if (!state.buddy) state.buddy = { username: '' };
      state.buddy.pairCode = code;
      state.buddy.role = role;
      state.buddy.lastSeen = Date.now();
      send({ t: 'hello', u: state.account.username });
      sendSnapNow();
      saveState();
      renderAll();
      if (opts.onJoined) opts.onJoined(state.buddy.username || '好友');
    });

    conn.on('data', (msg) => handleMsg(msg));
    conn.on('close', () => {
      if (currentConn === conn) { connOpen = false; currentConn = null; connecting = false; renderPair(); scheduleReconnect(); }
    });
    conn.on('error', (err) => {
      if (err && err.type === 'peer-unavailable' && opts.onFail) opts.onFail('未找到该配对码（好友可能未在等待）');
      if (currentConn === conn) { connOpen = false; currentConn = null; connecting = false; renderPair(); scheduleReconnect(); }
    });
  }

  function handleMsg(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') {
      if (!state.buddy) state.buddy = { username: msg.u };
      else if (state.buddy.username && state.buddy.username !== msg.u) {
        state.buddy = { username: msg.u, pairCode: state.buddy.pairCode, role: state.buddy.role };
        toast('已与新的好友「' + msg.u + '」配对');
      } else {
        state.buddy.username = msg.u;
      }
      if (msg.u === state.account.username) toast('注意：你和好友使用了相同的用户名');
      state.buddy.lastSeen = Date.now();
      saveState();
      if (connOpen) send({ t: 'hello', u: state.account.username });
      sendSnapNow();
      renderAll();
    } else if (msg.t === 'snap') {
      if (mergeBuddySnapshot(msg.d)) { renderAll(); }
    } else if (msg.t === 'ping') {
      send({ t: 'pong' });
    } else if (msg.t === 'pong') {
      if (state.buddy) { state.buddy.lastSeen = Date.now(); saveState(); renderPair(); }
    }
  }

  function sendSnapNow() {
    if (connOpen) send({ t: 'snap', d: buildSnap() });
  }
  function hostPair(code, opts) {
    opts = opts || {};
    connecting = true;
    loadPeerLib((ok) => {
      if (!ok) {
        connecting = false;
        toast('P2P 实时同步不可用，可使用「同步码」手动同步');
        if (opts.onFail) opts.onFail('P2P 不可用');
        return;
      }
      destroyPeer();
      try {
        const p = new Peer('stone-mates-' + code.toLowerCase());
        peer = p;
        p.on('open', () => { connecting = false; });
        p.on('connection', (conn) => {
          setupConn(conn, code, 'host', opts);
        });
        p.on('error', (err) => {
          connecting = false;
          if (err.type === 'unavailable-id') {
            // 好友那边正在监听 → 自动转为连接
            toast('检测到好友正在等待，自动转为连接…');
            if (state.buddy) state.buddy.role = 'join';
            peer = null;
            try { p.destroy(); } catch (e) { }
            joinPair(code, opts);
          } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed') {
            scheduleReconnect();
          }
        });
      } catch (e) {
        connecting = false;
        if (opts.onFail) opts.onFail(String(e));
      }
    });
  }

  function joinPair(code, opts) {
    opts = opts || {};
    connecting = true;
    loadPeerLib((ok) => {
      if (!ok) {
        connecting = false;
        toast('P2P 实时同步不可用，可使用「同步码」手动同步');
        if (opts.onFail) opts.onFail('P2P 不可用');
        return;
      }
      destroyPeer();
      try {
        const p = new Peer();
        peer = p;
        p.on('open', () => {
          const conn = p.connect('stone-mates-' + code.toLowerCase(), { reliable: true });
          setupConn(conn, code, 'join', opts);
          setTimeout(() => {
            if (connecting && conn && !conn.open) {
              connecting = false;
              if (opts.onFail) opts.onFail('未找到该配对码（好友可能未在等待）');
            }
          }, 12000);
        });
        p.on('error', (err) => {
          connecting = false;
          if (opts.onFail && err.type === 'peer-unavailable') opts.onFail('未找到该配对码（好友可能未在等待）');
          if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed') {
            scheduleReconnect();
          }
        });
      } catch (e) {
        connecting = false;
        if (opts.onFail) opts.onFail(String(e));
      }
    });
  }

  function makeCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  /* ---------- 今日安排 ---------- */
  function renderMySchedule() {
    const t = todayStr();
    const done = new Set((state.completions[t] || []));
    const list = $('myList');
    if (!state.schedule.length) {
      list.innerHTML = '<div class="item-empty">还没有安排，先添加一项吧 📝</div>';
    } else {
      list.innerHTML = state.schedule.map((it) => `
        <div class="item ${done.has(it.id) ? 'done' : ''}">
          <button class="item-check ${done.has(it.id) ? 'on' : ''}" data-id="${it.id}">✓</button>
          <input class="item-text" value="${escapeHtml(it.text)}" data-id="${it.id}" maxlength="60">
          ${it.time ? `<span class="item-time">${escapeHtml(it.time)}</span>` : ''}
          <button class="item-edit" data-id="${it.id}" title="编辑">✏️</button>
          <button class="item-del" data-id="${it.id}" title="删除">✕</button>
        </div>`).join('');
    }
    const total = state.schedule.length;
    const cnt = state.schedule.filter((it) => done.has(it.id)).length;
    $('myBar').style.width = total ? (cnt / total * 100).toFixed(1) + '%' : '0%';
    $('myProgText').textContent = total ? cnt + '/' + total : '0/0';

    list.querySelectorAll('.item-check').forEach((b) => { b.onclick = () => toggleItem(b.dataset.id); });
    list.querySelectorAll('.item-del').forEach((b) => { b.onclick = () => removeItem(b.dataset.id); });
    list.querySelectorAll('.item-edit').forEach((b) => {
      b.onclick = () => {
        const inp = list.querySelector('.item-text[data-id="' + b.dataset.id + '"]');
        if (inp) inp.focus();
      };
    });
    list.querySelectorAll('.item-text').forEach((inp) => {
      inp.addEventListener('change', () => {
        const v = inp.value.trim();
        if (v) renameItem(inp.dataset.id, v);
        else inp.value = state.schedule.find((i) => i.id === inp.dataset.id).text;
      });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
    });

    const d = new Date();
    const weeks = ['日', '一', '二', '三', '四', '五', '六'];
    $('todayLabel').textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + weeks[d.getDay()];
  }
  function addItem() {
    const text = $('newItemText').value.trim();
    if (!text) { $('newItemText').focus(); return; }
    const time = $('newItemTime').value;
    state.schedule.push({ id: uid(), text: text, time: time || '' });
    state.scheduleUpdatedAt = Date.now();
    $('newItemText').value = '';
    $('newItemTime').value = '';
    saveState();
    schedulePush();
    renderMySchedule();
    renderCheckin();
  }

  function removeItem(id) {
    state.schedule = state.schedule.filter((i) => i.id !== id);
    state.scheduleUpdatedAt = Date.now();
    const t = todayStr();
    if (state.completions[t]) {
      state.completions[t] = state.completions[t].filter((x) => x !== id);
      state.completionsUpdatedAt = Date.now();
    }
    saveState();
    schedulePush();
    renderMySchedule();
    renderCheckin();
  }

  function renameItem(id, text) {
    const it = state.schedule.find((i) => i.id === id);
    if (!it || it.text === text) return;
    it.text = text;
    state.scheduleUpdatedAt = Date.now();
    saveState();
    schedulePush();
  }

  function toggleItem(id) {
    const t = todayStr();
    if (!state.completions[t]) state.completions[t] = [];
    const arr = state.completions[t];
    const idx = arr.indexOf(id);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(id);
    state.completionsUpdatedAt = Date.now();
    saveState();
    schedulePush();
    renderMySchedule();
    renderCheckin();
  }

  /* ---------- 好友安排 ---------- */
  function buddyOnline() {
    const b = state.buddy;
    return !!b && (Date.now() - (b.lastSeen || 0) < 90000);
  }

  function renderBuddy() {
    const b = state.buddy;
    const list = $('buddyList');
    const statusEl = $('buddyStatus');
    if (!b || !b.schedule || !b.schedule.length) {
      list.innerHTML = '<div class="item-empty">' + (b ? '好友还没有添加安排' : '配对后即可看到好友的安排') + '</div>';
      $('buddyBar').style.width = '0%';
      $('buddyProgText').textContent = '0/0';
      statusEl.textContent = b ? (buddyOnline() ? '在线' : '未同步') : '';
      return;
    }
    const t = todayStr();
    const done = new Set((b.completions && b.completions[t]) || []);
    list.innerHTML = b.schedule.map((it) => `
      <div class="item ${done.has(it.id) ? 'done' : ''}">
        <span class="item-check ${done.has(it.id) ? 'on' : ''}">✓</span>
        <span class="item-text">${escapeHtml(it.text)}</span>
        ${it.time ? `<span class="item-time">${escapeHtml(it.time)}</span>` : ''}
      </div>`).join('');
    const total = b.schedule.length;
    const cnt = b.schedule.filter((it) => done.has(it.id)).length;
    $('buddyBar').style.width = (cnt / total * 100).toFixed(1) + '%';
    $('buddyProgText').textContent = cnt + '/' + total;
    statusEl.textContent = buddyOnline()
      ? '在线'
      : (b.lastSeen ? '上次同步 ' + new Date(b.lastSeen).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '未同步');
  }

  /* ---------- 打卡 ---------- */
  function checkinState() {
    const t = todayStr();
    const done = state.checkedDays.includes(t);
    const myIds = new Set(state.schedule.map((i) => i.id));
    const myDoneSet = new Set(state.completions[t] || []);
    const myDone = state.schedule.length > 0 && [...myIds].every((id) => myDoneSet.has(id));
    const myLeft = state.schedule.filter((i) => !myDoneSet.has(i.id)).length;
    const b = state.buddy;
    const bIds = b ? new Set(b.schedule.map((i) => i.id)) : new Set();
    const bDoneSet = b ? new Set((b.completions && b.completions[t]) || []) : new Set();
    const bDone = !!b && b.schedule.length > 0 && [...bIds].every((id) => bDoneSet.has(id));
    const bLeft = b ? b.schedule.filter((i) => !bDoneSet.has(i.id)).length : 0;
    const bStale = !!b && (Date.now() - (b.lastSeen || 0) > 12 * 3600 * 1000);
    return { t, done, myDone, bDone, hasBuddy: !!b, myLeft, bLeft, bStale };
  }

  function renderCheckin() {
    const cs = checkinState();
    const panel = $('checkinPanel');
    let html = '';
    if (cs.done) {
      html = `
        <div class="checked-banner">✓ 今日已打卡成功！获得 1 次敲击机会</div>
        <div style="margin-top:12px"><button id="btnGoForge" class="btn btn-accent btn-checkin">去石匠工坊敲石头 ⛏️</button></div>`;
    } else {
      let status = '';
      let enabled = false;
      if (!cs.hasBuddy) status = '先和好友配对，才能一起打卡（双方都完成全部安排后，今天才能打卡）';
      else if (!cs.myDone && !cs.bDone) status = '你和好友都还有未完成的安排，继续加油 💪';
      else if (!cs.myDone) status = '你还差 ' + cs.myLeft + ' 项安排未完成';
      else if (!cs.bDone) status = '好友还差 ' + cs.bLeft + ' 项安排未完成，等 TA 完成吧…';
      else { status = '你和好友都完成了今日安排！'; enabled = true; }
      if (cs.bStale) status += '<div class="muted" style="margin-top:6px">⚠️ 好友数据可能不是最新，建议让 TA 导出同步码发给你</div>';
      html = `
        <div class="checkin-status">${status}</div>
        <button id="btnCheckin" class="btn btn-checkin ${enabled ? 'btn-accent' : ''}" ${enabled ? '' : 'disabled'}>${enabled ? '双方完成！打卡 ⛏️' : '打卡'}</button>`;
    }
    panel.innerHTML = html;
    const btn = $('btnCheckin');
    if (btn) btn.onclick = doCheckin;
    const go = $('btnGoForge');
    if (go) go.onclick = () => switchView('forge');
  }

  function doCheckin() {
    const cs = checkinState();
    if (cs.done || !cs.myDone || !cs.bDone || !cs.hasBuddy) return;
    state.checkedDays.push(cs.t);
    state.checkedDays.sort();
    state.checkedUpdatedAt = Date.now();
    state.credit += 1;
    saveState();
    schedulePush();
    renderAll();
    confetti();
    Forge.chime();
    toast('🎉 打卡成功！获得 1 次敲击机会，快去敲石头吧！', 3400);
  }
  /* ---------- 石匠工坊 ---------- */
  function renderForgeStats() {
    const b = state.buddy;
    const total = state.strikes + (b ? (b.strikes || 0) : 0);
    $('statTotal').textContent = total;
    $('statMine').textContent = state.strikes;
    $('statBuddy').textContent = b ? (b.strikes || 0) : 0;
    $('statCredit').textContent = state.credit;
    $('statDays').textContent = state.checkedDays.length;
    Forge.update({ total: total });
  }

  function onStoneClick() {
    if (state.credit > 0) {
      state.credit -= 1;
      state.strikes += 1;
      state.strikesUpdatedAt = Date.now();
      saveState();
      schedulePush();
      renderForgeStats();
      Forge.strike();
    } else {
      toast('还没有敲击机会 —— 完成安排并双方打卡后就能敲石头啦 ⛏️');
    }
  }

  /* ---------- 历史记录 ---------- */
  function renderCalendar() {
    const now = new Date();
    const y = now.getFullYear() + Math.floor((now.getMonth() + calOffset) / 12);
    const m = ((now.getMonth() + calOffset) % 12 + 12) % 12;
    const first = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    $('calTitle').textContent = y + '年' + (m + 1) + '月';
    const grid = $('calGrid');
    grid.innerHTML = '';
    ['日', '一', '二', '三', '四', '五', '六'].forEach((d) => {
      grid.insertAdjacentHTML('beforeend', '<div class="cal-week">' + d + '</div>');
    });
    const checked = new Set(state.checkedDays);
    for (let i = 0; i < first.getDay(); i++) grid.insertAdjacentHTML('beforeend', '<div class="cal-day empty"></div>');
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const cls = ['cal-day'];
      if (checked.has(ds)) cls.push('checked');
      if (ds === todayStr()) cls.push('today');
      grid.insertAdjacentHTML('beforeend', '<div class="' + cls.join(' ') + '">' + d + '</div>');
    }
    const set = new Set(state.checkedDays);
    let streak = 0;
    const d0 = new Date();
    if (!set.has(todayStr())) d0.setDate(d0.getDate() - 1);
    while (set.has(fmtDate(d0))) { streak++; d0.setDate(d0.getDate() - 1); }
    const b = state.buddy;
    const total = state.strikes + (b ? (b.strikes || 0) : 0);
    $('histStats').innerHTML = `
      <div class="hist-stat"><span>${state.checkedDays.length}</span><label>累计打卡（天）</label></div>
      <div class="hist-stat"><span>${streak}</span><label>连续打卡（天）</label></div>
      <div class="hist-stat"><span>${total}</span><label>共敲击（下）</label></div>`;
    $('calNext').disabled = calOffset >= 0;
  }

  /* ---------- 配对卡片 ---------- */
  function renderPair() {
    const card = $('pairCard');
    const b = state.buddy;
    if (!b) {
      card.innerHTML = `
        <div class="pair-row">
          <div>
            <strong>还没有配对</strong>
            <div class="muted">生成配对码发给好友，或输入好友的配对码</div>
          </div>
          <div class="pair-actions">
            <button id="btnCreatePair" class="btn btn-accent">创建配对码</button>
            <button id="btnJoinPair" class="btn">输入配对码</button>
          </div>
        </div>
        <div class="pair-row" style="margin-top:12px;border-top:1px dashed var(--border);padding-top:12px">
          <div class="muted">好友不在线？用同步码离线交换进度</div>
          <div class="pair-actions">
            <button id="btnExport" class="btn btn-sm">导出同步码</button>
            <button id="btnImport" class="btn btn-sm">导入同步码</button>
          </div>
        </div>`;
      $('btnCreatePair').onclick = openCreateModal;
      $('btnJoinPair').onclick = openJoinModal;
      $('btnExport').onclick = openExportModal;
      $('btnImport').onclick = openImportModal;
    } else {
      const online = buddyOnline();
      const since = b.lastSeen
        ? new Date(b.lastSeen).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        : '从未';
      card.innerHTML = `
        <div class="pair-row">
          <div>
            <strong>好友：${escapeHtml(b.username || '未知')}</strong>
            <div class="muted"><span class="buddy-dot ${online ? 'dot-on' : 'dot-off'}"></span>${online ? '在线 · 实时同步中' : '离线 · 上次同步 ' + since}</div>
          </div>
          <div class="pair-actions">
            <button id="btnExport" class="btn btn-sm">导出同步码</button>
            <button id="btnImport" class="btn btn-sm">导入同步码</button>
            <button id="btnUnpair" class="btn btn-sm btn-danger">解除配对</button>
          </div>
        </div>`;
      $('btnExport').onclick = openExportModal;
      $('btnImport').onclick = openImportModal;
      $('btnUnpair').onclick = unpair;
    }
  }
  function openCreateModal() {
    const code = makeCode();
    pairWaitCallback = null;
    openModal('创建配对码', `
      <p class="muted">把配对码发给好友，好友打开网站后点「输入配对码」填入即可。</p>
      <div class="pair-big-code">${code}</div>
      <div id="pairWait" class="pair-hint">正在等待好友加入…（请保持此窗口打开）</div>`);
    pairWaitCallback = (u) => {
      const w = $('pairWait');
      if (w) w.textContent = '🎉 好友 ' + u + ' 已加入！';
      closeModal();
      toast('与「' + u + '」配对成功！安排会自动同步');
    };
    hostPair(code, {
      silent: false,
      onFail: (msg) => { const w = $('pairWait'); if (w) w.textContent = '连接失败：' + msg; },
      onJoined: pairWaitCallback,
    });
  }

  function openJoinModal() {
    openModal('输入配对码', `
      <p class="muted">输入好友的 6 位配对码（不区分大小写）</p>
      <input id="joinCodeInput" class="auth-input" placeholder="例如 A3B7K2" maxlength="6" style="text-transform:uppercase">
      <div class="modal-row"><button id="btnJoinGo" class="btn btn-accent btn-block">加入</button></div>
      <div id="joinStatus" class="modal-status"></div>`);
    $('btnJoinGo').onclick = () => {
      const code = $('joinCodeInput').value.trim().toUpperCase();
      if (!/^[A-Z0-9]{4,8}$/.test(code)) { $('joinStatus').textContent = '请输入有效的配对码'; return; }
      $('joinStatus').textContent = '正在连接…';
      joinPair(code, {
        silent: false,
        onFail: (msg) => { $('joinStatus').textContent = msg; },
        onJoined: () => { closeModal(); toast('配对成功！安排会自动同步'); },
      });
    };
    $('joinCodeInput').focus();
  }

  function openExportModal() {
    const code = 'SM1.' + b64u(JSON.stringify(buildSnap()));
    openModal('导出同步码', `
      <p class="muted">复制下面这串同步码发给好友（微信/QQ 都行）。对方在「导入同步码」里粘贴，就能看到你的安排与进度。</p>
      <textarea id="exportCode" class="modal-textarea" readonly>${escapeHtml(code)}</textarea>
      <div class="modal-row"><button id="btnCopyCode" class="btn btn-accent btn-block">复制同步码</button></div>`);
    $('btnCopyCode').onclick = () => {
      const ta = $('exportCode');
      ta.select();
      try { document.execCommand('copy'); } catch (e) { }
      if (navigator.clipboard) navigator.clipboard.writeText(code).catch(() => { });
      toast('已复制！发给好友吧');
    };
  }

  function openImportModal() {
    openModal('导入同步码', `
      <p class="muted">粘贴好友发给你的同步码，即可看到 TA 最新的安排与进度。</p>
      <textarea id="importCode" class="modal-textarea" placeholder="粘贴好友的同步码…"></textarea>
      <div class="modal-row"><button id="btnImportGo" class="btn btn-accent btn-block">导入</button></div>
      <div id="importStatus" class="modal-status"></div>`);
    $('btnImportGo').onclick = () => {
      const raw = $('importCode').value.trim();
      try {
        const snap = JSON.parse(b64d(raw.replace(/^SM1\./, '')));
        if (mergeBuddySnapshot(snap)) {
          $('importStatus').textContent = '✅ 导入成功！';
          renderAll();
          setTimeout(closeModal, 1000);
        }
      } catch (e) {
        $('importStatus').textContent = '同步码无效，请检查后重试';
      }
    };
  }

  function unpair() {
    openModal('解除配对', `
      <p>解除后你们的进度将不再自动同步（各自的本地数据不会删除）。</p>
      <div class="modal-row"><button id="btnUnpairGo" class="btn btn-danger btn-block">解除配对</button></div>`);
    $('btnUnpairGo').onclick = () => {
      state.buddy = null;
      saveState();
      destroyPeer();
      closeModal();
      renderAll();
      toast('已解除配对');
    };
  }
  /* ---------- 视图切换 / 渲染 ---------- */
  function switchView(name) {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    $('view-today').classList.toggle('hidden', name !== 'today');
    $('view-forge').classList.toggle('hidden', name !== 'forge');
    $('view-history').classList.toggle('hidden', name !== 'history');
    if (name === 'forge') renderForgeStats();
    if (name === 'history') renderCalendar();
  }

  function renderAll() {
    if (!state) return;
    renderPair();
    renderMySchedule();
    renderBuddy();
    renderCheckin();
    renderForgeStats();
    renderCalendar();
  }

  /* ---------- 初始化 ---------- */
  function enterApp(u) {
    state = loadState(u);
    $('authView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    $('userName').textContent = state.account.username;

    Forge.init($('forgeScene'), onStoneClick);
    renderAll();

    heartbeatTimer = setInterval(() => { if (connOpen) send({ t: 'ping' }); }, 15000);
    // 跨天自动刷新
    setInterval(() => {
      if (state && todayStr() !== lastToday) {
        lastToday = todayStr();
        renderAll();
      }
    }, 30000);

    if (state.buddy && state.buddy.pairCode) {
      const role = state.buddy.role === 'host' ? 'host' : 'join';
      if (role === 'host') hostPair(state.buddy.pairCode, { silent: true });
      else joinPair(state.buddy.pairCode, { silent: true });
    }
  }

  function init() {
    // 登录页
    $('authTabLogin').onclick = () => setAuthMode('login');
    $('authTabReg').onclick = () => setAuthMode('reg');
    $('authBtn').onclick = doAuth;
    $('authUser').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('authPass').focus(); });
    $('authPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doAuth(); });

    // 顶栏
    $('logoutBtn').onclick = logout;
    document.querySelectorAll('.tab').forEach((b) => { b.onclick = () => switchView(b.dataset.view); });

    // 今日安排
    $('btnAdd').onclick = addItem;
    $('newItemText').addEventListener('keydown', (e) => { if (e.key === 'Enter') addItem(); });

    // 历史
    $('calPrev').onclick = () => { calOffset--; renderCalendar(); };
    $('calNext').onclick = () => { calOffset++; renderCalendar(); };

    // 弹窗
    $('modalClose').onclick = closeModal;
    $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });

    // 自动登录
    const u = localStorage.getItem(SESSION_KEY);
    if (u && localStorage.getItem(stateKey(u))) enterApp(u);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
