/* ===== 敲石工坊 · 主逻辑 ===== */
(function () {
  'use strict';

  /* ---------- 小工具 ---------- */
  const $ = (id) => document.getElementById(id);
  // 多语言：界面文案统一走 I18N（i18n.js），切换语言后重新渲染即可
  const T = (k, v) => window.I18N.t(k, v);
  const applyI18n = () => window.I18N.apply();

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

  // 「无限敲击 / 无限雕刻」的账号（内部测试用），改这里就能加人
  const FREE_USERS = ['222'];
  function isFree() {
    if (!state || !state.account) return false;
    return FREE_USERS.indexOf(String(state.account.username || '').toLowerCase()) >= 0;
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
      scheduleDay: '',
      completions: {},
      completionsUpdatedAt: Date.now(),
      checkedDays: [],
      checkedUpdatedAt: Date.now(),
      strikes: 0,
      strikesUpdatedAt: Date.now(),
      credit: 0,
      carveCredit: 0,
      carveDay: '',
      carve: null,
      works: [],
      buddy: null,
      syncStat: { ok: 0, fail: 0, lastOk: 0, lastFail: 0, log: [] },
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
        s.schedule = (s.schedule || []).map((i) => ({
          id: String(i.id), text: String(i.text || ''), time: String(i.time || ''),
          dueAt: Number(i.dueAt) || 0, missed: !!i.missed, createdAt: Number(i.createdAt) || 0
        }));
        if (!s.syncStat || typeof s.syncStat.ok !== 'number') {
          s.syncStat = { ok: 0, fail: 0, lastOk: 0, lastFail: 0, log: [] };
        }
        if (typeof s.scheduleDay !== 'string') s.scheduleDay = '';
        if (!Array.isArray(s.works)) s.works = [];
        s.works = s.works.filter((w) => w && typeof w === 'object' && w.obj)
          .map((w) => ({
            id: String(w.id || ''), obj: String(w.obj), paint: String(w.paint || ''),
            mat: String(w.mat || 'stone'), name: String(w.name || ''),
            x: Number(w.x) || 180, y: Number(w.y) || 318,
          })).slice(-10);
        if (typeof s.carveCredit !== 'number') s.carveCredit = 0;
        if (typeof s.carveDay !== 'string') s.carveDay = '';
        if (!s.carve || typeof s.carve !== 'object' || !s.carve.obj || !s.carve.sil
            || typeof s.carve.count !== 'number') s.carve = null;
        else if (typeof s.carve.milestone !== 'number') s.carve.milestone = 0;
        delete s.carveImg; // 旧版「刻在材料上的图片」已被雕刻系统取代
        return s;
      }
    } catch (e) { }
    const s = defaultState(u);
    return s;
  }

  let storageWarned = false;
  function saveState() {
    if (!state) return;
    try {
      localStorage.setItem(stateKey(state.account.username), JSON.stringify(state));
    } catch (e) {
      // 浏览器本地存储写满时不能把整个功能卡死：提示一次，界面继续可用
      if (!storageWarned) {
        storageWarned = true;
        toast(T('toast.storageFull'), 7000);
      }
    }
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
  let peerWatchdog = null;
  let syncLoopTimer = null; // 周期同步（每 5 秒一次）
  let cdTickTimer = null;   // 限时倒计时秒级刷新
  // 轻量诊断日志（供 __smDebug 排查连接问题）
  let dbgLog = [];
  function dbgPush(x) { dbgLog.push(x); if (dbgLog.length > 12) dbgLog.shift(); }
  // 手动直连相关状态（不依赖 0.peerjs.com 中转服务器）
  let manualPc = null;      // 手动直连的 RTCPeerConnection
  let manualActive = false; // 手动建连进行中/已建立，此时暂停云端自动重试避免互相干扰
  let manualTimer = null;

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
    $('authBtn').textContent = m === 'login' ? T('auth.login') : T('auth.reg');
    $('authPass').placeholder = m === 'login' ? T('auth.passPh') : T('auth.passPhReg');
    $('authErr').textContent = '';
  }

  function doAuth() {
    const u = $('authUser').value.trim().toLowerCase();
    const p = $('authPass').value;
    const err = $('authErr');
    if (!/^[\w\u4e00-\u9fa5-]{2,16}$/.test(u)) { err.textContent = T('err.userFormat'); return; }
    if (authMode === 'reg') {
      if (p.length < 4) { err.textContent = T('err.passShort'); return; }
      if (localStorage.getItem(stateKey(u))) { err.textContent = T('err.userExists'); return; }
      const s = defaultState(u);
      s.account.salt = randomHex(8);
      s.account.hash = hashStr(s.account.salt + ':' + p);
      // 同时存一份明文，仅存自己浏览器本地（不随任何同步发送），供「用户详情」查看密码
      s.account.pwd = p;
      localStorage.setItem(stateKey(u), JSON.stringify(s));
      login(u);
    } else {
      const raw = localStorage.getItem(stateKey(u));
      if (!raw) { err.textContent = T('err.userNotFound'); return; }
      let s;
      try { s = JSON.parse(raw); } catch (e) { err.textContent = T('err.dataBroken'); return; }
      if (!s.account || s.account.hash !== hashStr(s.account.salt + ':' + p)) { err.textContent = T('err.passWrong'); return; }
      // 登录成功顺手补存明文（仅本地）：旧账号下次登录后，详情里也能直接看到密码。
      // 这里写不进去（隐私模式/存储写满）也绝不能挡住登录，否则点了按钮像没反应。
      if (!s.account.pwd) {
        s.account.pwd = p;
        try { localStorage.setItem(stateKey(u), JSON.stringify(s)); } catch (e) { }
      }
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
    clearInterval(syncLoopTimer);
    clearInterval(cdTickTimer);
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
    if (!d || d.v !== 1 || !d.u) { toast(T('toast.invalidSyncCode')); return false; }
    if (d.u === state.account.username) { toast(T('toast.selfSyncCode')); return false; }
    if (!state.buddy) state.buddy = { username: d.u };
    const b = state.buddy;
    if (b.username && b.username !== d.u) {
      b.username = d.u;
      b.schedule = b.scheduleUpdatedAt = b.completions = b.completionsUpdatedAt = undefined;
      b.checkedDays = [];
    }
    b.username = d.u;
    if (!b.scheduleUpdatedAt || d.su >= b.scheduleUpdatedAt) {
      b.schedule = (d.s || []).map((i) => ({
        id: String(i.id), text: String(i.text || ''), time: String(i.time || ''),
        dueAt: Number(i.dueAt) || 0, missed: !!i.missed, createdAt: Number(i.createdAt) || 0
      }));
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
    manualAbort();
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
      if (connOpen) { send({ t: 'snap', d: buildSnap() }); syncRecord(true, T('sync.reason.progress')); }
    }, 400);
  }

  /* ---------- 同步记录（右上角「同步记录」可查看） ----------
     每次同步尝试的结果都会记录并持久化；失败一律不弹提示（弹窗已去掉），
     静默自动重试。成功/失败的去重与展示见 openSyncStatModal。 */
  function syncRecord(ok, why) {
    if (!state || !state.buddy || !state.buddy.pairCode) return; // 未配对不记录
    const t = Date.now();
    if (!state.syncStat || typeof state.syncStat.ok !== 'number') {
      state.syncStat = { ok: 0, fail: 0, lastOk: 0, lastFail: 0, log: [] };
    }
    const st = state.syncStat;
    if (ok) {
      st.ok++;
      st.lastOk = t;
    } else {
      // 同一次失败的连续事件（如 error+close）只记一次
      if (st.lastFail && t - st.lastFail < 2500) return;
      st.fail++;
      st.lastFail = t;
    }
    st.log.push({ t: t, ok: ok, w: why || (ok ? T('sync.ok') : T('sync.fail')) });
    if (st.log.length > 30) st.log.shift();
    saveState();
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
    }, delayMs || 5000);
  }

  // 重试入口：加入方的 Peer 还活着就直接重新拨号；
  // 创建方只要保持在线监听，好友上线后会自动拨号过来。
  function retryConnect() {
    if (!state || !state.buddy || !state.buddy.pairCode) return;
    if (connOpen || manualActive) return;
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
      syncRecord(false, T('sync.reason.handshakeTimeout'));
      try { conn.close(); } catch (e) { }
      connOpen = false; currentConn = null; connecting = false;
      renderPair();
      if (role === 'join') scheduleReconnect(3000);
    }, 15000);
    const clearConnTimer = () => { clearTimeout(connTimer); connTimer = null; };

    conn.on('open', () => {
      dbgPush('conn-open');
      clearConnTimer();
      clearTimeout(peerWatchdog);
      peerWatchdog = null;
      connOpen = true;
      connecting = false;
      syncRecord(true, T('sync.reason.connected'));
      if (!state.buddy) state.buddy = { username: '' };
      const isNewConn = !state.buddy.lastSeen || (Date.now() - state.buddy.lastSeen) > 60000;
      state.buddy.pairCode = code;
      state.buddy.role = role;
      state.buddy.lastSeen = Date.now();
      send({ t: 'hello', u: state.account.username });
      sendSnapNow();
      saveState();
      renderAll();
      if (isNewConn) toast(T('toast.syncOk', { u: state.buddy.username || T('common.buddy') }));
      if (opts.onJoined) opts.onJoined(state.buddy.username || T('common.buddy'));
    });

    conn.on('data', (msg) => handleMsg(msg));
    conn.on('close', () => {
      clearConnTimer();
      if (!state) return;
      if (currentConn === conn) {
        connOpen = false; currentConn = null; connecting = false; renderPair();
        syncRecord(false, T('sync.reason.closed'));
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
        syncRecord(false, (err && err.type === 'peer-unavailable') ? T('sync.reason.buddyOffline') : T('sync.reason.connFail'));
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
        toast(T('toast.newBuddy', { u: msg.u }));
      } else {
        state.buddy.username = msg.u;
      }
      if (msg.u === state.account.username) toast(T('toast.sameName'));
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
    if (connOpen || manualActive) return;
    const code = state.buddy.pairCode;
    const role = state.buddy.role === 'host' ? 'host' : 'join';
    clearTimeout(peerWatchdog);
    peerWatchdog = null;
    // 库加载看门狗：CDN 无响应时 onload/onerror 都不会触发，超时后自动重试
    peerWatchdog = setTimeout(() => {
      connecting = false;
      if (!window.Peer) {
        syncRecord(false, T('sync.reason.serverFail'));
        scheduleReconnect(5000);
      }
    }, 15000);
    loadPeerLib((ok) => {
      if (!ok) {
        if (!state || !state.buddy) return;
        syncRecord(false, T('sync.reason.libFail'));
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
          syncRecord(false, T('sync.reason.serverTimeout'));
          scheduleReconnect(5000);
        }, 12000);
        p.on('open', () => {
          dbgPush('popen:' + role);
          connecting = false;
          // 看门狗只管"Peer 卡在打开"这一阶段，已上线即取消，避免误杀健康连接
          clearTimeout(peerWatchdog);
          peerWatchdog = null;
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
          syncRecord(false, T('sync.reason.serverDown'));
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
            // 好友不在线：记一次失败（静默不提示），稍后自动重拨
            syncRecord(false, T('sync.reason.buddyOffline'));
            scheduleReconnect();
          } else if (et === 'network' || et === 'server-error' || et === 'socket-error' || et === 'socket-closed') {
            if (peer === p) { try { p.destroy(); } catch (e) { } peer = null; }
            syncRecord(false, T('sync.reason.net'));
            scheduleReconnect();
          } else if (et === 'browser-incompatible') {
            syncRecord(false, T('sync.reason.browser'));
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
    if (manualActive || !state || !state.buddy || connOpen || !p || p.destroyed) return;
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
  function fmtCd(ms) {
    if (ms < 0) ms = 0;
    const sec = Math.floor(ms / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const p = (n) => String(n).padStart(2, '0');
    return h > 0 ? h + ':' + p(m) + ':' + p(s) : p(m) + ':' + p(s);
  }
  // 每秒刷新倒计时数字，并自动把到点仍未完成的任务标记为「超时未完成」
  // 任务的今日截止时间戳：优先「限时倒计时」，其次「几点之前完成」。
  // 到点还没完成就直接算未完成 —— 不管这条任务是几点建出来的。
  function taskDeadline(it) {
    if (!it) return 0;
    if (it.dueAt) return it.dueAt;
    if (!it.time) return 0;
    const parts = String(it.time).split(':');
    const h = Number(parts[0]), m = Number(parts[1]);
    if (!isFinite(h) || !isFinite(m)) return 0;
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.getTime();
  }

  // 到点还没完成的任务：直接记成未完成。渲染前也会跑一次，界面永远不会先显示一个过期的勾
  function markMissed() {
    if (!state) return false;
    const t = Date.now();
    const doneSet = new Set(state.completions[todayStr()] || []);
    let changed = false;
    state.schedule.forEach((it) => {
      if (it.missed || doneSet.has(it.id)) return;
      const dl = taskDeadline(it);
      if (dl && t >= dl) { it.missed = true; changed = true; }
    });
    if (changed) {
      state.scheduleUpdatedAt = Date.now();
      saveState();
      schedulePush();
    }
    return changed;
  }

  function tickCountdowns() {
    if (!state) return;
    if (markMissed()) { renderAll(); return; }
    const refresh = (scope, items) => {
      if (!scope) return;
      scope.querySelectorAll('[data-cd]').forEach((el) => {
        const it = (items || []).find((x) => x.id === el.dataset.cd);
        if (!it || !it.dueAt) return;
        const left = it.dueAt - Date.now();
        if (left <= 0) {
          // 好友端展示用本地判断；本人这边会在上面分支先标记 missed 并重渲染
          const item = el.closest('.item');
          if (item) {
            item.classList.add('miss');
            const ck = item.querySelector('.item-check');
            if (ck) { ck.classList.add('locked', 'miss'); ck.textContent = '✗'; }
          }
          const due = el.closest('.item-due');
          if (due) { due.classList.add('miss'); due.textContent = T('list.missedShort'); }
          return;
        }
        el.textContent = fmtCd(left);
      });
    };
    refresh($('myList'), state.schedule);
    refresh($('buddyList'), state.buddy ? (state.buddy.schedule || []) : []);
  }
  function renderMySchedule() {
    const t = todayStr();
    const done = new Set((state.completions[t] || []));
    const list = $('myList');
    if (!state.schedule.length) {
      list.innerHTML = '<div class="item-empty">' + escapeHtml(T('list.emptyMine')) + '</div>';
    } else {
      list.innerHTML = state.schedule.map((it) => {
        const isDone = done.has(it.id);
        const isMiss = !isDone && !!it.missed;
        const dueHtml = (!isDone && it.dueAt)
          ? `<span class="item-due ${isMiss ? 'miss' : ''}">${isMiss ? T('list.missed') : T('list.leftStart') + '<b data-cd="' + it.id + '">' + fmtCd(it.dueAt - Date.now()) + '</b>'}</span>`
          : ((isMiss && it.time) ? `<span class="item-due miss">${T('list.missed')}</span>` : '');
        return `
        <div class="item ${isDone ? 'done' : ''} ${isMiss ? 'miss' : ''}">
          <button class="item-check ${isDone ? 'on' : ''} ${isMiss ? 'locked miss' : ''}" data-id="${it.id}">${isMiss ? '✗' : '✓'}</button>
          <input class="item-text" value="${escapeHtml(it.text)}" data-id="${it.id}" maxlength="60" ${isMiss ? 'readonly' : ''}>
          ${it.time ? `<span class="item-time">${escapeHtml(it.time)}</span>` : ''}
          ${dueHtml}
          <button class="item-edit" data-id="${it.id}" title="${escapeHtml(T('list.edit'))}">✏️</button>
          <button class="item-del" data-id="${it.id}" title="${escapeHtml(T('list.del'))}">✕</button>
        </div>`;
      }).join('');
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
    const weeks = T('hist.weekdays').split(',');
    $('todayLabel').textContent = T('today.label', {
      y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), w: weeks[d.getDay()],
    });
  }
  /* 每天清空「我的安排」：新的一天从空白开始（老账号第一次升级时保留当天列表，第二天起自动清） */
  function rollDailyTasks(quiet) {
    if (!state) return false;
    const t = todayStr();
    if (state.scheduleDay === t) return false;
    if (!state.scheduleDay) {
      state.scheduleDay = t;
      saveState();
      return false;
    }
    const had = state.schedule.length;
    state.schedule = [];
    state.scheduleDay = t;
    state.scheduleUpdatedAt = Date.now(); // 时间戳要往前推，好友那边才会接受这份空安排
    saveState();
    schedulePush();
    if (had && !quiet) toast(T('toast.dayClear'), 5200);
    return true;
  }

  function addItem() {
    const text = $('newItemText').value.trim();
    if (!text) { $('newItemText').focus(); return; }
    const time = $('newItemTime').value;
    const dueMin = Number($('newItemDue').value) || 0;
    state.schedule.push({
      id: uid(), text: text, time: time || '',
      dueAt: dueMin > 0 ? Date.now() + dueMin * 60000 : 0,
      missed: false, createdAt: Date.now(),
    });
    state.scheduleUpdatedAt = Date.now();
    const pickedTime = time || '';
    $('newItemText').value = '';
    $('newItemTime').value = '';
    $('newItemDue').value = '0';
    saveState();
    markMissed(); // 填的时间已经过了的话，这里就直接标成「超时未完成」
    // 先说清楚：这条会立刻算未完成
    const justAdded = state.schedule[state.schedule.length - 1];
    if (pickedTime && taskDeadline(justAdded) && taskDeadline(justAdded) <= Date.now()) {
      toast(T('toast.timePast'), 6000);
    }
    schedulePush();
    renderMySchedule();
    renderCheckin();
  }

  function removeItem(id) {
    state.schedule = state.schedule.filter((i) => i.id !== id);
    state.scheduleUpdatedAt = Date.now();
    awardCarve();
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
    if (!it || it.missed || it.text === text) return;
    it.text = text;
    state.scheduleUpdatedAt = Date.now();
    saveState();
    schedulePush();
  }

  function toggleItem(id) {
    const itm = state.schedule.find((i) => i.id === id);
    if (itm && itm.missed) { toast(T('toast.missedLock')); return; }
    const t = todayStr();
    if (!state.completions[t]) state.completions[t] = [];
    const arr = state.completions[t];
    const idx = arr.indexOf(id);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(id);
    state.completionsUpdatedAt = Date.now();
    saveState();
    awardCarve(); // 我自己的安排全部勾完 → 当天攒 1 次雕刻机会
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
      list.innerHTML = '<div class="item-empty">' + escapeHtml(b ? T('list.emptyBuddy') : T('list.noPair')) + '</div>';
      $('buddyBar').style.width = '0%';
      $('buddyProgText').textContent = '0/0';
      statusEl.textContent = b ? (buddyOnline() ? T('buddy.online') : T('buddy.offline')) : '';
      return;
    }
    const t = todayStr();
    const done = new Set((b.completions && b.completions[t]) || []);
    const nowT = Date.now();
    list.innerHTML = b.schedule.map((it) => {
      const isDone = done.has(it.id);
      const dl = taskDeadline(it);
      const budMissed = !isDone && (!!it.missed || !!(dl && nowT >= dl));
      const budDue = !isDone && it.dueAt;
      const dueHtml = budDue
        ? `<span class="item-due ${budMissed ? 'miss' : ''}">${budMissed ? T('list.missed') : T('list.leftStart') + '<b data-cd="' + it.id + '">' + fmtCd(it.dueAt - nowT) + '</b>'}</span>`
        : ((budMissed && it.time) ? `<span class="item-due miss">${T('list.missed')}</span>` : '');
      return `
      <div class="item ${isDone ? 'done' : ''} ${budMissed ? 'miss' : ''}">
        <span class="item-check ${isDone ? 'on' : ''} ${budMissed ? 'locked miss' : ''}">${budMissed ? '✗' : '✓'}</span>
        <span class="item-text">${escapeHtml(it.text)}</span>
        ${it.time ? `<span class="item-time">${escapeHtml(it.time)}</span>` : ''}
        ${dueHtml}
      </div>`;
    }).join('');
    const total = b.schedule.length;
    const cnt = b.schedule.filter((it) => done.has(it.id)).length;
    $('buddyBar').style.width = (cnt / total * 100).toFixed(1) + '%';
    $('buddyProgText').textContent = cnt + '/' + total;
    statusEl.textContent = buddyOnline()
      ? T('buddy.online')
      : (b.lastSeen
        ? T('buddy.lastSync', { t: new Date(b.lastSeen).toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit' }) })
        : T('buddy.offline'));
  }

  /* ---------- 打卡 ---------- */
  function checkinState() {
    const t = todayStr();
    const done = state.checkedDays.includes(t);
    const myIds = new Set(state.schedule.map((i) => i.id));
    const myDoneSet = new Set(state.completions[t] || []);
    const myDone = state.schedule.length > 0 && [...myIds].every((id) => myDoneSet.has(id));
    const myLeft = state.schedule.filter((i) => !myDoneSet.has(i.id)).length;
    const myMissed = state.schedule.filter((i) => i.missed && !myDoneSet.has(i.id)).length;
    const b = state.buddy;
    const bSched = b ? (b.schedule || []) : [];
    const bIds = b ? new Set(bSched.map((i) => i.id)) : new Set();
    const bDoneSet = b ? new Set((b.completions && b.completions[t]) || []) : new Set();
    const bDone = bSched.length > 0 && [...bIds].every((id) => bDoneSet.has(id));
    const bLeft = bSched.filter((i) => !bDoneSet.has(i.id)).length;
    // 刚配对还没同步过时不提示数据过期
    const bStale = !!b && !!b.lastSeen && (Date.now() - b.lastSeen > 12 * 3600 * 1000);
    return { t, done, myDone, bDone, hasBuddy: !!b, myLeft, bLeft, bStale, myMissed };
  }

  function renderCheckin() {
    const cs = checkinState();
    const panel = $('checkinPanel');
    let html = '';
    if (cs.done) {
      html = `
        <div class="checked-banner">${escapeHtml(T('checkin.done'))}</div>
        <div style="margin-top:12px"><button id="btnGoForge" class="btn btn-accent btn-checkin">${escapeHtml(T('checkin.goForge'))}</button></div>`;
    } else {
      let status = '';
      let enabled = false;
      if (!cs.hasBuddy) status = T('checkin.needBuddy');
      else if (!cs.myDone && !cs.bDone) status = T('checkin.bothLeft');
      else if (!cs.myDone) status = T('checkin.myLeft', { n: cs.myLeft }) + (cs.myMissed ? T('checkin.myMissed', { n: cs.myMissed }) : '');
      else if (!cs.bDone) status = T('checkin.buddyLeft', { n: cs.bLeft });
      else { status = T('checkin.bothDone'); enabled = true; }
      if (cs.bStale) status += '<div class="muted" style="margin-top:6px">' + escapeHtml(T('checkin.stale')) + '</div>';
      html = `
        <div class="checkin-status">${status}</div>
        <button id="btnCheckin" class="btn btn-checkin ${enabled ? 'btn-accent' : ''}" ${enabled ? '' : 'disabled'}>${enabled ? T('checkin.btnReady') : T('checkin.btn')}</button>`;
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
    awardCarve();
    schedulePush();
    renderAll();
    confetti();
    Forge.chime();
    toast(T('toast.checkinOk'), 3400);
  }
  /* ---------- 石匠工坊 ---------- */
  function renderForgeStats() {
    const b = state.buddy;
    const myDays = state.checkedDays.length;
    $('statMine').textContent = state.strikes;
    $('statBuddy').textContent = b ? (b.strikes || 0) : 0;
    $('statCredit').textContent = isFree() ? '∞' : state.credit;
    $('statCarve').textContent = isFree() ? '∞' : (state.carveCredit || 0);
    $('statDays').textContent = myDays;
    Forge.setCarve(state.carve);
    Forge.setPaint(state.carve ? (state.carve.paint || '') : '');
    Forge.setWorks(state.works || []);
    Forge.update({ hits: state.strikes });
    renderForgeHint();
    renderCarvePanel();
    renderPaintBox();
    renderForgeLegend();
  }

  // 提示语跟着当前材质和剩余机会走
  function renderForgeHint() {
    const el = $('forgeHint');
    if (!el) return;
    const noCredit = !isFree() && state.credit <= 0;
    el.textContent = noCredit
      ? T('forge.hintNoCredit')
      : T('forge.hint', { item: Forge.matName(state.strikes) });
    el.classList.toggle('warn', noCredit);
  }

  // 图例：材质看「我自己的打卡天数」，作品进度看「雕刻次数」
  function renderForgeLegend() {
    const el = $('carveLegend');
    if (!el) return;
    const mats = Forge.MATERIALS.map((m) => T(m.key) + '(' + m.at + ')').join(' → ');
    const step = Forge.CARVE_STEP;
    const c = state.carve;
    const lines = [T('forge.legendMat', { ladder: mats })];
    lines.push(c && (c.count || 0) >= Forge.CARVE_TOTAL
      ? T('forge.workDone', { name: c.name || '' })
      : T('forge.legendWork', { a: step, b: step * 2, c: step * 3 }));
    el.textContent = '';
    lines.forEach((line) => {
      const div = document.createElement('div');
      div.textContent = line;
      el.appendChild(div);
    });
  }

  /* ---------- 雕刻 ----------
     机会：把自己今天的安排全部完成，当天 +1 次（与「敲击机会」分开）
     过程：第一次选一个物体（上传图片 + 拖框圈住 + 自动抠背景），
           之后每雕一次，这块料就被凿掉一点、越来越像那个物体：
           形状 50 次 → 上色 50 次 → 抛光 50 次。雕的是桌上同一块料，所以金料最后是金船。 */
  let cropImg = null;       // 选物体弹窗里已加载的图片
  let cropName = '';        // 图片文件名（当作物体名）
  let cropSel = null;       // 框选区域（画布像素坐标）
  let cropDrag = null;

  // 我自己今天的安排全部完成 → 当天攒 1 次雕刻机会
  function awardCarve() {
    if (!state) return;
    const t = todayStr();
    if (state.carveDay === t) return;
    if (isFree()) { state.carveDay = t; saveState(); return; } // 无限账号不用攒
    const done = new Set(state.completions[t] || []);
    if (!state.schedule.length || !state.schedule.every((i) => done.has(i.id))) return;
    state.carveDay = t;
    state.carveCredit = (state.carveCredit || 0) + 1;
    saveState();
    toast(T('toast.carveAward'), 3200);
    renderForgeStats();
  }

  // 雕刻面板：阶段名 / 进度 / 机会 / 按钮
  function renderCarvePanel() {
    const c = state.carve;
    const bar = $('carveProg');
    if (!bar) return;
    const step = Forge.CARVE_STEP;
    const total = Forge.CARVE_TOTAL;
    const n = c ? Math.min(total, c.count || 0) : 0;
    const stage = n >= 2 * step ? 2 : (n >= step ? 1 : 0);
    const done = n >= total;
    const pending = !!c && n > 0 && n % step === 0 && (c.milestone || 0) < n;
    $('carveStageName').textContent = c ? T('carve.stage' + stage) : T('carve.stage0');
    $('carveObjName').textContent = c ? T('carve.objName', { name: c.name || '' }) : '';
    bar.style.width = ((n / total) * 100).toFixed(1) + '%';
    $('carveProgress').textContent = T('carve.progress', { n: n, max: total });
    let msg;
    if (!c) msg = T('carve.needObj');
    else if (pending) msg = T('carve.milestoneTip', { name: c.name || '' });
    else if (done) msg = T('carve.done');
    else if (!isFree() && state.carveCredit <= 0) msg = T('carve.needCredit');
    else msg = T('carve.credit', { n: isFree() ? '∞' : state.carveCredit });
    $('carveStatus').textContent = msg;
    const btn = $('btnCarve');
    const pick = $('btnCarvePick');
    btn.disabled = !!c && !pending && (done || (!isFree() && state.carveCredit <= 0));
    btn.textContent = !c ? T('carve.btnPick') : (pending ? T('carve.btnChoose') : T('carve.btnCarve'));
    pick.classList.toggle('hidden', !c);
    pick.textContent = T('carve.btnChange');
  }

  // 雕一次
  function onCarve() {
    const c = state.carve;
    if (!c) { openCarvePickModal(); return; }
    const n0 = c.count || 0;
    const step = Forge.CARVE_STEP;
    if (n0 >= Forge.CARVE_TOTAL) { toast(T('carve.done')); return; }
    if (n0 > 0 && n0 % step === 0 && (c.milestone || 0) < n0) { openCarveMilestoneModal(); return; }
    if (!isFree() && state.carveCredit <= 0) { toast(T('carve.needCredit'), 3200); return; }
    if (!isFree()) state.carveCredit -= 1;
    c.count = n0 + 1;
    saveState();
    renderForgeStats();
    Forge.carve();
    toast(T('toast.carveOnce', { n: c.count }));
    if (c.count >= Forge.CARVE_TOTAL) {
      const done = c;
      setTimeout(() => { openFinishModal(done, !!finishWork()); }, 560);
    } else if (c.count % step === 0) {
      setTimeout(() => { confetti(); Forge.chime(); openCarveMilestoneModal(); }, 560);
    }
  }

  // 50 / 100 / 150 次：换物体，还是继续往下一阶段
  function openCarveMilestoneModal() {
    const c = state.carve;
    if (!c) return;
    const step = Forge.CARVE_STEP;
    const n = c.count || 0;
    const name = escapeHtml(c.name || '');
    const locked = n >= 2 * step; // 上色之后就不能再换物体了
    let title, body;
    if (locked) { title = T('carve.m100Title'); body = T('carve.m100Body', { name: name, n: step }); }
    else { title = T('carve.m50Title'); body = T('carve.m50Body', { name: name, n: step, mat: Forge.matName(state.strikes) }); }
    openModal(title, `
      <p>${body}</p>
      <div class="modal-row" style="flex-direction:column;gap:8px">
        <button id="btnCarveNext" class="btn btn-accent btn-block">${escapeHtml(T('carve.btnNext', { n: step }))}</button>
        ${locked ? '' : '<button id="btnCarveReplace" class="btn btn-block">' + escapeHtml(T('carve.btnReplace')) + '</button>'}
        <button id="btnCarveLater" class="btn btn-ghost btn-block">${escapeHtml(T('carve.cancel'))}</button>
      </div>`);
    $('btnCarveNext').onclick = () => {
      c.milestone = n;
      saveState();
      closeModal();
      renderForgeStats();
      toast(T('carve.nextToast', { stage: T('carve.stage' + Math.min(2, n / step)), n: step }), 3200);
    };
    const rp = $('btnCarveReplace');
    if (rp) rp.onclick = () => { closeModal(); openCarvePickModal(); };
    $('btnCarveLater').onclick = closeModal;
  }

  // 已经有进度时换物体要先确认（会从头开始雕）
  function askReplaceCarve() {
    const n = state.carve ? (state.carve.count || 0) : 0;
    if (!n) { openCarvePickModal(); return; }
    openModal(T('carve.replaceTitle'), `
      <p>${escapeHtml(T('carve.replaceBody', { n: n }))}</p>
      <div class="modal-row">
        <button id="btnReplaceGo" class="btn btn-accent btn-block">${escapeHtml(T('carve.btnReplace'))}</button>
        <button id="btnReplaceCancel" class="btn btn-ghost btn-block">${escapeHtml(T('carve.cancel'))}</button>
      </div>`);
    $('btnReplaceGo').onclick = openCarvePickModal;
    $('btnReplaceCancel').onclick = closeModal;
  }

  /* ---------- 材质演化（点材质那一行打开）：六级材质的样子 + 需要的天数 ---------- */
  function openMatLadderModal() {
    const hits = state.strikes;
    const list = Forge.MATERIALS;
    const curId = Forge.matId(hits);
    const ci = Math.max(0, list.findIndex((m) => m.id === curId));
    const cards = list.map((m, i) => {
      const on = m.id === curId;
      const reached = hits >= m.at;
      const label = reached ? (on ? T('mat.now') : T('mat.done')) : T('mat.days', { n: m.at });
      const left = reached ? '' : '<div class="mat-left">' + escapeHtml(T('mat.left', { n: m.at - hits })) + '</div>';
      return `<div class="mat-card${on ? ' on' : ''}${reached ? ' reached' : ''}">
        <div class="mat-pic">${Forge.previewRock(i, 72)}</div>
        <div class="mat-name">${escapeHtml(T(m.key))}</div>
        <div class="mat-days">${escapeHtml(label)}</div>${left}</div>`;
    }).join('');
    const next = list[ci + 1] || null;
    const note = next
      ? T('mat.note', { name: T(list[ci].key), n: hits, next: T(next.key), left: next.at - hits })
      : T('mat.noteDone', { name: T(list[ci].key), n: hits });
    openModal(T('mat.title'), `
      <p class="muted">${escapeHtml(T('mat.intro'))}</p>
      <div class="mat-grid">${cards}</div>
      <p class="muted" style="margin-top:10px">${escapeHtml(note)}</p>
      ${devBox('strikes', hits, 150, [0, 8, 25, 50, 90, 150])}`);
    bindDevBox('strikes', (n) => {
      state.strikes = n;
      state.strikesUpdatedAt = Date.now();
      saveState();
      schedulePush();
      renderForgeStats();
    }, openMatLadderModal);
  }

  /* ---------- 雕刻过程（点雕刻进度条打开）：石头 → 正方体 → 六面六色 → 亮面 ---------- */
  function openCarveStageModal() {
    const step = Forge.CARVE_STEP;
    const c = state.carve;
    const n = c ? Math.min(Forge.CARVE_TOTAL, c.count || 0) : 0;
    const cur = n === 0 ? 0 : (n < step ? 1 : (n < 2 * step ? 2 : 3));
    const mi = Math.max(0, Forge.MATERIALS.findIndex((m) => m.id === Forge.matId(state.strikes)));
    const cells = [
      { k: 0, n: 0, pic: Forge.previewRock(mi, 76), name: T('stg.s0') },
      { k: 1, n: step, pic: Forge.previewCube(1, mi, 76), name: T('stg.s1') },
      { k: 2, n: 2 * step, pic: Forge.previewCube(2, mi, 76), name: T('stg.s2') },
      { k: 3, n: 3 * step, pic: Forge.previewCube(3, mi, 76), name: T('stg.s3') },
    ].map((it) => `<div class="stg-card${it.k === cur ? ' on' : ''}">
        <div class="stg-pic">${it.pic}</div>
        <div class="stg-name">${escapeHtml(it.name)}</div>
        <div class="stg-n">${escapeHtml(T('stg.times', { n: it.n }))}</div></div>`).join('');
    openModal(T('stg.title'), `
      <p class="muted">${escapeHtml(T('stg.intro'))}</p>
      <div class="stg-strip">${cells}</div>
      <p class="muted" style="margin-top:10px;font-size:12px">${escapeHtml(T('stg.note'))}</p>
      ${c ? devBox('carve', n, Forge.CARVE_TOTAL, [0, 50, 100, 150]) : (isFree() ? '<p class="muted">' + escapeHtml(T('dev.needObj')) + '</p>' : '')}`);
    bindDevBox('carve', (v) => {
      if (!state.carve) return;
      state.carve.count = v;
      state.carve.milestone = v; // 直接设定就不弹里程碑了
      if (paintMode && !paintReady()) togglePaintMode();
      saveState();
      renderForgeStats();
    }, openCarveStageModal);
  }

  /* ---------- 内部账号专用：直接切换进度（只有 FREE_USERS 里的账号看得到） ---------- */
  function devBox(kind, cur, max, quick) {
    if (!isFree()) return '';
    const title = kind === 'strikes' ? T('dev.strikesTitle') : T('dev.carveTitle');
    const btns = quick.map((n) => `<button class="btn btn-sm dev-set" data-n="${n}">${n}</button>`).join('');
    return `
      <div class="dev-box">
        <div class="muted" style="margin-bottom:6px">${escapeHtml(title)}</div>
        <div class="dev-row">
          <input id="devRange" class="dev-range" type="range" min="0" max="${max}" step="1" value="${cur}">
          <span id="devVal" class="dev-val">${cur}</span>
        </div>
        <div class="dev-quick">${btns}</div>
        <div class="modal-row"><button id="btnDevApply" class="btn btn-accent btn-sm btn-block">${escapeHtml(T('dev.apply'))}</button></div>
      </div>`;
  }

  function bindDevBox(kind, apply, reopen) {
    if (!isFree()) return;
    const r = $('devRange');
    if (!r) return;
    const v = $('devVal');
    r.oninput = () => { v.textContent = r.value; };
    document.querySelectorAll('#modalBody .dev-set').forEach((b) => {
      b.onclick = () => { r.value = b.dataset.n; v.textContent = b.dataset.n; };
    });
    $('btnDevApply').onclick = () => {
      const n = Math.max(0, Math.min(Number(r.max) || 0, Number(r.value) || 0));
      apply(n);
      toast(T('dev.done', { n: n }));
      reopen();
    };
  }

  /* ---------- 自己上色（彩笔） ---------- */
  const PEN_COLORS = ['#ef4444', '#f59e0b', '#fde047', '#22c55e', '#38bdf8', '#6366f1', '#a855f7', '#f472b6', '#ffffff', '#111827'];
  const PAINT_W = 248, PAINT_H = 156;   // 涂色画布：跟物体同一个框，2 倍分辨率
  let paintMode = false;
  let penColor = PEN_COLORS[0];
  let penErase = false;
  let paintCv = null;
  let paintCtx = null;
  let paintLoaded = '';
  let painting = false;
  let paintLast = null;
  let paintFlush = 0;

  // 雕出形状之后、抛光完成之前都能自己涂色
  function paintReady() {
    const c = state && state.carve;
    const n = c ? (c.count || 0) : 0;
    return !!c && n >= Forge.CARVE_STEP && n < Forge.CARVE_TOTAL;
  }

  function ensurePaintCanvas() {
    if (paintCv) return paintCv;
    paintCv = document.createElement('canvas');
    paintCv.width = PAINT_W;
    paintCv.height = PAINT_H;
    paintCtx = paintCv.getContext('2d');
    return paintCv;
  }

  // 把已存的涂色载回画布（刷新/搬账号回来还能接着涂）
  function loadPaintFromState() {
    ensurePaintCanvas();
    const url = (state.carve && state.carve.paint) || '';
    if (url === paintLoaded) return;
    paintLoaded = url;
    paintCtx.clearRect(0, 0, PAINT_W, PAINT_H);
    if (!url) { Forge.setPaint(''); return; }
    const img = new Image();
    img.onload = () => {
      paintCtx.clearRect(0, 0, PAINT_W, PAINT_H);
      paintCtx.drawImage(img, 0, 0, PAINT_W, PAINT_H);
      Forge.setPaint(paintCv.toDataURL('image/png'));
    };
    img.src = url;
  }

  function flushPaint() {
    ensurePaintCanvas();
    const url = paintCv.toDataURL('image/png');
    paintLoaded = url;
    if (state.carve) {
      state.carve.paint = url;
      saveState();
    }
    Forge.setPaint(url);
  }

  // 屏幕坐标 -> 涂色画布坐标
  function paintPos(e) {
    const svg = document.querySelector('#forgeScene svg');
    const vb = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
    const r = svg.getBoundingClientRect();
    const x = vb[0] + (e.clientX - r.left) * (vb[2] / (r.width || 1));
    const y = vb[1] + (e.clientY - r.top) * (vb[3] / (r.height || 1));
    const b = Forge.OBJ_BOX;
    return { x: (x - b.x) / b.w * PAINT_W, y: (y - b.y) / b.h * PAINT_H };
  }

  function paintStroke(a, b) {
    ensurePaintCanvas();
    paintCtx.save();
    paintCtx.lineCap = 'round';
    paintCtx.lineJoin = 'round';
    paintCtx.lineWidth = 14;
    if (penErase) {
      paintCtx.globalCompositeOperation = 'destination-out';
      paintCtx.strokeStyle = '#000';
    } else {
      paintCtx.globalCompositeOperation = 'source-over';
      paintCtx.strokeStyle = penColor;
    }
    paintCtx.beginPath();
    paintCtx.moveTo(a.x, a.y);
    paintCtx.lineTo(b.x, b.y);
    paintCtx.stroke();
    paintCtx.restore();
    const now = Date.now();
    if (now - paintFlush > 90) { paintFlush = now; Forge.setPaint(paintCv.toDataURL('image/png')); }
  }

  function markPens() {
    const wrap = $('paintPens');
    if (!wrap) return;
    wrap.querySelectorAll('.pen[data-c]').forEach((b) => {
      b.classList.toggle('on', !penErase && b.dataset.c === penColor);
    });
    const er = $('penErase');
    if (er) er.classList.toggle('on', penErase);
  }

  function renderPens() {
    const wrap = $('paintPens');
    if (!wrap) return;
    if (!wrap.dataset.built) {
      wrap.dataset.built = '1';
      wrap.innerHTML = PEN_COLORS.map((c) => '<button class="pen" data-c="' + c + '" style="background:' + c + '"></button>').join('')
        + '<button id="penErase" class="pen pen-erase">🧽</button>';
      wrap.querySelectorAll('.pen[data-c]').forEach((b) => {
        b.onclick = () => { penColor = b.dataset.c; penErase = false; markPens(); };
      });
      const er = $('penErase');
      if (er) er.onclick = () => { penErase = true; markPens(); };
    }
    markPens();
  }

  function renderPaintBox() {
    const box = $('paintBox');
    if (!box) return;
    const c = state.carve;
    const n = c ? (c.count || 0) : 0;
    const gone = !c || n >= Forge.CARVE_TOTAL;
    box.classList.toggle('hidden', gone);
    if (gone) {
      if (paintMode) togglePaintMode();
      return;
    }
    const ready = paintReady();
    const btn = $('btnPaintMode');
    btn.disabled = !ready;
    btn.classList.toggle('active', paintMode);
    btn.textContent = paintMode ? T('paint.stop') : T('paint.start');
    $('paintPens').classList.toggle('hidden', !paintMode);
    $('paintHint').textContent = ready
      ? T('paint.hint')
      : T('paint.locked', { n: Forge.CARVE_STEP });
    if (paintMode && ready) renderPens();
  }

  function togglePaintMode() {
    if (!paintReady()) { toast(T('paint.locked', { n: Forge.CARVE_STEP }), 3600); return; }
    paintMode = !paintMode;
    if (paintMode) {
      loadPaintFromState();
      renderPens();
      toast(T('paint.hint'), 4000);
    } else {
      flushPaint();
    }
    const scene = $('forgeScene');
    if (scene) scene.classList.toggle('painting', paintMode);
    renderPaintBox();
  }

  function bindPaintSurface() {
    const svg = document.querySelector('#forgeScene svg');
    if (!svg || svg.dataset.paintBound === '1') return;
    svg.dataset.paintBound = '1';
    svg.addEventListener('pointerdown', (e) => {
      if (!paintMode || !paintReady()) return;
      e.preventDefault();
      e.stopPropagation();
      loadPaintFromState();
      painting = true;
      paintLast = paintPos(e);
      try { svg.setPointerCapture(e.pointerId); } catch (err) { }
    });
    svg.addEventListener('pointermove', (e) => {
      if (!painting) return;
      e.preventDefault();
      const p = paintPos(e);
      paintStroke(paintLast, p);
      paintLast = p;
    });
    const end = () => {
      if (!painting) return;
      painting = false;
      paintLast = null;
      flushPaint();
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  }

  /* ---------- 桌上成品（自由摆放，可拖动） ---------- */
  const WORK_MAX = 10;   // 本地存储有限：桌上最多留 10 件

  function freeWorkX() {
    const used = (state.works || []).map((w) => Number(w.x) || 0);
    let x = 175;
    while (x < 480 && used.some((u) => Math.abs(u - x) < 52)) x += 52;
    return Math.min(480, x);
  }

  function addWork() {
    const c = state.carve;
    if (!c) return null;
    if (!Array.isArray(state.works)) state.works = [];
    if (state.works.length >= WORK_MAX) return null;
    const w = {
      id: uid(),
      obj: c.obj || '',
      paint: c.paint || '',
      mat: Forge.matId(state.strikes),
      name: c.name || '',
      x: freeWorkX(),
      y: 318,
    };
    state.works.push(w);
    return w;
  }

  // 150 次雕完：把作品摆到桌上，手上的料清空，等选下一个物体
  function finishWork() {
    const c = state.carve;
    if (!c) return null;
    const w = addWork();
    if (!w) return null;
    state.carve = null;
    if (paintMode) togglePaintMode();
    paintLoaded = '';
    if (paintCtx) paintCtx.clearRect(0, 0, PAINT_W, PAINT_H);
    Forge.setCarve(null);
    Forge.setPaint('');
    saveState();
    renderForgeStats();
    confetti();
    Forge.chime();
    toast(T('work.placed', { name: w.name || '' }), 4400);
    return w;
  }

  function onWorkMove(id, x, y, moved) {
    const w = (state.works || []).find((k) => k.id === id);
    if (!w) return;
    if (!moved) { openWorkModal(id); return; }
    w.x = x;
    w.y = y;
    saveState();
  }

  function openWorkModal(id) {
    const w = (state.works || []).find((k) => k.id === id);
    if (!w) return;
    const mi = Forge.MATERIALS.findIndex((m) => m.id === w.mat);
    const matName = mi >= 0 ? T(Forge.MATERIALS[mi].key) : '';
    openModal(T('work.title'), `
      <p class="muted">${escapeHtml(T('work.hint'))}</p>
      <div class="acct-row"><span class="muted">${escapeHtml(T('carve.objName', { name: w.name || '' }))}</span></div>
      <div class="acct-row"><span class="muted">${escapeHtml(matName)}</span></div>
      <div class="modal-row" style="flex-direction:column;gap:8px">
        <button id="btnWorkDel" class="btn btn-danger btn-block">${escapeHtml(T('work.delete'))}</button>
        <button id="btnWorkClose" class="btn btn-ghost btn-block">${escapeHtml(T('carve.cancel'))}</button>
      </div>`);
    $('btnWorkDel').onclick = () => {
      openModal(T('work.delTitle'), `
        <p>${escapeHtml(T('work.delBody', { name: w.name || '' }))}</p>
        <div class="modal-row">
          <button id="btnWorkDelGo" class="btn btn-danger btn-block">${escapeHtml(T('work.delGo'))}</button>
          <button id="btnWorkDelNo" class="btn btn-ghost btn-block">${escapeHtml(T('carve.cancel'))}</button>
        </div>`);
      $('btnWorkDelGo').onclick = () => {
        state.works = (state.works || []).filter((k) => k.id !== id);
        saveState();
        closeModal();
        renderForgeStats();
        toast(T('work.deleted'));
      };
      $('btnWorkDelNo').onclick = closeModal;
    };
    $('btnWorkClose').onclick = closeModal;
  }

  // 抛光完成后的收尾弹窗
  function openFinishModal(c, placed) {
    openModal(T('finish.title'), `
      <p>${escapeHtml(placed ? T('finish.body', { name: c.name || '' }) : T('work.full', { n: WORK_MAX }))}</p>
      <div class="modal-row" style="flex-direction:column;gap:8px">
        <button id="btnFinishPick" class="btn btn-accent btn-block">${escapeHtml(placed ? T('finish.pick') : T('finish.retry'))}</button>
        ${placed ? '' : '<button id="btnFinishChange" class="btn btn-block">' + escapeHtml(T('carve.btnReplace')) + '</button>'}
        <button id="btnFinishLater" class="btn btn-ghost btn-block">${escapeHtml(placed ? T('finish.later') : T('carve.cancel'))}</button>
      </div>`);
    $('btnFinishPick').onclick = () => {
      if (placed) { closeModal(); openCarvePickModal(); return; }
      const w = finishWork();
      if (w) { closeModal(); openCarvePickModal(); }
      else { toast(T('work.full', { n: WORK_MAX }), 4200); }
    };
    const chg = $('btnFinishChange');
    if (chg) chg.onclick = () => { closeModal(); openCarvePickModal(); };
    $('btnFinishLater').onclick = closeModal;
  }

  /* ---------- 选物体：上传图片 → 拖框圈住 → 自动抠背景 ---------- */
  function openCarvePickModal() {
    cropSel = null;
    cropDrag = null;
    openModal(T('carve.pickTitle'), `
      <p class="muted">${escapeHtml(T('carve.pickIntro'))}</p>
      <div class="crop-wrap">
        <canvas id="cropCanvas" class="crop-canvas"></canvas>
        <div id="cropHintBox" class="crop-hint"></div>
      </div>
      <div class="modal-row"><button id="btnCropFile" class="btn btn-accent">${escapeHtml(T('carve.pickFile'))}</button></div>
      <div class="modal-row">
        <button id="btnCropUse" class="btn btn-accent" disabled>${escapeHtml(T('carve.pickUse'))}</button>
        <button id="btnCropWhole" class="btn" disabled>${escapeHtml(T('carve.pickWhole'))}</button>
        <button id="btnCropCancel" class="btn btn-ghost">${escapeHtml(T('carve.cancel'))}</button>
      </div>
      <div id="cropStatus" class="modal-status"></div>`);
    $('btnCropFile').onclick = () => $('carveImgFile').click();
    $('btnCropUse').onclick = () => useCrop(false);
    $('btnCropWhole').onclick = () => useCrop(true);
    $('btnCropCancel').onclick = closeModal;
    const cv = $('cropCanvas');
    if (cropImg) {
      fitCropCanvas(cv, cropImg);
      drawCrop();
    } else {
      cv.width = 320;
      cv.height = 180;
    }
    $('cropHintBox').classList.toggle('hidden', !!cropImg);
    $('cropHintBox').textContent = T('carve.pickEmpty');
    updateCropButtons();
    bindCropDrag(cv);
  }

  function fitCropCanvas(cv, img) {
    const max = 420;
    const k = Math.min(1, max / Math.max(img.width || max, img.height || max));
    cv.width = Math.max(1, Math.round((img.width || max) * k));
    cv.height = Math.max(1, Math.round((img.height || max) * k));
  }

  function bindCropDrag(cv) {
    if (!cv) return;
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(cv.width, (e.clientX - r.left) * (cv.width / (r.width || 1)))),
        y: Math.max(0, Math.min(cv.height, (e.clientY - r.top) * (cv.height / (r.height || 1)))),
      };
    };
    cv.addEventListener('pointerdown', (e) => {
      if (!cropImg) return;
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch (err) { }
      const p = pos(e);
      cropDrag = p;
      cropSel = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      drawCrop();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!cropDrag) return;
      e.preventDefault();
      const p = pos(e);
      cropSel.x1 = p.x;
      cropSel.y1 = p.y;
      drawCrop();
    });
    const end = () => {
      if (!cropDrag) return;
      cropDrag = null;
      const s = normSel();
      if (s && s.w < 10 && s.h < 10) cropSel = null; // 点一下当没选
      drawCrop();
      updateCropButtons();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
  }

  function normSel() {
    if (!cropSel) return null;
    const x = Math.min(cropSel.x0, cropSel.x1);
    const y = Math.min(cropSel.y0, cropSel.y1);
    return { x: x, y: y, w: Math.abs(cropSel.x1 - cropSel.x0), h: Math.abs(cropSel.y1 - cropSel.y0) };
  }

  function drawCrop() {
    const cv = $('cropCanvas');
    if (!cv || !cropImg) return;
    const cx = cv.getContext('2d');
    cx.clearRect(0, 0, cv.width, cv.height);
    cx.drawImage(cropImg, 0, 0, cv.width, cv.height);
    const s = normSel();
    if (!s || (s.w < 1 && s.h < 1)) return;
    cx.fillStyle = 'rgba(8,12,20,0.55)';
    cx.fillRect(0, 0, cv.width, s.y);
    cx.fillRect(0, s.y + s.h, cv.width, cv.height - s.y - s.h);
    cx.fillRect(0, s.y, s.x, s.h);
    cx.fillRect(s.x + s.w, s.y, cv.width - s.x - s.w, s.h);
    cx.strokeStyle = '#22d3ee';
    cx.lineWidth = 2;
    cx.setLineDash([6, 4]);
    cx.strokeRect(s.x + 1, s.y + 1, Math.max(0, s.w - 2), Math.max(0, s.h - 2));
    cx.setLineDash([]);
  }

  function updateCropButtons() {
    const s = normSel();
    const ok = !!cropImg && !!s && s.w > 10 && s.h > 10;
    const use = $('btnCropUse');
    const whole = $('btnCropWhole');
    if (use) use.disabled = !ok;
    if (whole) whole.disabled = !cropImg;
    const st = $('cropStatus');
    if (st && ok) st.textContent = '';
  }

  function onCropFile() {
    const input = $('carveImgFile');
    const f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    cropName = String(f.name || '').replace(/\.[^.]+$/, '').slice(0, 16) || T('common.object');
    const st = $('cropStatus');
    if (st) st.textContent = T('carve.pickReading');
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        cropImg = img;
        cropSel = null;
        cropDrag = null;
        const cv = $('cropCanvas');
        if (!cv) return;
        fitCropCanvas(cv, img);
        drawCrop();
        updateCropButtons();
        $('cropHintBox').classList.add('hidden');
        if ($('cropStatus')) $('cropStatus').textContent = T('carve.pickNeed');
      };
      img.onerror = () => { if ($('cropStatus')) $('cropStatus').textContent = T('carve.pickFail'); };
      img.src = String(reader.result || '');
    };
    reader.onerror = () => { if ($('cropStatus')) $('cropStatus').textContent = T('carve.pickFail'); };
    reader.readAsDataURL(f);
  }

  function useCrop(whole) {
    if (!cropImg) { toast(T('carve.pickEmpty')); return; }
    const cv = $('cropCanvas');
    const s = whole ? { x: 0, y: 0, w: cv.width, h: cv.height } : normSel();
    if (!s || s.w < 9 || s.h < 9) { toast(T('carve.pickTooSmall')); return; }
    const st = $('cropStatus');
    if (st) st.textContent = T('carve.pickWorking');
    // 先让「正在抠背景…」画出来，再干重活
    setTimeout(() => {
      try {
        const out = cutObject(cv, s);
        if (!out) { if ($('cropStatus')) $('cropStatus').textContent = T('carve.pickFail'); return; }
        state.carve = { obj: out.obj, sil: out.sil, name: cropName || T('common.object'), count: 0, milestone: 0, paint: '' };
        if (paintMode) togglePaintMode();
        paintLoaded = '';
        if (paintCtx) paintCtx.clearRect(0, 0, PAINT_W, PAINT_H);
        saveState();
        closeModal();
        renderForgeStats();
        toast(T('carve.pickDone', { name: state.carve.name }), 3200);
      } catch (e) {
        if ($('cropStatus')) $('cropStatus').textContent = T('carve.pickFail');
      }
    }, 40);
  }

  // 从画布上框选一块，抠掉背景，产出「物体本色图 + 白色剪影图」
  function cutObject(cv, s) {
    const x0 = Math.max(0, Math.round(s.x));
    const y0 = Math.max(0, Math.round(s.y));
    const w = Math.max(1, Math.min(cv.width - x0, Math.round(s.w)));
    const h = Math.max(1, Math.min(cv.height - y0, Math.round(s.h)));
    const px = cv.getContext('2d').getImageData(x0, y0, w, h).data;
    let soft = null;
    // 1) 图片本身带透明通道（已经抠好的 PNG）就直接用
    let tr = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] < 24) tr++;
    if (tr > w * h * 0.08) {
      soft = new Float32Array(w * h);
      for (let p = 0; p < w * h; p++) soft[p] = px[p * 4 + 3] / 255;
    } else {
      // 2) 取边框颜色当中位背景色，从四边洪水填充，只抠与边框相连的背景
      const m = floodBackground(px, w, h);
      if (m) soft = featherMask(m, w, h);
    }
    // 3) 抠不动（背景太花 / 物体贴着边）就退化成圆角方块，保证一定能雕出东西
    if (!soft) soft = roundedMask(w, h);
    // 收紧到物体外接矩形
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (soft[y * w + x] > 0.35) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const k = Math.min(1, 220 / Math.max(bw, bh));
    const ow = Math.max(1, Math.round(bw * k));
    const oh = Math.max(1, Math.round(bh * k));
    const colCv = document.createElement('canvas');
    colCv.width = ow;
    colCv.height = oh;
    const cc = colCv.getContext('2d');
    const colData = cc.createImageData(ow, oh);
    const silCv = document.createElement('canvas');
    silCv.width = ow;
    silCv.height = oh;
    const sc = silCv.getContext('2d');
    const silData = sc.createImageData(ow, oh);
    const cd = colData.data;
    const sd = silData.data;
    for (let y = 0; y < oh; y++) {
      const sy = minY + Math.min(bh - 1, Math.floor(y / k));
      for (let x = 0; x < ow; x++) {
        const sx = minX + Math.min(bw - 1, Math.floor(x / k));
        const sp = sy * w + sx;
        const a = Math.round(Math.max(0, Math.min(1, soft[sp])) * 255);
        const si = (y * ow + x) * 4;
        const ci = sp * 4;
        cd[si] = px[ci];
        cd[si + 1] = px[ci + 1];
        cd[si + 2] = px[ci + 2];
        cd[si + 3] = a;
        sd[si] = 255;
        sd[si + 1] = 255;
        sd[si + 2] = 255;
        sd[si + 3] = a;
      }
    }
    cc.putImageData(colData, 0, 0);
    sc.putImageData(silData, 0, 0);
    return { obj: colCv.toDataURL('image/png'), sil: silCv.toDataURL('image/png'), w: ow, h: oh };
  }

  // 洪水填充抠背景：和边框同色、且能从四边连过来的像素算背景
  function floodBackground(px, w, h) {
    const near = (function () {
      const rs = [], gs = [], bs = [];
      const take = (x, y) => {
        const i = (y * w + x) * 4;
        rs.push(px[i]); gs.push(px[i + 1]); bs.push(px[i + 2]);
      };
      for (let x = 0; x < w; x++) { take(x, 0); take(x, h - 1); }
      for (let y = 0; y < h; y++) { take(0, y); take(w - 1, y); }
      const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
      const br = med(rs), bg = med(gs), bb = med(bs);
      return (i) => {
        const dr = px[i] - br, dg = px[i + 1] - bg, db = px[i + 2] - bb;
        return Math.sqrt(dr * dr + dg * dg + db * db) < 58;
      };
    })();
    const seen = new Uint8Array(w * h);
    const qx = new Int32Array(w * h);
    const qy = new Int32Array(w * h);
    let qs = 0, qe = 0;
    const push = (x, y) => {
      const p = y * w + x;
      if (seen[p] || !near(p * 4)) return;
      seen[p] = 1;
      qx[qe] = x;
      qy[qe] = y;
      qe++;
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (qs < qe) {
      const x = qx[qs], y = qy[qs];
      qs++;
      if (x > 0) push(x - 1, y);
      if (x < w - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < h - 1) push(x, y + 1);
    }
    const m = new Uint8Array(w * h);
    let fg = 0;
    for (let p = 0; p < w * h; p++) {
      if (!seen[p]) { m[p] = 1; fg++; }
    }
    if (fg < w * h * 0.06) return null; // 抠得太干净，八成抠错了
    return m;
  }

  // 边缘羽化一下，雕出来的边不会像刀切
  function featherMask(m, w, h) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            s += m[ny * w + nx];
            c++;
          }
        }
        out[y * w + x] = s / c;
      }
    }
    return out;
  }

  function roundedMask(w, h) {
    const out = new Float32Array(w * h);
    const rx = Math.max(2, w * 0.1);
    const ry = Math.max(2, h * 0.1);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const e = Math.min(Math.min(x, w - 1 - x) / rx, Math.min(y, h - 1 - y) / ry);
        out[y * w + x] = Math.min(1, Math.max(0, e));
      }
    }
    return out;
  }

  function onStoneClick() {
    if (paintMode) return; // 上色模式下点在料上是涂色
    if (!isFree() && state.credit <= 0) {
      toast(T('toast.noCredit'));
      return;
    }
    if (!isFree()) state.credit -= 1;
    state.strikes += 1;
    state.strikesUpdatedAt = Date.now();
    saveState();
    schedulePush();
    renderForgeStats();
    Forge.strike();
  }

  /* ---------- 历史记录 ---------- */
  function renderCalendar() {
    const now = new Date();
    const y = now.getFullYear() + Math.floor((now.getMonth() + calOffset) / 12);
    const m = ((now.getMonth() + calOffset) % 12 + 12) % 12;
    const first = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    $('calTitle').textContent = T('hist.month', { y: y, m: m + 1 });
    const grid = $('calGrid');
    grid.innerHTML = '';
    T('hist.weekdays').split(',').forEach((d) => {
      grid.insertAdjacentHTML('beforeend', '<div class="cal-week">' + escapeHtml(d) + '</div>');
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
    const total = state.strikes; // 只统计自己敲的次数
    $('histStats').innerHTML = `
      <div class="hist-stat"><span>${state.checkedDays.length}</span><label>${escapeHtml(T('hist.checkedDays'))}</label></div>
      <div class="hist-stat"><span>${streak}</span><label>${escapeHtml(T('hist.streak'))}</label></div>
      <div class="hist-stat"><span>${total}</span><label>${escapeHtml(T('hist.totalHits'))}</label></div>`;
    $('calNext').disabled = calOffset >= 0;
  }

  /* ---------- 同步记录弹窗 ---------- */
  function fmtClock(ts) {
    if (!ts) return T('common.never');
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return T('hist.clock', {
      m: d.getMonth() + 1,
      d: d.getDate(),
      t: p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()),
    });
  }
  function openSyncStatModal() {
    const st = state.syncStat || { ok: 0, fail: 0, lastOk: 0, lastFail: 0, log: [] };
    const p = (n) => String(n).padStart(2, '0');
    const lines = st.log.map((e) => {
      const d = new Date(e.t);
      return '<div class="sync-line ' + (e.ok ? 'ok' : 'bad') + '">' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
        + '  ' + (e.ok ? '✓ ' + T('sync.ok') : '✗ ' + T('sync.fail')) + (e.w ? ' · ' + escapeHtml(e.w) : '') + '</div>';
    }).join('') || '<div class="muted" style="text-align:center;padding:8px 0">' + escapeHtml(T('syncModal.empty')) + '</div>';
    openModal(T('syncModal.title'), `
      <p class="muted">${escapeHtml(T('syncModal.intro'))}</p>
      <div class="sync-counts">
        <div class="sync-num ok"><b>${st.ok}</b><span>${escapeHtml(T('syncModal.ok'))}</span></div>
        <div class="sync-num bad"><b>${st.fail}</b><span>${escapeHtml(T('syncModal.fail'))}</span></div>
      </div>
      <div class="muted" style="margin-top:10px">${escapeHtml(T('syncModal.times', { ok: fmtClock(st.lastOk), fail: fmtClock(st.lastFail) }))}</div>
      <div class="sync-list">${lines}</div>
      <div class="modal-row"><button id="btnSyncReset" class="btn btn-ghost btn-sm">${escapeHtml(T('syncModal.clear'))}</button></div>`);
    $('btnSyncReset').onclick = () => {
      state.syncStat = { ok: 0, fail: 0, lastOk: 0, lastFail: 0, log: [] };
      saveState();
      openSyncStatModal();
    };
  }

  /* ---------- 语言切换（用户详情里点中文 / English） ---------- */
  function switchLang(l) {
    if (l === I18N.lang) return;
    I18N.set(l);
    if (state) { state.lang = l; saveState(); }
    applyI18n();
    setAuthMode(authMode);
    if (state) renderAll();
    openAccountModal();
    toast(T(l === 'en' ? 'acct.langEn' : 'acct.langZh'));
  }

  /* ---------- 用户详情弹窗 ---------- */
  function openAccountModal() {
    const acc = state.account;
    const legacy = !acc.pwd;
    const pwdHtml = acc.pwd
      ? '<code class="acct-pwd" id="acctPwdTxt">' + escapeHtml(acc.pwd) + '</code>'
      : '<span class="muted" id="acctPwdTxt">' + escapeHtml(T('acct.pwdLegacy')) + '</span>';
    const lang = I18N.lang;
    const legacyHtml = legacy ? `
      <div class="acct-verify">
        <input id="acctShowOld" class="input" type="password" placeholder="${escapeHtml(T('acct.pwdPh'))}" autocomplete="current-password">
        <button id="btnAcctShow" class="btn btn-accent btn-sm" style="flex:none">${escapeHtml(T('acct.showPwd'))}</button>
      </div>
      <div id="acctShowErr" class="acct-err"></div>` : '';
    openModal(T('acct.title'), `
      <div class="acct-row"><span class="muted">${escapeHtml(T('acct.username'))}</span><b>${escapeHtml(acc.username)}</b></div>
      <div class="acct-row"><span class="muted">${escapeHtml(T('acct.password'))}</span>${pwdHtml}</div>
      <div class="acct-row"><span class="muted">${escapeHtml(T('acct.lang'))}</span>
        <div class="lang-switch">
          <button id="langZh" class="btn btn-sm ${lang === 'zh' ? 'active' : ''}">中文</button>
          <button id="langEn" class="btn btn-sm ${lang === 'en' ? 'active' : ''}">English</button>
        </div>
      </div>
      ${legacyHtml}
      <div class="acct-sep"></div>
      <div class="muted" style="margin-bottom:6px">${escapeHtml(T('acct.chgTitle'))}</div>
      <input id="acctOld" class="input" type="password" placeholder="${escapeHtml(T('acct.oldPh'))}" autocomplete="current-password">
      <input id="acctNew" class="input" type="password" placeholder="${escapeHtml(T('acct.newPh'))}" autocomplete="new-password">
      <div id="acctErr" class="acct-err"></div>
      <div class="modal-row" style="flex-direction:row;justify-content:flex-end"><button id="btnAcctChg" class="btn btn-accent btn-sm">${escapeHtml(T('acct.saveBtn'))}</button></div>
      <div class="acct-sep" style="margin-top:14px"></div>
      <p class="muted" style="font-size:12px;margin-bottom:8px">${escapeHtml(T('acct.backupHint'))}</p>
      <div class="acct-row"><span class="muted">${escapeHtml(T('acct.lastBackup'))}</span><span id="acctBackupTime" class="muted"></span></div>
      <div class="modal-row" style="flex-direction:row;justify-content:flex-end"><button id="btnAcctBackup" class="btn btn-sm">${escapeHtml(T('acct.backupBtn'))}</button></div>`);
    $('btnAcctChg').onclick = saveNewPwd;
    $('acctNew').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveNewPwd(); });
    const showBtn = $('btnAcctShow');
    if (showBtn) {
      showBtn.onclick = showLegacyPwd;
      $('acctShowOld').addEventListener('keydown', (e) => { if (e.key === 'Enter') showLegacyPwd(); });
    }
    $('btnAcctBackup').onclick = openAcctBackupModal;
    $('langZh').onclick = () => switchLang('zh');
    $('langEn').onclick = () => switchLang('en');
    renderBackupTime();
  }

  // 「上次备份」时间：提醒换电脑前先备份一次
  function renderBackupTime() {
    const el = $('acctBackupTime');
    if (!el) return;
    const t = state.lastBackupAt;
    if (!t) { el.textContent = T('acct.neverBackup'); return; }
    const d = new Date(t);
    const p = (n) => String(n).padStart(2, '0');
    el.textContent = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // 旧账号：验证当前密码后补存明文，弹窗立即显示密码
  function showLegacyPwd() {
    const acc = state.account;
    const err = $('acctShowErr');
    const v = $('acctShowOld').value;
    if (!v || acc.hash !== hashStr(acc.salt + ':' + v)) { err.textContent = T('err.passWrongNow'); return; }
    acc.pwd = v;
    saveState();
    toast(T('toast.pwdShown'));
    openAccountModal();
  }

  function saveNewPwd() {
    const acc = state.account;
    const err = $('acctErr');
    const oldP = $('acctOld').value;
    const newP = $('acctNew').value;
    if (!oldP || acc.hash !== hashStr(acc.salt + ':' + oldP)) { err.textContent = T('err.passWrongNow'); return; }
    if (newP.length < 4) { err.textContent = T('err.newPassShort'); return; }
    acc.salt = randomHex(8);
    acc.hash = hashStr(acc.salt + ':' + newP);
    acc.pwd = newP;
    saveState();
    toast(newP === oldP ? T('toast.pwdSaved') : T('toast.pwdChanged'));
    openAccountModal();
  }

  /* ---------- 账号备份 / 恢复（跨电脑搬家，手动码 / 文件，不走云端） ---------- */
  // 备份码：把整个本地账号（含密码、安排、进度、配对信息）打包成 AM1. 开头的字符串
  function buildBackupCode() {
    const rec = JSON.parse(localStorage.getItem(stateKey(state.account.username)));
    return 'AM1.' + b64u(JSON.stringify(rec));
  }

  // 记录一次成功的备份（用户详情里显示「上次备份」时间）
  function markBackupDone() {
    state.lastBackupAt = Date.now();
    saveState();
    renderBackupTime();
  }

  // 下载文本文件（备份文件，方便跨电脑传输：微信文件传输助手 / U盘 / 网盘）
  function downloadTextFile(name, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function backupFileName() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
    return 'stone-mates-backup-' + state.account.username + '-' + stamp + '.txt';
  }

  function openAcctBackupModal() {
    const code = buildBackupCode();
    openModal(T('bk.title'), `
      <p class="muted">${escapeHtml(T('bk.intro'))}</p>
      <textarea id="bkCode" class="modal-textarea" readonly>${escapeHtml(code)}</textarea>
      <div class="modal-row"><button id="btnBkCopy" class="btn btn-accent btn-block">${escapeHtml(T('bk.copy'))}</button></div>
      <div class="modal-row"><button id="btnBkFile" class="btn btn-block">${escapeHtml(T('bk.download'))}</button></div>`);
    $('btnBkCopy').onclick = () => {
      const ta = $('bkCode');
      ta.select();
      try { document.execCommand('copy'); } catch (e) { }
      if (navigator.clipboard) navigator.clipboard.writeText(code).catch(() => { });
      markBackupDone();
      toast(T('toast.backupCopied'));
    };
    $('btnBkFile').onclick = () => {
      downloadTextFile(backupFileName(), code);
      markBackupDone();
      toast(T('toast.backupDownloaded'));
    };
  }

  // 解析备份文本：支持 AM1. 备份码，也容忍把 JSON 直接存成文件的情况
  function parseBackupText(txt) {
    const t = String(txt || '').trim();
    if (!t) return null;
    try { return JSON.parse(b64d(t.replace(/^AM1\./, ''))); } catch (e) { }
    try { return JSON.parse(t); } catch (e) { }
    return null;
  }

  // 恢复：登录页使用，粘贴备份码或选择备份文件后恢复本机同名账号并自动登录
  function openAcctRestoreModal() {
    openModal(T('rs.title'), `
      <p class="muted">${escapeHtml(T('rs.intro'))}</p>
      <textarea id="rsCode" class="modal-textarea" placeholder="${escapeHtml(T('rs.codePh'))}"></textarea>
      <div class="modal-row"><button id="btnRsGo" class="btn btn-accent btn-block">${escapeHtml(T('rs.go'))}</button></div>
      <div id="rsStatus" class="modal-status"></div>`);
    let pendingRec = null; // 已解析、等待二次确认覆盖的记录
    const doRestore = () => {
      const st = $('rsStatus');
      const rec = pendingRec || parseBackupText($('rsCode').value);
      if (!rec || typeof rec !== 'object' || !rec.account || typeof rec.account !== 'object'
          || typeof rec.account.username !== 'string' || !/^[\w\u4e00-\u9fa5-]{2,16}$/.test(rec.account.username)
          || typeof rec.account.salt !== 'string' || typeof rec.account.hash !== 'string') {
        pendingRec = null;
        st.textContent = T('rs.invalid');
        return;
      }
      if (!Array.isArray(rec.schedule)) rec.schedule = [];
      if (!rec.completions || typeof rec.completions !== 'object') rec.completions = {};
      if (!Array.isArray(rec.checkedDays)) rec.checkedDays = [];
      const key = stateKey(rec.account.username);
      const existed = !!localStorage.getItem(key);
      if (existed && !pendingRec) {
        pendingRec = rec;
        st.textContent = T('rs.existsWarn', { u: rec.account.username });
        return;
      }
      try {
        localStorage.setItem(key, JSON.stringify(rec));
        login(rec.account.username);
        closeModal();
        toast(existed ? T('toast.restoredOverwrite') : T('toast.restored'));
      } catch (e) {
        st.textContent = T('rs.fail');
      }
    };
    $('btnRsGo').onclick = doRestore;
    $('rsCode').addEventListener('input', () => { pendingRec = null; });
  }

  /* ---------- 配对卡片 ---------- */
  function renderPair() {
    const card = $('pairCard');
    const b = state.buddy;
    if (!b) {
      card.innerHTML = `
        <div class="pair-row">
          <div>
            <strong>${escapeHtml(T('pair.none'))}</strong>
            <div class="muted">${escapeHtml(T('pair.noneHint'))}</div>
          </div>
          <div class="pair-actions">
            <button id="btnCreatePair" class="btn btn-accent">${escapeHtml(T('pair.create'))}</button>
            <button id="btnJoinPair" class="btn">${escapeHtml(T('pair.join'))}</button>
          </div>
        </div>
        <div class="pair-row" style="margin-top:12px;border-top:1px dashed var(--border);padding-top:12px">
          <div class="muted">${escapeHtml(T('pair.offlineHint'))}</div>
          <div class="pair-actions">
            <button id="btnExport" class="btn btn-sm">${escapeHtml(T('pair.export'))}</button>
            <button id="btnImport" class="btn btn-sm">${escapeHtml(T('pair.import'))}</button>
          </div>
        </div>`;
      $('btnCreatePair').onclick = openCreateModal;
      $('btnJoinPair').onclick = openJoinModal;
      $('btnExport').onclick = openExportModal;
      $('btnImport').onclick = openImportModal;
    } else {
      const online = buddyOnline();
      const manualBtn = connOpen ? '' : '<button id="btnManual" class="btn btn-sm btn-accent">' + escapeHtml(T('pair.manual')) + '</button>';
      const since = b.lastSeen
        ? new Date(b.lastSeen).toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit' })
        : T('common.never');
      card.innerHTML = `
        <div class="pair-row">
          <div>
            <strong>${escapeHtml(T('pair.buddyName', { u: b.username || T('pair.notSynced') }))}</strong>
            <div class="muted"><span class="buddy-dot ${online ? 'dot-on' : 'dot-off'}"></span>${online ? escapeHtml(T('pair.online')) : (b.username ? escapeHtml(T('pair.offline', { code: b.pairCode || '', t: since })) : escapeHtml(T('pair.waiting', { code: b.pairCode || '' })))}</div>
          </div>
          <div class="pair-actions">
            <button id="btnExport" class="btn btn-sm">${escapeHtml(T('pair.export'))}</button>
            <button id="btnImport" class="btn btn-sm">${escapeHtml(T('pair.import'))}</button>
            ${manualBtn}
            <button id="btnUnpair" class="btn btn-sm btn-danger">${escapeHtml(T('pair.unpair'))}</button>
          </div>
        </div>`;
      $('btnExport').onclick = openExportModal;
      $('btnImport').onclick = openImportModal;
      $('btnUnpair').onclick = unpair;
      const mb = $('btnManual'); if (mb) mb.onclick = openManualModal;
    }
  }
  function openCreateModal() {
    const code = makeCode();
    state.buddy = { pairCode: code, role: 'host' };
    saveState();
    renderAll();
    openModal(T('pair.createTitle'), `
      <p class="muted">${escapeHtml(T('pair.createIntro'))}</p>
      <div class="pair-big-code">${code}</div>
      <div class="pair-hint">${escapeHtml(T('pair.createHint'))}</div>
      <div class="modal-row">
        <button id="btnCopyPairCode" class="btn btn-accent">${escapeHtml(T('pair.copyCode'))}</button>
        <button id="btnCreateDone" class="btn">${escapeHtml(T('pair.done'))}</button>
      </div>`);
    $('btnCopyPairCode').onclick = () => {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { }
      document.body.removeChild(ta);
      if (navigator.clipboard) navigator.clipboard.writeText(code).catch(() => { });
      toast(T('toast.pairCopied'));
    };
    $('btnCreateDone').onclick = () => { closeModal(); renderAll(); };
    syncPair({ silent: true });
  }

  function openJoinModal() {
    openModal(T('pair.joinTitle'), `
      <p class="muted">${escapeHtml(T('pair.joinIntro'))}</p>
      <input id="joinCodeInput" class="auth-input" placeholder="${escapeHtml(T('pair.joinPh'))}" maxlength="6" style="text-transform:uppercase">
      <div class="modal-row"><button id="btnJoinGo" class="btn btn-accent btn-block">${escapeHtml(T('pair.joinGo'))}</button></div>
      <div id="joinStatus" class="modal-status"></div>`);
    $('btnJoinGo').onclick = () => {
      const code = $('joinCodeInput').value.trim().toUpperCase();
      if (!/^[A-Z0-9]{4,8}$/.test(code)) { $('joinStatus').textContent = T('pair.joinBad'); return; }
      state.buddy = { pairCode: code, role: 'join' };
      saveState();
      closeModal();
      renderAll();
      toast(T('toast.joined'));
      syncPair({ silent: true });
    };
    $('joinCodeInput').focus();
  }

  function openExportModal() {
    const code = 'SM1.' + b64u(JSON.stringify(buildSnap()));
    openModal(T('pair.exportTitle'), `
      <p class="muted">${escapeHtml(T('pair.exportIntro'))}</p>
      <textarea id="exportCode" class="modal-textarea" readonly>${escapeHtml(code)}</textarea>
      <div class="modal-row"><button id="btnCopyCode" class="btn btn-accent btn-block">${escapeHtml(T('pair.copySync'))}</button></div>`);
    $('btnCopyCode').onclick = () => {
      const ta = $('exportCode');
      ta.select();
      try { document.execCommand('copy'); } catch (e) { }
      if (navigator.clipboard) navigator.clipboard.writeText(code).catch(() => { });
      toast(T('toast.codeCopied'));
    };
  }

  function openImportModal() {
    openModal(T('pair.importTitle'), `
      <p class="muted">${escapeHtml(T('pair.importIntro'))}</p>
      <textarea id="importCode" class="modal-textarea" placeholder="${escapeHtml(T('pair.importPh'))}"></textarea>
      <div class="modal-row"><button id="btnImportGo" class="btn btn-accent btn-block">${escapeHtml(T('pair.importGo'))}</button></div>
      <div id="importStatus" class="modal-status"></div>`);
    $('btnImportGo').onclick = () => {
      const raw = $('importCode').value.trim();
      try {
        const snap = JSON.parse(b64d(raw.replace(/^SM1\./, '')));
        if (mergeBuddySnapshot(snap)) {
          $('importStatus').textContent = T('pair.importOk');
          renderAll();
          setTimeout(closeModal, 1000);
        }
      } catch (e) {
        $('importStatus').textContent = T('pair.importBad');
      }
    };
  }

  function unpair() {
    openModal(T('pair.unpairTitle'), `
      <p>${escapeHtml(T('pair.unpairIntro'))}</p>
      <div class="modal-row"><button id="btnUnpairGo" class="btn btn-danger btn-block">${escapeHtml(T('pair.unpairGo'))}</button></div>`);
    $('btnUnpairGo').onclick = () => {
      state.buddy = null;
      saveState();
      destroyPeer();
      closeModal();
      renderAll();
      toast(T('toast.unpaired'));
    };
  }
  /* ---------- 手动直连（WebRTC 直连，不依赖任何中转服务器） ----------
     原理：两端在浏览器里直接建立 WebRTC 连接，只把「连接邀请 / 应答」两段文本
     通过微信/QQ 互发（复制粘贴），贴回后即建立实时通道。
     适用于自动同步连不上（如 0.peerjs.com 不可达/被墙）的网络环境。 */
  function manualAbort() {
    manualActive = false;
    clearTimeout(manualTimer);
    manualTimer = null;
    try { if (manualPc) manualPc.close(); } catch (e) { }
    manualPc = null;
  }
  function manualPcNew() {
    manualAbort();
    if (!window.RTCPeerConnection) throw new Error(T('manual.errWebrtc'));
    const pc = new RTCPeerConnection({ iceServers: PEER_OPT.config.iceServers });
    manualPc = pc;
    return pc;
  }
  function manualGather(pc) {
    return new Promise((resolve) => {
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(); } };
      if (pc.iceGatheringState === 'complete') { fin(); return; }
      pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') fin(); };
      setTimeout(fin, 3500); // 兜底超时，用已收集到的候选继续
    });
  }
  // 把 RTCDataChannel 包装成与现有连接对象一致的接口，直接复用 setupConn/handleMsg 同步逻辑
  function manualWrapDc(dc) {
    const conn = {
      open: false,
      hs: {},
      on(ev, cb) { (this.hs[ev] = this.hs[ev] || []).push(cb); return this; },
      emit(ev, arg) { (this.hs[ev] || []).forEach((cb) => { try { cb(arg); } catch (e) { } }); },
      send(msg) { if (dc.readyState === 'open') { try { dc.send(JSON.stringify(msg)); } catch (e) { } } },
      close() { try { dc.close(); } catch (e) { } }
    };
    dc.onopen = () => {
      conn.open = true;
      clearTimeout(manualTimer);
      manualTimer = null;
      conn.emit('open');
    };
    dc.onmessage = (ev) => {
      try { conn.emit('data', JSON.parse(ev.data)); } catch (e) { }
    };
    dc.onclose = () => {
      manualActive = false;
      clearTimeout(manualTimer);
      manualTimer = null;
      const wasOpen = conn.open;
      conn.open = false;
      conn.emit('close');
      try { if (manualPc) manualPc.close(); } catch (e) { }
      manualPc = null;
    };
    dc.onerror = () => {
      manualActive = false;
      conn.open = false;
      try { dc.close(); } catch (e) { }
    };
    return conn;
  }
  // 手动建连成功后暂停云端重试；45 秒没建立成功则自动放弃，交回云端自动重试
  function manualArmWatchdog() {
    manualActive = true;
    clearTimeout(manualTimer);
    manualTimer = setTimeout(() => {
      if (!connOpen && manualActive) manualAbort();
    }, 45000);
  }
  async function manualCreateOffer() {
    if (!state || !state.buddy) throw new Error(T('manual.errNoBuddy'));
    const code = state.buddy.pairCode;
    const role = state.buddy.role === 'host' ? 'host' : 'join';
    const pc = manualPcNew();
    const dc = pc.createDataChannel('sm');
    const conn = manualWrapDc(dc);
    setupConn(conn, code, role);
    manualArmWatchdog();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await manualGather(pc);
    return 'SM2.O.' + b64u(pc.localDescription.sdp);
  }
  async function manualAnswerOffer(offerSdp) {
    if (!state || !state.buddy) throw new Error(T('manual.errNoBuddy'));
    const code = state.buddy.pairCode;
    const role = state.buddy.role === 'host' ? 'host' : 'join';
    const pc = manualPcNew();
    pc.ondatachannel = (ev) => {
      const conn = manualWrapDc(ev.channel);
      setupConn(conn, code, role);
    };
    manualArmWatchdog();
    await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    await manualGather(pc);
    return 'SM2.A.' + b64u(pc.localDescription.sdp);
  }
  async function manualAcceptAnswer(answerSdp) {
    if (!manualPc) throw new Error(T('manual.errNoOffer'));
    await manualPc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  }
  function manualCopyText(t) {
    const ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { }
    document.body.removeChild(ta);
    if (navigator.clipboard) navigator.clipboard.writeText(t).catch(() => { });
  }
  function openManualModal() {
    if (connOpen) { toast(T('toast.alreadyConnected')); return; }
    openModal(T('manual.title'), `
      <p class="muted">${escapeHtml(T('manual.intro'))}</p>
      <div class="muted" style="line-height:1.7">${T('manual.steps')}</div>
      <textarea id="manualBox" class="modal-textarea" placeholder="${escapeHtml(T('manual.boxPh'))}" style="margin-top:10px"></textarea>
      <div class="modal-row" style="flex-wrap:wrap">
        <button id="btnManualOffer" class="btn btn-accent">${escapeHtml(T('manual.offer'))}</button>
        <button id="btnManualAnswer" class="btn">${escapeHtml(T('manual.answer'))}</button>
        <button id="btnManualGo" class="btn">${escapeHtml(T('manual.go'))}</button>
        <button id="btnManualCancel" class="btn btn-ghost">${escapeHtml(T('manual.cancel'))}</button>
      </div>
      <div id="manualStatus" class="modal-status"></div>`);
    const st = $('manualStatus');
    const box = $('manualBox');
    $('btnManualOffer').onclick = async () => {
      st.textContent = T('manual.genOffer');
      try {
        const t = await manualCreateOffer();
        box.value = t;
        manualCopyText(t);
        st.textContent = T('manual.offerOk');
        toast(T('toast.inviteCopied'));
      } catch (e) {
        manualAbort();
        st.textContent = T('manual.genFail', { e: String((e && e.message) || e) });
      }
    };
    $('btnManualAnswer').onclick = async () => {
      const raw = box.value.trim();
      if (raw.indexOf('SM2.O.') !== 0) { st.textContent = T('manual.needOffer'); return; }
      st.textContent = T('manual.genAnswer');
      try {
        const t = await manualAnswerOffer(b64d(raw.replace(/^SM2\.O\./, '')));
        box.value = t;
        manualCopyText(t);
        st.textContent = T('manual.answerOk');
        toast(T('toast.answerCopied'));
      } catch (e) {
        manualAbort();
        st.textContent = T('manual.genFailFull', { e: String((e && e.message) || e) });
      }
    };
    $('btnManualGo').onclick = async () => {
      const raw = box.value.trim();
      if (raw.indexOf('SM2.A.') !== 0) { st.textContent = T('manual.needAnswer'); return; }
      st.textContent = T('manual.connecting');
      try {
        await manualAcceptAnswer(b64d(raw.replace(/^SM2\.A\./, '')));
        st.textContent = T('manual.connOk');
        setTimeout(() => { if (connOpen) closeModal(); }, 1200);
      } catch (e) {
        manualAbort();
        st.textContent = T('manual.connFail', { e: String((e && e.message) || e) });
      }
    };
    $('btnManualCancel').onclick = () => { manualAbort(); closeModal(); };
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
    markMissed();
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
    // 账号里记着语言（换电脑用备份码搬过来时一起带过来）；没有就跟当前设置一致
    if (state.lang && state.lang !== I18N.lang) {
      I18N.set(state.lang);
      applyI18n();
      setAuthMode(authMode);
    } else if (!state.lang) {
      state.lang = I18N.lang;
    }
    $('authView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    $('userName').textContent = state.account.username;

    // 渲染出错也绝不能把人留在登录页：先撑开界面，再把问题说出来
    try {
      rollDailyTasks(); // 隔天再打开：先把昨天剩的安排清掉，并提示一声
      Forge.init($('forgeScene'), onStoneClick);
      bindPaintSurface();
      renderAll();
      awardCarve();
    } catch (e) {
      if (window.console) console.error(e);
      toast('⚠️ ' + T('toast.renderFail', { e: (e && e.message) ? e.message : String(e) }), 8000);
    }

    heartbeatTimer = setInterval(() => { if (connOpen) send({ t: 'ping' }); }, 15000);
    // 周期同步：每 5 秒推一次最新进度（连接建立后生效），保证安排/超时状态及时到好友那边
    syncLoopTimer = setInterval(() => {
      if (connOpen) { sendSnapNow(); syncRecord(true, T('sync.reason.periodic')); }
    }, 5000);
    // 限时倒计时秒级刷新 + 到点自动标记超时
    cdTickTimer = setInterval(tickCountdowns, 1000);
    // 跨天自动刷新：顺手清空昨天的安排
    setInterval(() => {
      if (state && todayStr() !== lastToday) {
        lastToday = todayStr();
        rollDailyTasks();
        renderAll();
        awardCarve();
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
    $('authRestore').onclick = openAcctRestoreModal;
    $('authUser').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('authPass').focus(); });
    $('authPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doAuth(); });
    setAuthMode(authMode); // 按当前语言同步登录/注册按钮与占位符文案

    // 顶栏
    $('logoutBtn').onclick = logout;
    $('btnAcct').onclick = openAccountModal;
    $('btnSyncStat').onclick = openSyncStatModal;
    document.querySelectorAll('.tab').forEach((b) => { b.onclick = () => switchView(b.dataset.view); });

    // 石匠工坊：雕刻（攒机会 → 选物体 → 一次一次雕）
    $('btnCarve').onclick = () => {
      const c = state && state.carve;
      const n = c ? (c.count || 0) : 0;
      if (c && n > 0 && n % Forge.CARVE_STEP === 0 && (c.milestone || 0) < n) { openCarveMilestoneModal(); return; }
      onCarve();
    };
    $('btnCarvePick').onclick = askReplaceCarve;
    $('btnPaintMode').onclick = togglePaintMode;
    Forge.onWorkMove = onWorkMove;
    // 点材质那一行看六级材质演化；点雕刻进度条看雕刻过程
    $('matRow').onclick = openMatLadderModal;
    $('carveProgWrap').onclick = openCarveStageModal;
    $('carveImgFile').onchange = onCropFile;

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
      log: dbgLog.slice(),
      syncStat: state && state.syncStat ? { ok: state.syncStat.ok, fail: state.syncStat.fail } : null
    };
  };

  document.addEventListener('DOMContentLoaded', init);
})();
