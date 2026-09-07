/* 스테이지 정의 (10개) — 격자 크기·목표 점령률·제한 시간·적 수·AI 성향·네온 팔레트 */
(function () {
  const S = (o) => Object.assign({ loop: [4, 8], react: 3, huntRange: 7 }, o);
  window.PLAYER_COLOR = 0x00f0ff;
  window.ENEMY_COLORS = [0xff2bd6, 0x7cff00, 0xffb300, 0xb266ff, 0xfff200, 0xff3b3b];
  window.DIRS = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
  window.STAGES = [
    S({ id: 1, name: '네온 게이트', en: 'NEON GATE', grid: 28, target: 20, time: 120, enemies: 1,
      playerSpeed: 5.0, enemySpeed: 3.8, aggression: 0.08, loop: [3, 7], react: 2, huntRange: 5,
      palette: { bg: 0x06021a, fog: 0x0a0432, grid: 0x6a2cff, accent: 0x00f0ff, wall: 0x00f0ff } }),
    S({ id: 2, name: '사이버 하버', en: 'CYBER HARBOR', grid: 32, target: 25, time: 130, enemies: 2,
      playerSpeed: 5.2, enemySpeed: 4.2, aggression: 0.15, loop: [4, 8], react: 3, huntRange: 6,
      palette: { bg: 0x02121a, fog: 0x041c28, grid: 0x00a0c0, accent: 0x33ffe0, wall: 0x33ffe0 } }),
    S({ id: 3, name: '마그마 스트리트', en: 'MAGMA STREET', grid: 34, target: 28, time: 140, enemies: 2,
      playerSpeed: 5.4, enemySpeed: 4.7, aggression: 0.25, loop: [4, 9], react: 3, huntRange: 7,
      palette: { bg: 0x1a0505, fog: 0x2a0808, grid: 0xff4a1a, accent: 0xffb300, wall: 0xff6a00 } }),
    S({ id: 4, name: '홀로그램 파크', en: 'HOLOGRAM PARK', grid: 36, target: 30, time: 150, enemies: 3,
      playerSpeed: 5.6, enemySpeed: 5.0, aggression: 0.3, loop: [4, 9], react: 3, huntRange: 7,
      palette: { bg: 0x03170f, fog: 0x062418, grid: 0x19d47a, accent: 0x7cff00, wall: 0x7cff00 } }),
    S({ id: 5, name: '미드나잇 하이웨이', en: 'MIDNIGHT HIGHWAY', grid: 40, target: 33, time: 160, enemies: 3,
      playerSpeed: 5.8, enemySpeed: 5.4, aggression: 0.4, loop: [5, 10], react: 4, huntRange: 8,
      palette: { bg: 0x050a24, fog: 0x081238, grid: 0x2f6bff, accent: 0xff2bd6, wall: 0xff2bd6 } }),
    S({ id: 6, name: '크롬 팩토리', en: 'CHROME FACTORY', grid: 42, target: 36, time: 170, enemies: 4,
      playerSpeed: 6.0, enemySpeed: 5.8, aggression: 0.5, loop: [5, 10], react: 4, huntRange: 8,
      palette: { bg: 0x0a0a12, fog: 0x121220, grid: 0x8899cc, accent: 0x00f0ff, wall: 0xcfe6ff } }),
    S({ id: 7, name: '레이저 정글', en: 'LASER JUNGLE', grid: 44, target: 38, time: 180, enemies: 4,
      playerSpeed: 6.2, enemySpeed: 6.0, aggression: 0.6, loop: [5, 11], react: 4, huntRange: 9,
      palette: { bg: 0x12031a, fog: 0x1c0628, grid: 0xc020ff, accent: 0x7cff00, wall: 0xff2bd6 } }),
    S({ id: 8, name: '플라즈마 코어', en: 'PLASMA CORE', grid: 48, target: 40, time: 190, enemies: 5,
      playerSpeed: 6.4, enemySpeed: 6.3, aggression: 0.7, loop: [6, 12], react: 5, huntRange: 9,
      palette: { bg: 0x1a0a02, fog: 0x2a1004, grid: 0xff7a00, accent: 0xb266ff, wall: 0xffb300 } }),
    S({ id: 9, name: '글리치 존', en: 'GLITCH ZONE', grid: 50, target: 42, time: 200, enemies: 5,
      playerSpeed: 6.6, enemySpeed: 6.5, aggression: 0.8, loop: [6, 12], react: 5, huntRange: 10,
      palette: { bg: 0x120208, fog: 0x1e0410, grid: 0xff1a4a, accent: 0x00f0ff, wall: 0xff1a4a } }),
    S({ id: 10, name: '싱귤래리티', en: 'SINGULARITY', grid: 54, target: 45, time: 210, enemies: 6,
      playerSpeed: 6.8, enemySpeed: 6.7, aggression: 0.9, loop: [6, 13], react: 6, huntRange: 11,
      palette: { bg: 0x0a0a0a, fog: 0x141414, grid: 0xffd700, accent: 0xffffff, wall: 0xffd700 } }),
  ];
})();
