/* ===== 敲石工坊 · 石匠场景 ===== */
(function () {
  'use strict';

  const VIEW_W = 640, VIEW_H = 420;

  const STAGES = [
    [0, '原石'],
    [8, '初凿'],
    [25, '打形'],
    [50, '精雕'],
    [90, '渐成'],
    [150, '杰作'],
  ];
  const CARVE_MAX = 150; // 雕成杰作所需总敲击数

  /* ---------- 音效（WebAudio，无需素材） ---------- */
  const sound = {
    ctx: null,
    ensure() {
      if (!this.ctx) {
        try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { }
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    tone(freq, freqEnd, dur, gain, type) {
      const c = this.ensure();
      if (!c) return;
      const t = c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'triangle';
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur + 0.02);
    },
    clink() { this.tone(1680, 520, 0.09, 0.22, 'triangle'); this.tone(840, 300, 0.06, 0.1, 'sine'); },
    thud() { this.tone(95, 52, 0.12, 0.32, 'sine'); },
    chime() {
      this.tone(880, 880, 0.18, 0.16, 'triangle');
      setTimeout(() => this.tone(1318, 1318, 0.3, 0.18, 'triangle'), 140);
    },
  };

  /* ---------- 场景 SVG ---------- */
  function sceneSVG() {
    return `
<svg viewBox="0 0 ${VIEW_W} ${VIEW_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1a2440"/><stop offset="1" stop-color="#101a2e"/>
    </linearGradient>
    <linearGradient id="floorGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0e1626"/><stop offset="1" stop-color="#0a101d"/>
    </linearGradient>
    <linearGradient id="stoneGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7b8ba1"/><stop offset="1" stop-color="#475569"/>
    </linearGradient>
    <linearGradient id="woodGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a16207"/><stop offset="1" stop-color="#7c4a1e"/>
    </linearGradient>
    <radialGradient id="warmGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#f59e0b" stop-opacity="0.22"/><stop offset="1" stop-color="#f59e0b" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="statueClip"><rect id="statueClipRect" x="272" y="252" width="96" height="52"/></clipPath>
  </defs>

  <!-- 墙壁 -->
  <rect x="0" y="0" width="${VIEW_W}" height="262" fill="url(#wallGrad)"/>
  <g stroke="#26324d" stroke-width="1.5" opacity="0.55">
    <line x1="0" y1="52" x2="${VIEW_W}" y2="52"/>
    <line x1="0" y1="92" x2="${VIEW_W}" y2="92"/>
    <line x1="0" y1="132" x2="${VIEW_W}" y2="132"/>
    <line x1="0" y1="172" x2="${VIEW_W}" y2="172"/>
    <line x1="0" y1="212" x2="${VIEW_W}" y2="212"/>
    <line x1="0" y1="252" x2="${VIEW_W}" y2="252"/>
    <line x1="70" y1="0" x2="70" y2="52"/><line x1="230" y1="0" x2="230" y2="52"/><line x1="390" y1="0" x2="390" y2="52"/><line x1="550" y1="0" x2="550" y2="52"/>
    <line x1="150" y1="52" x2="150" y2="92"/><line x1="310" y1="52" x2="310" y2="92"/><line x1="470" y1="52" x2="470" y2="92"/>
    <line x1="70" y1="92" x2="70" y2="132"/><line x1="230" y1="92" x2="230" y2="132"/><line x1="390" y1="92" x2="390" y2="132"/><line x1="550" y1="92" x2="550" y2="132"/>
    <line x1="150" y1="132" x2="150" y2="172"/><line x1="310" y1="132" x2="310" y2="172"/><line x1="470" y1="132" x2="470" y2="172"/>
    <line x1="70" y1="172" x2="70" y2="212"/><line x1="230" y1="172" x2="230" y2="212"/><line x1="390" y1="172" x2="390" y2="212"/><line x1="550" y1="172" x2="550" y2="212"/>
  </g>

  <!-- 地面 -->
  <rect x="0" y="262" width="${VIEW_W}" height="${VIEW_H - 262}" fill="url(#floorGrad)"/>
  <g stroke="#18233a" stroke-width="1.5" opacity="0.6">
    <line x1="0" y1="312" x2="${VIEW_W}" y2="312"/>
    <line x1="0" y1="362" x2="${VIEW_W}" y2="362"/>
    <line x1="0" y1="412" x2="${VIEW_W}" y2="412"/>
    <line x1="90" y1="262" x2="60" y2="312"/><line x1="290" y1="262" x2="270" y2="312"/>
    <line x1="500" y1="262" x2="520" y2="312"/><line x1="170" y1="312" x2="140" y2="362"/>
    <line x1="370" y1="312" x2="400" y2="362"/><line x1="560" y1="362" x2="590" y2="412"/>
  </g>

  <!-- 石匠（坐在桌后） -->
  <g class="mason-body">
    <!-- 躯干 -->
    <path d="M286,150 C286,120 354,120 354,150 L354,262 C354,280 286,280 286,262 Z" fill="#92400e"/>
    <path d="M286,150 C286,120 354,120 354,150 L354,170 L286,170 Z" fill="#a16207" opacity="0.5"/>
    <rect x="286" y="240" width="68" height="9" rx="3" fill="#f59e0b"/>
    <!-- 头 -->
    <circle cx="320" cy="116" r="24" fill="#eab98a"/>
    <g class="eyes">
      <circle cx="310" cy="114" r="3.2" fill="#1e293b"/>
      <circle cx="330" cy="114" r="3.2" fill="#1e293b"/>
    </g>
    <path d="M307,127 Q320,133 333,127" stroke="#64748b" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M318,133 L320,140 L322,133 Z" fill="#94a3b8"/>
    <!-- 斗笠 -->
    <ellipse cx="320" cy="88" rx="37" ry="8" fill="#eab308"/>
    <path d="M287,88 L320,50 L353,88 Z" fill="#d97706"/>
    <rect x="299" y="78" width="42" height="7" rx="3" fill="#a16207"/>
    <!-- 左手（搭在桌上） -->
    <path d="M292,168 Q252,212 240,286" stroke="#92400e" stroke-width="16" fill="none" stroke-linecap="round"/>
    <circle cx="240" cy="288" r="9" fill="#eab98a"/>
    <!-- 右手 + 锤子（抬起待击） -->
    <g id="armR">
      <path d="M348,166 Q390,158 420,182" stroke="#92400e" stroke-width="15" fill="none" stroke-linecap="round"/>
      <path d="M420,182 L436,202" stroke="#92400e" stroke-width="13" fill="none" stroke-linecap="round"/>
      <circle cx="420" cy="182" r="8.5" fill="#eab98a"/>
      <line x1="420" y1="182" x2="440" y2="160" stroke="#a16207" stroke-width="6" stroke-linecap="round"/>
      <rect x="426" y="153" width="30" height="15" rx="4" fill="#94a3b8" stroke="#64748b" stroke-width="1.5" transform="rotate(48 441 160)"/>
    </g>
  </g>
  <!-- 桌子 -->
  <path d="M120,300 L520,300 L560,342 L80,342 Z" fill="url(#woodGrad)" stroke="#5b3412" stroke-width="2"/>
  <rect x="130" y="342" width="380" height="13" fill="#8a5522"/>
  <rect x="150" y="355" width="15" height="50" fill="#5b3412"/>
  <rect x="475" y="355" width="15" height="50" fill="#5b3412"/>
  <ellipse cx="320" cy="398" rx="190" ry="16" fill="#000" opacity="0.3"/>

  <!-- 石头 -->
  <ellipse cx="320" cy="303" rx="52" ry="10" fill="#f59e0b" opacity="0.14"/>
  <g id="stone" class="stone-hit">
    <path id="stoneShape" d="M284,300 C281,268 302,252 330,252 C358,252 379,268 376,300 Z" fill="url(#stoneGrad)" stroke="#334155" stroke-width="2"/>
    <ellipse cx="312" cy="270" rx="13" ry="5.5" fill="#94a3b8" opacity="0.35"/>
    <g id="cracks" stroke="#0f172a" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0">
      <path d="M308,262 L316,278 L311,292"/>
      <path d="M340,258 L333,274 L344,288"/>
      <path d="M322,296 L316,301"/>
    </g>
    <g id="statue" clip-path="url(#statueClip)" opacity="0">
      <path d="M296,302 C296,282 306,272 320,272 C334,272 344,282 344,302 Z" fill="#cbd5e1"/>
      <circle cx="320" cy="264" r="10" fill="#cbd5e1"/>
      <rect x="294" y="298" width="52" height="7" rx="2" fill="#94a3b8"/>
    </g>
  </g>
  <ellipse cx="320" cy="300" rx="66" ry="9" fill="#000" opacity="0.25"/>
</svg>`;
  }

  /* ---------- 场景控制 ---------- */
  const Forge = {
    el: null,
    svg: null,
    armEl: null,
    stoneEl: null,
    cracksEl: null,
    statueEl: null,
    clipRectEl: null,
    statueOpacity: 0,
    armAngle: 0,
    busy: false,
    onStoneClick: null,

    init(container, cb) {
      this.el = container;
      this.svg = null;
      this.onStoneClick = cb || null;
      container.innerHTML = sceneSVG();
      const svg = container.querySelector('svg');
      this.svg = svg;
      this.armEl = svg.querySelector('#armR');
      this.stoneEl = svg.querySelector('#stone');
      this.cracksEl = svg.querySelector('#cracks');
      this.statueEl = svg.querySelector('#statue');
      this.clipRectEl = svg.querySelector('#statueClipRect');

      // 手臂动画需要以肩部为原点（viewBox 坐标系）
      this.armEl.style.transformBox = 'view-box';
      this.armEl.style.transformOrigin = '348px 168px';
      this.armEl.style.transform = 'rotate(0deg)';
      this.stoneEl.style.transformBox = 'fill-box';
      this.stoneEl.style.transformOrigin = '50% 90%';

      this.stoneEl.addEventListener('click', (e) => {
        e.stopPropagation();
        sound.ensure();
        if (this.busy) return;
        if (this.onStoneClick) this.onStoneClick();
      });
      svg.addEventListener('click', () => sound.ensure());
      document.addEventListener('pointerdown', () => sound.ensure(), { once: true });

      // 眨眼
      this.blinkTimer = setInterval(() => {
        const eyes = svg.querySelector('.eyes');
        if (!eyes) return;
        eyes.classList.add('blink');
        setTimeout(() => eyes.classList.remove('blink'), 160);
      }, 3400);
    },

    /* 更新统计与雕刻进度 */
    update({ total }) {
      total = total || 0;
      this.statueOpacity = Math.min(1, total / CARVE_MAX) * 0.95;
      this.statueEl.style.opacity = this.statueOpacity.toFixed(3);
      this.cracksEl.style.opacity = (Math.min(1, total / 50) * 0.8).toFixed(3);

      let stageName = STAGES[0][1], next = null, prog = 0;
      for (let i = 0; i < STAGES.length; i++) {
        const [t, n] = STAGES[i];
        if (total >= t) { stageName = n; next = STAGES[i + 1] || null; prog = t; }
      }
      const bar = document.getElementById('carveBar');
      const stageEl = document.getElementById('carveStage');
      const textEl = document.getElementById('carveText');
      if (bar) bar.style.width = Math.min(100, (total / CARVE_MAX) * 100).toFixed(1) + '%';
      if (stageEl) stageEl.textContent = stageName;
      if (textEl) {
        textEl.textContent = next
          ? '距「' + next[1] + '」还差 ' + (next[0] - total) + ' 下'
          : '已雕成杰作，继续创造纪录吧！';
      }
      void prog;
    },
    /* 敲击动画 */
    async strike() {
      if (this.busy || !this.armEl) return false;
      this.busy = true;
      try {
        // 1. 抡起锤子
        await this.animArm(-30, 130, 'ease-out');
        // 2. 砸下
        this.animArm(80, 105, 'cubic-bezier(.2,1.7,.3,1)');
        this.impact();
        sound.clink();
        sound.thud();
        await sleep(115);
        // 3. 收回来
        await this.animArm(0, 480, 'ease-out');
      } finally {
        this.busy = false;
      }
      return true;
    },

    animArm(toDeg, ms, easing) {
      const from = this.armAngle;
      return new Promise((resolve) => {
        const anim = this.armEl.animate(
          [{ transform: 'rotate(' + from + 'deg)' }, { transform: 'rotate(' + toDeg + 'deg)' }],
          { duration: ms, easing: easing || 'ease-out' }
        );
        anim.onfinish = () => {
          this.armAngle = toDeg;
          this.armEl.style.transform = 'rotate(' + toDeg + 'deg)';
          resolve();
        };
      });
    },

    impact() {
      const svg = this.svg;
      // 石头震动
      this.stoneEl.animate(
        [
          { transform: 'translate(0,0) rotate(0)' },
          { transform: 'translate(3px,-2px) rotate(1.5deg)' },
          { transform: 'translate(-3px,1px) rotate(-1.5deg)' },
          { transform: 'translate(0,0) rotate(0)' },
        ],
        { duration: 340, easing: 'ease-out' }
      );
      // 裂纹闪光
      this.cracksEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320 });

      const CX = 366, CY = 254; // 锤子落点
      // 火星
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (0.15 + 0.7 * Math.random()) * (i % 2 ? 1 : -1) - Math.PI / 2;
        const dist = 26 + Math.random() * 30;
        const dur = 380 + Math.random() * 240;
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', CX); c.setAttribute('cy', CY);
        c.setAttribute('r', 1.6 + Math.random() * 2);
        c.setAttribute('fill', i % 3 === 0 ? '#fbbf24' : '#fcd34d');
        svg.appendChild(c);
        c.animate(
          [
            { transform: 'translate(0,0)', opacity: 1 },
            { transform: 'translate(' + Math.cos(a) * dist + 'px,' + (Math.sin(a) * dist + 24) + 'px)', opacity: 0 },
          ],
          { duration: dur, easing: 'cubic-bezier(.1,.6,.3,1)' }
        ).onfinish = () => c.remove();
      }
      // 碎石屑
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
        const d = 18 + Math.random() * 16;
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', CX + 8); c.setAttribute('cy', CY);
        c.setAttribute('r', 1.2 + Math.random());
        c.setAttribute('fill', '#94a3b8');
        svg.appendChild(c);
        c.animate(
          [
            { transform: 'translate(0,0)', opacity: 1 },
            { transform: 'translate(' + Math.cos(a) * d + 'px,' + (Math.sin(a) * d) + 'px)', opacity: 0 },
          ],
          { duration: 420, easing: 'ease-out' }
        ).onfinish = () => c.remove();
      }
      // 叮！提示
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', CX + 22); t.setAttribute('y', CY - 12);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-size', '19');
      t.setAttribute('font-weight', 'bold');
      t.setAttribute('fill', '#fbbf24');
      t.textContent = '叮!';
      svg.appendChild(t);
      t.animate(
        [
          { transform: 'translate(0,0)', opacity: 1 },
          { transform: 'translate(0,-26px)', opacity: 0 },
        ],
        { duration: 720, easing: 'ease-out' }
      ).onfinish = () => t.remove();
    },

    chime() { sound.chime(); },
    unlock() { sound.ensure(); },
  };

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  window.Forge = Forge;
})();
