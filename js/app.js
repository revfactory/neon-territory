/* 앱 — 게임 생성/이벤트 연결, 스테이지 흐름(런), 일시정지, 렌더 루프, 멀티플레이 로비 */
(function () {
  const App = {
    game: null, renderer: null, paused: false, runScore: 0, runStart: 0, stageId: 1, last: 0,
    start(deps) {
      Storage.load();
      const st = Storage.settings;
      AudioFX.sound = st.sound; AudioFX.music = st.music; Haptics.enabled = st.vibrate;
      const canvas = document.getElementById('gl');
      this.renderer = new Renderer3D(deps, canvas, this.effectiveQuality());
      UI.init(this);
      Input.attach(document.body);
      Input.onDir = (d) => { if (this.game && !this.paused && !this.game.demo) this.game.setPlayerDir(d); };
      Input.onPause = () => this.togglePause();
      Input.onAny = () => AudioFX.init();
      document.addEventListener('pointerup', () => AudioFX.init(), { once: false });
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
      this.initNet();
      this.startDemo();
      UI.show('title');
      document.getElementById('loading').classList.add('hide');
      this.last = performance.now();
      requestAnimationFrame((t) => this.loop(t));
      const code = new URLSearchParams(location.search).get('room');
      if (code) this.openLobby(code.toUpperCase());
    },
    detectQuality() {
      const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
      return mobile ? 'medium' : 'high';
    },
    effectiveQuality() { const q = Storage.settings.quality; return q === 'auto' ? this.detectQuality() : q; },
    applyQuality() { this.renderer.setQuality(this.effectiveQuality()); },
    loop(t) {
      const dt = Math.min(0.05, Math.max(0, (t - this.last) / 1000));
      this.last = t;
      if (this.game && !this.paused) this.game.update(dt);
      this.renderer.render(dt, this.game);
      UI.updateHUD(this.game);
      requestAnimationFrame((tt) => this.loop(tt));
    },
    startDemo() {
      this.paused = false;
      const cfg = Object.assign({}, STAGES[3], { enemies: 4 });
      const g = new Game(cfg, { demo: true });
      this.bind(g);
      this.game = g;
      this.renderer.mode = 'orbit';
      g.start();
      this.renderer.setStage(g);
    },
    startRun(stageId) { this.runScore = 0; this.startStage(stageId); },
    startStage(id) {
      this.stageId = id; this.runStart = this.runScore;
      const cfg = STAGES[id - 1];
      const g = new Game(cfg, { runScore: this.runScore, lives: 3 });
      this.bind(g);
      this.game = g; this.paused = false;
      this.renderer.mode = 'follow';
      g.start();
      this.renderer.setStage(g);
      UI.show('hud'); UI.resetHUD(g); UI.showIntro(cfg);
      AudioFX.init(); AudioFX.startMusic(id);
    },
    nextStage() { if (this.stageId >= 10) { this.toMenu(); return; } this.startStage(this.stageId + 1); },
    retryStage() { if (this.game && this.game.multi) return; this.runScore = this.runStart; this.startStage(this.stageId); },
    toMenu() { AudioFX.stopMusic(); UI.hideIntro(); Net.leave(); this.startDemo(); UI.show('title'); },
    /* 멀티는 서버가 계속 돌기 때문에 멈추지 않고 메뉴만 띄운다 */
    pause() {
      if (!this.game || this.game.demo) return;
      if (this.game.state !== 'playing' && this.game.state !== 'intro') return;
      if (this.game.multi) { UI.show('pause'); return; }
      if (this.paused) return;
      this.paused = true; UI.show('pause');
    },
    resume() {
      if (this.game && this.game.multi) { if (UI.current === 'pause') UI.show('hud'); return; }
      if (!this.paused) return;
      this.paused = false; this.last = performance.now(); UI.show('hud');
    },
    togglePause() { if (this.paused || UI.current === 'pause') this.resume(); else this.pause(); },

    /* ---------- 멀티플레이 ---------- */
    initNet() {
      Net.onStatus = (s, bad) => UI.lobbyStatus(s, bad);
      Net.onLobby = (l) => UI.renderLobby(l);
      Net.onError = (msg) => UI.lobbyStatus(msg, true);
      Net.onStart = (m) => this.startMulti(m);
      Net.onLeft = () => UI.renderLobby(null);
    },
    openLobby(code) {
      AudioFX.stopMusic(); UI.hideIntro();
      if (this.game && !this.game.demo) this.startDemo();
      UI.show('lobby'); UI.renderLobby(Net.lobby);
      if (code) UI.setJoinCode(code);
      Net.connect().catch(() => {});
    },
    startMulti(m) {
      const g = new NetGame(m);
      Net.game = g;
      this.bind(g);
      this.game = g; this.paused = false;
      this.renderer.mode = 'follow';
      this.renderer.setStage(g);
      UI.show('hud'); UI.resetHUD(g);
      if (g.state === 'intro') UI.showIntro(g.cfg); else UI.hideIntro();
      AudioFX.init(); AudioFX.startMusic(5);
    },
    onMatchOver(g, d) {
      const me = g.player.id, won = d.winnerId === me;
      AudioFX.stopMusic(); AudioFX.play(won ? 'clear' : 'over'); Haptics.trigger(won ? 'clear' : 'over');
      if (won) { ScreenFX.flash('#ffffff', 0.6, 600); this.renderer.shake(0.5); }
      else ScreenFX.vignette('#ff2040', 1500);
      UI.hideIntro();
      UI.banner(won ? 'VICTORY!' : 'MATCH OVER', won ? 'clear' : 'over', 1600);
      setTimeout(() => { if (this.game === g) UI.showMatch(d, me); }, 1700);
    },

    /* 게임 이벤트를 렌더러·UI·효과음에 연결한다. 내 개체(me) 기준으로 연출을 가른다 */
    bind(g) {
      const R = this.renderer, demo = g.demo;
      const isMe = (id) => !!g.player && id === g.player.id; // bind 는 start() 전에 불리므로 이벤트 시점에 읽는다
      g.on('capture', (d) => {
        R.onCapture(d);
        if (demo || !isMe(d.id)) return;
        const s = R.worldToScreen(d.origin.x, d.origin.y);
        UI.popup('+' + d.points, s.x, s.y - 20, d.mult > 1 ? 'big' : '');
        if (d.mult > 1) UI.popup('×' + d.mult + ' COMBO', s.x, s.y + 22, 'combo');
        AudioFX.play(d.mult > 1 ? 'bigCapture' : 'capture');
        Haptics.trigger(d.mult > 1 ? 'bigCapture' : 'capture');
        ScreenFX.flash('#00f0ff', d.mult > 1 ? 0.35 : 0.14, 320);
        R.shake(d.mult > 1 ? 0.4 : 0.12);
      });
      g.on('death', (d) => {
        R.onDeath(d);
        if (demo) return;
        if (isMe(d.id)) {
          AudioFX.play('death'); Haptics.trigger('death');
          ScreenFX.flash('#ff2040', 0.5, 420); ScreenFX.vignette('#ff2040', 900); ScreenFX.shakeHud();
          UI.banner(d.out ? '탈락!' : d.suicide ? '자기 꼬리에 충돌!' : '격추당했다!', 'danger', 1200);
        } else if (isMe(d.killerId)) {
          AudioFX.play(d.eliminated ? 'eliminate' : 'kill'); Haptics.trigger(d.eliminated ? 'eliminate' : 'kill');
          const s = R.worldToScreen(d.x, d.y);
          UI.popup((d.eliminated ? 'ELIMINATED! +' : 'KILL! +') + d.points, s.x, s.y, 'kill');
          ScreenFX.flash('#ff2bd6', 0.25, 300);
        } else AudioFX.play('enemyDeath');
      });
      g.on('respawn', (d) => { R.onRespawn(d); if (!demo && isMe(d.id)) { AudioFX.play('respawn'); Haptics.trigger('respawn'); } });
      g.on('turn', (d) => { if (!demo && isMe(d.id)) AudioFX.play('turn'); });
      g.on('countdown', (d) => { UI.banner(String(d.n), 'count', 900); AudioFX.play('count'); Haptics.trigger('ui'); });
      g.on('go', () => {
        UI.hideIntro(); UI.banner('GO!', 'go', 800); AudioFX.play('go'); Haptics.trigger('go');
        if (g.cfg.id === 1) UI.showHint(6000);
      });
      g.on('warning', () => { AudioFX.play('warning'); Haptics.trigger('warning'); });
      g.on('stageClear', (d) => this.onStageClear(g, d));
      g.on('gameOver', (d) => this.onGameOver(g, d));
      g.on('matchOver', (d) => this.onMatchOver(g, d));
    },
    onStageClear(g, d) {
      const newBest = Storage.recordStage(d.stageId, d.stageTotal, d.stars);
      this.runScore = d.runTotal;
      AudioFX.stopMusic(); AudioFX.play('clear'); Haptics.trigger('clear');
      ScreenFX.flash('#ffffff', 0.6, 600); this.renderer.shake(0.5);
      UI.banner('STAGE CLEAR!', 'clear', 1600);
      setTimeout(() => {
        if (this.game !== g) return;
        if (d.stageId >= 10) {
          UI.showOver({ reason: 'clear', total: d.runTotal, stageId: 10, stats: d.stats, percent: d.percent, target: g.cfg.target }, true);
        } else UI.showClear(d, newBest);
      }, 1700);
    },
    onGameOver(g, d) {
      AudioFX.stopMusic(); AudioFX.play('over'); Haptics.trigger('over');
      ScreenFX.vignette('#ff2040', 1500);
      UI.banner(d.reason === 'time' ? 'TIME OVER' : 'GAME OVER', 'over', 1600);
      setTimeout(() => { if (this.game === g) UI.showOver(d, false); }, 1700);
    }
  };
  window.App = App;
})();
