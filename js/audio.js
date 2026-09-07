/* 웹오디오 신스 — 효과음 + 신스웨이브 배경음 시퀀서 (외부 파일 없음) */
(function () {
  const AudioFX = {
    ctx: null, master: null, sfx: null, mus: null, sound: true, music: true,
    _timer: null, _step: 0, _next: 0, _stage: 1, _on: false, _pending: 0, noiseBuf: null,
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createDynamicsCompressor();
      this.master.threshold.value = -14; this.master.ratio.value = 5;
      this.master.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = this.sound ? 0.85 : 0; this.sfx.connect(this.master);
      this.mus = c.createGain(); this.mus.gain.value = this.music ? 0.3 : 0; this.mus.connect(this.master);
      const len = c.sampleRate * 1.2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      if (this._pending) { const s = this._pending; this._pending = 0; this.startMusic(s); }
    },
    setSound(v) { this.sound = v; if (this.sfx) this.sfx.gain.value = v ? 0.85 : 0; },
    setMusic(v) { this.music = v; if (this.mus) this.mus.gain.setTargetAtTime(v ? 0.3 : 0, this.ctx.currentTime, 0.08); },
    tone(o) {
      if (!this.ctx) return;
      const c = this.ctx, now = c.currentTime + (o.t || 0), dur = o.dur || 0.2;
      const osc = c.createOscillator(); osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f || 440, now);
      if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, now + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(o.vol == null ? 0.3 : o.vol, now + (o.a || 0.006));
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      let node = osc;
      if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q || 1; osc.connect(f); node = f; }
      node.connect(g); g.connect(o.dest || this.sfx);
      osc.start(now); osc.stop(now + dur + 0.05);
    },
    noise(o) {
      if (!this.ctx || !this.noiseBuf) return;
      const c = this.ctx, now = c.currentTime + (o.t || 0), dur = o.dur || 0.3;
      const src = c.createBufferSource(); src.buffer = this.noiseBuf;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = o.hp || 200;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lp || 9000;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(o.vol == null ? 0.3 : o.vol, now + (o.a || 0.004));
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(o.dest || this.sfx);
      src.start(now); src.stop(now + dur + 0.05);
    },
    play(name) {
      if (!this.ctx || !this.sound) return;
      const T = (o) => this.tone(o), N = (o) => this.noise(o);
      switch (name) {
        case 'ui': T({ f: 900, f2: 1400, type: 'square', dur: 0.07, vol: 0.08 }); break;
        case 'turn': T({ f: 480, f2: 620, type: 'triangle', dur: 0.05, vol: 0.09 }); break;
        case 'capture':
          [523, 659, 784].forEach((f, i) => T({ f, type: 'sine', t: i * 0.06, dur: 0.22, vol: 0.22 }));
          N({ dur: 0.18, vol: 0.08, hp: 3000 }); break;
        case 'bigCapture':
          [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => T({ f, type: 'triangle', t: i * 0.055, dur: 0.35, vol: 0.22 }));
          T({ f: 1568, f2: 2093, type: 'sine', t: 0.35, dur: 0.5, vol: 0.15 });
          N({ dur: 0.4, vol: 0.12, hp: 2500 }); break;
        case 'death':
          N({ dur: 0.7, vol: 0.5, hp: 80, lp: 4000 });
          T({ f: 220, f2: 35, type: 'sawtooth', dur: 0.7, vol: 0.35, lp: 1200 });
          T({ f: 110, f2: 30, type: 'square', dur: 0.5, vol: 0.2 }); break;
        case 'enemyDeath':
          N({ dur: 0.4, vol: 0.25, hp: 300, lp: 6000 });
          T({ f: 400, f2: 60, type: 'sawtooth', dur: 0.35, vol: 0.18, lp: 1500 }); break;
        case 'kill':
          T({ f: 300, f2: 1200, type: 'sawtooth', dur: 0.18, vol: 0.2, lp: 3000 });
          T({ f: 1200, f2: 1800, type: 'square', t: 0.12, dur: 0.15, vol: 0.12 });
          N({ dur: 0.3, vol: 0.2, hp: 1000 }); break;
        case 'eliminate':
          [880, 1108, 1318, 1760].forEach((f, i) => T({ f, type: 'square', t: i * 0.07, dur: 0.2, vol: 0.12 }));
          N({ dur: 0.5, vol: 0.25, hp: 600 }); break;
        case 'count': T({ f: 660, type: 'square', dur: 0.12, vol: 0.12 }); break;
        case 'go':
          T({ f: 880, f2: 1320, type: 'square', dur: 0.4, vol: 0.14 });
          [660, 880, 1320].forEach((f, i) => T({ f, type: 'triangle', t: i * 0.05, dur: 0.5, vol: 0.14 })); break;
        case 'clear':
          [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => T({ f, type: 'square', t: i * 0.1, dur: 0.3, vol: 0.11 }));
          [261, 329, 392, 523].forEach((f, i) => T({ f, type: 'sawtooth', t: 0.8 + i * 0.02, dur: 1.4, vol: 0.09, lp: 2000 }));
          N({ t: 0.8, dur: 1.0, vol: 0.12, hp: 4000 }); break;
        case 'over':
          [440, 415, 392, 349, 311].forEach((f, i) => T({ f, type: 'sawtooth', t: i * 0.22, dur: 0.5, vol: 0.14, lp: 1500 }));
          T({ f: 110, f2: 55, type: 'square', t: 1.1, dur: 1.5, vol: 0.14 }); break;
        case 'warning': T({ f: 1000, f2: 900, type: 'square', dur: 0.09, vol: 0.13 }); break;
        case 'respawn': T({ f: 300, f2: 1500, type: 'sine', dur: 0.4, vol: 0.18 }); N({ dur: 0.25, vol: 0.06, hp: 4000 }); break;
        case 'unlock': [784, 988, 1175, 1568].forEach((f, i) => T({ f, type: 'sine', t: i * 0.08, dur: 0.4, vol: 0.14 })); break;
        default: break;
      }
    },
    /* ---------- 배경음 시퀀서 ---------- */
    startMusic(stage) {
      this._stage = stage || 1;
      if (!this.ctx) { this._pending = this._stage; return; }
      this._on = true; this._step = 0; this._next = this.ctx.currentTime + 0.05;
      if (!this._timer) this._timer = setInterval(() => this._schedule(), 40);
    },
    stopMusic() {
      this._on = false; this._pending = 0;
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
    },
    _schedule() {
      if (!this._on || !this.ctx) return;
      const c = this.ctx, bpm = 116 + this._stage * 4, spb = 60 / bpm / 4;
      while (this._next < c.currentTime + 0.14) {
        this._playStep(this._step, this._next - c.currentTime, spb);
        this._step = (this._step + 1) % 64;
        this._next += spb;
      }
    },
    _playStep(step, t, spb) {
      const keyShift = [0, 2, -3, 5, -2, 3, 1, -4, 4, -1][(this._stage - 1) % 10];
      const roots = [0, -4, 3, -2], bar = ((step / 16) | 0) % 4;
      const base = 110 * Math.pow(2, (keyShift + roots[bar]) / 12);
      const dest = this.mus;
      if (step % 4 === 0) this.tone({ f: 160, f2: 42, type: 'sine', t, dur: 0.22, vol: 0.9, dest });
      if (step % 8 === 4) { this.noise({ t, dur: 0.16, vol: 0.32, hp: 900, lp: 7000, dest }); this.tone({ f: 190, f2: 120, type: 'triangle', t, dur: 0.12, vol: 0.25, dest }); }
      if (step % 2 === 0) this.noise({ t, dur: 0.035, vol: step % 4 === 2 ? 0.1 : 0.16, hp: 6500, dest });
      if (step % 2 === 0) {
        const oct = (step % 8 === 6) ? 2 : 1;
        this.tone({ f: base * oct, type: 'sawtooth', t, dur: spb * 1.7, vol: 0.28, lp: 380 + this._stage * 40, q: 3, dest });
      }
      const third = bar === 0 ? 3 : 4;
      const pat = [0, 7, 12, 7, third, 12, 7, 12, 0, 7, third + 12, 7, 12, 19, 12, 7];
      const semi = pat[step % 16];
      this.tone({ f: base * 4 * Math.pow(2, semi / 12), type: 'square', t, dur: spb * 0.85, vol: 0.055, lp: 3500, dest });
      if (step % 16 === 14 && this._stage >= 3) this.tone({ f: base * 8, f2: base * 6, type: 'sine', t, dur: spb * 1.5, vol: 0.08, dest });
    }
  };
  window.AudioFX = AudioFX;
})();
