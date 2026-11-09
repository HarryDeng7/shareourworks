/* ===== 小石客服：帮助窗口与站长反馈 ===== */
(function () {
  'use strict';

  const btnApp = document.getElementById('helpOpen');
  const btnAuth = document.getElementById('helpOpenAuth');
  const btnAdmin = document.getElementById('adminFeedback');
  if (!btnApp && !btnAuth && !btnAdmin) return;

  const chatEndpoint = window.SOW_CHAT_API || '/api/chat';
  const feedbackEndpoint = window.SOW_FEEDBACK_API
    || chatEndpoint.replace(/\/api\/chat\/?$/, '/api/feedback');
  const THREAD_KEY = 'sowHelpThread';
  const USED_KEY = 'sowHelpThreadUsed';
  const history = [];
  let busy = false;
  let panel = null;
  let log = null;
  let input = null;
  let send = null;
  let adminMode = false;
  let adminList = [];
  let adminIndex = 0;
  let replyTimer = null;
  let lastReplyCount = 0;
  let lastEscalatedQuestion = '';

  function isEn() {
    if (window.I18N && window.I18N.lang) return window.I18N.lang === 'en';
    return /^en/i.test(document.documentElement.lang || navigator.language || '');
  }

  function text() {
    return isEn() ? {
      name: 'Stone Support',
      title: 'Stone Support',
      welcome: 'Hi, I’m Stone Support. Ask me how to add tasks, check in, pair with a buddy, carve, upload an image, or find your history.',
      placeholder: 'Ask a question about using this site…',
      send: 'Send',
      close: 'Close',
      note: 'Only your questions are sent. Account data, tasks, and images are not. If I’m unsure, I’ll forward the question to the owner.',
      pending: 'Thinking…',
      escalated: 'I’m not sure about that, so I’ve sent it to the owner. Replies will appear here.',
      escalateFail: 'I’m not sure about that, and I could not reach the owner right now. Please try again later.',
      admin: 'Feedback',
      adminTitle: 'Owner Feedback',
      adminReply: 'Reply and next',
      adminNext: 'Next',
      adminEmpty: 'No unanswered feedback.',
      adminForbidden: 'Only the 222 account can view feedback.',
      adminUnavailable: 'Feedback is unavailable right now. The database may not be connected.',
      adminNeedText: 'Write a reply first.',
      adminSent: 'Reply saved.',
      adminCount: 'Item {n} / {total}',
    } : {
      name: '小石客服',
      title: '小石客服',
      welcome: '你好，我是小石客服。可以问我怎么添加安排、打卡、和好友配对、雕刻、上传图片，或者查看历史记录。',
      placeholder: '问一个关于使用的问题…',
      send: '发送',
      close: '关闭',
      note: '只发送你的问题，不会发送账号、任务或图片。如果我没把握，会把问题转给站长。',
      pending: '正在回复…',
      escalated: '这个问题我没把握，已经转给站长。回复会显示在这里。',
      escalateFail: '这个问题我没把握，暂时无法转交，请稍后再试。',
      admin: '反馈',
      adminTitle: '站长反馈',
      adminReply: '回复并下一条',
      adminNext: '下一条',
      adminEmpty: '没有未回复的反馈。',
      adminForbidden: '只有 222 账号可以查看反馈。',
      adminUnavailable: '反馈暂时不可用，数据库可能还没连接。',
      adminNeedText: '先写一句回复。',
      adminSent: '回复已保存。',
      adminCount: '第 {n} / {total} 条',
    };
  }

  const faq = [
    { k: ['添加安排', '添加任务', '新建任务', 'add task', 'new task', 'add a task'],
      zh: '在「我的安排」下面输入任务文字，点「添加」。可以顺便填完成时间，或选一个限时倒计时。',
      en: 'Under My Plan, type the task and press Add. You can also set a finish time or a countdown.' },
    { k: ['打卡', 'check in', 'checkin'],
      zh: '双方都完成今天的全部安排后，「打卡」按钮才会亮。打卡会获得 1 次敲击机会。',
      en: 'The Check in button unlocks when both you and your buddy finish all of today’s tasks. Checking in earns 1 strike.' },
    { k: ['配对', '好友', 'buddy', 'pair'],
      zh: '在好友卡片里点「创建配对码」发给对方，或点「输入配对码」加入。配对后每 5 秒同步一次进度。',
      en: 'Create a pair code and send it to your buddy, or enter their code. Progress syncs about every 5 seconds.' },
    { k: ['雕刻机会', 'carve', '选物体', '选择物体', 'object'],
      zh: '完成自己今天的全部安排会获得雕刻机会。第一次先点「选择物体」，上传图片并框住要雕的东西。',
      en: 'Finish all of your own tasks today to earn a carve. First choose an object: upload an image and frame the object.' },
    { k: ['上色', '彩笔', '橡皮', 'paint', 'eraser'],
      zh: '雕到第 50 次后可以开始上色。选一支笔在料上拖动，橡皮可以擦掉；是否涂色不影响进度。',
      en: 'After 50 carves you can paint. Pick a pen and drag on the piece; the eraser removes paint. Painting does not affect progress.' },
    { k: ['抛光', '完成', '杰作', 'polish', 'finish'],
      zh: '第 100 次后只剩抛光，再雕 50 次完成。作品会摆到桌上，最多 10 件，可以拖动或删除。',
      en: 'After carve 100 only polishing remains; 50 more carves finish it. The work moves to the table; up to 10, draggable and deletable.' },
    { k: ['图片', '上传', '相册', '文件', 'upload', 'image', 'photo'],
      zh: '点「选择图片」会打开系统相册/文件选择。如果没反应，试试用手机自带浏览器打开，不要在微信内置浏览器里操作。',
      en: 'Choose image opens the system gallery/file picker. If nothing happens, try your phone’s browser instead of an in-app browser.' },
    { k: ['保存', 'save', '失败'],
      zh: '右上角会显示「保存中… / 已保存 / 保存失败」。失败时等自动重试，或换一张小一点的图片。',
      en: 'The top-right shows Saving…, Saved, or Save failed. On failure, wait for the retry or use a smaller image.' },
    { k: ['历史', '日历', '连续', 'history', 'calendar', 'streak'],
      zh: '「历史记录」里可以看打卡日历、连续打卡天数和累计敲击次数。',
      en: 'History shows your check-in calendar, current streak, and total hits.' },
    { k: ['时间', '超时', '截止', '倒计时', 'deadline', 'expired', 'countdown'],
      zh: '任务可以填完成时间或限时倒计时。到点还没完成会打叉，按未完成计算，需要删除后才能继续。',
      en: 'Tasks can have a finish time or countdown. When time runs out they are marked expired and count as unfinished; delete them to continue.' },
    { k: ['密码', '登录', '账号', 'password', 'login', 'account'],
      zh: '账号用用户名和密码登录。目前没有自动找回密码或修改密码功能；请不要把密码发给任何人。',
      en: 'Sign in with your username and password. There is no automatic password reset or change yet. Never share your password.' },
    { k: ['窗口', '客服', 'help', 'support'],
      zh: '左上角的「小石客服」可以随时打开这个帮助窗口。',
      en: 'The Stone Support button at the top-left opens this help window at any time.' },
  ];

  function fallbackAnswer(question) {
    const q = String(question || '').toLowerCase();
    for (const item of faq) {
      if (item.k.some((word) => q.includes(word.toLowerCase()))) {
        return { text: isEn() ? item.en : item.zh, escalate: false };
      }
    }
    return {
      text: isEn()
        ? 'I only know the basics of this page. Ask me about adding tasks, checking in, pairing, carving, painting, uploading images, saving, or history.'
        : '我暂时只了解这个页面的基本用法。你可以问：添加安排、打卡、配对、雕刻、上色、上传图片、保存或历史记录。',
      escalate: true,
    };
  }

  function token() {
    try {
      let value = localStorage.getItem(THREAD_KEY);
      if (!value) {
        value = (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : ('sow' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
        localStorage.setItem(THREAD_KEY, value);
      }
      return value;
    } catch (e) {
      return 'sow' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    }
  }

  function threadUsed() {
    try { return localStorage.getItem(USED_KEY) === '1'; } catch (e) { return false; }
  }

  function markThreadUsed() {
    try { localStorage.setItem(USED_KEY, '1'); } catch (e) { }
  }

  function addMessage(role, content, pending) {
    const el = document.createElement('div');
    el.className = 'help-msg ' + role + (pending ? ' pending' : '');
    el.textContent = content;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  async function submitFeedback(question, transcript) {
    if (lastEscalatedQuestion === question) return true;
    try {
      const response = await fetch(feedbackEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          question: question,
          transcript: transcript.slice(-8),
          token: token(),
          lang: isEn() ? 'en' : 'zh',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) return false;
      lastEscalatedQuestion = question;
      lastReplyCount = 0;
      markThreadUsed();
      return true;
    } catch (e) {
      return false;
    }
  }

  async function fetchReplies() {
    if (!threadUsed() || adminMode) return;
    try {
      const response = await fetch(feedbackEndpoint + '?token=' + encodeURIComponent(token()));
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok || !Array.isArray(data.replies)) return;
      if (data.replies.length <= lastReplyCount) return;
      for (let i = lastReplyCount; i < data.replies.length; i++) {
        const reply = data.replies[i];
        if (reply && reply.text) {
          addMessage('bot', (isEn() ? 'Owner: ' : '站长：') + reply.text);
        }
      }
      lastReplyCount = data.replies.length;
    } catch (e) { }
  }

  function syncText() {
    const t = text();
    [btnApp, btnAuth, btnAdmin].forEach((b) => { if (b) b.textContent = b === btnAdmin ? t.admin : t.name; });
    if (!panel) return;
    panel.querySelector('.help-title').textContent = adminMode ? t.adminTitle : t.title;
    panel.querySelector('.help-close').textContent = t.close;
    panel.querySelector('.help-note').textContent = t.note;
    input.placeholder = t.placeholder;
    send.textContent = t.send;
    panel.querySelector('.help-admin-send').textContent = t.adminReply;
    panel.querySelector('.help-admin-next').textContent = t.adminNext;
    if (!adminMode && !log.children.length) addMessage('bot', t.welcome);
  }

  function buildPanel() {
    panel = document.createElement('section');
    panel.id = 'helpPanel';
    panel.className = 'help-panel hidden';
    panel.innerHTML = [
      '<div class="help-head"><span class="help-title"></span><button type="button" class="help-close"></button></div>',
      '<div class="help-log" aria-live="polite"></div>',
      '<div class="help-note"></div>',
      '<form class="help-form"><input class="help-input" type="text" maxlength="500" autocomplete="off"><button class="help-send" type="submit"></button></form>',
      '<div class="help-admin hidden">',
      '  <div class="help-admin-meta"></div>',
      '  <div class="help-admin-question"></div>',
      '  <textarea class="help-admin-reply" maxlength="1000"></textarea>',
      '  <div class="help-admin-actions"><button type="button" class="help-send help-admin-send"></button><button type="button" class="help-admin-next"></button></div>',
      '  <div class="help-admin-status"></div>',
      '</div>',
    ].join('');
    document.body.appendChild(panel);
    log = panel.querySelector('.help-log');
    input = panel.querySelector('.help-input');
    send = panel.querySelector('.help-send');
    panel.querySelector('.help-close').onclick = close;
    panel.querySelector('.help-form').onsubmit = (event) => {
      event.preventDefault();
      ask(input.value);
    };
    panel.querySelector('.help-admin-send').onclick = adminReply;
    panel.querySelector('.help-admin-next').onclick = adminNext;
  }

  async function ask(raw) {
    const question = String(raw || '').trim();
    if (!question || busy) return;
    input.value = '';
    busy = true;
    send.disabled = true;
    addMessage('user', question);
    history.push({ role: 'user', content: question });
    const pending = addMessage('bot', text().pending, true);
    let answer = null;
    let escalate = false;
    try {
      const response = await fetch(chatEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-8), lang: isEn() ? 'en' : 'zh' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok || !data.reply) throw new Error(data.error || 'bad_reply');
      answer = data.reply;
      escalate = !!data.escalate;
    } catch (error) {
      const local = fallbackAnswer(question);
      answer = local.text;
      escalate = local.escalate;
    }
    pending.classList.remove('pending');
    pending.textContent = answer;
    history.push({ role: 'assistant', content: answer });
    if (escalate) {
      const sent = await submitFeedback(question, history);
      addMessage('bot', sent ? text().escalated : text().escalateFail);
    }
    if (history.length > 8) history.splice(0, history.length - 8);
    busy = false;
    send.disabled = false;
    log.scrollTop = log.scrollHeight;
    input.focus();
  }

  function showChat() {
    adminMode = false;
    panel.querySelector('.help-log').classList.remove('hidden');
    panel.querySelector('.help-note').classList.remove('hidden');
    panel.querySelector('.help-form').classList.remove('hidden');
    panel.querySelector('.help-admin').classList.add('hidden');
    if (!log.children.length) addMessage('bot', text().welcome);
    syncText();
    fetchReplies();
  }

  function showAdmin() {
    adminMode = true;
    panel.querySelector('.help-log').classList.add('hidden');
    panel.querySelector('.help-note').classList.add('hidden');
    panel.querySelector('.help-form').classList.add('hidden');
    panel.querySelector('.help-admin').classList.remove('hidden');
    syncText();
    loadAdmin();
  }

  async function loadAdmin() {
    const status = panel.querySelector('.help-admin-status');
    const meta = panel.querySelector('.help-admin-meta');
    const question = panel.querySelector('.help-admin-question');
    const reply = panel.querySelector('.help-admin-reply');
    status.textContent = '…';
    meta.textContent = '';
    question.textContent = '';
    reply.value = '';
    try {
      const response = await fetch(feedbackEndpoint + '?admin=1', { credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (response.status === 403) { status.textContent = text().adminForbidden; return; }
      if (!response.ok || !data.ok) { status.textContent = text().adminUnavailable; return; }
      adminList = Array.isArray(data.items) ? data.items : [];
      adminIndex = 0;
      if (!adminList.length) { status.textContent = text().adminEmpty; return; }
      renderAdmin();
    } catch (e) {
      status.textContent = text().adminUnavailable;
    }
  }

  function renderAdmin() {
    const t = text();
    const item = adminList[adminIndex];
    const status = panel.querySelector('.help-admin-status');
    const meta = panel.querySelector('.help-admin-meta');
    const question = panel.querySelector('.help-admin-question');
    const reply = panel.querySelector('.help-admin-reply');
    if (!item) {
      meta.textContent = '';
      question.textContent = '';
      reply.value = '';
      status.textContent = t.adminEmpty;
      return;
    }
    meta.textContent = item.username + ' · ' + (item.createdAt || '') + ' · ' + t.adminCount
      .replace('{n}', String(adminIndex + 1)).replace('{total}', String(adminList.length));
    const lines = [item.question || ''];
    if (Array.isArray(item.transcript) && item.transcript.length) {
      lines.push('', (isEn() ? 'Conversation:' : '对话记录：'));
      item.transcript.forEach((m) => {
        lines.push((m.role === 'user' ? (isEn() ? 'User: ' : '用户：') : (isEn() ? 'Assistant: ' : '客服：')) + (m.content || ''));
      });
    }
    question.textContent = lines.join('\n');
    reply.value = '';
    status.textContent = '';
    reply.focus();
  }

  async function adminReply() {
    const item = adminList[adminIndex];
    const reply = panel.querySelector('.help-admin-reply');
    const status = panel.querySelector('.help-admin-status');
    if (!item) return;
    const value = reply.value.trim();
    if (!value) { status.textContent = text().adminNeedText; return; }
    try {
      const response = await fetch(feedbackEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reply', id: item.id, text: value }),
        credentials: 'same-origin',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        status.textContent = response.status === 403 ? text().adminForbidden : text().adminUnavailable;
        return;
      }
      adminList.splice(adminIndex, 1);
      if (adminIndex >= adminList.length) adminIndex = 0;
      renderAdmin();
      status.textContent = adminList.length ? text().adminSent : text().adminEmpty;
    } catch (e) {
      status.textContent = text().adminUnavailable;
    }
  }

  function adminNext() {
    if (!adminList.length) return;
    adminIndex = (adminIndex + 1) % adminList.length;
    renderAdmin();
  }

  function open() {
    if (!panel) buildPanel();
    panel.classList.remove('hidden');
    [btnApp, btnAuth].forEach((b) => { if (b) b.setAttribute('aria-expanded', 'true'); });
    showChat();
    setTimeout(() => input && input.focus(), 30);
    if (replyTimer) clearInterval(replyTimer);
    replyTimer = setInterval(fetchReplies, 20000);
  }

  function openAdmin() {
    if (!panel) buildPanel();
    panel.classList.remove('hidden');
    showAdmin();
  }

  function close() {
    if (!panel) return;
    panel.classList.add('hidden');
    [btnApp, btnAuth].forEach((b) => { if (b) b.setAttribute('aria-expanded', 'false'); });
    if (replyTimer) { clearInterval(replyTimer); replyTimer = null; }
  }

  function toggle() {
    if (panel && !panel.classList.contains('hidden')) close();
    else open();
  }

  [btnApp, btnAuth].forEach((b) => {
    if (!b) return;
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', toggle);
  });
  if (btnAdmin) btnAdmin.addEventListener('click', openAdmin);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  new MutationObserver(syncText).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['lang'],
  });
  syncText();
})();
