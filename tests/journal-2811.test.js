'use strict';
// 2.43.1 : trois constats du journal du 28/11 (15 h 23 à 15 h 53).
//  1. Un invité qui devient « prévu » en cours de titre faisait jeter l'annonce déjà prête (interlude coupé).
//  2. L'humeur du jour ressortait dans presque toutes les interventions.
//  3. Le fondu enchaîné échouait à chaque titre, sans rien dire de plus que « refusé par le navigateur ».
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { DIR, loadPanel } = require('./helpers');

const DUO = "Object.assign(settings, PRESET_JEFF_LAETI, { radio: true, claudeAnnounce: true, voiceEngine: 'gemini', guestFreq: 'rare', hostPicks: 'off', castGuests: true }); hasGemini = true; hasGemini1 = true; hasKey = true; learn.guests = {};";

test('invité dont l’heure arrive en cours de titre : l’annonce déjà prête est gardée, l’invité est prévu à la suivante', async () => {
  const p = loadPanel();
  p.run(DUO + "radioLog = () => {}; dlog = () => {};" +
    "var __next = { key: 'n', title: 'T', artist: 'A', style: 'rock' };" +
    // L'heure de l'invité est passée depuis une seconde ; une annonce (sans invité) est prête pour le titre suivant.
    "var __s = { startedAt: Date.now() - 1800e3, guestNextAt: Date.now() - 1000, queue: [__next], played: [] };" +
    "var __ready = { text: 'annonce prête', voiced: true, audio: null, kind: 'interlude' };" +
    "__s.prefetch = { key: 'n', kind: 'interlude', role: roleFor(__s, __next), progKeys: progKeysFor(__s, __next), hookId: '', guestPhase: '', dedicId: '', promise: Promise.resolve(__ready) };" +
    "var __prepared = 0; var __prep0 = prepareAnnouncement; prepareAnnouncement = async function () { __prepared++; return { text: 'refaite' }; };");
  // Vérifier ne prévoit personne.
  assert.equal(p.run('guestPhaseNow(__s)'), '');
  assert.equal(p.run('!!__s.guest'), false);
  // À l'antenne : c'est bien l'annonce prête qui est prise, rien n'est refait.
  const got = await p.run("getAnnouncement(__s, 'interlude', { key: 'p', title: 'P', artist: 'Q' }, __next)");
  assert.equal(got.text, 'annonce prête');
  assert.equal(p.run('__prepared'), 0);
  assert.equal(p.run('!!__s.guest'), false, 'la vérification n’a pas prévu d’invité');
  // La préparation suivante, elle, le prévoit (c'est le seul endroit).
  assert.equal(p.run('guestPhaseFor(__s, __next)'), 'annonce');
  assert.equal(p.run('guestPhaseNow(__s)'), 'annonce');
  // Une annonce préparée avec l'invité annoncé reste bonne tant qu'il n'a pas avancé.
  p.run("__s.prefetch = { key: 'n', kind: 'interlude', role: roleFor(__s, __next), progKeys: progKeysFor(__s, __next), hookId: '', guestPhase: 'annonce', dedicId: '', promise: Promise.resolve(__ready) };");
  assert.equal((await p.run("getAnnouncement(__s, 'interlude', { key: 'p', title: 'P', artist: 'Q' }, __next)")).text, 'annonce prête');
  // … et n'est plus la bonne une fois qu'il est arrivé.
  p.run("__s.guest.phase = 'arrivee';");
  assert.equal((await p.run("getAnnouncement(__s, 'interlude', { key: 'p', title: 'P', artist: 'Q' }, __next)")).text, 'refaite');
  // Dans la boucle de lecture aussi, la vérification se fait sans prévoir d'invité.
  const lecture = fs.readFileSync(path.join(DIR, 'mdj-lecture.js'), 'utf8');
  assert.match(lecture, /\(s\.prefetch\.guestPhase \|\| ''\) !== guestPhaseNow\(s\)/);
  assert.doesNotMatch(lecture, /!== guestPhaseFor\(/);
  assert.match(lecture, /guestPhase: guestPhaseFor\(s, nx\)/, 'la préparation, elle, peut prévoir l’invité');
});

test('humeur du jour : à l’intro, puis environ une fois sur trois, jamais deux interventions de suite', () => {
  const p = loadPanel();
  p.run(DUO + "var __s = { variety: { angles: [], timeAt: 0, weatherAt: 0, stationAt: 0, momentAt: 0 } };");
  const intro = JSON.parse(JSON.stringify(p.run("ficheFocus(__s, 'intro', ['A', 'B'], Date.now())")));
  assert.ok(intro.mood.A && intro.mood.B, 'l’intro donne le ton du jour');
  assert.notEqual(intro.mood.A, intro.mood.B);
  let shown = 0;
  let twice = 0;
  let prev = true;
  const N = 600;
  for (let i = 0; i < N; i++) {
    const f = p.run("ficheFocus(__s, '" + (i % 2 ? 'talkover' : 'interlude') + "', ['A', 'B'], Date.now())");
    const on = !!f.mood.A;
    assert.equal(!!f.mood.B, on, 'les deux humeurs partent ensemble');
    if (on) { shown++; assert.equal(f.mood.A, intro.mood.A, 'la même humeur toute l’émission'); }
    if (on && prev) twice++;
    prev = on;
  }
  assert.equal(twice, 0, 'jamais deux interventions de suite');
  // 0,4 quand la précédente ne l'avait pas : un peu moins de trois interventions sur dix.
  assert.ok(shown > N * 0.2 && shown < N * 0.37, shown + ' sur ' + N);
  // Un seul animateur à l'antenne : seule son humeur part.
  p.run('__s.variety.moodLast = false;');
  let solo = null;
  for (let i = 0; i < 60 && !(solo && solo.mood.B); i++) { p.run('__s.variety.moodLast = false;'); solo = p.run("ficheFocus(__s, 'talkover', ['B'], Date.now())"); }
  assert.ok(solo.mood.B);
  assert.equal(solo.mood.A, '');
});

// Le fondu enchaîné de yt-bridge.js, isolé : un faux lecteur intégré à qui l'on fait dire ce qu'on veut.
function loadCrossfade() {
  const src = fs.readFileSync(path.join(DIR, 'yt-bridge.js'), 'utf8');
  const i = src.indexOf('  const X = { frame: null');
  const j = src.indexOf('  // -------------------------------------------------- voix, jingles, fond');
  assert.ok(i > 0 && j > i, 'repères du fondu enchaîné introuvables');
  const ctx = { logs: [], now: 1e12, sent: [], onMessage: null, ticks: [], main: { paused: false, playbackRate: 1, currentTime: 100 } };
  const el = () => ({ style: {}, setAttribute() {}, addEventListener() {}, append() {}, remove() {}, contentWindow: { postMessage: (m) => ctx.sent.push(JSON.parse(m)) } });
  const sandbox = {
    Date: { now: () => ctx.now }, Math, JSON, Number, Object, encodeURIComponent,
    window: { addEventListener: (t, fn) => { if (t === 'message') ctx.onMessage = fn; } },
    document: { createElement: el, body: { appendChild() {} } }, location: { origin: 'https://music.youtube.com' },
    setInterval: (fn) => { ctx.ticks.push(fn); return ctx.ticks.length; }, clearInterval: () => {},
    blog: (msg, data) => ctx.logs.push({ msg, data }), player: () => ({ getCurrentTime: () => ctx.main.currentTime, getVideoData: () => ({ title: 'Titre' }), classList: { contains: () => false } }),
    videoEl: () => ctx.main, currentId: () => ctx.vid, A: { volFallback: { base: null } }, currentGain: () => 1, fadeTo: () => {}
  };
  vm.createContext(sandbox);
  vm.runInContext('(function () {\n' + src.slice(i, j) + '\n  this.api = { X, xfadePrep, xfadeGo, xSync, xfadeDrop };\n}).call(this);', sandbox);
  ctx.api = sandbox.api;
  // Un message du second lecteur.
  ctx.say = (event, info) => ctx.onMessage({ source: ctx.api.X.frame.contentWindow, data: JSON.stringify({ event, info }) });
  ctx.tick = (ms) => { ctx.now += ms || 350; ctx.api.xSync(); };
  return ctx;
}
// Un essai qui finit comme dans le journal : le lecteur joue en muet, puis se met en pause dès que le son s'ouvre.
function refusedOnce(c, vid) {
  c.vid = vid;
  assert.equal(c.api.xfadePrep(vid, 100).ok, true);
  c.say('initialDelivery', { playerState: 1, currentTime: 102, muted: true, volume: 100 });
  c.tick();
  assert.equal(c.api.X.phase, 'unmuting');
  c.say('onStateChange', 2);
  c.say('infoDelivery', { muted: false, volume: 0 });
  for (let k = 0; k < 20 && !c.api.X.err; k++) c.tick(700);
  c.tick();
  return c.logs.filter((l) => /^fondu enchaîné impossible/.test(l.msg)).pop();
}

test('fondu enchaîné refusé : le journal dit ce que le second lecteur a fait', () => {
  const c = loadCrossfade();
  const log = refusedOnce(c, 'vid1');
  assert.match(log.msg, /lecture avec le son refusée par le navigateur/);
  // La suite des événements, datée : lecture en muet, son ouvert, pause, relances.
  assert.match(log.data.suite, /son ouvert/);
  assert.match(log.data.suite, /état 2/);
  assert.equal((log.data.suite.match(/relance/g) || []).length, 2);
  assert.equal(log.data.etat, 2);
  assert.equal(log.data.muet, false);
  assert.equal(log.data.volume, 0);
  assert.equal(log.data.essais, 3);
  assert.equal(log.data.a_repondu, true);
  assert.equal(log.data.echecs_de_suite, 1);
  assert.equal(c.api.xfadeGo(3).ok, false);
});

test('fondu enchaîné : après trois échecs de suite, plus de second lecteur pendant une demi-heure, puis nouvel essai', () => {
  const c = loadCrossfade();
  for (const v of ['v1', 'v2', 'v3']) { refusedOnce(c, v); c.api.xfadeDrop(); }
  assert.equal(c.logs.filter((l) => /^fondu enchaîné impossible/.test(l.msg)).length, 3);
  // Quatrième titre : le second lecteur n'est pas ouvert, et c'est dit une seule fois.
  c.vid = 'v4';
  const r = c.api.xfadePrep('v4', 50);
  assert.equal(r.ok, false);
  assert.equal(c.api.X.frame, null);
  assert.match(c.api.xfadeGo(3).reason, /en pause après trois échecs de suite/);
  c.vid = 'v5';
  c.api.xfadePrep('v5', 50);
  assert.equal(c.logs.filter((l) => /trois échecs de suite, plus de second lecteur pendant 30 minutes/.test(l.msg)).length, 1);
  // Une demi-heure plus tard : on réessaie.
  c.now += 31 * 60e3;
  c.vid = 'v6';
  assert.equal(c.api.xfadePrep('v6', 50).ok, true);
  assert.equal(c.api.X.fails, 0);
  // Un essai qui marche remet le compteur à zéro.
  const d = loadCrossfade();
  refusedOnce(d, 'a'); d.api.xfadeDrop();
  refusedOnce(d, 'b'); d.api.xfadeDrop();
  assert.equal(d.api.X.fails, 2);
  d.vid = 'c';
  d.api.xfadePrep('c', 100);
  d.say('initialDelivery', { playerState: 1, currentTime: 102 });
  d.tick();
  d.say('infoDelivery', { currentTime: 102.4 });
  d.tick();
  assert.equal(d.api.X.fails, 0);
  assert.ok(['sync', 'ready'].includes(d.api.X.phase), d.api.X.phase);
});
