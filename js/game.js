/* 게임 규칙 — 개체 이동, 궤적/충돌, 포위 점령, 점수, 스테이지 흐름 */
(function () {
  const DIRS = window.DIRS;

  class Entity {
    constructor(id, isPlayer, color, name) {
      this.id = id; this.isPlayer = isPlayer; this.color = color; this.name = name;
      this.x = 0; this.y = 0; this.dir = -1; this.nextDir = -1; this.progress = 0;
      this.speed = 5; this.alive = false; this.trail = []; this.respawnTimer = 0;
      this.kills = 0; this.deaths = 0; this.stopped = true; this.ai = null; this.protect = 0;
      this.lastX = 0; this.lastY = 0;
    }
  }

  class Game {
    constructor(cfg, opts) {
      opts = opts || {};
      this.cfg = cfg; this.demo = !!opts.demo;
      this.runScore = opts.runScore || 0;
      this.lives = opts.lives || 3; this.maxLives = this.lives;
      this.score = 0; this.killScore = 0; this.time = cfg.time; this.elapsed = 0;
      this.state = 'idle'; this.listeners = {};
      this.entities = []; this.byId = [];
      this.introTimer = 0; this.introStep = 0; this.overTimer = 0; this.warned = -1;
      this.stats = { captured: 0, kills: 0, deaths: 0, biggest: 0 };
      this.pendingReason = '';
    }
    on(ev, fn) { (this.listeners[ev] || (this.listeners[ev] = [])).push(fn); return this; }
    emit(ev, d) { const l = this.listeners[ev]; if (l) for (let i = 0; i < l.length; i++) l[i](d); }

    start() {
      const cfg = this.cfg;
      this.grid = new Territory(cfg.grid, cfg.grid);
      const player = new Entity(1, true, window.PLAYER_COLOR, 'YOU');
      player.speed = cfg.playerSpeed;
      this.player = player; this.entities.push(player);
      for (let k = 0; k < cfg.enemies; k++) {
        const e = new Entity(2 + k, false, window.ENEMY_COLORS[k % 6], 'BOT ' + (k + 1));
        e.speed = cfg.enemySpeed * (0.92 + Math.random() * 0.16);
        e.ai = new EnemyAI(e, this, cfg);
        this.entities.push(e);
      }
      if (this.demo) { player.ai = new EnemyAI(player, this, cfg); player.speed = cfg.enemySpeed; }
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
        total: this.runScore + this.score, percent: this.grid.percent(1),
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
          this.time = 0; this.state = 'over';
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
        if (!e.alive) { e.respawnTimer -= dt; if (e.respawnTimer <= 0) this.respawn(e); continue; }
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
        this.score += points;
        this.stats.captured += count;
        this.stats.biggest = Math.max(this.stats.biggest, count);
      }
      this.emit('capture', { id: e.id, cells: res.cells, count, origin, points, mult, stolen: stolenTotal, isPlayer: e.isPlayer });
      for (let k = 0; k < this.entities.length; k++) {
        const o = this.entities[k];
        if (o !== e && o.alive && this.grid.counts[o.id] === 0) this.kill(o, e, true);
      }
      if (e.isPlayer && !this.demo && this.grid.percent(1) >= this.cfg.target) this.stageClear();
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
      else if (!this.demo) { this.lives--; this.stats.deaths++; }
      let points = 0;
      if (killer && killer !== victim) {
        killer.kills++;
        if (killer.isPlayer && !this.demo) {
          points = eliminated ? 800 : 500;
          this.score += points; this.killScore += points; this.stats.kills++;
        }
      }
      this.emit('death', {
        id: victim.id, x: pos.x, y: pos.y, color: victim.color, isPlayer: victim.isPlayer,
        cleared, killerId: killer ? killer.id : 0, suicide: killer === victim, eliminated: !!eliminated, points
      });
      if (victim.isPlayer && !this.demo && this.lives <= 0 && this.state === 'playing') {
        this.state = 'dying'; this.overTimer = 2.2;
      }
    }
    respawn(e) {
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
        timeLeft, percent: this.grid.percent(1), stats: this.stats, lives: this.lives
      });
    }
  }
  window.Game = Game;
  window.Entity = Entity;
})();
