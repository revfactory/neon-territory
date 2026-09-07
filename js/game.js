/* 게임 규칙 — 개체 이동, 궤적/충돌, 포위 점령, 점수, 스테이지 흐름, 멀티플레이 승패 */
(function () {
  const DIRS = window.DIRS;

  class Entity {
    constructor(id, isPlayer, color, name) {
      this.id = id; this.isPlayer = isPlayer; this.color = color; this.name = name;
      this.x = 0; this.y = 0; this.dir = -1; this.nextDir = -1; this.progress = 0;
      this.speed = 5; this.alive = false; this.trail = []; this.respawnTimer = 0;
      this.kills = 0; this.deaths = 0; this.stopped = true; this.ai = null; this.protect = 0;
      this.lastX = 0; this.lastY = 0;
      /* 사람 개체는 목숨·점수·통계를 개체마다 따로 센다 (멀티플레이 대응) */
      this.lives = 0; this.maxLives = 0; this.score = 0; this.killScore = 0;
      this.stats = { captured: 0, kills: 0, deaths: 0, biggest: 0 };
      this.out = false;      // 멀티: 목숨을 모두 잃어 탈락
      this.connected = true; // 멀티: 접속 상태 (끊기면 AI가 대신 조종)
    }
  }

  class Game {
    /* opts: { demo, runScore, lives, multi, players: [{ id, name, color }] } */
    constructor(cfg, opts) {
      opts = opts || {};
      this.cfg = cfg; this.demo = !!opts.demo; this.multi = !!opts.multi;
      this.players = opts.players || null;
      this.runScore = opts.runScore || 0;
      this.startLives = opts.lives || 3;
      this.time = cfg.time; this.elapsed = 0;
      this.state = 'idle'; this.listeners = {};
      this.entities = []; this.byId = []; this.player = null;
      this.introTimer = 0; this.introStep = 0; this.overTimer = 0; this.warned = -1;
      this.pendingReason = '';
    }
    /* 단일 플레이 화면이 읽는 값은 내 개체(player)의 값을 그대로 돌려준다 */
    get score() { return this.player ? this.player.score : 0; }
    get killScore() { return this.player ? this.player.killScore : 0; }
    get lives() { return this.player ? this.player.lives : 0; }
    get maxLives() { return this.player ? this.player.maxLives : 0; }
    get stats() { return this.player ? this.player.stats : { captured: 0, kills: 0, deaths: 0, biggest: 0 }; }

    on(ev, fn) { (this.listeners[ev] || (this.listeners[ev] = [])).push(fn); return this; }
    emit(ev, d) { const l = this.listeners[ev]; if (l) for (let i = 0; i < l.length; i++) l[i](d); }

    start() {
      const cfg = this.cfg;
      this.grid = new Territory(cfg.grid, cfg.grid);
      const humans = this.multi ? this.players : [{ id: 1, name: 'YOU', color: window.PLAYER_COLOR }];
      for (const p of humans) {
        const e = new Entity(p.id, true, p.color, p.name);
        e.speed = cfg.playerSpeed; e.lives = e.maxLives = this.startLives;
        this.entities.push(e);
      }
      this.player = this.entities[0];
      const botColors = cfg.botColors || window.ENEMY_COLORS;
      for (let k = 0; k < cfg.enemies; k++) {
        const e = new Entity(humans.length + 1 + k, false, botColors[k % botColors.length], 'BOT ' + (k + 1));
        e.speed = cfg.enemySpeed * (0.92 + Math.random() * 0.16);
        e.ai = new EnemyAI(e, this, cfg);
        this.entities.push(e);
      }
      if (this.demo) { this.player.ai = new EnemyAI(this.player, this, cfg); this.player.speed = cfg.enemySpeed; }
      for (const e of this.entities) this.byId[e.id] = e;
      const taken = [];
      for (const e of this.entities) {
        const s = this.grid.findSpawn(e.id, 1, taken, Math.floor(cfg.grid / 3));
        this.grid.seed(e.id, s.x, s.y, 1);
        e.x = s.x; e.y = s.y; e.lastX = s.x; e.lastY = s.y; e.alive = true; e.stopped = true; e.dir = -1;
        taken.push(s);
      }
      if (this.demo) this.state = 'playing';
      else { this.state = 'intro'; this.introTimer = 4.8; this.introStep = 5; }
      this.emit('start', {});
    }
    setPlayerDir(d) { if (this.player.ai) return; this.player.nextDir = d; }
    /* 멀티: 개체 id 로 방향 입력 */
    setDir(id, d) { const e = this.byId[id]; if (e && e.isPlayer && !e.ai) e.nextDir = d; }
    canMove(e, d) {
      const nx = e.x + DIRS[d].x, ny = e.y + DIRS[d].y;
      if (!this.grid.inBounds(nx, ny)) return false;
      if (this.grid.trail[this.grid.idx(nx, ny)] === e.id) return false;
      return true;
    }
    alivePositions(except) {
      const out = [];
      for (const e of this.entities) if (e.alive && e !== except) out.push({ x: e.x, y: e.y });
      return out;
    }
    percent(id) { return this.grid.percent(id); }
    summary() {
      return {
        stageId: this.cfg.id, score: this.score, runScore: this.runScore,
        total: this.runScore + this.score, percent: this.grid.percent(this.player.id),
        target: this.cfg.target, stats: this.stats, lives: this.lives, time: this.time
      };
    }

    update(dt) {
      if (this.state === 'intro') {
        this.introTimer -= dt;
        const step = Math.ceil(this.introTimer);
        if (step < this.introStep) {
          this.introStep = step;
          if (step > 3) { /* 스테이지 소개 카드 */ }
          else if (step > 0) this.emit('countdown', { n: step });
          else { this.state = 'playing'; this.emit('go', {}); }
        }
        return;
      }
      if (this.state === 'dying') {
        this.overTimer -= dt;
        this.updateEntities(dt, true);
        if (this.overTimer <= 0) { this.state = 'over'; this.emit('gameOver', Object.assign({ reason: 'lives' }, this.summary())); }
        return;
      }
      if (this.state !== 'playing') return;
      if (!this.demo) {
        this.time -= dt; this.elapsed += dt;
        const secs = Math.ceil(this.time);
        if (secs <= 10 && secs > 0 && secs !== this.warned) { this.warned = secs; this.emit('warning', { secs }); }
        if (this.time <= 0) {
          this.time = 0;
          if (this.multi) { this.finish('time', null); return; }
          this.state = 'over';
          this.emit('gameOver', Object.assign({ reason: 'time' }, this.summary()));
          return;
        }
      }
      this.updateEntities(dt, false);
    }
    updateEntities(dt, skipPlayer) {
      for (let k = 0; k < this.entities.length; k++) {
        const e = this.entities[k];
        if (skipPlayer && e.isPlayer) continue;
        if (!e.alive) { if (e.out) continue; e.respawnTimer -= dt; if (e.respawnTimer <= 0) this.respawn(e); continue; }
        if (e.protect > 0) e.protect -= dt;
        if (e.stopped) {
          if (e.ai || e.nextDir >= 0) this.chooseDir(e);
          if (e.stopped) continue;
        }
        e.progress += e.speed * dt;
        let guard = 0;
        while (e.progress >= 1 && e.alive && guard++ < 4) {
          e.progress -= 1;
          this.arrive(e);
          if (!e.alive) break;
          if (this.state !== 'playing' && this.state !== 'dying') return;
          this.chooseDir(e);
          if (e.stopped) break;
        }
      }
    }
    chooseDir(e) {
      let d = -1;
      if (e.ai) d = e.ai.decide();
      else {
        if (e.nextDir >= 0 && this.canMove(e, e.nextDir)) d = e.nextDir;
        else if (e.dir >= 0 && this.canMove(e, e.dir)) d = e.dir;
      }
      e.nextDir = -1;
      if (d >= 0) {
        if (e.isPlayer && e.dir >= 0 && e.dir !== d) this.emit('turn', { id: e.id });
        e.dir = d; e.stopped = false;
      } else { e.stopped = true; e.progress = 0; }
    }
    arrive(e) {
      const grid = this.grid;
      const nx = e.x + DIRS[e.dir].x, ny = e.y + DIRS[e.dir].y;
      if (!grid.inBounds(nx, ny)) { e.stopped = true; e.progress = 0; return; }
      const i = grid.idx(nx, ny);
      const t = grid.trail[i];
      if (t) { const victim = this.byId[t]; if (victim) this.kill(victim, e); if (!e.alive) return; }
      e.lastX = e.x; e.lastY = e.y; e.x = nx; e.y = ny;
      for (let k = 0; k < this.entities.length; k++) {
        const o = this.entities[k];
        if (o === e || !o.alive || o.x !== e.x || o.y !== e.y) continue;
        const eOut = e.trail.length > 0, oOut = o.trail.length > 0;
        if (eOut && oOut) { this.kill(o, e); this.kill(e, o); }
        else if (eOut) this.kill(e, o);
        else if (oOut) this.kill(o, e);
        if (!e.alive) return;
      }
      if (grid.owner[i] === e.id) {
        if (e.trail.length) this.doCapture(e);
      } else if (!grid.trail[i]) {
        grid.setTrail(i, e.id); e.trail.push(i);
      }
    }
    doCapture(e) {
      const origin = { x: e.x, y: e.y };
      const res = this.grid.capture(e.id, e.trail);
      e.trail = [];
      if (e.ai) e.ai.reset();
      const count = res.cells.length;
      let stolenTotal = 0;
      for (const k in res.stolen) stolenTotal += res.stolen[k];
      let points = 0, mult = 1;
      if (e.isPlayer && !this.demo) {
        mult = count >= 150 ? 4 : count >= 80 ? 3 : count >= 30 ? 2 : 1;
        points = count * 10 * mult + stolenTotal * 5;
        e.score += points;
        e.stats.captured += count;
        e.stats.biggest = Math.max(e.stats.biggest, count);
      }
      this.emit('capture', { id: e.id, cells: res.cells, count, origin, points, mult, stolen: stolenTotal, isPlayer: e.isPlayer });
      for (let k = 0; k < this.entities.length; k++) {
        const o = this.entities[k];
        if (o !== e && o.alive && this.grid.counts[o.id] === 0) this.kill(o, e, true);
      }
      if (e.isPlayer && !this.demo && this.grid.percent(e.id) >= this.cfg.target) {
        if (this.multi) this.finish('target', e); else this.stageClear();
      }
    }
    kill(victim, killer, eliminated) {
      if (!victim.alive) return;
      if (victim.protect > 0 && killer !== victim && !eliminated) return;
      victim.alive = false; victim.deaths++;
      victim.respawnTimer = victim.isPlayer ? 1.8 : 2.4 + Math.random() * 1.2;
      const pos = { x: victim.x, y: victim.y };
      this.grid.clearTrail(victim.trail); victim.trail = [];
      let cleared = [];
      if (!victim.isPlayer) cleared = this.grid.clearOwner(victim.id);
      else if (!this.demo) {
        victim.lives--; victim.stats.deaths++;
        if (this.multi && victim.lives <= 0) { victim.out = true; cleared = this.grid.clearOwner(victim.id); }
      }
      let points = 0;
      if (killer && killer !== victim) {
        killer.kills++;
        if (killer.isPlayer && !this.demo) {
          points = eliminated ? 800 : 500;
          killer.score += points; killer.killScore += points; killer.stats.kills++;
        }
      }
      this.emit('death', {
        id: victim.id, x: pos.x, y: pos.y, color: victim.color, isPlayer: victim.isPlayer,
        cleared, killerId: killer ? killer.id : 0, suicide: killer === victim, eliminated: !!eliminated, points, out: victim.out
      });
      if (!this.multi && victim.isPlayer && !this.demo && victim.lives <= 0 && this.state === 'playing') {
        this.state = 'dying'; this.overTimer = 2.2;
      }
      if (this.multi && victim.out) this.checkElimination();
    }
    respawn(e) {
      if (e.out) return;
      const g = this.grid;
      let sx, sy;
      let own = null;
      if (g.counts[e.id] > 0) {
        own = []; const deep = [];
        for (let i = 0; i < g.n; i++) {
          if (g.owner[i] !== e.id || g.trail[i]) continue;
          own.push(i);
          const x = i % g.w, y = (i / g.w) | 0;
          if (x > 0 && x < g.w - 1 && y > 0 && y < g.h - 1 &&
              g.owner[i - 1] === e.id && g.owner[i + 1] === e.id && g.owner[i - g.w] === e.id && g.owner[i + g.w] === e.id) deep.push(i);
        }
        const pool = deep.length ? deep : own;
        if (pool.length) { const i = pool[(Math.random() * pool.length) | 0]; sx = i % g.w; sy = (i / g.w) | 0; }
        else own = null;
      }
      if (!own) {
        const s = g.findSpawn(e.id, 1, this.alivePositions(e), 6);
        g.seed(e.id, s.x, s.y, 1); sx = s.x; sy = s.y;
      }
      e.x = sx; e.y = sy; e.lastX = sx; e.lastY = sy;
      e.alive = true; e.dir = -1; e.nextDir = -1; e.progress = 0; e.stopped = true; e.trail = []; e.protect = 1.5;
      if (e.ai) e.ai.reset();
      this.emit('respawn', { id: e.id, x: sx, y: sy, isPlayer: e.isPlayer });
    }
    /* ---------- 단일 플레이: 스테이지 클리어 ---------- */
    stageClear() {
      this.state = 'clear';
      const cfg = this.cfg;
      const timeLeft = Math.max(0, this.time);
      const timeBonus = Math.round(timeLeft) * 15;
      const lifeBonus = this.lives * 400;
      const stars = (this.stats.deaths === 0 && timeLeft / cfg.time >= 0.3) ? 3 : (this.stats.deaths <= 1 ? 2 : 1);
      const stageTotal = this.score + timeBonus + lifeBonus;
      this.emit('stageClear', {
        stageId: cfg.id, captureScore: this.score - this.killScore, killScore: this.killScore,
        timeBonus, lifeBonus, stageTotal, runTotal: this.runScore + stageTotal, stars,
        timeLeft, percent: this.grid.percent(this.player.id), stats: this.stats, lives: this.lives
      });
    }
    /* ---------- 멀티플레이: 승패 ---------- */
    /* 사람 참가자가 둘 이상이면 한 명만 남았을 때, 혼자면 탈락했을 때 끝난다 */
    checkElimination() {
      const humans = this.entities.filter((e) => e.isPlayer);
      const left = humans.filter((e) => !e.out);
      if (humans.length >= 2 ? left.length <= 1 : left.length === 0) this.finish('elim', left[0] || null);
    }
    /* reason: 'target'(목표 점령률 도달) | 'time'(시간 종료, 점령률 순위) | 'elim'(마지막 생존자) */
    finish(reason, by) {
      if (this.state !== 'playing') return;
      this.state = 'over';
      const ranking = this.entities.map((e) => ({
        id: e.id, name: e.name, color: e.color, bot: !e.isPlayer, out: e.out,
        percent: this.grid.percent(e.id), score: e.score, kills: e.kills, deaths: e.deaths
      }));
      ranking.sort((a, b) => (a.out - b.out) || (b.percent - a.percent) || (b.score - a.score));
      if (by) { const k = ranking.findIndex((r) => r.id === by.id); if (k > 0) ranking.unshift(ranking.splice(k, 1)[0]); }
      this.emit('matchOver', { reason, ranking, winnerId: ranking[0].id, time: this.time, elapsed: this.elapsed });
    }
  }
  window.Game = Game;
  window.Entity = Entity;
})();
