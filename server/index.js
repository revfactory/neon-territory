'use strict';
/* 멀티플레이 서버 — 정적 파일 서빙 + WebSocket 방 관리 + 권위 시뮬레이션(20Hz)
 * 클라이언트는 방향 입력만 보내고, 서버가 게임 규칙을 돌려 바뀐 칸과 개체 상태를 매 틱 내려보낸다. */
const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

/* 브라우저용 게임 규칙 파일을 그대로 불러온다. window 전역만 쓰므로 globalThis 로 대체한다. */
globalThis.window = globalThis;
require('../js/stages.js');
require('../js/grid.js');
require('../js/ai.js');
require('../js/game.js');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const MAX_PLAYERS = 5, MAX_BOTS = 3;
const TICK = 0.05;                                            // 시뮬레이션 간격(초)
const MATCH_TIME = Number(process.env.NEON_MATCH_TIME) || 150; // 한 판 제한 시간(초)
const MATCH_TARGET = 35;                                      // 먼저 이 점령률에 닿으면 즉시 승리
const COLORS = [0x00f0ff, 0xff2bd6, 0x7cff00, 0xffb300, 0xb266ff, 0xff3b3b, 0x3d7bff, 0x00ffa0];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DROP_GRACE = 90 * 1000;      // 접속이 끊긴 참가자를 방에서 지우기까지 기다리는 시간
const ROOM_IDLE = 30 * 60 * 1000;  // 대기실이 이 시간 동안 조용하면 방을 닫는다

const app = express();
app.disable('x-powered-by');
app.get('/healthz', (req, res) => res.type('text').send('ok'));
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.use('/css', express.static(path.join(ROOT, 'css')));
app.use('/js', express.static(path.join(ROOT, 'js')));
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

const rooms = new Map();
let nextPid = 1;
const makePid = () => 'p' + (nextPid++) + '-' + Math.random().toString(36).slice(2, 8);
const round2 = (v) => Math.round(v * 100) / 100;
function makeCode() {
  let c;
  do { c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]; } while (rooms.has(c));
  return c;
}
function cleanName(s, fallback) {
  s = String(s || '').replace(/[^\w가-힣ㄱ-ㅎㅏ-ㅣ .\-]/g, '').trim().slice(0, 8);
  return s || fallback;
}
function send(ws, m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
function entFull(e) {
  return {
    id: e.id, name: e.name, color: e.color, isPlayer: e.isPlayer, speed: e.speed,
    x: e.x, y: e.y, dir: e.dir, progress: e.progress, alive: e.alive, stopped: e.stopped, protect: e.protect,
    trailLen: e.trail.length, lives: e.lives, maxLives: e.maxLives, score: e.score, killScore: e.killScore,
    kills: e.kills, deaths: e.deaths, stats: e.stats, out: e.out, connected: e.connected
  };
}

class Room {
  constructor(code) {
    this.code = code; this.players = new Map(); this.hostPid = null; this.state = 'lobby';
    this.bots = 1; this.game = null; this.timer = null; this.events = []; this.lastStats = '';
    this.touched = Date.now(); this.last = 0; this.acc = 0;
  }
  freeColor() {
    const used = new Set([...this.players.values()].map((p) => p.color));
    return COLORS.find((c) => !used.has(c));
  }
  add(ws, name) {
    const pid = makePid();
    const p = { pid, name, color: this.freeColor(), ready: false, ws, connected: true, eid: 0, dropTimer: null };
    this.players.set(pid, p);
    if (!this.hostPid) this.hostPid = pid;
    ws.pid = pid; ws.room = this;
    this.touched = Date.now();
    return p;
  }
  remove(pid) {
    const p = this.players.get(pid);
    if (!p) return;
    if (p.dropTimer) clearTimeout(p.dropTimer);
    this.players.delete(pid);
    if (this.hostPid === pid) this.hostPid = this.players.size ? this.players.keys().next().value : null;
    this.handOverToAI(p);
    if (!this.players.size) this.destroy();
    else if (this.state === 'playing' && ![...this.players.values()].some((q) => q.connected)) this.destroy();
  }
  /* 접속이 끊긴 사람의 개체는 봇 AI 가 이어서 조종한다 */
  handOverToAI(p) {
    if (!this.game || !p.eid) return;
    const e = this.game.byId[p.eid];
    if (e && !e.ai) { e.ai = new EnemyAI(e, this.game, this.game.cfg); e.connected = false; }
  }
  takeBackFromAI(p) {
    if (!this.game || !p.eid) return;
    const e = this.game.byId[p.eid];
    if (e) { e.ai = null; e.connected = true; }
  }
  destroy(notice) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const p of this.players.values()) {
      if (p.dropTimer) clearTimeout(p.dropTimer);
      if (notice) send(p.ws, { t: 'error', msg: notice });
      if (p.ws) { p.ws.room = null; p.ws.pid = null; send(p.ws, { t: 'left' }); }
    }
    this.players.clear();
    rooms.delete(this.code);
  }
  lobbyMsg(pid) {
    return {
      t: 'lobby', code: this.code, hostPid: this.hostPid, you: pid, state: this.state, bots: this.bots,
      players: [...this.players.values()].map((p) => ({ pid: p.pid, name: p.name, color: p.color, ready: p.ready, host: p.pid === this.hostPid, connected: p.connected }))
    };
  }
  sendLobby() { for (const p of this.players.values()) send(p.ws, this.lobbyMsg(p.pid)); }
  canStart() {
    const ps = [...this.players.values()];
    return ps.length + this.bots >= 2 && ps.every((p) => p.pid === this.hostPid || p.ready);
  }
  broadcast(m) {
    const s = JSON.stringify(m);
    for (const p of this.players.values()) if (p.ws && p.ws.readyState === 1) p.ws.send(s);
  }
  startMatch() {
    const ps = [...this.players.values()];
    ps.forEach((p, k) => { p.eid = k + 1; });
    const humanColors = new Set(ps.map((p) => p.color));
    const botColors = COLORS.filter((c) => !humanColors.has(c));
    const n = ps.length + this.bots;
    const base = window.STAGES[(Math.random() * window.STAGES.length) | 0];
    const cfg = Object.assign({}, base, {
      id: 0, multi: true, name: '네온 아레나', en: 'NEON ARENA',
      grid: n <= 3 ? 34 : n <= 5 ? 38 : 42, target: MATCH_TARGET, time: MATCH_TIME, enemies: this.bots, humans: ps.length,
      playerSpeed: 6.0, enemySpeed: 5.4, aggression: 0.4, loop: [5, 10], react: 4, huntRange: 8, botColors
    });
    const g = this.game = new Game(cfg, { multi: true, players: ps.map((p) => ({ id: p.eid, name: p.name, color: p.color })) });
    ['capture', 'death', 'respawn', 'turn', 'countdown', 'go', 'warning', 'matchOver'].forEach((k) => g.on(k, (d) => this.events.push({ t: k, d })));
    g.start();
    this.state = 'playing'; this.lastStats = ''; this.events.length = 0;
    for (const p of ps) send(p.ws, this.snapshot(p.pid));
    g.grid.dirty.length = 0;
    this.last = Date.now(); this.acc = 0;
    this.timer = setInterval(() => this.step(), TICK * 1000);
  }
  snapshot(pid) {
    const g = this.game, p = this.players.get(pid);
    return {
      t: 'start', cfg: g.cfg, me: p ? p.eid : 0, time: round2(g.time), state: g.state,
      owner: Buffer.from(g.grid.owner).toString('base64'), trail: Buffer.from(g.grid.trail).toString('base64'),
      entities: g.entities.map(entFull)
    };
  }
  step() {
    const g = this.game;
    if (!g) return;
    const now = Date.now();
    this.acc += Math.min(0.25, (now - this.last) / 1000); this.last = now;
    while (this.acc >= TICK && g.state !== 'over') { g.update(TICK); this.acc -= TICK; }
    this.broadcast(this.tickMsg());
    if (g.state === 'over') this.endMatch();
  }
  tickMsg() {
    const g = this.game, grid = g.grid;
    const seen = new Set(), cells = [];
    for (const i of grid.dirty) { if (seen.has(i)) continue; seen.add(i); cells.push(i, grid.owner[i], grid.trail[i]); }
    grid.dirty.length = 0;
    const ents = g.entities.map((e) => [
      e.id, e.x, e.y, e.dir, Math.round(e.progress * 100),
      (e.alive ? 1 : 0) | (e.stopped ? 2 : 0) | (e.protect > 0 ? 4 : 0) | (e.out ? 8 : 0) | (e.connected ? 16 : 0),
      e.trail.length
    ]);
    const stats = g.entities.map((e) => [e.id, e.lives, e.score, e.kills, e.deaths]);
    const key = JSON.stringify(stats);
    const m = { t: 'tick', time: round2(g.time), state: g.state, cells, ents };
    if (key !== this.lastStats) { this.lastStats = key; m.stats = stats; }
    if (this.events.length) { m.ev = this.events; this.events = []; }
    return m;
  }
  endMatch() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null; this.state = 'lobby'; this.game = null; this.touched = Date.now();
    for (const p of [...this.players.values()]) {
      p.ready = false; p.eid = 0;
      if (!p.connected) this.remove(p.pid);
    }
    if (rooms.has(this.code)) this.sendLobby();
  }
}

function leave(ws) {
  const r = ws.room;
  if (!r) return;
  const pid = ws.pid;
  ws.room = null; ws.pid = null;
  r.remove(pid);
  if (rooms.has(r.code)) r.sendLobby();
}
function onClose(ws) {
  const r = ws.room;
  if (!r) return;
  const p = r.players.get(ws.pid);
  ws.room = null; ws.pid = null;
  if (!p) return;
  if (r.state !== 'playing') { r.remove(p.pid); if (rooms.has(r.code)) r.sendLobby(); return; }
  p.connected = false; p.ws = null;
  r.handOverToAI(p);
  if (![...r.players.values()].some((q) => q.connected)) { r.destroy(); return; }
  p.dropTimer = setTimeout(() => {
    if (rooms.has(r.code) && r.players.get(p.pid) === p && !p.connected) { r.remove(p.pid); if (rooms.has(r.code)) r.sendLobby(); }
  }, DROP_GRACE);
}
function handle(ws, m) {
  const room = ws.room;
  if (room) room.touched = Date.now();
  switch (m.t) {
    case 'ping': send(ws, { t: 'pong' }); break;
    case 'create': {
      if (room) leave(ws);
      const r = new Room(makeCode());
      rooms.set(r.code, r);
      const p = r.add(ws, cleanName(m.name, 'P1'));
      send(ws, { t: 'welcome', pid: p.pid });
      r.sendLobby();
      break;
    }
    case 'join': {
      const code = String(m.code || '').toUpperCase().trim();
      const r = rooms.get(code);
      if (!r) { send(ws, { t: 'error', msg: '방을 찾을 수 없습니다: ' + code }); break; }
      const old = m.pid ? r.players.get(m.pid) : null;
      if (old) { /* 재접속: 같은 자리로 돌아온다 */
        if (old.ws && old.ws !== ws) { old.ws.room = null; old.ws.pid = null; old.ws.close(); }
        if (old.dropTimer) { clearTimeout(old.dropTimer); old.dropTimer = null; }
        old.ws = ws; old.connected = true; ws.pid = old.pid; ws.room = r;
        r.takeBackFromAI(old);
        send(ws, { t: 'welcome', pid: old.pid });
        if (r.state === 'playing') send(ws, r.snapshot(old.pid));
        r.sendLobby();
        break;
      }
      if (room) leave(ws);
      if (r.state !== 'lobby') { send(ws, { t: 'error', msg: '게임이 진행 중인 방입니다. 끝난 뒤 다시 참가해 주세요.' }); break; }
      if (r.players.size >= MAX_PLAYERS) { send(ws, { t: 'error', msg: '방이 가득 찼습니다 (최대 ' + MAX_PLAYERS + '명)' }); break; }
      const p = r.add(ws, cleanName(m.name, 'P' + (r.players.size + 1)));
      send(ws, { t: 'welcome', pid: p.pid });
      r.sendLobby();
      break;
    }
    case 'leave': leave(ws); send(ws, { t: 'left' }); break;
    case 'ready': {
      if (!room || room.state !== 'lobby') break;
      const p = room.players.get(ws.pid);
      if (p) p.ready = !!m.on;
      room.sendLobby();
      break;
    }
    case 'bots': {
      if (!room || room.state !== 'lobby' || room.hostPid !== ws.pid) break;
      room.bots = Math.max(0, Math.min(MAX_BOTS, m.n | 0));
      room.sendLobby();
      break;
    }
    case 'start': {
      if (!room || room.state !== 'lobby' || room.hostPid !== ws.pid) break;
      if (!room.canStart()) { send(ws, { t: 'error', msg: '모든 참가자가 준비되어야 시작할 수 있습니다 (참가자+봇 2 이상)' }); break; }
      room.startMatch();
      break;
    }
    case 'dir': {
      if (!room || room.state !== 'playing' || !room.game) break;
      const p = room.players.get(ws.pid), d = m.d | 0;
      if (p && p.eid && d >= 0 && d <= 3) room.game.setDir(p.eid, d);
      break;
    }
    default: break;
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    try { handle(ws, m); } catch (e) { console.error('[ws]', m.t, e); }
  });
  ws.on('close', () => onClose(ws));
  ws.on('error', () => {});
});
/* 죽은 소켓 정리, 오래 비어 있는 대기실 정리 */
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 30000).unref();
setInterval(() => {
  const now = Date.now();
  for (const r of [...rooms.values()]) if (r.state === 'lobby' && now - r.touched > ROOM_IDLE) r.destroy('오래 비어 있어 방을 닫았습니다');
}, 60000).unref();

server.listen(PORT, () => console.log('neon-territory server listening on :' + PORT));
