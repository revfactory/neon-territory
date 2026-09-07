/* 적 AI — 확장 루프 계획 / 귀환 / 사냥 / 위험 회피 */
(function () {
  const DIRS = window.DIRS;
  class EnemyAI {
    constructor(e, game, cfg) {
      this.e = e; this.g = game; this.cfg = cfg;
      this.plan = []; this.mode = 'idle'; this.target = -1;
    }
    reset() { this.plan = []; this.mode = 'idle'; this.target = -1; }
    decide() {
      const e = this.e, grid = this.g.grid;
      const inside = grid.owner[grid.idx(e.x, e.y)] === e.id;
      const outside = e.trail.length > 0;
      if (outside && this.inDanger()) { this.mode = 'return'; this.plan = []; }
      if (this.mode !== 'return' && (this.mode === 'hunt' || Math.random() < this.cfg.aggression * 0.5)) {
        const t = this.findPrey();
        if (t >= 0) { this.mode = 'hunt'; this.target = t; this.plan = []; }
        else if (this.mode === 'hunt') this.mode = outside ? 'return' : 'idle';
      }
      if (this.mode === 'hunt' && e.trail.length > this.cfg.loop[1] * 3) this.mode = 'return';
      let want = -1;
      if (this.mode === 'hunt') {
        want = this.dirToward(grid.xOf(this.target), grid.yOf(this.target));
      } else if (this.mode === 'return') {
        if (inside && !outside) this.mode = 'idle'; else want = this.dirHome();
      }
      if (this.mode === 'idle') {
        if (inside && !outside && !this.plan.length) this.makePlan();
        if (this.plan.length) {
          const seg = this.plan[0];
          want = seg.dir === 'home' ? this.dirHome() : seg.dir;
          seg.steps--;
          if (seg.steps <= 0) this.plan.shift();
        } else if (outside) {
          want = this.dirHome();
        } else {
          want = e.dir >= 0 ? e.dir : (Math.random() * 4) | 0;
        }
      }
      return this.validate(want);
    }
    validate(want) {
      const e = this.e, cands = [];
      if (want >= 0) cands.push(want);
      if (e.dir >= 0) cands.push(e.dir, (e.dir + 1) % 4, (e.dir + 3) % 4, (e.dir + 2) % 4);
      else cands.push(0, 1, 2, 3);
      for (const d of cands) if (this.safe(d)) return d;
      for (const d of cands) if (this.g.canMove(e, d)) return d;
      return -1;
    }
    safe(d) {
      const e = this.e, g = this.g;
      if (!g.canMove(e, d)) return false;
      const nx = e.x + DIRS[d].x, ny = e.y + DIRS[d].y;
      for (const o of g.entities) {
        if (o === e || !o.alive) continue;
        if (o.x === nx && o.y === ny) return false;
        // 궤적을 끌고 있을 때는 상대 머리 바로 옆칸도 피한다
        if (e.trail.length && Math.abs(o.x - nx) + Math.abs(o.y - ny) <= 1 && o.trail.length === 0) return false;
      }
      return true;
    }
    inDanger() {
      const e = this.e, g = this.g, grid = g.grid, r = this.cfg.react;
      for (const o of g.entities) {
        if (o === e || !o.alive) continue;
        if (Math.abs(o.x - e.x) + Math.abs(o.y - e.y) <= r + 1) return true;
        const tr = e.trail;
        for (let k = 0; k < tr.length; k++) {
          const i = tr[k];
          if (Math.abs(o.x - grid.xOf(i)) + Math.abs(o.y - grid.yOf(i)) <= r) return true;
        }
      }
      return false;
    }
    findPrey() {
      const e = this.e, g = this.g, grid = g.grid;
      let best = -1, bd = this.cfg.huntRange;
      for (const o of g.entities) {
        if (o === e || !o.alive || !o.trail.length || o.protect > 0) continue;
        const tr = o.trail;
        for (let k = 0; k < tr.length; k++) {
          const i = tr[k], tx = grid.xOf(i), ty = grid.yOf(i);
          const d = Math.abs(tx - e.x) + Math.abs(ty - e.y);
          const od = Math.abs(o.x - tx) + Math.abs(o.y - ty);
          const wgt = o.isPlayer ? d : d + 2;
          if (wgt < bd && d <= od + 2) { bd = wgt; best = i; }
        }
      }
      return best;
    }
    dirToward(tx, ty) {
      const e = this.e, dx = tx - e.x, dy = ty - e.y;
      if (dx === 0 && dy === 0) return e.dir;
      const horiz = Math.abs(dx) >= Math.abs(dy);
      const primary = horiz ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3);
      const secondary = horiz ? (dy > 0 ? 1 : dy < 0 ? 3 : -1) : (dx > 0 ? 0 : dx < 0 ? 2 : -1);
      if (this.safe(primary)) return primary;
      if (secondary >= 0 && this.safe(secondary)) return secondary;
      return primary;
    }
    dirHome() {
      const e = this.e, grid = this.g.grid, own = grid.owner, n = grid.n, w = grid.w;
      let bi = -1, bd = 1e9;
      for (let i = 0; i < n; i++) {
        if (own[i] !== e.id) continue;
        const d = Math.abs((i % w) - e.x) + Math.abs(((i / w) | 0) - e.y);
        if (d < bd) { bd = d; bi = i; }
      }
      if (bi < 0) return -1;
      return this.dirToward(bi % w, (bi / w) | 0);
    }
    makePlan() {
      const e = this.e, grid = this.g.grid, lo = this.cfg.loop[0], hi = this.cfg.loop[1];
      const rnd = () => lo + ((Math.random() * (hi - lo + 1)) | 0);
      let bestD = -1, bestScore = -1e9;
      const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
      for (const d of order) {
        let steps = 0, x = e.x, y = e.y, blocked = false;
        while (steps < 12) {
          x += DIRS[d].x; y += DIRS[d].y;
          if (!grid.inBounds(x, y)) { blocked = true; break; }
          if (grid.owner[grid.idx(x, y)] !== e.id) break;
          steps++;
        }
        let space = 0, xx = x, yy = y;
        while (space < hi && grid.inBounds(xx, yy)) { xx += DIRS[d].x; yy += DIRS[d].y; space++; }
        const score = (blocked ? -100 : (12 - steps)) + space + Math.random() * 3;
        if (score > bestScore) { bestScore = score; bestD = d; }
      }
      if (bestD < 0) bestD = (Math.random() * 4) | 0;
      const turn = Math.random() < 0.5 ? 1 : 3, a = rnd(), b = rnd();
      this.plan = [
        { dir: bestD, steps: a + 2 },
        { dir: (bestD + turn) % 4, steps: b },
        { dir: (bestD + turn * 2) % 4, steps: a + 1 },
        { dir: 'home', steps: 999 }
      ];
    }
  }
  window.EnemyAI = EnemyAI;
})();
