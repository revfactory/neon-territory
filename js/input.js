/* 입력 — 터치 드래그(가상 조이스틱형 스와이프) + 키보드 */
(function () {
  const Input = {
    onDir: null, onPause: null, onAny: null,
    origin: null, lastDir: -1, threshold: 18, pointerId: null, joy: null, stick: null,
    attach(el) {
      this.joy = document.getElementById('joystick');
      this.stick = this.joy.querySelector('.stick');
      el.addEventListener('pointerdown', (e) => this.down(e), { passive: false });
      el.addEventListener('pointermove', (e) => this.move(e), { passive: false });
      el.addEventListener('pointerup', (e) => this.up(e));
      el.addEventListener('pointercancel', (e) => this.up(e));
      window.addEventListener('keydown', (e) => this.key(e));
      document.addEventListener('touchmove', (e) => {
        if (e.target.closest && e.target.closest('.scroll')) return;
        e.preventDefault();
      }, { passive: false });
      document.addEventListener('gesturestart', (e) => e.preventDefault());
      document.addEventListener('contextmenu', (e) => e.preventDefault());
      document.addEventListener('dblclick', (e) => e.preventDefault());
    },
    down(e) {
      if (this.onAny) this.onAny();
      if (e.target.closest('button, input, a, .screen, .ui-block')) return;
      if (this.pointerId !== null) return;
      this.pointerId = e.pointerId;
      this.origin = { x: e.clientX, y: e.clientY };
      this.lastDir = -1;
      this.showJoy(e.clientX, e.clientY);
    },
    move(e) {
      if (e.pointerId !== this.pointerId || !this.origin) return;
      const dx = e.clientX - this.origin.x, dy = e.clientY - this.origin.y;
      const ax = Math.abs(dx), ay = Math.abs(dy);
      if (Math.max(ax, ay) < this.threshold) { this.moveStick(dx, dy); return; }
      const d = ax > ay ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3);
      if (d !== this.lastDir) { this.lastDir = d; if (this.onDir) this.onDir(d); }
      // 손가락을 계속 끌어도 방향을 바꿀 수 있게 기준점을 손가락 뒤로 끌고 간다
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, this.threshold * 0.9 / len);
      this.origin = { x: e.clientX - dx * k, y: e.clientY - dy * k };
      this.joy.style.left = this.origin.x + 'px';
      this.joy.style.top = this.origin.y + 'px';
      this.moveStick(dx * k, dy * k);
    },
    up(e) {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null; this.origin = null; this.hideJoy();
    },
    key(e) {
      const m = { ArrowRight: 0, ArrowDown: 1, ArrowLeft: 2, ArrowUp: 3, d: 0, s: 1, a: 2, w: 3, D: 0, S: 1, A: 2, W: 3 };
      if (this.onAny) this.onAny();
      if (e.key in m) { e.preventDefault(); if (this.onDir) this.onDir(m[e.key]); }
      else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (this.onPause) this.onPause(); }
    },
    showJoy(x, y) {
      this.joy.classList.add('on');
      this.joy.style.left = x + 'px'; this.joy.style.top = y + 'px';
      this.moveStick(0, 0);
    },
    moveStick(dx, dy) {
      const max = 26, l = Math.hypot(dx, dy) || 1, k = Math.min(1, max / l);
      this.stick.style.transform = 'translate(' + (dx * k) + 'px,' + (dy * k) + 'px)';
    },
    hideJoy() { this.joy.classList.remove('on'); }
  };
  window.Input = Input;
})();
