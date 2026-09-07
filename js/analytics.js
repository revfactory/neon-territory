/* 구글 애널리틱스 이벤트 — gtag 가 없거나 광고 차단기에 막혀도 게임은 영향을 받지 않는다 */
(function () {
  const Analytics = {
    track(name, params) {
      try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) { /* 무시 */ }
    }
  };
  window.Analytics = Analytics;
})();
