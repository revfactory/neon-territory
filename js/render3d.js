/* 3D 렌더러 — Three.js 인스턴싱 격자, 네온 바닥 셰이더, 블룸, 파티클, 링 이펙트, 카메라 */
(function () {
  const FLOOR_VS = `
    varying vec2 vPos;
    void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vPos = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
  const FLOOR_FS = `
    uniform float uTime; uniform vec3 uColor; uniform vec3 uAccent; uniform vec2 uArena; uniform vec3 uFog;
    varying vec2 vPos;
    void main(){
      vec2 p = vPos;
      vec2 fw = fwidth(p) * 1.2 + 0.002;
      vec2 d1 = abs(fract(p - 0.5) - 0.5);
      vec2 l1 = 1.0 - smoothstep(vec2(0.0), fw * 1.4, d1);
      float minor = max(l1.x, l1.y);
      vec2 d4 = abs(fract(p * 0.25 - 0.5) - 0.5) * 4.0;
      vec2 l4 = 1.0 - smoothstep(vec2(0.0), fw * 2.2, d4);
      float major = max(l4.x, l4.y);
      float inside = step(abs(p.x), uArena.x) * step(abs(p.y), uArena.y);
      float distN = length(p / (uArena * 2.6));
      float fade = 1.0 - smoothstep(0.3, 1.0, distN);
      float pulse = 0.8 + 0.2 * sin(uTime * 2.2 - length(p) * 0.35);
      float sweep = exp(-abs(fract((p.x + p.y) * 0.015 - uTime * 0.06) - 0.5) * 26.0);
      vec3 col = uColor * (minor * 0.45 + major * 0.85) * pulse * (0.5 + 0.7 * inside) * fade;
      col += uAccent * sweep * (0.35 * inside + 0.1) * max(minor, major * 1.5) * fade;
      col += uColor * 0.05 * inside;
      col += uColor * 0.04 * inside * (1.0 - distN);
      col = mix(col, uFog, smoothstep(0.55, 1.0, distN));
      gl_FragColor = vec4(col, 1.0);
    }`;
  const PART_VS = `
    attribute vec2 attr; uniform float uPR; varying vec3 vC; varying float vA;
    void main(){ vC = color; vA = attr.y; vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = attr.x * uPR * (260.0 / max(1.0, -mv.z)); gl_Position = projectionMatrix * mv; }`;
  const PART_FS = `
    varying vec3 vC; varying float vA;
    void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.12, d) * vA; if (a < 0.01) discard;
      gl_FragColor = vec4(vC * a * 1.6, a); }`;

  function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  class ParticleSystem {
    constructor(T, max) {
      this.T = T; this.max = max; this.head = 0;
      this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.attr = new Float32Array(max * 2);
      this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
      this.size0 = new Float32Array(max); this.grav = new Float32Array(max); this.damp = new Float32Array(max);
      const geo = new T.BufferGeometry();
      this.posAttr = new T.BufferAttribute(this.pos, 3).setUsage(T.DynamicDrawUsage);
      this.colAttr = new T.BufferAttribute(this.col, 3).setUsage(T.DynamicDrawUsage);
      this.aAttr = new T.BufferAttribute(this.attr, 2).setUsage(T.DynamicDrawUsage);
      geo.setAttribute('position', this.posAttr); geo.setAttribute('color', this.colAttr); geo.setAttribute('attr', this.aAttr);
      const mat = new T.ShaderMaterial({
        uniforms: { uPR: { value: 1 } }, vertexShader: PART_VS, fragmentShader: PART_FS,
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, vertexColors: true
      });
      this.points = new T.Points(geo, mat); this.points.frustumCulled = false;
    }
    emit(x, y, z, color, n, o) {
      o = o || {};
      const spread = o.spread == null ? 0.3 : o.spread, speed = o.speed == null ? 2 : o.speed, up = o.up == null ? 1.5 : o.up;
      const life = o.life || 0.8, size = o.size || 0.5, grav = o.grav == null ? 3 : o.grav, damp = o.damp == null ? 2 : o.damp;
      for (let k = 0; k < n; k++) {
        const i = this.head; this.head = (this.head + 1) % this.max; const i3 = i * 3;
        this.pos[i3] = x + (Math.random() - 0.5) * spread * 2;
        this.pos[i3 + 1] = y + (Math.random() - 0.5) * spread;
        this.pos[i3 + 2] = z + (Math.random() - 0.5) * spread * 2;
        const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
        this.vel[i3] = Math.cos(a) * s; this.vel[i3 + 1] = up * (0.5 + Math.random()); this.vel[i3 + 2] = Math.sin(a) * s;
        this.col[i3] = color.r; this.col[i3 + 1] = color.g; this.col[i3 + 2] = color.b;
        this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.8);
        this.size0[i] = size * (0.6 + Math.random() * 0.8); this.grav[i] = grav; this.damp[i] = damp;
      }
      this.colAttr.needsUpdate = true;
    }
    update(dt) {
      const n = this.max;
      for (let i = 0; i < n; i++) {
        const l = this.life[i];
        if (l <= 0) { if (this.attr[i * 2] !== 0) { this.attr[i * 2] = 0; this.attr[i * 2 + 1] = 0; } continue; }
        const nl = l - dt; this.life[i] = nl;
        const i3 = i * 3, dm = Math.exp(-this.damp[i] * dt);
        this.vel[i3] *= dm; this.vel[i3 + 2] *= dm; this.vel[i3 + 1] -= this.grav[i] * dt;
        this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
        if (this.pos[i3 + 1] < 0.03) { this.pos[i3 + 1] = 0.03; this.vel[i3 + 1] *= -0.4; }
        const f = Math.max(0, nl / this.maxLife[i]);
        this.attr[i * 2] = this.size0[i] * (0.3 + 0.7 * f); this.attr[i * 2 + 1] = Math.min(1, f * 1.6);
      }
      this.posAttr.needsUpdate = true; this.aAttr.needsUpdate = true;
    }
  }

  class RingFX {
    constructor(T, scene) {
      this.pool = [];
      for (let k = 0; k < 14; k++) {
        const m = new T.Mesh(new T.RingGeometry(0.82, 1, 48),
          new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
        m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
        this.pool.push({ mesh: m, t: 1, dur: 0.6, r: 3 });
      }
    }
    spawn(x, z, color, r, dur) {
      let it = this.pool.find((p) => p.t >= 1);
      if (!it) { it = this.pool[0]; for (const p of this.pool) if (p.t > it.t) it = p; }
      it.mesh.position.set(x, 0.08, z);
      it.mesh.material.color.copy(color).multiplyScalar(2.2);
      it.t = 0; it.dur = dur || 0.6; it.r = r || 3;
    }
    update(dt) {
      for (const p of this.pool) {
        if (p.t >= 1) { p.mesh.visible = false; continue; }
        p.t += dt / p.dur;
        const e = 1 - Math.pow(1 - Math.min(1, p.t), 3), s = 0.3 + p.r * e;
        p.mesh.scale.set(s, s, 1); p.mesh.material.opacity = (1 - Math.min(1, p.t)) * 0.9; p.mesh.visible = true;
      }
    }
  }

  class Renderer3D {
    constructor(deps, canvas, quality) {
      const T = this.T = deps.THREE;
      this.deps = deps; this.canvas = canvas; this.quality = quality;
      this.renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
      this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.1;
      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(55, 1, 0.1, 400);
      this.camPos = new T.Vector3(0, 22, 20); this.camLook = new T.Vector3(); this.camTarget = new T.Vector3();
      this.shakeAmt = 0; this.time = 0; this.mode = 'orbit'; this.orbitA = 0; this.zero = new T.Vector3();
      this.camH = 14; this.camD = 9; this.lastPlayerPos = null;
      this.scene.add(new T.HemisphereLight(0x9070ff, 0x100818, 0.55));
      const dl = new T.DirectionalLight(0xffffff, 1.1); dl.position.set(6, 14, 8); this.scene.add(dl);
      this.playerLight = new T.PointLight(0x00f0ff, 2.5, 10, 1.6); this.playerLight.position.set(0, 2, 0); this.scene.add(this.playerLight);
      this.composer = new deps.EffectComposer(this.renderer);
      this.composer.addPass(new deps.RenderPass(this.scene, this.camera));
      this.bloom = new deps.UnrealBloomPass(new T.Vector2(512, 512), 0.9, 0.4, 0.72);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new deps.OutputPass());
      this.particles = new ParticleSystem(T, quality === 'low' ? 700 : 2000); this.scene.add(this.particles.points);
      this.rings = new RingFX(T, this.scene);
      this.glowTex = this.makeGlowTexture();
      this.entityMeshes = new Map(); this.anims = new Map(); this.stageGroup = null; this.game = null;
      this.zeroM = new T.Matrix4().makeScale(0, 0, 0); this._m = new T.Matrix4(); this._p = new T.Vector3(); this._p2 = new T.Vector3();
      this.white = new T.Color(1, 1, 1);
      this.setQuality(quality);
      window.addEventListener('resize', () => this.resize());
    }
    setQuality(q) {
      this.quality = q;
      const dpr = window.devicePixelRatio || 1;
      const pr = q === 'high' ? Math.min(dpr, 2) : q === 'medium' ? Math.min(dpr, 1.5) : 1;
      this.renderer.setPixelRatio(pr); this.composer.setPixelRatio(pr);
      this.bloom.enabled = q !== 'low';
      this.bloom.strength = q === 'high' ? 0.95 : 0.85;
      this.particles.points.material.uniforms.uPR.value = pr;
      this.resize();
    }
    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.width = w; this.height = h;
      this.renderer.setSize(w, h, false); this.composer.setSize(w, h);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    }
    makeGlowTexture() {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
      return new this.T.CanvasTexture(c);
    }
    shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
    worldToScreen(cx, cy) {
      const v = this._p2.set(cx + this.offX, 0.6, cy + this.offZ).project(this.camera);
      return { x: (v.x + 1) / 2 * this.width, y: (1 - v.y) / 2 * this.height, visible: v.z < 1 };
    }

    setStage(game) {
      const T = this.T; this.game = game;
      if (this.stageGroup) {
        this.scene.remove(this.stageGroup);
        this.stageGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
      }
      for (const m of this.entityMeshes.values()) this.scene.remove(m);
      this.entityMeshes.clear(); this.anims.clear();
      const g = game.grid, pal = game.cfg.palette, W = g.w, H = g.h, n = g.n;
      this.scene.background = new T.Color(pal.bg);
      this.scene.fog = new T.FogExp2(pal.fog, 0.02);
      const grp = this.stageGroup = new T.Group(); this.scene.add(grp);
      this.offX = -W / 2 + 0.5; this.offZ = -H / 2 + 0.5;
      // 네온 격자 바닥
      const size = Math.max(W, H) * 4;
      this.floorMat = new T.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uColor: { value: new T.Color(pal.grid) }, uAccent: { value: new T.Color(pal.accent) },
          uArena: { value: new T.Vector2(W / 2, H / 2) }, uFog: { value: new T.Color(pal.fog) }
        },
        vertexShader: FLOOR_VS, fragmentShader: FLOOR_FS
      });
      const floor = new T.Mesh(new T.PlaneGeometry(size, size), this.floorMat);
      floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01; grp.add(floor);
      // 경기장 벽 + 기둥 + 반투명 에너지 장막
      const wallMat = new T.MeshBasicMaterial({ color: new T.Color(pal.wall).multiplyScalar(0.9) });
      const wh = 0.5, wt = 0.18;
      const mk = (sx, sz, px, pz) => { const m = new T.Mesh(new T.BoxGeometry(sx, wh, sz), wallMat); m.position.set(px, wh / 2, pz); grp.add(m); };
      mk(W + wt * 2, wt, 0, -H / 2 - wt / 2); mk(W + wt * 2, wt, 0, H / 2 + wt / 2);
      mk(wt, H, -W / 2 - wt / 2, 0); mk(wt, H, W / 2 + wt / 2, 0);
      const pillarGeo = new T.BoxGeometry(0.5, 2.4, 0.5);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => {
        const p = new T.Mesh(pillarGeo, wallMat); p.position.set(a * (W / 2 + 0.1), 1.2, b * (H / 2 + 0.1)); grp.add(p);
      });
      const panelMat = new T.MeshBasicMaterial({ color: new T.Color(pal.wall), transparent: true, opacity: 0.05, side: T.DoubleSide, depthWrite: false });
      const ph = 2.2;
      const mkp = (sx, px, pz, rot) => { const m = new T.Mesh(new T.PlaneGeometry(sx, ph), panelMat); m.position.set(px, ph / 2, pz); m.rotation.y = rot; grp.add(m); };
      mkp(W, 0, -H / 2, 0); mkp(W, 0, H / 2, 0); mkp(H, -W / 2, 0, Math.PI / 2); mkp(H, W / 2, 0, Math.PI / 2);
      // 영역/궤적 인스턴스 메시
      const cellGeo = new T.BoxGeometry(0.94, 0.22, 0.94); cellGeo.translate(0, 0.11, 0);
      const terrMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.3 });
      terrMat.onBeforeCompile = (s) => {
        s.uniforms.uBoost = { value: 0.6 };
        s.fragmentShader = s.fragmentShader
          .replace('uniform vec3 emissive;', 'uniform vec3 emissive;\nuniform float uBoost;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * uBoost;');
      };
      this.terr = new T.InstancedMesh(cellGeo, terrMat, n);
      this.terr.instanceMatrix.setUsage(T.DynamicDrawUsage); this.terr.frustumCulled = false;
      const trailGeo = new T.BoxGeometry(1, 0.4, 1); trailGeo.translate(0, 0.2, 0);
      this.trailMesh = new T.InstancedMesh(trailGeo, new T.MeshBasicMaterial({ color: 0xffffff }), n);
      this.trailMesh.instanceMatrix.setUsage(T.DynamicDrawUsage); this.trailMesh.frustumCulled = false;
      const black = new T.Color(0, 0, 0);
      for (let i = 0; i < n; i++) {
        this.terr.setMatrixAt(i, this.zeroM); this.terr.setColorAt(i, black);
        this.trailMesh.setMatrixAt(i, this.zeroM); this.trailMesh.setColorAt(i, black);
      }
      grp.add(this.terr); grp.add(this.trailMesh);
      this.colors = {};
      for (const e of game.entities) {
        const c = new T.Color(e.color);
        this.colors[e.id] = { base: c, terr: c.clone().multiplyScalar(0.5), trail: c.clone().multiplyScalar(1.35) };
      }
      for (const e of game.entities) this.entityMeshes.set(e.id, this.makeEntityMesh(e));
      this.makeDust(grp, W, H, pal);
      for (let i = 0; i < n; i++) this.writeCell(i);
      g.dirty.length = 0;
      this.terr.instanceMatrix.needsUpdate = true; this.terr.instanceColor.needsUpdate = true;
      this.trailMesh.instanceMatrix.needsUpdate = true; this.trailMesh.instanceColor.needsUpdate = true;
      const big = Math.max(W, H);
      this.big = big;
      this.viewW = Math.min(24, Math.max(14, big * 0.55));   // 세로 화면: 가로로 보이는 칸 수
      this.viewH = Math.min(20, Math.max(11, big * 0.42));   // 가로 화면: 세로로 보이는 칸 수
      this.camH = 9 + big * 0.16; this.camD = this.camH * 0.62;
      const p = game.player;
      this.lastPlayerPos = { x: p.x + this.offX, z: p.y + this.offZ };
      this.camTarget.set(this.lastPlayerPos.x, 0, this.lastPlayerPos.z); this.camLook.copy(this.camTarget);
      if (this.mode === 'orbit') this.camPos.set(0, big * 0.9, big * 0.9);
      else this.camPos.set(this.camTarget.x, this.camH * 2.2, this.camTarget.z + this.camD * 2.2);
      this.playerLight.color.set(p.color);
    }
    makeDust(grp, W, H, pal) {
      const T = this.T, n = this.quality === 'low' ? 120 : 320;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (Math.random() - 0.5) * W; pos[i * 3 + 1] = Math.random() * 5 + 0.2; pos[i * 3 + 2] = (Math.random() - 0.5) * H;
      }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      const mat = new T.PointsMaterial({ color: new T.Color(pal.accent), size: 0.16, map: this.glowTex, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false });
      this.dust = new T.Points(geo, mat); this.dust.frustumCulled = false; this.dustH = H; grp.add(this.dust);
    }
    makeEntityMesh(e) {
      const T = this.T, col = new T.Color(e.color), grp = new T.Group();
      const core = new T.Mesh(new T.OctahedronGeometry(0.42, 0),
        new T.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.25), emissive: col, emissiveIntensity: 1.5, roughness: 0.2, metalness: 0.7 }));
      core.position.y = 0.45; core.scale.set(1, 0.72, 1); grp.add(core);
      const nose = new T.Mesh(new T.ConeGeometry(0.16, 0.42, 4), new T.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.5) }));
      nose.rotation.z = -Math.PI / 2; nose.position.set(0.62, 0.45, 0); grp.add(nose);
      const ring = new T.Mesh(new T.TorusGeometry(0.62, 0.045, 8, 36), new T.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.7) }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.35; grp.add(ring);
      const wire = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(0.95, 0.95, 0.95)),
        new T.LineBasicMaterial({ color: col.clone().multiplyScalar(1.8), transparent: true, opacity: 0.65 }));
      wire.position.y = 0.45; grp.add(wire);
      const spr = new T.Sprite(new T.SpriteMaterial({ map: this.glowTex, color: col, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.35 }));
      spr.scale.set(e.isPlayer ? 2.4 : 2.0, e.isPlayer ? 2.4 : 2.0, 1); spr.position.y = 0.45; grp.add(spr);
      grp.userData = { core, ring, wire, spr, heading: 0 };
      this.scene.add(grp);
      return grp;
    }

    /* ---------- 이벤트 이펙트 ---------- */
    onCapture(d) {
      const g = this.game.grid, cells = d.cells, col = this.colors[d.id];
      if (!cells.length || !col) return;
      const ox = d.origin.x, oy = d.origin.y;
      for (let k = 0; k < cells.length; k++) {
        const i = cells[k], dist = Math.abs(g.xOf(i) - ox) + Math.abs(g.yOf(i) - oy);
        this.anims.set(i, { kind: 'grow', start: this.time + dist * 0.018, dur: 0.5, color: null });
      }
      const nP = Math.min(cells.length, 60);
      for (let k = 0; k < nP; k++) {
        const i = cells[(Math.random() * cells.length) | 0];
        this.particles.emit(g.xOf(i) + this.offX, 0.3, g.yOf(i) + this.offZ, col.base, 1, { speed: 0.5, up: 2.4, life: 0.9, size: 0.45, grav: 1.5 });
      }
      this.particles.emit(ox + this.offX, 0.4, oy + this.offZ, col.base, d.isPlayer ? 40 : 14, { speed: 3.5, up: 2.5, life: 0.8, size: 0.55 });
      this.rings.spawn(ox + this.offX, oy + this.offZ, col.base, 2 + Math.sqrt(cells.length) * 0.5, 0.7);
    }
    onDeath(d) {
      const g = this.game.grid, col = this.colors[d.id];
      if (!col) return;
      const wx = d.x + this.offX, wz = d.y + this.offZ;
      this.particles.emit(wx, 0.5, wz, col.base, d.isPlayer ? 150 : 80, { speed: 6, up: 4, life: 1.2, size: 0.7, spread: 0.4, grav: 4, damp: 1.5 });
      this.particles.emit(wx, 0.5, wz, this.white, 24, { speed: 2, up: 5, life: 0.6, size: 0.9 });
      this.rings.spawn(wx, wz, col.base, 5, 0.8); this.rings.spawn(wx, wz, this.white, 2.5, 0.45);
      for (let k = 0; k < d.cleared.length; k++) {
        const i = d.cleared[k], dist = Math.abs(g.xOf(i) - d.x) + Math.abs(g.yOf(i) - d.y);
        this.anims.set(i, { kind: 'shrink', start: this.time + dist * 0.02, dur: 0.45, color: col.terr });
      }
      this.shake(d.isPlayer ? 1.0 : 0.35);
    }
    onRespawn(d) {
      const col = this.colors[d.id];
      if (!col) return;
      const wx = d.x + this.offX, wz = d.y + this.offZ;
      this.rings.spawn(wx, wz, col.base, 2.6, 0.7);
      this.particles.emit(wx, 0.3, wz, col.base, 40, { speed: 1.5, up: 4, life: 1, size: 0.5, grav: 0.5 });
    }

    /* ---------- 프레임 ---------- */
    writeCell(i, s, col) {
      const g = this.game.grid, o = g.owner[i], t = g.trail[i];
      const x = (i % g.w) + this.offX, z = ((i / g.w) | 0) + this.offZ;
      if (s == null) {
        if (o) { this._m.makeScale(1, 1, 1).setPosition(x, 0, z); this.terr.setMatrixAt(i, this._m); this.terr.setColorAt(i, this.colors[o].terr); }
        else this.terr.setMatrixAt(i, this.zeroM);
      } else {
        const c = col || (o ? this.colors[o].terr : null);
        if (c && s > 0.001) { this._m.makeScale(s, s, s).setPosition(x, 0, z); this.terr.setMatrixAt(i, this._m); this.terr.setColorAt(i, c); }
        else this.terr.setMatrixAt(i, this.zeroM);
      }
      if (t && this.colors[t]) {
        const tr = g.trail, w = g.w, cx = i % w, cz = (i / w) | 0;
        const hL = cx > 0 && tr[i - 1] === t, hR = cx < w - 1 && tr[i + 1] === t;
        const hU = cz > 0 && tr[i - w] === t, hD = cz < g.h - 1 && tr[i + w] === t;
        const sx = (hL || hR) ? 1 : 0.58, sz = (hU || hD) ? 1 : 0.58;
        this._m.makeScale(sx, 1, sz).setPosition(x, 0.06, z); this.trailMesh.setMatrixAt(i, this._m); this.trailMesh.setColorAt(i, this.colors[t].trail);
      } else this.trailMesh.setMatrixAt(i, this.zeroM);
    }
    updateCells() {
      const g = this.game.grid, dirty = g.dirty;
      let changed = dirty.length > 0;
      const tr = g.trail, w = g.w;
      for (let k = 0; k < dirty.length; k++) {
        const i = dirty[k];
        if (!this.anims.has(i)) this.writeCell(i);
        if (tr[i]) { // 이웃 궤적 셀의 띠 모양도 갱신
          const cx = i % w, cz = (i / w) | 0;
          if (cx > 0 && tr[i - 1] && !this.anims.has(i - 1)) this.writeCell(i - 1);
          if (cx < w - 1 && tr[i + 1] && !this.anims.has(i + 1)) this.writeCell(i + 1);
          if (cz > 0 && tr[i - w] && !this.anims.has(i - w)) this.writeCell(i - w);
          if (cz < g.h - 1 && tr[i + w] && !this.anims.has(i + w)) this.writeCell(i + w);
        }
      }
      dirty.length = 0;
      if (this.anims.size) {
        changed = true;
        for (const [i, a] of this.anims) {
          const t = (this.time - a.start) / a.dur;
          if (t < 0) this.writeCell(i, a.kind === 'grow' ? 0 : 1, a.color);
          else if (t >= 1) { this.anims.delete(i); this.writeCell(i); }
          else {
            let s;
            if (a.kind === 'grow') { const u = t - 1, k = 1.9; s = 1 + (k + 1) * u * u * u + k * u * u; }
            else s = 1 - t * t;
            this.writeCell(i, s, a.color);
          }
        }
      }
      if (changed) {
        this.terr.instanceMatrix.needsUpdate = true; this.terr.instanceColor.needsUpdate = true;
        this.trailMesh.instanceMatrix.needsUpdate = true; this.trailMesh.instanceColor.needsUpdate = true;
      }
    }
    updateEntities(dt) {
      const DIRS = window.DIRS;
      for (const e of this.game.entities) {
        const m = this.entityMeshes.get(e.id);
        if (!m) continue;
        const blink = e.protect > 0 && (Math.floor(this.time * 14) % 2 === 0);
        m.visible = e.alive && !blink;
        if (!e.alive) continue;
        const moving = e.dir >= 0 && !e.stopped;
        const px = e.x + (moving ? DIRS[e.dir].x * e.progress : 0), pz = e.y + (moving ? DIRS[e.dir].y * e.progress : 0);
        const wx = px + this.offX, wz = pz + this.offZ;
        m.position.set(wx, 0.1 + Math.sin(this.time * 5 + e.id * 1.7) * 0.06, wz);
        const ud = m.userData;
        if (e.dir >= 0) ud.heading = lerpAngle(ud.heading, Math.atan2(-DIRS[e.dir].y, DIRS[e.dir].x), 1 - Math.exp(-dt * 14));
        m.rotation.y = ud.heading;
        ud.core.rotation.y += dt * 3; ud.wire.rotation.y -= dt * 1.4; ud.wire.rotation.x += dt * 0.9;
        ud.ring.rotation.z += dt * 2.5; ud.ring.position.y = 0.35 + Math.sin(this.time * 6 + e.id) * 0.05;
        ud.spr.material.opacity = 0.25 + 0.12 * Math.sin(this.time * 7 + e.id);
        if (e.trail.length && moving && Math.random() < 0.7)
          this.particles.emit(wx, 0.3, wz, this.colors[e.id].base, 1, { speed: 0.4, up: 1.4, life: 0.7, size: 0.4, grav: 0.8, spread: 0.2 });
        if (e.isPlayer) { this.playerLight.position.set(wx, 1.6, wz); this.lastPlayerPos = { x: wx, z: wz }; }
      }
    }
    updateDust(dt) {
      if (!this.dust) return;
      const a = this.dust.geometry.attributes.position, arr = a.array;
      for (let i = 1; i < arr.length; i += 3) { arr[i] += dt * 0.35; if (arr[i] > 5.5) arr[i] = 0.2; }
      a.needsUpdate = true;
    }
    updateCamera(dt) {
      const cam = this.camera, k = 1 - Math.exp(-dt * 5);
      const portrait = this.height > this.width;
      const tanV = Math.tan(cam.fov * Math.PI / 360), aspect = cam.aspect || 1;
      if (this.mode === 'orbit' || !this.game) {
        this.orbitA += dt * 0.12;
        const big = this.big || 30;
        // 경기장 전체가 들어오도록 거리 계산
        const dist = (big * 1.15 / 2) / (tanV * Math.min(1, aspect));
        const pitch = 48 * Math.PI / 180;
        const R = dist * Math.cos(pitch), h = dist * Math.sin(pitch);
        this.camPos.lerp(this._p.set(Math.cos(this.orbitA) * R, h, Math.sin(this.orbitA) * R), k);
        this.camLook.lerp(this.zero, k);
      } else {
        if (this.lastPlayerPos) this.camTarget.set(this.lastPlayerPos.x, 0, this.lastPlayerPos.z);
        // 화면 비율에 맞춰 보이는 칸 수가 일정하도록 거리 계산
        const dist = portrait ? (this.viewW / 2) / (tanV * aspect) : (this.viewH / 2) / tanV;
        const pitch = 58 * Math.PI / 180;
        const h = dist * Math.sin(pitch), d = dist * Math.cos(pitch);
        const ahead = portrait ? 2.5 : 1;
        this.camPos.lerp(this._p.set(this.camTarget.x, h, this.camTarget.z + d), k);
        this.camLook.lerp(this._p.set(this.camTarget.x, 0, this.camTarget.z - ahead), k);
      }
      this.shakeAmt *= Math.exp(-dt * 6);
      const s = this.shakeAmt, sx = (Math.random() - 0.5) * s, sy = (Math.random() - 0.5) * s, sz = (Math.random() - 0.5) * s;
      cam.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z + sz);
      cam.lookAt(this.camLook.x + sx * 0.5, this.camLook.y, this.camLook.z + sz * 0.5);
    }
    render(dt, game) {
      this.time += dt;
      if (this.floorMat) this.floorMat.uniforms.uTime.value = this.time;
      if (this.game) { this.updateCells(); this.updateEntities(dt); this.updateDust(dt); }
      this.particles.update(dt); this.rings.update(dt);
      this.updateCamera(dt);
      this.composer.render();
    }
  }
  window.Renderer3D = Renderer3D;
})();
