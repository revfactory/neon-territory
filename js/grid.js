/* 영역 격자 — 소유자/궤적 배열, 포위 점령(flood fill), 스폰 위치 탐색 */
(function () {
  class Territory {
    constructor(w, h) {
      this.w = w; this.h = h; this.n = w * h;
      this.owner = new Uint8Array(this.n);
      this.trail = new Uint8Array(this.n);
      this.counts = new Uint32Array(32);
      this._mark = new Uint8Array(this.n);
      this._queue = new Int32Array(this.n);
      this.dirty = [];
    }
    idx(x, y) { return y * this.w + x; }
    xOf(i) { return i % this.w; }
    yOf(i) { return (i / this.w) | 0; }
    inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
    setOwner(i, id) {
      const o = this.owner[i];
      if (o === id) return;
      if (o) this.counts[o]--;
      if (id) this.counts[id]++;
      this.owner[i] = id;
      this.dirty.push(i);
    }
    setTrail(i, id) {
      if (this.trail[i] === id) return;
      this.trail[i] = id;
      this.dirty.push(i);
    }
    percent(id) { return this.counts[id] / this.n * 100; }

    /* 궤적을 영역으로 바꾸고, 바깥 테두리에서 닿지 않는 모든 칸을 점령한다 */
    capture(id, trailCells) {
      const captured = [], stolen = {};
      for (let k = 0; k < trailCells.length; k++) {
        const i = trailCells[k], o = this.owner[i];
        if (o !== id) { if (o) stolen[o] = (stolen[o] || 0) + 1; this.setOwner(i, id); captured.push(i); }
        this.setTrail(i, 0);
      }
      const mark = this._mark, q = this._queue, w = this.w, h = this.h, owner = this.owner;
      mark.fill(0);
      let head = 0, tail = 0;
      const push = (i) => { if (!mark[i] && owner[i] !== id) { mark[i] = 1; q[tail++] = i; } };
      for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
      for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
      while (head < tail) {
        const i = q[head++], x = i % w, y = (i / w) | 0;
        if (x > 0) push(i - 1);
        if (x < w - 1) push(i + 1);
        if (y > 0) push(i - w);
        if (y < h - 1) push(i + w);
      }
      for (let i = 0; i < this.n; i++) {
        if (owner[i] !== id && !mark[i]) {
          const o = owner[i];
          if (o) stolen[o] = (stolen[o] || 0) + 1;
          this.setOwner(i, id); captured.push(i);
        }
      }
      return { cells: captured, stolen };
    }
    clearOwner(id) {
      const cells = [];
      for (let i = 0; i < this.n; i++) if (this.owner[i] === id) { cells.push(i); this.setOwner(i, 0); }
      return cells;
    }
    clearTrail(cells) { for (let k = 0; k < cells.length; k++) this.setTrail(cells[k], 0); }
    seed(id, cx, cy, r) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, y = cy + dy;
        if (!this.inBounds(x, y)) continue;
        const i = this.idx(x, y);
        this.setTrail(i, 0); this.setOwner(i, id);
      }
    }
    ownedCells(id) {
      const out = [];
      for (let i = 0; i < this.n; i++) if (this.owner[i] === id) out.push(i);
      return out;
    }
    /* 빈 공간 중 다른 개체와 minDist 이상 떨어진 (2r+1)² 블록을 찾는다 */
    findSpawn(id, r, avoid, minDist) {
      const w = this.w, h = this.h;
      const ok = (cx, cy, strict) => {
        for (let k = 0; k < avoid.length; k++) {
          if (Math.abs(avoid[k].x - cx) + Math.abs(avoid[k].y - cy) < minDist) return false;
        }
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const i = this.idx(cx + dx, cy + dy);
          if (this.trail[i]) return false;
          if (strict && this.owner[i] !== 0) return false;
        }
        return true;
      };
      for (let pass = 0; pass < 3; pass++) {
        const tries = pass === 2 ? 400 : 200, md = pass === 0 ? minDist : Math.max(3, minDist >> 1);
        for (let t = 0; t < tries; t++) {
          const cx = r + 1 + ((Math.random() * (w - 2 * r - 2)) | 0);
          const cy = r + 1 + ((Math.random() * (h - 2 * r - 2)) | 0);
          const save = minDist; minDist = md;
          const good = ok(cx, cy, pass === 0);
          minDist = save;
          if (good) return { x: cx, y: cy };
        }
      }
      return { x: (w / 2) | 0, y: (h / 2) | 0 };
    }
  }
  window.Territory = Territory;
})();
