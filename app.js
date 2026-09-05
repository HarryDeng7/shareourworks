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
  let libLoading = false;
  let syncDownNotified = false;
  let peerWatchdog = null;
  // 轻量诊断日志（供 __smDebug 排查连接问题）
  let dbgLog = [];
  function dbgPush(x) { dbgLog.push(x); if (dbgLog.length > 12) dbgLog.shift(); }

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

  // 自带 ICE 服务器：默认只有 Google STUN（国内经常连不上），
  // 加上国内可达的 STUN 提高 NAT 打洞成功率。
  const PEER_OPT = {
    config: {
      iceServers: [
        { urls: 'stun:stun.chat.bilibili.com:3478' },
        { urls: 'stun:stun.miwifi.com:3478' },
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ]
    }
  };

  function loadPeerLib(cb) {
    if (window.Peer) { cb(true); return; }
    if (libLoading) return; // 已有一次加载在途，避免重复堆积 script 标签
    libLoading = true;
    let i = 0;
    const tryNext = () => {
      if (i >= PEER_URLS.length) { libLoading = false; cb(false); return; }
      const s = document.createElement('script');
      s.src = PEER_URLS[i++];
      s.onload = () => { libLoading = false; cb(true); };
      s.onerror = tryNext;
      document.head.appendChild(s);
    };
    tryNext();
  }

  function destroyPeer() {
    clearTimeout(reconnectTimer);
    clearTimeout(peerWatchdog);
    peerWatchdog = null;
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

  // 同步服务器连不上/长时间无响应：同一会话只提示一次，随后静默自动重试
  function noteCloudDown() {
    if (syncDownNotified) return;
    syncDownNotified = true;
    toast('实时同步暂时连不上（无法连接同步服务器），会自动重试；也可先用「同步码」手动同步', 3200);
  }

  function scheduleReconnect(delayMs) {
    if (!state || !state.buddy || !state.buddy.pairCode) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      try {
        retryConnect();
      } catch (e) {
        // 兜底：重试入口自身异常也绝不让循环中断
        if (state && state.buddy && state.buddy.pairCode && !connOpen) scheduleReconnect(15000);
      }
    }, delayMs || 10000);
  }

  // 重试入口：加入方的 Peer 还活着就直接重新拨号；
  // 创建方只要保持在线监听，好友上线后会自动拨号过来。
  function retryConnect() {
    if (!state || !state.buddy || !state.buddy.pairCode) return;
    if (connOpen) return;
    const code = state.buddy.pairCode;
    const role = state.buddy.role === 'host' ? 'host' : 'join';
    if (role === 'host') {
      if (peer && !peer.destroyed && peer.open) return; // 已在监听，无需动作
      syncPair({ silent: true });
      return;
    }
    if (peer && !peer.destroyed && peer.open) {
      dialBuddy(peer, code, 'join'); // 无需重新注册，直接重拨
      return;
    }
    syncPair({ silent: true });
  }

  function setupConn(conn, code, role, opts) {
    opts = opts || {};
    if (currentConn && currentConn !== conn) { try { currentConn.close(); } catch (e) { } }
    currentConn = conn;
    connOpen = false;

    // 连接看门狗：拨号后 15 秒仍未建立（如 NAT 打洞卡住），关闭并重试，
    // 避免界面永远停留在"连接中"。
    let connTimer = setTimeout(() => {
      if (!state) return;
      if (conn !== currentConn || conn.open) return;
      try { conn.close(); } catch (e) { }
      connOpen = false; currentConn = null; connecting = false;
      renderPair();
      if (role === 'join') scheduleReconnect(3000);
    }, 15000);
    const clearConnTimer = () => { clearTimeout(connTimer); connTimer = null; };

    conn.on('open', () => {
      dbgPush('conn-open');
      clearConnTimer();
      connOpen = true;
      connecting = false;
      syncDownNotified = false;
      if (!state.buddy) state.buddy = { username: '' };
      const isNewConn = !state.buddy.lastSeen || (Date.now() - state.buddy.lastSeen) > 60000;
      state.buddy.pairCode = code;
      state.buddy.role = role;
      state.buddy.lastSeen = Date.now();
      send({ t: 'hello', u: state.account.username });
      sendSnapNow();
      saveState();
      renderAll();
      if (isNewConn) toast('已与「' + (state.buddy.username || '好友') + '」同步成功 ⚡');
      if (opts.onJoined) opts.onJoined(state.buddy.username || '好友');
    });

    conn.on('data', (msg) => handleMsg(msg));
    conn.on('close', () => {
      clearConnTimer();
      if (!state) return;
      if (currentConn === conn) {
        connOpen = false; currentConn = null; connecting = false; renderPair();
        // 只有加入方需要主动重拨；创建方保持监听即可，好友会自动拨过来
        if (role === 'join') scheduleReconnect();
      }
    });
    conn.on('error', (err) => {
      clearConnTimer();
      dbgPush('conn-err:' + (err && err.type));
      if (!state) return;
      // 好友不在线时拨号会报 peer-unavailable，属正常情况，稍后自动重试
      if (currentConn === conn) {
        connOpen = false; currentConn = null; connecting = false; renderPair();
        if (role === 'join') scheduleReconnect(5000);
      }
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
  // 配对后双方使用固定 ID：创建方 -a、加入方 -b，各自监听并互相拨号，
  // 只要有配对码，任何一方上线都能自动连上，无需另一方在线等待。
  function ownPeerId(code, role) {
    return 'stone-mates-' + code.toLowerCase() + (role === 'host' ? '-a' : '-b');
  }
  function buddyPeerId(code, role) {
    return 'stone-mates-' + code.toLowerCase() + (role === 'host' ? '-b' : '-a');
  }

  // 连接策略：创建方固定 ID 后缀 -a（只监听），加入方后缀 -b（负责拨号）。
  // 双方不需要同时在线等待：只要有配对码，任一方上线后最多十几秒就能自动连上；
  // 单向拨号也避免了双方同时互拨导致的连接互相顶替、始终连不上的竞态。
  function syncPair(opts) {
    opts = opts || {};
    if (!state || !state.buddy || !state.buddy.pairCode) return;
    if (connOpen) return;
    const code = state.buddy.pairCode;
    const role = state.buddy.role === 'host' ? 'host' : 'join';
    clearTimeout(peerWatchdog);
    peerWatchdog = null;
    // 库加载看门狗：CDN 无响应时 onload/onerror 都不会触发，超时后自动重试
    peerWatchdog = setTimeout(() => {
      connecting = false;
      if (!window.Peer) {
        noteCloudDown();
        scheduleReconnect(10000);
      }
    }, 15000);
    loadPeerLib((ok) => {
      if (!ok) {
        if (!state || !state.buddy) return;
        if (!opts.silent) toast('实时同步不可用（无法加载同步库），可用「同步码」手动同步');
        noteCloudDown();
        scheduleReconnect(30000);
        return;
      }
      if (!state || !state.buddy || !state.buddy.pairCode) return;
      if (connOpen) return;
      destroyPeer();
      connecting = true;
      try {
        const p = new Peer(ownPeerId(code, role), PEER_OPT);
        peer = p;
        // 看门狗：服务器长时间无响应时 Peer 既不会 open 也不会报错，
        // 不处理会永远卡在连接中 —— 超时销毁并自动重试。
        peerWatchdog = setTimeout(() => {
          dbgPush('wd');
          connecting = false;
          if (peer === p) { try { p.destroy(); } catch (e) { } peer = null; }
          noteCloudDown();
          scheduleReconnect(8000);
        }, 12000);
        p.on('open', () => {
          dbgPush('popen:' + role);
          connecting = false;
          // 创建方只监听，等好友拨号过来；加入方此时拨号连好友
          if (role === 'join') dialBuddy(p, code, role);
        });
        p.on('connection', (conn) => {
          // 好友拨号过来，直接建立连接
          setupConn(conn, code, role, opts);
        });
        p.on('disconnected', () => {
          connecting = false;
          if (peer === p) { try { p.destroy(); } catch (e) { } peer = null; }
          noteCloudDown();
          scheduleReconnect(5000);
        });
        p.on('error', (err) => {
          connecting = false;
          const et = err.type;
          dbgPush('perr:' + et);
          if (et === 'unavailable-id') {
            // 自己的 ID 仍被占用（旧页面/旧会话未释放），销毁后稍候再注册
            if (peer === p) { try { p.destroy(); } catch (e) { } peer = null; }
            scheduleReconnect();
          } else if (et === 'peer-unavailable') {
            // 好友不在线：加入方稍后自动重拨
            scheduleReconnect();
          } else if (et === 'network' || et === 'server-error' || et === 'socket-error' || et === 'socket-closed') {
            if (peer === p) { try { p.destroy(); } catch (e) { } peer = null; }
            noteCloudDown();
            scheduleReconnect();
          } else if (et === 'browser-incompatible') {
            noteCloudDown();
          }
        });
      } catch (e) {
        connecting = false;
        if (opts.onFail) opts.onFail(String(e));
        // 任何同步异常都不允许中断重试循环，稍后自动再来一次
        scheduleReconnect(15000);
      }
    });
  }

  function dialBuddy(p, code, role, opts) {
    if (!state || !state.buddy || connOpen || !p || p.destroyed) return;
    dbgPush('dial');
    const conn = p.connect(buddyPeerId(code, role), { reliable: true });
    setupConn(conn, code, role, opts);
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
    if (!b || !(b.schedule || []).length) {
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
    const bSched = b ? (b.schedule || []) : [];
    const bIds = b ? new Set(bSched.map((i) => i.id)) : new Set();
    const bDoneSet = b ? new Set((b.completions && b.completions[t]) || []) : new Set();
    const bDone = bSched.length > 0 && [...bIds].every((id) => bDoneSet.has(id));
    const bLeft = bSched.filter((i) => !bDoneSet.has(i.id)).length;
    // 刚配对还没同步过时不提示数据过期
    const bStale = !!b && !!b.lastSeen && (Date.now() - b.lastSeen > 12 * 3600 * 1000);
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
            <div class="muted">生成配对码发给好友（好友随时可加入），或输入好友的配对码</div>
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
            <strong>好友：${escapeHtml(b.username || '未同步')}</strong>
            <div class="muted"><span class="buddy-dot ${online ? 'dot-on' : 'dot-off'}"></span>${online ? '在线 · 实时同步中' : (b.username ? '离线 · 配对码 ' + escapeHtml(b.pairCode || '') + ' · 上次同步 ' + since + ' · 每 10 秒自动重试' : '已配对 · 配对码 ' + escapeHtml(b.pairCode || '') + ' · 等好友上线（每 10 秒自动重试）')}</div>
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
    state.buddy = { pairCode: code, role: 'host' };
    saveState();
    renderAll();
    openModal('创建配对码', `
      <p class="muted">把配对码发给好友，好友随时输入这个码即可加入（不需要你在线等待）。</p>
      <div class="pair-big-code">${code}</div>
      <div class="pair-hint">双方同时在线时，安排与进度会自动同步 ⚡</div>
      <div class="modal-row">
        <button id="btnCopyPairCode" class="btn btn-accent">复制配对码</button>
        <button id="btnCreateDone" class="btn">完成</button>
      </div>`);
    $('btnCopyPairCode').onclick = () => {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { }
      document.body.removeChild(ta);
      if (navigator.clipboard) navigator.clipboard.writeText(code).catch(() => { });
      toast('配对码已复制，发给好友吧');
    };
    $('btnCreateDone').onclick = () => { closeModal(); renderAll(); };
    syncPair({ silent: true });
  }

  function openJoinModal() {
    openModal('输入配对码', `
      <p class="muted">输入好友的 6 位配对码（不区分大小写），随时可加入，无需好友在线等待。</p>
      <input id="joinCodeInput" class="auth-input" placeholder="例如 A3B7K2" maxlength="6" style="text-transform:uppercase">
      <div class="modal-row"><button id="btnJoinGo" class="btn btn-accent btn-block">加入</button></div>
      <div id="joinStatus" class="modal-status"></div>`);
    $('btnJoinGo').onclick = () => {
      const code = $('joinCodeInput').value.trim().toUpperCase();
      if (!/^[A-Z0-9]{4,8}$/.test(code)) { $('joinStatus').textContent = '请输入有效的配对码'; return; }
      state.buddy = { pairCode: code, role: 'join' };
      saveState();
      closeModal();
      renderAll();
      toast('已加入配对！好友上线后会自动同步');
      syncPair({ silent: true });
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
      syncPair({ silent: true });
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

  // 调试：外部（开发者工具/测试脚本）查看 P2P 内部状态
  window.__smDebug = function () {
    const b = state && state.buddy;
    return {
      peer: !!peer,
      peerOpen: !!(peer && peer.open),
      connOpen: connOpen,
      connecting: connecting,
      id: (b && b.pairCode) ? ownPeerId(b.pairCode, b.role === 'host' ? 'host' : 'join') : null,
      log: dbgLog.slice()
    };
  };

  document.addEventListener('DOMContentLoaded', init);
})();
