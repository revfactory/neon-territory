/* 진동(햅틱) + 화면 플래시/비네트 효과 */
(function () {
  const Haptics = {
    enabled: true,
    supported: !!(navigator.vibrate),
    patterns: {
      ui: [8], turn: [6], capture: [25], bigCapture: [30, 40, 70, 40, 110],
      death: [220, 60, 220], kill: [50, 30, 80], eliminate: [40, 30, 40, 30, 140],
      clear: [60, 40, 60, 40, 240], over: [300, 100, 300, 100, 600],
      warning: [40], go: [30, 40, 90], respawn: [20, 30, 20]
    },
    trigger(name) {
      if (!this.enabled || !this.supported) return;
      try { navigator.vibrate(this.patterns[name] || [20]); } catch (e) { /* 무시 */ }
    },
    stop() { if (this.supported) { try { navigator.vibrate(0); } catch (e) { /* 무시 */ } } }
  };

  const ScreenFX = {
    flash(color, alpha, dur) {
      const el = document.getElementById('fx-flash');
      if (!el) return;
      el.style.transition = 'none';
      el.style.background = color;
      el.style.opacity = alpha == null ? 0.4 : alpha;
      void el.offsetWidth;
      el.style.transition = 'opacity ' + (dur || 260) + 'ms ease-out';
      el.style.opacity = 0;
    },
    vignette(color, dur) {
      const el = document.getElementById('fx-vignette');
      if (!el) return;
      el.style.setProperty('--vc', color || '#ff2040');
      el.style.setProperty('--vd', (dur || 700) + 'ms');
      el.classList.remove('on');
      void el.offsetWidth;
      el.classList.add('on');
    },
    shakeHud() {
      const h = document.getElementById('hud');
      if (!h) return;
      h.classList.remove('shake');
      void h.offsetWidth;
      h.classList.add('shake');
    }
  };
  window.Haptics = Haptics;
  window.ScreenFX = ScreenFX;
})();
