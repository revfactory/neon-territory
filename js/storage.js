/* localStorage 저장소 — 해금 상태, 스테이지별 최고 기록, 랭킹, 설정 */
(function () {
  const KEY = 'neon-territory-save-v1';
  const DEF_SETTINGS = { sound: true, music: true, vibrate: true, quality: 'auto' };
  const Storage = {
    data: null,
    load() {
      let d = null;
      try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { d = null; }
      this.data = Object.assign({ unlocked: 1, stages: {}, board: [], lastName: 'AAA', settings: {} }, d || {});
      this.data.settings = Object.assign({}, DEF_SETTINGS, this.data.settings || {});
      return this.data;
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* 저장 불가 환경 */ } },
    get settings() { return this.data.settings; },
    setSetting(k, v) { this.data.settings[k] = v; this.save(); },
    stage(id) { return this.data.stages[id] || { best: 0, stars: 0, clears: 0 }; },
    recordStage(id, score, stars) {
      const s = this.stage(id);
      const newBest = score > s.best;
      s.best = Math.max(s.best, score);
      s.stars = Math.max(s.stars, stars);
      s.clears = (s.clears || 0) + 1;
      this.data.stages[id] = s;
      if (id < 10) this.data.unlocked = Math.max(this.data.unlocked, id + 1);
      this.save();
      return newBest;
    },
    submitRun(entry) {
      const b = this.data.board;
      b.push(entry);
      b.sort((a, c) => c.score - a.score || (c.stage - a.stage));
      if (b.length > 20) b.length = 20;
      this.data.lastName = entry.name;
      this.save();
      return b.indexOf(entry) + 1;
    },
    totalStars() { let t = 0; for (const k in this.data.stages) t += this.data.stages[k].stars || 0; return t; },
    reset() { try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ } this.load(); }
  };
  window.Storage = Storage;
})();
