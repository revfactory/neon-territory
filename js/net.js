/* 네트워크 — WebSocket 연결/재접속, 로비 메시지, 서버 상태를 화면에 비추는 NetGame */
(function () {
  const Net = {
    ws: null, pid: null, room: null, lobby: null, name: '', leaving: false, connecting: null, hb: null, game: null,
    pending: null, // 애널리틱스: 방 만들기/참가 요청이 서버에서 확정되면 이벤트를 보낸다
    onLobby: null, onStart: null, onError: null, onStatus: null, onLeft: null,
    url() { return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'; },
    status(s, bad) { if (this.onStatus) this.onStatus(s, bad); },
    /* 무료 서버는 잠들어 있을 수 있으므로 깨어날 때까지(최대 약 1분 반) 다시 시도한다 */
    connect() {
      if (this.ws && this.ws.readyState === 1) return Promise.resolve();
      if (this.connecting) return this.connecting;
      this.connecting = new Promise((resolve, reject) => {
        let attempt = 0;
        const fail = (e) => { this.connecting = null; this.status('서버에 연결할 수 없습니다', true); reject(e); };
        const tryOnce = () => {
          attempt++;
          this.status(attempt === 1 ? '서버 연결 중…' : '서버를 깨우는 중… (' + attempt + ')');
          let ws;
          try { ws = new WebSocket(this.url()); } catch (e) { fail(e); return; }
          let opened = false;
          const to = setTimeout(() => { if (!opened) ws.close(); }, 8000);
          ws.onopen = () => {
            opened = true; clearTimeout(to);
            this.ws = ws; this.connecting = null; this.startHeartbeat(); this.status('연결됨');
            resolve();
          };
          ws.onmessage = (ev) => this.handle(ev.data);
          ws.onerror = () => {};
          ws.onclose = () => {
            clearTimeout(to);
            if (!opened) {
              if (attempt < 12) setTimeout(tryOnce, Math.min(8000, 1500 * attempt)); else fail(new Error('connect timeout'));
              return;
            }
            if (this.ws === ws) this.onClosed();
          };
        };
        tryOnce();
      });
      return this.connecting;
    },
    startHeartbeat() { clearInterval(this.hb); this.hb = setInterval(() => this.send({ t: 'ping' }), 25000); },
    onClosed() {
      clearInterval(this.hb); this.ws = null;
      if (this.leaving || !this.room) { this.status('연결이 끊어졌습니다', true); return; }
      this.status('연결이 끊겨 다시 접속하는 중…', true);
      const code = this.room, pid = this.pid;
      this.connect().then(() => this.send({ t: 'join', code, name: this.name, pid }), () => {});
    },
    send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); },
    create(name) { this.name = name; this.leaving = false; this.pending = { type: 'create' }; this.send({ t: 'create', name }); },
    join(code, name, method) { this.name = name; this.leaving = false; this.pending = { type: 'join', code, method: method || 'code' }; this.send({ t: 'join', code, name }); },
    ready(on) { this.send({ t: 'ready', on: !!on }); },
    setBots(n) { this.send({ t: 'bots', n }); },
    start() { this.send({ t: 'start' }); },
    dir(d) { this.send({ t: 'dir', d }); },
    leave() {
      if (!this.room) return;
      this.leaving = true;
      this.send({ t: 'leave' });
      this.room = null; this.lobby = null; this.pid = null; this.game = null;
    },
    handle(raw) {
      let m;
      try { m = JSON.parse(raw); } catch (e) { return; }
      switch (m.t) {
        case 'welcome': this.pid = m.pid; break;
        case 'lobby':
          this.room = m.code; this.lobby = m;
          if (this.pending) {
            const p = this.pending; this.pending = null;
            if (p.type === 'create') Analytics.track('mp_room_create', { room_code: m.code, bots: m.bots });
            else Analytics.track('mp_room_join', { room_code: m.code, method: p.method, players: m.players.length, bots: m.bots });
          }
          if (this.onLobby) this.onLobby(m);
          break;
        case 'start': if (this.onStart) this.onStart(m); break;
        case 'tick': if (this.game) this.game.applyTick(m); break;
        case 'error':
          if (this.pending) {
            const p = this.pending; this.pending = null;
            Analytics.track(p.type === 'join' ? 'mp_room_join_failed' : 'mp_room_create_failed', { room_code: p.code || '', method: p.method || '', reason: m.msg });
          }
          if (this.onError) this.onError(m.msg);
          break;
        case 'left': this.room = null; this.lobby = null; this.pid = null; this.game = null; if (this.onLeft) this.onLeft(); break;
        default: break;
      }
    }
  };

  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  /* 서버가 보낸 상태를 Game 과 같은 모양으로 들고 있어 렌더러·HUD·효과가 그대로 동작한다 */
  class NetGame {
    constructor(m) {
      this.cfg = m.cfg; this.multi = true; this.demo = false; this.runScore = 0;
      this.state = m.state; this.time = m.time; this.listeners = {};
      const g = this.grid = new Territory(this.cfg.grid, this.cfg.grid);
      g.owner.set(b64(m.owner)); g.trail.set(b64(m.trail));
      g.counts.fill(0);
      for (let i = 0; i < g.n; i++) g.counts[g.owner[i]]++;
      this.entities = []; this.byId = [];
      for (const o of m.entities) {
        const e = new Entity(o.id, o.isPlayer, o.color, o.name);
        Object.assign(e, o);
        e.trail = []; e.trail.length = o.trailLen || 0;
        this.entities.push(e); this.byId[e.id] = e;
      }
      this.player = this.byId[m.me] || this.entities[0];
    }
    get score() { return this.player.score; }
    get killScore() { return this.player.killScore; }
    get lives() { return this.player.lives; }
    get maxLives() { return this.player.maxLives; }
    get stats() { return this.player.stats; }
    on(ev, fn) { (this.listeners[ev] || (this.listeners[ev] = [])).push(fn); return this; }
    emit(ev, d) { const l = this.listeners[ev]; if (l) for (let i = 0; i < l.length; i++) l[i](d); }
    percent(id) { return this.grid.percent(id); }
    setPlayerDir(d) { Net.dir(d); }
    /* 틱 사이에는 속도만큼 미리 밀어 두고, 다음 틱이 오면 서버 값으로 맞춘다 */
    update(dt) {
      if (this.state !== 'playing') return;
      this.time = Math.max(0, this.time - dt);
      for (let k = 0; k < this.entities.length; k++) {
        const e = this.entities[k];
        if (!e.alive) continue;
        if (!e.stopped && e.dir >= 0) e.progress = Math.min(0.99, e.progress + e.speed * dt);
      }
    }
    applyTick(m) {
      this.time = m.time; this.state = m.state;
      const g = this.grid, c = m.cells;
      for (let k = 0; k < c.length; k += 3) { g.setOwner(c[k], c[k + 1]); g.setTrail(c[k], c[k + 2]); }
      for (const a of m.ents) {
        const e = this.byId[a[0]];
        if (!e) continue;
        e.x = a[1]; e.y = a[2]; e.dir = a[3]; e.progress = a[4] / 100;
        const f = a[5];
        e.alive = !!(f & 1); e.stopped = !!(f & 2); e.protect = (f & 4) ? 1 : 0; e.out = !!(f & 8); e.connected = !!(f & 16);
        e.trail.length = a[6];
      }
      if (m.stats) for (const s of m.stats) {
        const e = this.byId[s[0]];
        if (!e) continue;
        e.lives = s[1]; e.score = s[2]; e.kills = s[3]; e.deaths = s[4]; e.stats.kills = s[3]; e.stats.deaths = s[4];
      }
      if (m.ev) for (const ev of m.ev) this.emit(ev.t, ev.d);
    }
  }
  window.Net = Net;
  window.NetGame = NetGame;
})();
