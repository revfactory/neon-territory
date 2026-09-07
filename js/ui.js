/* UI — 화면 전환, HUD, 스테이지 선택, 점수판, 결과 화면, 팝업/배너 */
(function () {
  const $ = (s) => document.querySelector(s);
  const fmt = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  const QUALITY_LABEL = { auto: '자동', high: '고화질', medium: '중간', low: '저화질' };

  const UI = {
    app: null, screens: {}, current: '', hud: {}, last: {}, _bt: 0, _ht: 0, submitted: false, overData: null,
    init(app) {
      this.app = app;
      document.querySelectorAll('.screen').forEach((s) => { this.screens[s.id.replace('screen-', '')] = s; });
      document.body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-action]');
        if (!b) return;
        e.preventDefault();
        AudioFX.init(); AudioFX.play('ui'); Haptics.trigger('ui');
        this.action(b.dataset.action, b);
      });
      ['stage', 'pct', 'pctFill', 'target', 'timer', 'score', 'lives', 'enemies', 'hint'].forEach((k) => { this.hud[k] = document.getElementById('hud-' + k); });
      const inp = $('#name-input');
      inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9가-힣ㄱ-ㅎ]/g, '').slice(0, 3); });
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.submitName(); });
      ['#lobby-name', '#lobby-code'].forEach((sel) => {
        const el = $(sel);
        el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.action(sel === '#lobby-code' ? 'mp-join' : 'mp-create'); });
      });
      $('#lobby-code').addEventListener('input', () => { const el = $('#lobby-code'); el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
      $('#lobby-name').value = Storage.settings.nick || '';
      $('#room-bots').addEventListener('change', (e) => Net.setBots(+e.target.value));
      this.syncSettings();
      this.renderTitle();
    },
    show(name) {
      for (const k in this.screens) this.screens[k].classList.toggle('active', k === name);
      this.current = name;
      $('#hud').classList.toggle('active', name === 'hud' || name === 'pause');
      if (name === 'stages') this.renderStages();
      if (name === 'scores') this.renderScores();
      if (name === 'title') this.renderTitle();
      if (name === 'pause') $('#btn-pause-retry').hidden = !!(this.app.game && this.app.game.multi);
    },
    action(a, el) {
      const app = this.app;
      if (this.current === 'over' && !this.submitted && (a === 'retry' || a === 'title' || a === 'scores')) this.submitName(true);
      switch (a) {
        case 'start': app.startRun(1); break;
        case 'multi': app.openLobby(); break;
        case 'mp-create': { const n = this.nick(); if (n) Net.connect().then(() => Net.create(n)).catch(() => {}); break; }
        case 'mp-join': {
          const n = this.nick(), code = ($('#lobby-code').value || '').toUpperCase().trim();
          if (!n) break;
          if (code.length < 4) { this.lobbyStatus('방 코드 4자를 입력해 주세요', true); break; }
          Net.connect().then(() => Net.join(code, n)).catch(() => {});
          break;
        }
        case 'mp-ready': { const l = Net.lobby, me = l && l.players.find((p) => p.pid === l.you); Net.ready(!(me && me.ready)); break; }
        case 'mp-start': Net.start(); break;
        case 'mp-leave': Net.leave(); this.renderLobby(null); break;
        case 'mp-copy': this.copyInvite(); break;
        case 'mp-back': Net.leave(); this.show('title'); break;
        case 'mp-again': app.openLobby(); break;
        case 'continue': app.startRun(Storage.data.unlocked); break;
        case 'stages': this.show('stages'); break;
        case 'scores': this.show('scores'); break;
        case 'title': app.toMenu(); break;
        case 'back': if (app.game && !app.game.demo) app.toMenu(); else this.show('title'); break;
        case 'pause': app.togglePause(); break;
        case 'resume': app.resume(); break;
        case 'retry': app.retryStage(); break;
        case 'next': app.nextStage(); break;
        case 'stage': app.startRun(+el.dataset.stage); break;
        case 'toggle-sound': Storage.setSetting('sound', !Storage.settings.sound); AudioFX.setSound(Storage.settings.sound); this.syncSettings(); break;
        case 'toggle-music': Storage.setSetting('music', !Storage.settings.music); AudioFX.setMusic(Storage.settings.music); this.syncSettings(); break;
        case 'toggle-vibrate': Storage.setSetting('vibrate', !Storage.settings.vibrate); Haptics.enabled = Storage.settings.vibrate; if (Haptics.enabled) Haptics.trigger('capture'); this.syncSettings(); break;
        case 'quality': {
          const order = ['auto', 'high', 'medium', 'low'];
          const q = order[(order.indexOf(Storage.settings.quality) + 1) % order.length];
          Storage.setSetting('quality', q); app.applyQuality(); this.syncSettings(); break;
        }
        case 'submit-name': this.submitName(false); break;
        case 'tab': this.setTab(el.dataset.tab); break;
        case 'reset-data':
          if (el.dataset.armed) { Storage.reset(); this.renderScores(); el.textContent = '기록 초기화'; delete el.dataset.armed; }
          else { el.dataset.armed = '1'; el.textContent = '정말 삭제할까요? (다시 탭)'; setTimeout(() => { delete el.dataset.armed; el.textContent = '기록 초기화'; }, 3000); }
          break;
        default: break;
      }
    },
    syncSettings() {
      const s = Storage.settings;
      const set = (id, on, label) => { const el = $(id); el.textContent = label; el.classList.toggle('off', !on); };
      set('#tog-sound', s.sound, '🔊 효과음 ' + (s.sound ? 'ON' : 'OFF'));
      set('#tog-music', s.music, '🎵 음악 ' + (s.music ? 'ON' : 'OFF'));
      set('#tog-vibrate', s.vibrate, '📳 진동 ' + (s.vibrate ? 'ON' : 'OFF') + (Haptics.supported ? '' : ' (미지원)'));
      set('#tog-quality', true, '✨ 화질: ' + QUALITY_LABEL[s.quality]);
    },
    renderTitle() {
      const d = Storage.data;
      const cont = $('#btn-continue');
      cont.hidden = d.unlocked <= 1;
      cont.textContent = '이어하기 · STAGE ' + String(d.unlocked).padStart(2, '0');
      let best = 0; for (const k in d.stages) best = Math.max(best, d.stages[k].best || 0);
      const top = d.board.length ? d.board[0].score : 0;
      $('#title-stats').textContent = '★ ' + Storage.totalStars() + ' / 30   ·   BEST RUN ' + fmt(top) + (best ? '   ·   STAGE BEST ' + fmt(best) : '');
    },
    renderStages() {
      const grid = $('#stage-grid');
      let h = '';
      STAGES.forEach((s) => {
        const r = Storage.stage(s.id), locked = s.id > Storage.data.unlocked;
        h += '<button class="stage-card' + (locked ? ' locked' : '') + '" data-action="stage" data-stage="' + s.id + '"' + (locked ? ' disabled' : '') + '>' +
          '<div class="num">' + String(s.id).padStart(2, '0') + '</div>' +
          '<div class="nm">' + esc(s.name) + '</div><div class="en">' + esc(s.en) + '</div>' +
          '<div class="st">' + '★'.repeat(r.stars) + '<span class="dim">' + '★'.repeat(3 - r.stars) + '</span></div>' +
          '<div class="best">BEST ' + (r.best ? fmt(r.best) : '-') + '</div>' +
          '<div class="meta">목표 ' + s.target + '% · ' + s.time + '초 · 적 ' + s.enemies + '</div></button>';
      });
      grid.innerHTML = h;
    },
    setTab(tab) {
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
      $('#board-rank').hidden = tab !== 'rank';
      $('#board-stage').hidden = tab !== 'stage';
    },
    renderScores() {
      const b = Storage.data.board, rank = $('#board-rank');
      if (!b.length) rank.innerHTML = '<div class="empty">아직 기록이 없습니다.<br>첫 기록의 주인공이 되어 보세요!</div>';
      else {
        let h = '<table><tr><th>#</th><th>NAME</th><th>SCORE</th><th>STAGE</th><th>DATE</th></tr>';
        b.slice(0, 10).forEach((r, i) => {
          h += '<tr class="r' + (i + 1) + '"><td>' + (i + 1) + '</td><td class="name">' + esc(r.name) + '</td><td>' + fmt(r.score) + '</td><td>' + (r.cleared ? 'ALL' : r.stage) + '</td><td>' + esc(r.date || '') + '</td></tr>';
        });
        rank.innerHTML = h + '</table>';
      }
      let h = '<table><tr><th>STAGE</th><th>NAME</th><th>BEST</th><th>STARS</th></tr>';
      STAGES.forEach((s) => {
        const r = Storage.stage(s.id);
        h += '<tr><td>' + String(s.id).padStart(2, '0') + '</td><td class="name">' + esc(s.name) + '</td><td>' + (r.best ? fmt(r.best) : '-') + '</td><td class="st">' + '★'.repeat(r.stars) + '<span class="dim">' + '★'.repeat(3 - r.stars) + '</span></td></tr>';
      });
      $('#board-stage').innerHTML = h + '</table>';
    },
    /* ---------- HUD ---------- */
    resetHUD(game) {
      this.last = {};
      const h = this.hud;
      h.stage.textContent = game.multi ? 'VS' : String(game.cfg.id).padStart(2, '0');
      h.target.textContent = game.cfg.target + '%';
      h.pctFill.style.width = '0%';
      h.pct.textContent = '0.0%';
      h.hint.classList.remove('on');
      document.documentElement.style.setProperty('--acc', hex(game.cfg.palette.accent));
    },
    showHint(ms) {
      const h = this.hud.hint; h.classList.add('on');
      clearTimeout(this._ht); this._ht = setTimeout(() => h.classList.remove('on'), ms || 6000);
    },
    fmtTime(t) { t = Math.max(0, t | 0); return ((t / 60) | 0) + ':' + String(t % 60).padStart(2, '0'); },
    updateHUD(game) {
      if (!game || game.demo || (this.current !== 'hud' && this.current !== 'pause')) return;
      const h = this.hud, L = this.last;
      const pct = game.grid.percent(game.player.id), pr = Math.floor(pct * 10) / 10;
      if (L.pct !== pr) {
        L.pct = pr; h.pct.textContent = pr.toFixed(1) + '%';
        h.pctFill.style.width = Math.min(100, pct / game.cfg.target * 100) + '%';
        h.pctFill.classList.toggle('near', pct / game.cfg.target > 0.8);
      }
      const t = Math.ceil(game.time);
      if (L.t !== t) { L.t = t; h.timer.textContent = this.fmtTime(t); h.timer.classList.toggle('danger', t <= 10); }
      const sc = game.runScore + game.score;
      if (L.sc !== sc) {
        L.sc = sc; h.score.textContent = fmt(sc);
        h.score.classList.remove('bump'); void h.score.offsetWidth; h.score.classList.add('bump');
      }
      if (L.lives !== game.lives) {
        L.lives = game.lives;
        let s = ''; for (let i = 0; i < game.maxLives; i++) s += '<i class="' + (i < game.lives ? '' : 'off') + '"></i>';
        h.lives.innerHTML = s;
      }
      const now = performance.now();
      if (!L.en || now - L.en > 250) {
        L.en = now; let s = '';
        for (const e of game.entities) {
          if (e === game.player) continue;
          const dead = game.multi ? e.out : !e.alive;
          s += '<span class="chip' + (dead ? ' dead' : '') + '"><i style="background:' + hex(e.color) + ';color:' + hex(e.color) + '"></i>' +
            (game.multi ? esc(e.name) + (e.isPlayer && !e.connected ? '(AI)' : '') + ' ' : '') + game.grid.percent(e.id).toFixed(0) + '%</span>';
        }
        h.enemies.innerHTML = s;
      }
    },
    popup(text, x, y, cls) {
      const el = document.createElement('div');
      el.className = 'popup ' + (cls || '');
      el.textContent = text;
      el.style.left = Math.max(40, Math.min(window.innerWidth - 40, x)) + 'px';
      el.style.top = Math.max(60, Math.min(window.innerHeight - 40, y)) + 'px';
      $('#popups').appendChild(el);
      setTimeout(() => el.remove(), 1150);
    },
    banner(html, cls, dur) {
      const b = $('#banner');
      b.innerHTML = html; b.className = 'banner';
      void b.offsetWidth;
      b.className = 'banner on ' + (cls || '');
      clearTimeout(this._bt); this._bt = setTimeout(() => { b.className = 'banner'; }, dur || 900);
    },
    showIntro(cfg) {
      $('#intro-stage').innerHTML = cfg.multi ? 'BATTLE' : 'STAGE <span id="intro-num">' + String(cfg.id).padStart(2, '0') + '</span>';
      $('#intro-name').textContent = cfg.name;
      $('#intro-en').textContent = cfg.en;
      $('#intro-target').textContent = cfg.target + '%';
      $('#intro-time').textContent = cfg.time + '초';
      $('#intro-enemies').textContent = cfg.multi ? ('참가 ' + cfg.humans + '명 · 봇 ' + cfg.enemies + '기') : (cfg.enemies + '기');
      $('#intro-enemies-lbl').textContent = cfg.multi ? '' : '적 ';
      $('#intro').classList.add('on');
    },
    hideIntro() { $('#intro').classList.remove('on'); },
    /* ---------- 결과 화면 ---------- */
    countUp(el, to, dur) {
      const t0 = performance.now();
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        el.textContent = fmt(to * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    showClear(d, newBest) {
      this.show('clear');
      $('#clear-breakdown').innerHTML =
        '<div><span>점령 점수</span><b>' + fmt(d.captureScore) + '</b></div>' +
        '<div><span>격추 보너스</span><b>' + fmt(d.killScore) + '</b></div>' +
        '<div><span>시간 보너스 (' + Math.round(d.timeLeft) + '초)</span><b>' + fmt(d.timeBonus) + '</b></div>' +
        '<div><span>생명 보너스 (' + d.lives + ')</span><b>' + fmt(d.lifeBonus) + '</b></div>';
      this.countUp($('#clear-total'), d.stageTotal, 900);
      this.countUp($('#clear-run'), d.runTotal, 1200);
      $('#clear-best').classList.toggle('on', !!newBest);
      const stars = $('#clear-stars').children;
      for (let i = 0; i < 3; i++) stars[i].classList.remove('on');
      setTimeout(() => { for (let i = 0; i < d.stars; i++) stars[i].classList.add('on'); }, 200);
      $('#btn-next').textContent = d.stageId >= 10 ? '완주 결과 보기 →' : '다음 스테이지 →';
    },
    showOver(d, allClear) {
      this.show('over');
      this.submitted = false; this.overData = d;
      const title = $('#over-title');
      title.textContent = allClear ? 'ALL CLEAR!' : d.reason === 'time' ? 'TIME OVER' : 'GAME OVER';
      title.className = 'neon-h ' + (allClear ? 'gold' : 'danger');
      $('#over-reason').textContent = allClear ? '10개 스테이지를 모두 정복했습니다!'
        : d.reason === 'time' ? '시간 초과 · 점령률 ' + d.percent.toFixed(1) + '% / 목표 ' + d.target + '%'
        : '생명을 모두 잃었습니다';
      this.countUp($('#over-score'), d.total, 1000);
      $('#over-stats').innerHTML =
        '<span>도달 스테이지<b>' + d.stageId + '</b></span><span>점령 칸<b>' + fmt(d.stats.captured) + '</b></span>' +
        '<span>격추<b>' + d.stats.kills + '</b></span><span>최대 점령<b>' + fmt(d.stats.biggest) + '</b></span>';
      const entry = $('#name-entry');
      entry.hidden = d.total <= 0;
      $('#rank-result').textContent = d.total <= 0 ? '점수가 없어 랭킹에 오르지 않습니다' : '';
      $('#name-input').value = Storage.data.lastName || 'AAA';
      $('#btn-retry-over').hidden = !!allClear;
      if (d.total <= 0) this.submitted = true;
    },
    /* ---------- 멀티플레이 로비 ---------- */
    nick() {
      const el = $('#lobby-name');
      const v = (el.value || '').replace(/[^\w가-힣ㄱ-ㅎㅏ-ㅣ .\-]/g, '').trim().slice(0, 8);
      el.value = v;
      if (!v) { this.lobbyStatus('닉네임을 입력해 주세요', true); el.focus(); return ''; }
      Storage.setSetting('nick', v);
      return v;
    },
    setJoinCode(code) { $('#lobby-code').value = String(code || '').toUpperCase().slice(0, 4); },
    lobbyStatus(text, bad) {
      const el = $('#lobby-status');
      el.textContent = text || '';
      el.classList.toggle('bad', !!bad);
      if (bad) { clearTimeout(this._lt); this._lt = setTimeout(() => { if (el.classList.contains('bad')) this.renderLobby(Net.lobby); }, 4000); }
    },
    renderLobby(l) {
      const entry = $('#lobby-entry'), room = $('#lobby-room');
      if (!l) {
        entry.hidden = false; room.hidden = true;
        if (Net.ws && Net.ws.readyState === 1) this.lobbyStatus('방을 만들거나 코드로 참가하세요');
        return;
      }
      entry.hidden = true; room.hidden = false;
      $('#room-code').textContent = l.code;
      const me = l.players.find((p) => p.pid === l.you);
      const isHost = l.hostPid === l.you;
      let h = '';
      for (const p of l.players) {
        h += '<div class="lp' + (p.connected ? '' : ' off') + '"><i style="background:' + hex(p.color) + ';color:' + hex(p.color) + '"></i>' +
          '<span class="nm">' + esc(p.name) + (p.pid === l.you ? ' <em>(나)</em>' : '') + '</span>' +
          '<span class="st' + (p.host || p.ready ? ' ok' : '') + '">' + (p.host ? '방장' : p.ready ? '준비 완료' : '대기 중') + '</span></div>';
      }
      for (let k = 0; k < l.bots; k++) h += '<div class="lp bot"><i></i><span class="nm">BOT ' + (k + 1) + '</span><span class="st">AI</span></div>';
      $('#room-players').innerHTML = h;
      const sel = $('#room-bots'); sel.value = String(l.bots); sel.disabled = !isHost;
      $('#room-opts').classList.toggle('dim', !isHost);
      const ready = $('#btn-ready'); ready.hidden = isHost; ready.textContent = me && me.ready ? '준비 취소' : '준비 완료';
      ready.classList.toggle('primary', !(me && me.ready));
      const others = l.players.filter((p) => p.pid !== l.hostPid);
      const canStart = isHost && others.every((p) => p.ready) && (l.players.length + l.bots >= 2);
      const start = $('#btn-mp-start'); start.hidden = !isHost; start.disabled = !canStart;
      this.lobbyStatus(l.players.length + '/5명 참가' + (isHost
        ? (canStart ? ' · 시작할 수 있습니다' : ' · 참가자가 모두 준비되면 시작할 수 있습니다')
        : (me && me.ready ? ' · 방장이 시작하기를 기다리는 중' : ' · 준비 완료를 눌러 주세요')));
    },
    copyInvite() {
      const url = location.origin + location.pathname + '?room=' + (Net.room || '');
      const done = () => this.lobbyStatus('초대 링크를 복사했습니다: ' + url);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => this.lobbyStatus(url));
      else this.lobbyStatus(url);
    },
    showMatch(d, me) {
      this.show('match');
      const won = d.winnerId === me, mine = d.ranking.find((r) => r.id === me);
      const title = $('#match-title');
      title.textContent = won ? 'VICTORY' : mine && mine.out ? 'ELIMINATED' : 'MATCH OVER';
      title.className = 'neon-h ' + (won ? 'gold' : 'danger');
      const win = d.ranking[0];
      $('#match-reason').textContent = d.reason === 'target' ? esc(win.name) + ' 이(가) 목표 점령률에 먼저 도달했습니다'
        : d.reason === 'elim' ? esc(win.name) + ' 이(가) 마지막까지 살아남았습니다'
        : '시간 종료 · 점령률 순위로 결정';
      let h = '<table><tr><th>#</th><th>NAME</th><th>영역</th><th>SCORE</th><th>K/D</th></tr>';
      d.ranking.forEach((r, i) => {
        h += '<tr class="r' + (i + 1) + (r.id === me ? ' me' : '') + '"><td>' + (i + 1) + '</td>' +
          '<td class="name"><i class="dot" style="background:' + hex(r.color) + ';color:' + hex(r.color) + '"></i>' + esc(r.name) + (r.id === me ? ' (나)' : '') + (r.out ? ' <s>OUT</s>' : '') + '</td>' +
          '<td>' + r.percent.toFixed(1) + '%</td><td>' + fmt(r.score) + '</td><td>' + r.kills + '/' + r.deaths + '</td></tr>';
      });
      $('#match-board').innerHTML = h + '</table>';
    },
    submitName(silent) {
      if (this.submitted || !this.overData) return;
      const d = this.overData;
      const name = (($('#name-input').value || '').toUpperCase().slice(0, 3)) || 'AAA';
      const rank = Storage.submitRun({ name, score: d.total, stage: d.stageId, cleared: d.reason === 'clear', date: new Date().toISOString().slice(0, 10) });
      this.submitted = true;
      $('#name-entry').hidden = true;
      if (!silent) {
        $('#rank-result').textContent = rank + '위로 등록되었습니다!';
        AudioFX.play('unlock'); Haptics.trigger('bigCapture');
      }
    }
  };
  window.UI = UI;
})();
