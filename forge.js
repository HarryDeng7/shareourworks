/* ===== 敲石工坊 · 石匠场景 ===== */
(function () {
  'use strict';

  const VIEW_W = 640, VIEW_H = 420;

  /* 材质：按「我自己的打卡天数」升级 —— 决定这块料是什么材料、什么颜色 */
  const MATERIALS = [
    { id: 'stone', at: 0, key: 'forge.stage0',
      g: ['#7b8ba1', '#5c6b80', '#475569'], top: ['#b6c3d3', '#8b9bad'], stroke: '#334155', stroke2: '#64748b',
      hl: '#94a3b8', facet: '#e2e8f0',
      glow: '#f59e0b', glowOp: 0.14, sparks: ['#fbbf24', '#fcd34d'], debris: '#94a3b8', text: '#fbbf24' },
    { id: 'ironOre', at: 8, key: 'forge.stage1',
      g: ['#8d8078', '#6b5f56', '#4b413b'], top: ['#b9a99e', '#7a6a60'], stroke: '#3f3733', stroke2: '#6b5f56',
      hl: '#a89a90', facet: '#e7ded6',
      glow: '#c08457', glowOp: 0.13, sparks: ['#e0b088', '#c9926a'], debris: '#8a7b70', text: '#e8c9a8' },
    { id: 'iron', at: 25, key: 'forge.stage2',
      g: ['#b9c6d6', '#8b9bad', '#5c6b80'], top: ['#f1f5f9', '#9aa8b8'], stroke: '#475569', stroke2: '#64748b',
      hl: '#f8fafc', facet: '#f1f5f9',
      glow: '#94a3b8', glowOp: 0.12, sparks: ['#e2e8f0', '#cbd5e1'], debris: '#64748b', text: '#e2e8f0' },
    { id: 'goldOre', at: 50, key: 'forge.stage3',
      g: ['#cdb26a', '#a08b45', '#7a6222'], top: ['#ead9a0', '#b08e3a'], stroke: '#6b5518', stroke2: '#9c7f2e',
      hl: '#f0e2b0', facet: '#f7ecc4',
      glow: '#d9a441', glowOp: 0.15, sparks: ['#eac76a', '#d4a83c'], debris: '#a08339', text: '#f0d98a' },
    { id: 'gold', at: 90, key: 'forge.stage4',
      g: ['#fcd34d', '#dc9c2a', '#b45309'], top: ['#fef3c7', '#f59e0b'], stroke: '#92400e', stroke2: '#b45309',
      hl: '#fffbeb', facet: '#fffbeb',
      glow: '#fbbf24', glowOp: 0.18, sparks: ['#fde047', '#facc15'], debris: '#b45309', text: '#fde047' },
    { id: 'diamond', at: 150, key: 'forge.stage5',
      g: ['#e8f9ff', '#7dd3fc', '#0284c7'], top: ['#ffffff', '#a5f3fc'], stroke: '#0369a1', stroke2: '#38bdf8',
      hl: '#ffffff', facet: '#e0f7ff',
      glow: '#22d3ee', glowOp: 0.2, sparks: ['#a5f3fc', '#67e8f9'], debris: '#7dd3fc', text: '#a5f3fc' },
  ];
  const CARVE_MAX = 150; // 材质封顶：打卡 150 天 = 钻石

  /* 形状：按「我和好友合计敲击数」升级 —— 决定这块料长什么样子（材质不管形状） */
  const SHAPES = [
    { id: 'stone', at: 0, key: 'forge.shape.stone' },
    { id: 'ingot', at: 20, key: 'forge.shape.ingot' },
    { id: 'gem', at: 100, key: 'forge.shape.gem' },
  ];
  // 落锤点跟着形状走（形状不同，料面高低不同）
  const IMPACT = { stone: { x: 366, y: 254 }, ingot: { x: 366, y: 272 }, gem: { x: 360, y: 272 } };
  // 雕刻：一次一次把这块料凿成图片里的物体（形状 50 次 → 上色 50 次 → 抛光 50 次）
  const CARVE_STEP = 50;
  const CARVE_TOTAL = 150;
  const OBJ_BOX = { x: 268, y: 232, w: 124, h: 78 };   // 物体在桌面上的落位（viewBox 坐标）
  const MASK_BOX = { x: 236, y: 196, w: 196, h: 150 }; // 蒙版范围（要盖住整块料）
  // 敲击特效的颜色直接取当前材质的配方（MATERIALS 里带 sparks/debris/text）
  function fxOf(id) {
    for (let i = 0; i < MATERIALS.length; i++) if (MATERIALS[i].id === id) return MATERIALS[i];
    return MATERIALS[0];
  }
  const SVGNS = 'http://www.w3.org/2000/svg';

  function T(k, v) { return window.I18N ? window.I18N.t(k, v) : k; }

  function matOf(days) {
    let m = MATERIALS[0];
    for (let i = 0; i < MATERIALS.length; i++) if ((days || 0) >= MATERIALS[i].at) m = MATERIALS[i];
    return m;
  }

  function shapeOf(total) {
    let s = SHAPES[0];
    for (let i = 0; i < SHAPES.length; i++) if ((total || 0) >= SHAPES[i].at) s = SHAPES[i];
    return s;
  }

  // 「距下一级材质还差几天」用
  function stageOf(days) {
    const m = matOf(days);
    let next = null;
    for (let i = 0; i < MATERIALS.length; i++) {
      if (MATERIALS[i].id === m.id) next = MATERIALS[i + 1] || null;
    }
    return { key: m.key, next: next ? [next.at, next.key] : null };
  }


  /* ---------- 石料外观：棱角分明的多面石头（六种材质共用这个形状，只换颜色） ---------- */
  const ROCK_OUTLINE = 'M284,300 L286,278 L296,262 L312,252 L338,250 L362,258 L376,276 L377,300 Z';
  // 五个切面：先两块提亮的顶面，再三块压暗的侧面，拼出「一刀一刀凿出来」的棱角感
  const ROCK_LIGHT = [
    'M286,278 L296,262 L312,252 L322,272 L306,282 Z',
    'M312,252 L338,250 L362,258 L348,278 L322,272 Z',
  ];
  const ROCK_DARK = [
    'M362,258 L376,276 L377,300 L352,296 L348,278 Z',
    'M286,278 L306,282 L318,296 L284,300 Z',
    'M306,282 L322,272 L348,278 L352,296 L318,296 Z',
  ];
  const ROCK_RIDGE = 'M286,278 L306,282 L318,296M312,252 L322,272 L348,278M338,250 L322,272M362,258 L348,278';

  /* ---------- 弹窗里的预览小图（自带颜色，不依赖场景，可同时放好几张） ---------- */
  function mixHex(a, b, t) {
    const pa = parseInt(String(a).slice(1), 16);
    const pb = parseInt(String(b).slice(1), 16);
    const r = Math.round((((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t));
    const g = Math.round((((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t));
    const bl = Math.round(((pa & 255) * (1 - t) + (pb & 255) * t));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }

  // 一块棱角分明的石料（给「材质演化」用）
  function previewRock(matIdx, px) {
    const m = MATERIALS[matIdx] || MATERIALS[0];
    const c1 = m.g[0], c2 = m.g[1] || m.g[0], c3 = m.g[2] || m.g[1] || m.g[0];
    const light = m.top[0], dark = '#0b1220';
    const gid = 'pvrock' + matIdx;
    let s = '<svg class="pv" viewBox="278 242 106 64" width="' + px + '" height="' + Math.round(px * 64 / 106) + '" xmlns="http://www.w3.org/2000/svg">';
    s += '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0" stop-color="' + c1 + '"/><stop offset="0.5" stop-color="' + c2 + '"/>'
      + '<stop offset="1" stop-color="' + c3 + '"/></linearGradient></defs>';
    s += '<path d="' + ROCK_OUTLINE + '" fill="url(#' + gid + ')" stroke="' + m.stroke + '" stroke-width="2"/>';
    ROCK_LIGHT.forEach((d, i) => { s += '<path d="' + d + '" fill="' + light + '" opacity="' + (i ? 0.2 : 0.35) + '"/>'; });
    ROCK_DARK.forEach((d, i) => { s += '<path d="' + d + '" fill="' + dark + '" opacity="' + [0.18, 0.12, 0.06][i] + '"/>'; });
    s += '<path d="' + ROCK_RIDGE + '" fill="none" stroke="' + m.stroke + '" stroke-width="1.2" opacity="0.4"/>';
    return s + '</svg>';
  }

  // 六面六色（上色的样子）
  const CUBE6 = ['#ef4444', '#f59e0b', '#22c55e', '#38bdf8', '#a78bfa', '#f472b6'];
  const CUBE_TOP = 'M50,12 L80,29 L50,46 L20,29 Z';
  const CUBE_LEFT = 'M20,29 L50,46 L50,82 L20,65 Z';
  const CUBE_RIGHT = 'M50,46 L80,29 L80,65 L50,82 Z';

  // 雕出来的方料：stage 1 = 素材本色（刚雕出形状），2 = 六面六色（上色），3 = 再加抛光高光
  function previewCube(stage, matIdx, px) {
    const m = MATERIALS[matIdx] || MATERIALS[0];
    const c1 = m.g[0], c2 = m.g[1] || m.g[0];
    let top, left, right, chips = '';
    if (stage >= 2) {
      top = CUBE6[0]; left = CUBE6[2]; right = CUBE6[4];
      chips = CUBE6.map((c, i) => '<rect x="' + (10 + i * 14) + '" y="90" width="11" height="11" rx="3" fill="' + c + '"/>').join('');
    } else {
      top = c1; left = c2; right = mixHex(c1, c2, 0.45);
    }
    const gloss = stage >= 3
      ? '<path d="' + CUBE_TOP + '" fill="#ffffff" opacity="0.3"/>'
        + '<g stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" opacity="0.9">'
        + '<path d="M28,21 L28,13 M24,17 L32,17"/><path d="M74,59 L74,51 M70,55 L78,55"/></g>'
      : '';
    return '<svg class="pv" viewBox="0 0 100 104" width="' + px + '" height="' + Math.round(px * 104 / 100) + '" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="' + CUBE_TOP + '" fill="' + top + '" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>'
      + '<path d="' + CUBE_LEFT + '" fill="' + left + '" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>'
      + '<path d="' + CUBE_RIGHT + '" fill="' + right + '" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>'
      + gloss + chips + '</svg>';
  }

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
    tick() { this.tone(2400, 1100, 0.05, 0.13, 'square'); },
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
    <linearGradient id="woodGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a16207"/><stop offset="1" stop-color="#7c4a1e"/>
    </linearGradient>
    <radialGradient id="warmGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#f59e0b" stop-opacity="0.22"/><stop offset="1" stop-color="#f59e0b" stop-opacity="0"/>
    </radialGradient>
    <!-- 材质渐变：三段颜色由 JS 按当前材质填，形状与材质互不影响 -->
    <linearGradient id="matGrad" x1="0" y1="0" x2="0" y2="1">
      <stop id="mg0" offset="0" stop-color="#7b8ba1"/>
      <stop id="mg1" offset="0.5" stop-color="#5c6b80"/>
      <stop id="mg2" offset="1" stop-color="#475569"/>
    </linearGradient>
    <linearGradient id="matTop" x1="0" y1="0" x2="0" y2="1">
      <stop id="mt0" offset="0" stop-color="#b6c3d3"/>
      <stop id="mt1" offset="1" stop-color="#8b9bad"/>
    </linearGradient>
    <style>
      #shape .body { stroke: var(--mat-stroke, #334155); }
      #shape .edge { stroke: var(--mat-stroke2, #64748b); }
      #shape .hl { stroke: var(--mat-hl, #94a3b8); }
      #shape .facet { stroke: var(--mat-facet, #e0f7ff); }
      #shape .ridge { stroke: var(--mat-stroke, #334155); }
    </style>
    <linearGradient id="glossGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.4" stop-color="#ffffff" stop-opacity="0.35"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.8"/>
      <stop offset="0.6" stop-color="#ffffff" stop-opacity="0.15"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <!-- 物体轮廓遮罩：把上传图片抠出来的剪影当蒙版用 -->
    <mask id="objMask" maskUnits="userSpaceOnUse" x="236" y="196" width="196" height="150">
      <image id="objMaskImg" href="" x="268" y="232" width="124" height="78" preserveAspectRatio="xMidYMid meet"/>
    </mask>
    <!-- 块体遮罩：整块料（随雕刻次数变透明）+ 物体剪影（始终保留） -->
    <mask id="blockMask" maskUnits="userSpaceOnUse" x="236" y="196" width="196" height="150">
      <rect id="blockBase" x="236" y="196" width="196" height="150" fill="#ffffff"/>
      <image id="blockSil" href="" x="268" y="232" width="124" height="78" preserveAspectRatio="xMidYMid meet"/>
    </mask>
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
      <rect id="hammerHead" x="426" y="153" width="30" height="15" rx="4" fill="#94a3b8" stroke="#64748b" stroke-width="1.5" transform="rotate(48 441 160)"/>
      <g id="chisel" class="hidden">
        <line x1="419" y1="183" x2="443" y2="168" stroke="#78350f" stroke-width="5" stroke-linecap="round"/>
        <path d="M441,165 L451,158 L456,164 L446,171 Z" fill="#cbd5e1" stroke="#64748b" stroke-width="1.2"/>
      </g>
    </g>
  </g>
  <!-- 桌子 -->
  <path d="M120,300 L520,300 L560,342 L80,342 Z" fill="url(#woodGrad)" stroke="#5b3412" stroke-width="2"/>
  <rect x="130" y="342" width="380" height="13" fill="#8a5522"/>
  <rect x="150" y="355" width="15" height="50" fill="#5b3412"/>
  <rect x="475" y="355" width="15" height="50" fill="#5b3412"/>
  <ellipse cx="320" cy="398" rx="190" ry="16" fill="#000" opacity="0.3"/>

  <!-- 桌上的原材料：石头 → 铁锭 → 金锭 → 钻石（按两人合计敲击数升级） -->
  <ellipse id="itemGlow" cx="330" cy="302" rx="58" ry="10" fill="#f59e0b" opacity="0.14"/>
  <g id="item" class="stone-hit" data-shape="stone" data-material="stone">
    <!-- #piece 是「这块料整体」：雕刻时用蒙版把块体一点点凿掉，只留下物体的轮廓 -->
    <g id="piece">
      <!-- 形状（按合计敲击升级）：石块 / 锭形 / 宝石形，颜色交给材质渐变 -->
      <g id="shape">
        <g id="shape-stone">
          <path class="body" d="M284,300 L286,278 L296,262 L312,252 L338,250 L362,258 L376,276 L377,300 Z" fill="url(#matGrad)" stroke-width="2"/>
          <g fill="url(#matTop)">
            <path d="M286,278 L296,262 L312,252 L322,272 L306,282 Z" opacity="0.35"/>
            <path d="M312,252 L338,250 L362,258 L348,278 L322,272 Z" opacity="0.2"/>
          </g>
          <g fill="#0b1220">
            <path d="M362,258 L376,276 L377,300 L352,296 L348,278 Z" opacity="0.18"/>
            <path d="M286,278 L306,282 L318,296 L284,300 Z" opacity="0.12"/>
            <path d="M306,282 L322,272 L348,278 L352,296 L318,296 Z" opacity="0.06"/>
          </g>
          <path class="ridge" d="M286,278 L306,282 L318,296M312,252 L322,272 L348,278M338,250 L322,272M362,258 L348,278" stroke-width="1.2" opacity="0.4" fill="none"/>
        </g>
        <g id="shape-ingot" class="hidden">
          <path class="body" d="M294,282 L366,282 L378,302 L282,302 Z" fill="url(#matGrad)" stroke-width="2"/>
          <path class="edge" d="M300,270 L360,270 L366,282 L294,282 Z" fill="url(#matTop)" stroke-width="1.5"/>
          <path class="hl" d="M302,274 L358,274" stroke-width="1.5" opacity="0.5" stroke-linecap="round"/>
        </g>
        <g id="shape-gem" class="hidden">
          <path class="body" d="M312,266 L348,266 L366,284 L330,302 L294,284 Z" fill="url(#matGrad)" stroke-width="2"/>
          <path d="M312,266 L348,266 L336,284 L324,284 Z" fill="#ffffff" opacity="0.3"/>
          <g class="facet" stroke-width="1.2" opacity="0.7" fill="none">
            <path d="M294,284 L366,284"/>
            <path d="M312,266 L324,284"/><path d="M348,266 L336,284"/>
            <path d="M324,284 L330,302"/><path d="M336,284 L330,302"/>
            <path d="M294,284 L330,302"/><path d="M366,284 L330,302"/>
          </g>
          <g class="hl" stroke-width="2" stroke-linecap="round">
            <path class="gem-spark" d="M354,246 L354,236 M349,241 L359,241"/>
            <path class="gem-spark d2" d="M296,262 L296,254 M292,258 L300,258"/>
          </g>
        </g>
      </g>
      <!-- 凿痕：雕刻过程中越来越明显，块体被凿掉后自然消失 -->
      <g id="chisels" stroke="#0b1220" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0">
        <path d="M296,276 L312,286"/>
        <path d="M330,258 L338,272"/>
        <path d="M352,278 L362,286"/>
        <path d="M314,296 L332,300"/>
      </g>
      <!-- 雕出来的物体：先按材料本色出形状（金料雕出金船），再上色，最后抛光 -->
      <rect id="carveFill" class="hidden" x="268" y="232" width="124" height="78" fill="url(#matGrad)" mask="url(#objMask)"/>
      <image id="carveCol" class="hidden" href="" x="268" y="232" width="124" height="78" preserveAspectRatio="xMidYMid meet" mask="url(#objMask)"/>
      <g id="carveGloss" class="hidden" mask="url(#objMask)">
        <path d="M268,312 L352,226 L382,226 L298,312 Z" fill="url(#glossGrad)" style="mix-blend-mode:screen"/>
        <g stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" style="mix-blend-mode:screen">
          <path class="gem-spark" d="M364,242 L364,230 M358,236 L370,236"/>
          <path class="gem-spark d2" d="M290,272 L290,262 M285,267 L295,267"/>
          <path class="gem-spark d3" d="M330,224 L330,216 M326,220 L334,220"/>
        </g>
      </g>
      <g id="cracks" stroke="#0f172a" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0">
        <path d="M308,262 L316,278 L311,292"/>
        <path d="M340,258 L333,274 L344,288"/>
        <path d="M322,296 L316,301"/>
      </g>
    </g>
  </g>
  <ellipse cx="330" cy="301" rx="66" ry="9" fill="#000" opacity="0.25"/>
</svg>`;
  }

  /* ---------- 场景控制 ---------- */
  const Forge = {
    el: null,
    svg: null,
    armEl: null,
    itemEl: null,
    pieceEl: null,
    glowEl: null,
    cracksEl: null,
    chiselsEl: null,
    carveFill: null,
    carveCol: null,
    carveGloss: null,
    objMaskImg: null,
    blockBase: null,
    blockSil: null,
    hammerEl: null,
    chiselEl: null,
    work: null,
    carveObjSrc: '',
    carveSilSrc: '',
    shapeEl: null,
    gradStops: null,
    material: '',
    matObj: null,
    shape: '',
    myDays: 0,
    painted: false,
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
      this.itemEl = svg.querySelector('#item');
      this.pieceEl = svg.querySelector('#piece');
      this.glowEl = svg.querySelector('#itemGlow');
      this.cracksEl = svg.querySelector('#cracks');
      this.chiselsEl = svg.querySelector('#chisels');
      this.carveFill = svg.querySelector('#carveFill');
      this.carveCol = svg.querySelector('#carveCol');
      this.carveGloss = svg.querySelector('#carveGloss');
      this.objMaskImg = svg.querySelector('#objMaskImg');
      this.blockBase = svg.querySelector('#blockBase');
      this.blockSil = svg.querySelector('#blockSil');
      this.hammerEl = svg.querySelector('#hammerHead');
      this.chiselEl = svg.querySelector('#chisel');
      this.shapeEl = svg.querySelector('#shape');
      this.gradStops = { mg0: svg.querySelector('#mg0'), mg1: svg.querySelector('#mg1'), mg2: svg.querySelector('#mg2'),
        mt0: svg.querySelector('#mt0'), mt1: svg.querySelector('#mt1') };

      // 手臂动画需要以肩部为原点（viewBox 坐标系）
      this.armEl.style.transformBox = 'view-box';
      this.armEl.style.transformOrigin = '348px 168px';
      this.armEl.style.transform = 'rotate(0deg)';
      this.itemEl.style.transformBox = 'fill-box';
      this.itemEl.style.transformOrigin = '50% 90%';

      this.itemEl.addEventListener('click', (e) => {
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

    /* 更新：形状（两人合计敲击）+ 材质（我自己的打卡天数）；两者互不影响 */
    update({ total, myDays }) {
      total = total || 0;
      myDays = myDays || 0;
      this.myDays = myDays;
      const shape = shapeOf(total);
      const mat = matOf(myDays);
      this.matObj = mat;

      if (shape.id !== this.shape) {
        this.shape = shape.id;
        this.itemEl.dataset.shape = shape.id;
        this.itemEl.querySelectorAll('#shape > g').forEach((g) => {
          g.classList.toggle('hidden', g.id !== 'shape-' + shape.id);
        });
        if (this.painted) this.morph();
      }
      // 材质只管颜色：换材质不动形状，升级时也弹一下
      if (mat.id !== this.material) {
        this.material = mat.id;
        this.itemEl.dataset.material = mat.id;
        this.applyMaterial(mat);
        if (this.painted) this.morph();
      }
      // 石块形状：越接近「锭形」裂纹越明显
      this.cracksEl.style.opacity =
        (shape.id === 'stone' ? Math.min(1, total / SHAPES[1].at) * 0.85 : 0).toFixed(3);

      this.syncCarve();

      const st = stageOf(myDays);
      const bar = document.getElementById('carveBar');
      const stageEl = document.getElementById('carveStage');
      const textEl = document.getElementById('carveText');
      if (bar) bar.style.width = Math.min(100, (myDays / CARVE_MAX) * 100).toFixed(1) + '%';
      if (stageEl) stageEl.textContent = T(st.key);
      if (textEl) {
        textEl.textContent = st.next
          ? T('forge.stageLeft', { stage: T(st.next[1]), n: st.next[0] - myDays })
          : T('forge.stageDone');
      }
      this.painted = true;
    },

    /* 换材质：改三段渐变 + 描边色变量 + 落料光晕颜色（形状一层不动） */
    applyMaterial(mat) {
      const s = this.gradStops;
      if (s) {
        s.mg0.setAttribute('stop-color', mat.g[0]);
        s.mg1.setAttribute('stop-color', mat.g[1]);
        s.mg2.setAttribute('stop-color', mat.g[2] || mat.g[1]);
        s.mt0.setAttribute('stop-color', mat.top[0]);
        s.mt1.setAttribute('stop-color', mat.top[1]);
      }
      const st = this.svg.style;
      st.setProperty('--mat-stroke', mat.stroke);
      st.setProperty('--mat-stroke2', mat.stroke2 || mat.stroke);
      st.setProperty('--mat-hl', mat.hl || mat.top[0]);
      st.setProperty('--mat-facet', mat.facet || mat.top[0]);
      this.glowEl.setAttribute('fill', mat.glow);
      this.glowEl.setAttribute('opacity', String(mat.glowOp));
    },

    /* 雕刻用的两张图：物体本色图 + 白色剪影（只在变化时改 href） */
    setCarve(c) {
      this.work = (c && c.obj && c.sil) ? c : null;
      const obj = this.work ? this.work.obj : '';
      const sil = this.work ? this.work.sil : '';
      if (obj !== this.carveObjSrc) {
        this.carveObjSrc = obj;
        if (obj) this.carveCol.setAttribute('href', obj);
        else this.carveCol.removeAttribute('href');
      }
      if (sil !== this.carveSilSrc) {
        this.carveSilSrc = sil;
        [this.objMaskImg, this.blockSil].forEach((el) => {
          if (sil) {
            el.setAttribute('href', sil);
            try { el.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', sil); } catch (e) { }
          } else {
            el.removeAttribute('href');
          }
        });
      }
    },

    /* 按雕刻次数摆布局：块体一点点被凿掉 → 物体本色 → 上色 → 抛光 */
    syncCarve() {
      const c = this.work;
      const n = c ? Math.max(0, Math.min(CARVE_TOTAL, c.count || 0)) : 0;
      const has = !!c;
      const pShape = has ? Math.min(1, n / CARVE_STEP) : 0;
      const pPaint = has ? Math.min(1, Math.max(0, (n - CARVE_STEP) / CARVE_STEP)) : 0;
      const pPolish = has ? Math.min(1, Math.max(0, (n - 2 * CARVE_STEP) / CARVE_STEP)) : 0;
      // 块体遮罩：块体随进度变透明；物体剪影那一块始终保留，于是最后只剩物体
      if (has && n > 0) this.pieceEl.setAttribute('mask', 'url(#blockMask)');
      else this.pieceEl.removeAttribute('mask');
      this.blockBase.setAttribute('opacity', (1 - pShape).toFixed(3));
      this.carveFill.classList.toggle('hidden', !has);
      this.carveFill.setAttribute('opacity', has ? (0.18 + 0.82 * pShape).toFixed(3) : '0');
      this.carveCol.classList.toggle('hidden', !has || n < CARVE_STEP);
      this.carveCol.setAttribute('opacity', pPaint.toFixed(3));
      this.carveGloss.classList.toggle('hidden', !has || n < 2 * CARVE_STEP);
      this.carveGloss.setAttribute('opacity', pPolish.toFixed(3));
      const op = (!has || n <= 0 || n >= CARVE_STEP) ? 0 : 0.25 + 0.75 * Math.sin(Math.PI * pShape);
      this.chiselsEl.style.opacity = op.toFixed(3);
    },

    /* 材质/形状升级的那一瞬间：弹一下 + 光晕一圈 */
    morph() {
      const fx = this.matObj || fxOf(this.material);
      this.itemEl.animate(
        [
          { transform: 'scale(1,1)' },
          { transform: 'scale(0.88,1.14)' },
          { transform: 'scale(1.08,0.94)' },
          { transform: 'scale(1,1)' },
        ],
        { duration: 640, easing: 'ease-out' }
      );
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('cx', '330');
      c.setAttribute('cy', '278');
      c.setAttribute('r', '26');
      c.setAttribute('fill', 'none');
      c.setAttribute('stroke', fx.glow);
      c.setAttribute('stroke-width', '4');
      c.style.transformBox = 'fill-box';
      c.style.transformOrigin = '50% 50%';
      this.svg.appendChild(c);
      c.animate(
        [{ transform: 'scale(0.3)', opacity: 0.95 }, { transform: 'scale(3.6)', opacity: 0 }],
        { duration: 640, easing: 'ease-out' }
      ).onfinish = () => c.remove();
    },
    /* 手上拿的是锤子还是凿子 */
    setTool(t) {
      const chisel = t === 'chisel';
      if (this.hammerEl) this.hammerEl.classList.toggle('hidden', chisel);
      if (this.chiselEl) this.chiselEl.classList.toggle('hidden', !chisel);
    },

    /* 敲击动画 */
    async strike() {
      if (this.busy || !this.armEl) return false;
      this.busy = true;
      this.setTool('hammer');
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

    /* 雕刻动画：换成凿子连凿三下，碎屑往下掉 */
    async carve() {
      if (this.busy || !this.armEl) return false;
      this.busy = true;
      this.setTool('chisel');
      try {
        await this.animArm(-26, 130, 'ease-out');
        for (let i = 0; i < 3; i++) {
          this.animArm(62, 95, 'cubic-bezier(.2,1.7,.3,1)');
          await sleep(70);
          this.chipImpact();
          sound.tick();
          await sleep(90);
          if (i < 2) await this.animArm(44, 110, 'ease-out');
          await sleep(50);
        }
        await this.animArm(0, 420, 'ease-out');
      } finally {
        this.setTool('hammer');
        this.busy = false;
      }
      return true;
    },

    /* 凿下来的碎屑（比敲击的火星更小更碎） */
    chipImpact() {
      const fx = fxOf(this.material);
      const at = IMPACT[this.shape] || IMPACT.stone;
      this.itemEl.animate(
        [
          { transform: 'translate(0,0) rotate(0)' },
          { transform: 'translate(2px,-1px) rotate(0.8deg)' },
          { transform: 'translate(-2px,1px) rotate(-0.8deg)' },
          { transform: 'translate(0,0) rotate(0)' },
        ],
        { duration: 220, easing: 'ease-out' }
      );
      this.chiselsEl.animate([{ opacity: 1 }, { opacity: 0.3 }], { duration: 260 });
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * (0.35 + 0.6 * Math.random()) * (i % 2 ? 1 : -1) - Math.PI / 2;
        const d = 14 + Math.random() * 22;
        const sz = 1.6 + Math.random() * 2.4;
        const c = document.createElementNS(SVGNS, 'rect');
        c.setAttribute('x', (at.x - sz / 2).toFixed(2));
        c.setAttribute('y', (at.y - sz / 2).toFixed(2));
        c.setAttribute('width', sz.toFixed(2));
        c.setAttribute('height', sz.toFixed(2));
        c.setAttribute('fill', i % 3 ? fx.debris : fx.sparks[0]);
        this.svg.appendChild(c);
        c.animate(
          [
            { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
            { transform: 'translate(' + Math.cos(a) * d + 'px,' + (Math.sin(a) * d + 22) + 'px) rotate(220deg)', opacity: 0 },
          ],
          { duration: 430 + Math.random() * 220, easing: 'cubic-bezier(.1,.6,.3,1)' }
        ).onfinish = () => c.remove();
      }
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
      const fx = fxOf(this.material);
      const at = IMPACT[this.shape] || IMPACT.stone;
      // 材料震动
      this.itemEl.animate(
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

      const CX = at.x, CY = at.y; // 锤子落点（跟着形状走）
      // 火星
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (0.15 + 0.7 * Math.random()) * (i % 2 ? 1 : -1) - Math.PI / 2;
        const dist = 26 + Math.random() * 30;
        const dur = 380 + Math.random() * 240;
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', CX); c.setAttribute('cy', CY);
        c.setAttribute('r', 1.6 + Math.random() * 2);
        c.setAttribute('fill', fx.sparks[i % fx.sparks.length]);
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
        c.setAttribute('fill', fx.debris);
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
      t.setAttribute('fill', fx.text);
      t.textContent = T('forge.clink');
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

  Forge.MATERIALS = MATERIALS; // 6 级材质（按我的打卡天数）
  Forge.SHAPES = SHAPES;       // 3 种形状（按两人合计敲击）
  Forge.CARVE_STEP = CARVE_STEP;
  Forge.CARVE_TOTAL = CARVE_TOTAL;
  Forge.OBJ_BOX = OBJ_BOX;
  Forge.previewRock = previewRock;
  Forge.previewCube = previewCube;
  Forge.CUBE6 = CUBE6;
  Forge.shapeId = function (total) { return shapeOf(total).id; };
  Forge.shapeName = function (total) { return T(shapeOf(total).key); };
  Forge.matId = function (days) { return matOf(days).id; };
  Forge.matName = function (days) { return T(matOf(days).key); };

  window.Forge = Forge;
})();
