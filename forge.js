/* ===== 敲石工坊 · 石匠场景 ===== */
(function () {
  'use strict';

  const VIEW_W = 640, VIEW_H = 420;

  /* 材质：按「我自己敲的次数」升级 —— 决定这块料是什么材料、什么颜色 */
  const MATERIALS = [
    { id: 'stone', at: 0, key: 'forge.stage0',
      g: ['#b5ada0', '#9a9284', '#7d7568'], top: ['#d3cbba', '#b5ada0'], stroke: '#5f584d', stroke2: '#8d8577',
      hl: '#e3dccd', facet: '#efe9dc',
      glow: '#b08a5a', glowOp: 0.1, sparks: ['#c9b48f', '#d8c6a6'], debris: '#a9a294', text: '#7c5c36' },
    { id: 'ironOre', at: 8, key: 'forge.stage1',
      g: ['#b59b85', '#967c68', '#78614f'], top: ['#d4bda6', '#b59b85'], stroke: '#5b4739', stroke2: '#8a745f',
      hl: '#d8c4b1', facet: '#eee0d2',
      glow: '#a9774f', glowOp: 0.1, sparks: ['#c9a07a', '#b98a62'], debris: '#a08672', text: '#7d5a3d' },
    { id: 'iron', at: 25, key: 'forge.stage2',
      g: ['#d6d9d6', '#bfc3c0', '#9ba09d'], top: ['#eceeeb', '#d6d9d6'], stroke: '#6b706d', stroke2: '#9ba09d',
      hl: '#f4f5f2', facet: '#fbfaf6',
      glow: '#9aa39c', glowOp: 0.08, sparks: ['#d9dcd7', '#c4c8c2'], debris: '#a8ada7', text: '#5f665f' },
    { id: 'goldOre', at: 50, key: 'forge.stage3',
      g: ['#d4bd80', '#b9a05c', '#978043'], top: ['#e8d7a6', '#d4bd80'], stroke: '#6f5b28', stroke2: '#9c8448',
      hl: '#f0e3bb', facet: '#f7edcd',
      glow: '#c09a4a', glowOp: 0.1, sparks: ['#dcc484', '#cbb066'], debris: '#b39a5f', text: '#7c6226' },
    { id: 'gold', at: 90, key: 'forge.stage4',
      g: ['#e2c069', '#cfa847', '#b08a31'], top: ['#efdca0', '#e2c069'], stroke: '#7a5d20', stroke2: '#ab8a3e',
      hl: '#f6ecc9', facet: '#fbf4de',
      glow: '#d0ab55', glowOp: 0.12, sparks: ['#e6cf88', '#d8bb63'], debris: '#be9a4d', text: '#7a5d20' },
    { id: 'diamond', at: 150, key: 'forge.stage5',
      g: ['#a6c8d2', '#7fb0c9', '#5f8ea3'], top: ['#cfe2e6', '#a6c8d2'], stroke: '#4f7484', stroke2: '#7fa2b0',
      hl: '#e8f2f3', facet: '#f6fbfa',
      glow: '#7d9aa3', glowOp: 0.1, sparks: ['#b6d0d6', '#cfe0e3'], debris: '#9db9c2', text: '#4f6f7c' },
  ];
  const CARVE_MAX = 150; // 材质封顶：敲 150 下 = 钻石

  // 落锤点：这块石料正面下锤的位置（形状不再变化，固定一个点）
  const ROCK_HIT = { x: 360, y: 276 };
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

  function matOf(hits) {
    let m = MATERIALS[0];
    for (let i = 0; i < MATERIALS.length; i++) if ((hits || 0) >= MATERIALS[i].at) m = MATERIALS[i];
    return m;
  }

  // 「距下一级材质还差几下」用
  function stageOf(hits) {
    const m = matOf(hits);
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
    const light = m.top[0], dark = m.g[2] || m.g[1] || m.g[0];
    let s = '<svg class="pv" viewBox="278 242 106 64" width="' + px + '" height="' + Math.round(px * 64 / 106) + '" xmlns="http://www.w3.org/2000/svg">';
    s += '<path d="' + ROCK_OUTLINE + '" fill="' + (m.g[1] || m.g[0]) + '" stroke="' + m.stroke + '" stroke-width="2"/>';
    ROCK_LIGHT.forEach((d, i) => { s += '<path d="' + d + '" fill="' + light + '" opacity="' + (i ? 0.2 : 0.35) + '"/>'; });
    ROCK_DARK.forEach((d, i) => { s += '<path d="' + d + '" fill="' + dark + '" opacity="' + [0.18, 0.12, 0.06][i] + '"/>'; });
    s += '<path d="' + ROCK_RIDGE + '" fill="none" stroke="' + m.stroke + '" stroke-width="1.2" opacity="0.4"/>';
    return s + '</svg>';
  }

  // 六面六色（上色的样子）
  const CUBE6 = ['#a94b3d', '#c08a3e', '#6f8a5e', '#6f8a9a', '#8a7a8e', '#b07a70'];
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
    <!-- 面的明暗由切面颜色决定，不用渐变 -->
    <style>
      #shape .body { fill: var(--mat-fill, #9a9284); stroke: var(--mat-stroke, #5f584d); }
      #shape .edge { stroke: var(--mat-stroke2, #8d8577); }
      #shape .hl { stroke: var(--mat-hl, #e3dccd); }
      #shape .facet { stroke: var(--mat-facet, #efe9dc); }
      #shape .ridge { stroke: var(--mat-stroke, #5f584d); }
    </style>
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
  <rect x="0" y="0" width="${VIEW_W}" height="262" fill="#efe7d9"/>
  <rect x="0" y="238" width="${VIEW_W}" height="24" fill="#e7dccb"/>
  <line x1="0" y1="238" x2="${VIEW_W}" y2="238" stroke="#d5c7b1" stroke-width="2"/>

  <!-- 地面 -->
  <rect x="0" y="262" width="${VIEW_W}" height="${VIEW_H - 262}" fill="#e3d7c3"/>
  <line x1="0" y1="262" x2="${VIEW_W}" y2="262" stroke="#d5c7b1" stroke-width="2"/>

  <!-- 石匠（坐在桌后） -->
  <g class="mason-body">
    <!-- 躯干 -->
    <path d="M286,150 C286,120 354,120 354,150 L354,262 C354,280 286,280 286,262 Z" fill="#8f5a3c"/>
    <path d="M286,150 C286,120 354,120 354,150 L354,170 L286,170 Z" fill="#a9724c" opacity="0.5"/>
    <rect x="286" y="240" width="68" height="9" rx="3" fill="#b98a4a"/>
    <!-- 头 -->
    <circle cx="320" cy="116" r="24" fill="#eab98a"/>
    <g class="eyes">
      <circle cx="310" cy="114" r="3.2" fill="#3a342b"/>
      <circle cx="330" cy="114" r="3.2" fill="#3a342b"/>
    </g>
    <path d="M307,127 Q320,133 333,127" stroke="#8a6a55" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M318,133 L320,140 L322,133 Z" fill="#c9a58c"/>
    <!-- 斗笠 -->
    <ellipse cx="320" cy="88" rx="37" ry="8" fill="#c9a860"/>
    <path d="M287,88 L320,50 L353,88 Z" fill="#b08a4a"/>
    <rect x="299" y="78" width="42" height="7" rx="3" fill="#8f5a3c"/>
    <!-- 左手（搭在桌上） -->
    <path d="M292,168 Q252,212 240,286" stroke="#8f5a3c" stroke-width="16" fill="none" stroke-linecap="round"/>
    <circle cx="240" cy="288" r="9" fill="#eab98a"/>
    <!-- 右手 + 锤子（抬起待击） -->
    <g id="armR">
      <path d="M348,166 Q390,158 420,182" stroke="#8f5a3c" stroke-width="15" fill="none" stroke-linecap="round"/>
      <path d="M420,182 L436,202" stroke="#8f5a3c" stroke-width="13" fill="none" stroke-linecap="round"/>
      <circle cx="420" cy="182" r="8.5" fill="#eab98a"/>
      <line x1="420" y1="182" x2="440" y2="160" stroke="#8a5f3c" stroke-width="6" stroke-linecap="round"/>
      <rect id="hammerHead" x="426" y="153" width="30" height="15" rx="4" fill="#b9b6ad" stroke="#7c786e" stroke-width="1.5" transform="rotate(48 441 160)"/>
      <g id="chisel" class="hidden">
        <line x1="419" y1="183" x2="443" y2="168" stroke="#6f4a2f" stroke-width="5" stroke-linecap="round"/>
        <path d="M441,165 L451,158 L456,164 L446,171 Z" fill="#d8d5cc" stroke="#7c786e" stroke-width="1.2"/>
      </g>
    </g>
  </g>
  <!-- 桌子 -->
  <path d="M120,300 L520,300 L560,342 L80,342 Z" fill="#a97c52" stroke="#6f4a2f" stroke-width="2"/>
  <rect x="130" y="342" width="380" height="13" fill="#8a5f3c"/>
  <rect x="150" y="355" width="15" height="50" fill="#6f4a2f"/>
  <rect x="475" y="355" width="15" height="50" fill="#6f4a2f"/>
  <ellipse cx="320" cy="398" rx="190" ry="16" fill="#8b7a61" opacity="0.18"/>

  <!-- 桌上做好的作品：自由摆放（可拖动） -->
  <g id="works"></g>
  <!-- 手上这块料 -->
  <g id="item" class="stone-hit" data-material="stone">
    <!-- #piece 是「这块料整体」：雕刻时用蒙版把块体一点点凿掉，只留下物体的轮廓 -->
    <g id="piece">
      <!-- 这块料：棱角分明的石料，长什么样固定，颜色由材质（打卡天数）决定 -->
      <g id="shape">
        <g id="shape-stone">
          <path class="body" d="M284,300 L286,278 L296,262 L312,252 L338,250 L362,258 L376,276 L377,300 Z" fill="var(--mat-fill)" stroke-width="2"/>
          <g fill="var(--mat-top)">
            <path d="M286,278 L296,262 L312,252 L322,272 L306,282 Z" opacity="0.5"/>
            <path d="M312,252 L338,250 L362,258 L348,278 L322,272 Z" opacity="0.32"/>
          </g>
          <g fill="var(--mat-dark)">
            <path d="M362,258 L376,276 L377,300 L352,296 L348,278 Z" opacity="0.3"/>
            <path d="M286,278 L306,282 L318,296 L284,300 Z" opacity="0.18"/>
            <path d="M306,282 L322,272 L348,278 L352,296 L318,296 Z" opacity="0.1"/>
          </g>
          <path class="ridge" d="M286,278 L306,282 L318,296M312,252 L322,272 L348,278M338,250 L322,272M362,258 L348,278" stroke-width="1.2" opacity="0.4" fill="none"/>
        </g>
      </g>
      <!-- 凿痕：雕刻过程中越来越明显，块体被凿掉后自然消失 -->
      <g id="chisels" stroke="var(--mat-dark)" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0">
        <path d="M296,276 L312,286"/>
        <path d="M330,258 L338,272"/>
        <path d="M352,278 L362,286"/>
        <path d="M314,296 L332,300"/>
      </g>
      <!-- 雕出来的物体：先按材料本色出形状（金料雕出金船），再自己上色，最后抛光 -->
      <rect id="carveFill" class="hidden" x="268" y="232" width="124" height="78" fill="var(--mat-fill)" mask="url(#objMask)"/>
      <image id="carvePaint" class="hidden" href="" x="268" y="232" width="124" height="78" preserveAspectRatio="xMidYMid meet" mask="url(#objMask)"/>
      <g id="carveGloss" class="hidden" mask="url(#objMask)">
        <path d="M268,312 L352,226 L382,226 L298,312 Z" fill="#ffffff" opacity="0.18"/>
        <g stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" style="mix-blend-mode:screen">
          <path class="gem-spark" d="M364,242 L364,230 M358,236 L370,236"/>
          <path class="gem-spark d2" d="M290,272 L290,262 M285,267 L295,267"/>
          <path class="gem-spark d3" d="M330,224 L330,216 M326,220 L334,220"/>
        </g>
      </g>
    </g>
  </g>
  <ellipse cx="330" cy="301" rx="66" ry="9" fill="#8b7a61" opacity="0.2"/>
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
    chiselsEl: null,
    carveFill: null,
    carvePaint: null,
    carveGloss: null,
    worksEl: null,
    paintSrc: '',
    workNodes: null,
    dragWork: null,
    onWorkMove: null,
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
    hits: 0,
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
      this.glowEl = null;
      this.chiselsEl = svg.querySelector('#chisels');
      this.carveFill = svg.querySelector('#carveFill');
      this.carvePaint = svg.querySelector('#carvePaint');
      this.carveGloss = svg.querySelector('#carveGloss');
      this.worksEl = svg.querySelector('#works');
      this.objMaskImg = svg.querySelector('#objMaskImg');
      this.blockBase = svg.querySelector('#blockBase');
      this.blockSil = svg.querySelector('#blockSil');
      this.hammerEl = svg.querySelector('#hammerHead');
      this.chiselEl = svg.querySelector('#chisel');
      this.shapeEl = svg.querySelector('#shape');

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

    /* 更新：只看材质（我自己敲的次数）—— 这块料长什么样由雕刻选的物体决定，材质决定颜色 */
    update({ hits }) {
      hits = hits || 0;
      this.hits = hits;
      const mat = matOf(hits);
      this.matObj = mat;

      if (mat.id !== this.material) {
        this.material = mat.id;
        this.itemEl.dataset.material = mat.id;
        this.applyMaterial(mat);
        if (this.painted) this.morph();
      }

      this.syncCarve();

      const st = stageOf(hits);
      const bar = document.getElementById('carveBar');
      const stageEl = document.getElementById('carveStage');
      const textEl = document.getElementById('carveText');
      if (bar) bar.style.width = Math.min(100, (hits / CARVE_MAX) * 100).toFixed(1) + '%';
      if (stageEl) stageEl.textContent = T(st.key);
      if (textEl) {
        textEl.textContent = st.next
          ? T('forge.stageLeft', { stage: T(st.next[1]), n: st.next[0] - hits })
          : T('forge.stageDone');
      }
      this.painted = true;
    },

    /* 换材质：改三段渐变 + 描边色变量 + 落料光晕颜色（形状一层不动） */
    applyMaterial(mat) {
      const st = this.svg.style;
      st.setProperty('--mat-fill', mat.g[1] || mat.g[0]);
      st.setProperty('--mat-top', mat.top[0]);
      st.setProperty('--mat-dark', mat.g[2] || mat.g[1] || mat.g[0]);
      st.setProperty('--mat-stroke', mat.stroke);
      st.setProperty('--mat-stroke2', mat.stroke2 || mat.stroke);
      st.setProperty('--mat-hl', mat.hl || mat.top[0]);
      st.setProperty('--mat-facet', mat.facet || mat.top[0]);
    },

    /* 自己涂的色（PNG 纹理，和物体同一个框；只在变化时改 href） */
    setPaint(url) {
      const u = url || '';
      if (u === this.paintSrc) return;
      this.paintSrc = u;
      if (u) this.carvePaint.setAttribute('href', u);
      else this.carvePaint.removeAttribute('href');
      this.carvePaint.classList.toggle('hidden', !u || !this.work || (this.work.count || 0) < CARVE_STEP);
    },

    /* 桌上做好的作品：自由摆放，数量多了自动缩小 */
    setWorks(list) {
      if (!this.worksEl) return;
      this.worksEl.textContent = '';
      this.workNodes = {};
      const arr = list || [];
      const k = arr.length > 4 ? Math.max(0.26, 0.5 - (arr.length - 4) * 0.05) : 0.5;
      arr.forEach((w) => {
        const g = document.createElementNS(SVGNS, 'g');
        g.setAttribute('class', 'work');
        g.setAttribute('data-id', w.id);
        g.style.cursor = 'grab';
        const box = { x: OBJ_BOX.w * k, y: OBJ_BOX.h * k };
        const sh = document.createElementNS(SVGNS, 'ellipse');
        sh.setAttribute('cx', 0);
        sh.setAttribute('cy', box.y / 2 - 2);
        sh.setAttribute('rx', box.x * 0.5);
        sh.setAttribute('ry', 5 * k);
        sh.setAttribute('fill', '#8b7a61');
        sh.setAttribute('opacity', '0.18');
        g.appendChild(sh);
        [w.obj, w.paint].forEach((href, i) => {
          if (!href) return;
          const im = document.createElementNS(SVGNS, 'image');
          im.setAttribute('href', href);
          try { im.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', href); } catch (e) { }
          im.setAttribute('x', -box.x / 2);
          im.setAttribute('y', -box.y / 2);
          im.setAttribute('width', box.x);
          im.setAttribute('height', box.y);
          im.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          if (i === 0) im.setAttribute('class', 'w-obj');
          else im.setAttribute('class', 'w-paint');
          g.appendChild(im);
        });
        this.placeWork(g, w.x, w.y);
        this.worksEl.appendChild(g);
        this.workNodes[w.id] = g;
      });
      this.bindWorkDrag();
    },

    placeWork(g, x, y) {
      const nx = Math.min(500, Math.max(140, Number(x) || 0));
      const ny = Math.min(336, Math.max(300, Number(y) || 0));
      g.setAttribute('transform', 'translate(' + nx.toFixed(1) + ',' + ny.toFixed(1) + ')');
      g.dataset.x = String(nx);
      g.dataset.y = String(ny);
    },

    /* 成品拖动：按住拖动改位置，松手把新坐标回传给调用方保存 */
    bindWorkDrag() {
      const el = this.worksEl;
      if (!el || el.dataset.bound === '1') return;
      el.dataset.bound = '1';
      const toScene = (e) => {
        const vb = this.svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
        const r = this.svg.getBoundingClientRect();
        const kx = vb[2] / (r.width || 1), ky = vb[3] / (r.height || 1);
        return { x: vb[0] + (e.clientX - r.left) * kx, y: vb[1] + (e.clientY - r.top) * ky };
      };
      el.addEventListener('pointerdown', (e) => {
        const g = e.target.closest ? e.target.closest('.work') : null;
        if (!g) return;
        e.preventDefault();
        e.stopPropagation();
        try { el.setPointerCapture(e.pointerId); } catch (err) { }
        const p = toScene(e);
        this.dragWork = { g: g, id: g.dataset.id, dx: Number(g.dataset.x) - p.x, dy: Number(g.dataset.y) - p.y, moved: 0 };
        g.style.cursor = 'grabbing';
      });
      el.addEventListener('pointermove', (e) => {
        if (!this.dragWork) return;
        e.preventDefault();
        const p = toScene(e);
        const nx = p.x + this.dragWork.dx, ny = p.y + this.dragWork.dy;
        const g = this.dragWork.g;
        if (Math.abs(nx - Number(g.dataset.x)) + Math.abs(ny - Number(g.dataset.y)) > 2) this.dragWork.moved += 1;
        this.placeWork(g, nx, ny);
      });
      const end = () => {
        if (!this.dragWork) return;
        const d = this.dragWork;
        this.dragWork = null;
        d.g.style.cursor = 'grab';
        if (this.onWorkMove) this.onWorkMove(d.id, Number(d.g.dataset.x), Number(d.g.dataset.y), d.moved > 1);
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    },

    hitTestWork(px, py) {
      const keys = Object.keys(this.workNodes || {});
      for (let i = keys.length - 1; i >= 0; i--) {
        const g = this.workNodes[keys[i]];
        const x = Number(g.dataset.x), y = Number(g.dataset.y);
        if (Math.abs(px - x) < 40 && Math.abs(py - y) < 34) return keys[i];
      }
      return null;
    },

    /* 雕刻用的两张图：物体本色图 + 白色剪影（只在变化时改 href） */
    setCarve(c) {
      this.work = (c && c.obj && c.sil) ? c : null;
      const obj = this.work ? this.work.obj : '';
      const sil = this.work ? this.work.sil : '';
      this.carveObjSrc = obj; // 物体本色图只用于成品留档（手上的料由材质颜色决定）
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
      this.carvePaint.classList.toggle('hidden', !has || n < CARVE_STEP || !this.paintSrc);
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
      const at = ROCK_HIT;
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
      const at = ROCK_HIT;
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

  Forge.MATERIALS = MATERIALS; // 6 级材质（按我自己敲的次数）
  Forge.CARVE_STEP = CARVE_STEP;
  Forge.CARVE_TOTAL = CARVE_TOTAL;
  Forge.OBJ_BOX = OBJ_BOX;
  Forge.previewRock = previewRock;
  Forge.previewCube = previewCube;
  Forge.CUBE6 = CUBE6;
  Forge.matId = function (hits) { return matOf(hits).id; };
  Forge.matName = function (hits) { return T(matOf(hits).key); };

  window.Forge = Forge;
})();
