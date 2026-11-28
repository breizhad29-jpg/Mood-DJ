'use strict';
// 2.42 : l'invité (spécialiste ou personnage) ne prend plus toujours la place du second animateur. D'une visite à
// l'autre, il est reçu par l'un puis par l'autre ; celui qui le reçoit garde sa voix, sa fiche, ses souvenirs.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPanel } = require('./helpers');

// Dans le duo livré, Jeff est le premier animateur (A) et Laeti la seconde (B).
const DUO = "Object.assign(settings, PRESET_JEFF_LAETI, { radio: true, claudeAnnounce: true, voiceEngine: 'gemini', guestFreq: 'rare', hostPicks: 'off', castGuests: true }); hasGemini = true; hasGemini1 = true; hasKey = true; learn.guests = {};";
const H = 3600e3;

test('qui reçoit l’invité : l’autre animateur à chaque visite, et pour un nouveau venu celui qui n’a pas reçu le précédent', () => {
  const p = loadPanel();
  p.run(DUO);
  // Aucun invité jusque-là : le premier animateur, comme avant.
  assert.equal(p.run("guestStay('rock')"), 'A');
  // Le même invité revient : il tombe sur l'autre.
  p.run("learn.guests.rock = { name: 'Tom', visits: 1, last: Date.now() - 5 * " + H + ", with: 'Jeff' };");
  assert.equal(p.run("guestStay('rock')"), 'B');
  p.run("learn.guests.rock.with = 'Laeti';");
  assert.equal(p.run("guestStay('rock')"), 'A');
  // Un nouveau venu : reçu par celui qui n'a pas reçu le dernier invité passé (Tom était avec Laeti : c'est Jeff).
  assert.equal(p.run("guestStay('jazz')"), 'A');
});

test('qui reçoit l’invité : cas par cas', () => {
  const p = loadPanel();
  p.run(DUO + "learn.guests = { rock: { name: 'Tom', visits: 1, last: Date.now() - 5 * " + H + ", with: 'Laeti' }, jazz: { name: 'Nina', visits: 2, last: Date.now() - 2 * " + H + ", with: 'Jeff' } };");
  // Le dernier invité passé (Nina) a été reçu par Jeff : un nouveau venu est pour Laeti.
  assert.equal(p.run("guestStay('soul')"), 'B');
  p.run("learn.guests.jazz.last = Date.now() - 9 * " + H + ";");
  // Maintenant le dernier passé est Tom, reçu par Laeti : le nouveau venu est pour Jeff.
  assert.equal(p.run("guestStay('soul')"), 'A');
  // Un invité venu avant la 2.42 (personne de noté) : c'était avec le premier animateur, donc l'autre cette fois.
  p.run("learn.guests.blues = { name: 'Lou', visits: 3, last: Date.now() - " + H + " };");
  assert.equal(p.run("guestStay('blues')"), 'B');
  // … et un nouveau venu juste après lui aussi (le dernier passé était avec le premier animateur).
  assert.equal(p.run("guestStay('soul')"), 'B');
  // Retenu par prénom : si l'auditeur inverse ses animateurs, l'alternance suit les personnes, pas les places.
  p.run("for (const k of ['name', 'style', 'persona', 'story', 'voiceNote', 'gvoice']) { const a = settings[SLOT.A[k]]; settings[SLOT.A[k]] = settings[SLOT.B[k]]; settings[SLOT.B[k]] = a; } settings.voiceGender = 'femme'; settings.cohostGender = 'homme';");
  assert.equal(p.run('settings.hostName'), 'Laeti');
  assert.equal(p.run("guestStay('rock')"), 'B', 'Tom a vu Laeti la dernière fois : il voit Jeff, qui est maintenant le second');
  assert.equal(p.run("guestStay('jazz')"), 'A', 'Nina a vu Jeff : elle voit Laeti, maintenant la première');
  // Émission à un seul animateur : personne d'autre pour recevoir l'invité.
  p.run('settings.duo = false;');
  assert.equal(p.run("guestStay('rock')"), 'A');
  p.run("settings.duo = true; settings.voiceEngine = 'navigateur';");
  assert.equal(p.run("guestStay('rock')"), 'A');
});

test('Arthur commence par Jeff, où que Jeff soit placé ; Camille suit l’alternance', () => {
  const p = loadPanel();
  p.run(DUO);
  assert.equal(p.run('CAST_JEFF_LAETI[1].first'), 'Jeff');
  assert.equal(p.run("castGuest(CAST_JEFF_LAETI[1], 'annonce').stay"), 'A');
  // Même si le dernier invité a été reçu par Jeff : la première fois d'Arthur est avec lui.
  p.run("learn.guests.rock = { name: 'Tom', visits: 1, last: Date.now() - " + H + ", with: 'Jeff' };");
  assert.equal(p.run("castGuest(CAST_JEFF_LAETI[1], 'annonce').stay"), 'A');
  assert.equal(p.run("castGuest(CAST_JEFF_LAETI[0], 'annonce').stay"), 'B', 'Camille : Jeff vient de recevoir, c’est Laeti');
  // Jeff en second (comme chez l'auteur) : Arthur est reçu par le second animateur.
  p.run("for (const k of ['name', 'style', 'persona', 'story', 'voiceNote', 'gvoice']) { const a = settings[SLOT.A[k]]; settings[SLOT.A[k]] = settings[SLOT.B[k]]; settings[SLOT.B[k]] = a; } settings.voiceGender = 'femme'; settings.cohostGender = 'homme'; learn.guests = {};");
  assert.equal(p.run('isJeffLaeti()'), true);
  assert.equal(p.run("castGuest(CAST_JEFF_LAETI[1], 'annonce').stay"), 'B');
  // Arthur déjà venu en 2.41 (avec la première, Laeti) : cette fois c'est Jeff.
  p.run("learn.guests['perso:arthur'] = { name: 'Arthur', visits: 1, last: Date.now() - 30 * " + H + " };");
  assert.equal(p.run("castGuest(CAST_JEFF_LAETI[1], 'annonce').stay"), 'B');
  // Puis l'alternance : après Jeff, Laeti.
  p.run("learn.guests['perso:arthur'].with = 'Jeff';");
  assert.equal(p.run("castGuest(CAST_JEFF_LAETI[1], 'annonce').stay"), 'A');
});

test('au départ de l’invité : on retient qui l’a reçu, et le journal dit qui revient', () => {
  const p = loadPanel();
  p.run(DUO + "var __log = []; radioLog = (s, m) => { __log.push(String(m)); }; var __s = { startedAt: Date.now() - " + H + ", queue: [], played: [] };");
  const visit = () => {
    p.run("__s.guest = castGuest(CAST_JEFF_LAETI[0], 'annonce'); var __stay = __s.guest.stay; for (var i = 0; i < 6 && __s.guest; i++) guestAdvance(__s, __s.guest.phase);");
    return p.run('__stay');
  };
  // Trois visites de Camille : Jeff, Laeti, Jeff.
  assert.equal(visit(), 'A');
  assert.equal(p.run("learn.guests['perso:camille'].with"), 'Jeff');
  assert.match(p.run('__log[__log.length - 1]'), /Camille est repartie, Laeti revient\./);
  assert.equal(visit(), 'B');
  assert.equal(p.run("learn.guests['perso:camille'].with"), 'Laeti');
  assert.match(p.run('__log[__log.length - 1]'), /Camille est repartie, Jeff revient\./);
  assert.equal(visit(), 'A');
  assert.equal(p.run("learn.guests['perso:camille'].visits"), 3);
});

test('la voix de l’invité : ni celle de l’animateur qui le reçoit, ni celle de l’absent', () => {
  const p = loadPanel();
  p.run(DUO + "settings.geminiVoiceB = 'Laomedeia';");
  assert.equal(p.run('geminiVoices().b'), 'Laomedeia');
  const v = p.run("castGuest(CAST_JEFF_LAETI[0], 'annonce').voice");
  assert.notEqual(v, 'Laomedeia');
  assert.notEqual(v, p.run('geminiVoices().a'));
  assert.equal(p.run("GEMINI_VOICES.find((x) => x[0] === '" + v + "')[1]"), 'femme');
  p.run("settings.geminiVoiceB = '';");
  assert.equal(p.run("castGuest(CAST_JEFF_LAETI[0], 'annonce').voice"), 'Laomedeia');
});

// Une intervention avec un invité au micro, reçu par 'A' ou par 'B'.
function onAir(p, who, stay, phase, extra) {
  p.run("__pay = null; __tts = null; __s = __mk('" + phase + "', " + who + "); __s.guest.stay = '" + stay + "';" + (extra || ''));
  return p.run("prepareAnnouncement(__s, 'interlude', __t('a'), __s.queue[0], Date.now() + 6e4)").then((ann) => ({
    ann, pay: JSON.parse(JSON.stringify(p.run('__pay'))), tts: JSON.parse(JSON.stringify(p.run('__tts')))
  }));
}
const STUDIO = "var __pay = null; var __tts = null; var __reply = 'A: Tiens, te voilà.\\nB: Je passais par là.';" +
  "claude = async (action, payload) => { if (action === 'announce') { __pay = payload; return __reply; } if (action === 'gemini-tts') { __tts = payload; return { b64: '' }; } return {}; };" +
  "factsFor = async () => ({ text: 'Le groupe a enregistré ce titre en une seule prise, en 1997.', src: 'wiki' }); genreFacts = async () => null; weatherLine = async () => '';" +
  DUO + "Object.assign(settings, { radioFreq: 'every', programme: true, rhythm: 'regulier', chat: 'off', hostVoiceNote: 'voix de Jeff', cohostVoiceNote: 'voix de Laeti' });" +
  "hostMemory = { A: [{ t: 'Jeff a raté son train ce matin.' }], B: [{ t: 'Laeti a retrouvé un vieux micro au grenier.' }], L: [] };" +
  "var __t = (k) => ({ key: k, title: 'Titre ' + k, artist: 'Artiste ' + k, energy: 3, style: 'rock' });" +
  "var __mk = (phase, who) => ({ id: 's1', sel: clone(DEFAULT_SEL), queue: ['b', 'c', 'd'].map(__t), played: [], lastLines: [], startedAt: Date.now(), transitions: 3, programme: { keys: ['a', 'b', 'c'], at: 0 }, guest: castGuest(CAST_JEFF_LAETI[who], phase) }); var __s = null;";

test('invité reçu par la seconde animatrice : son prénom, sa fiche, ses souvenirs, son humeur et sa voix ; le premier a quitté le micro', async () => {
  const p = loadPanel();
  p.run(STUDIO);
  const gv = JSON.parse(JSON.stringify(p.run('geminiVoices()')));
  const b = await onAir(p, 1, 'B', 'arrivee');
  assert.equal(b.pay.host, 'Laeti');
  assert.equal(b.pay.style, p.run('settings.cohostStyle'));
  assert.equal(b.pay.hostGender, 'femme');
  assert.equal(b.pay.cohost, 'Arthur');
  assert.equal(b.pay.guest.away, 'Jeff');
  assert.match(b.pay.persona.a, /^Laeti \(nom complet/);
  assert.equal(b.pay.persona.b, '');
  assert.deepEqual(b.pay.persona.memA, ['Laeti a retrouvé un vieux micro au grenier.']);
  assert.deepEqual(b.pay.persona.memB, []);
  assert.equal(b.pay.persona.relation, '');
  // L'humeur du jour de Laeti, sous l'étiquette « A » (c'est elle que l'IA appelle A cette fois). Elle n'est pas
  // envoyée à chaque intervention (2.43.1) : on recommence jusqu'à en voir une.
  let withMood = b;
  for (let i = 0; i < 60 && !withMood.pay.focus.mood.A; i++) withMood = await onAir(p, 1, 'B', 'arrivee');
  assert.equal(withMood.pay.focus.mood.A, p.run('__s.variety.mood.B'));
  assert.equal(withMood.pay.focus.mood.B, '');
  assert.equal(b.pay.focus.mood.B, '');
  if (b.pay.focus.facet) assert.equal(b.pay.focus.facet.who, 'A');
  if (b.pay.focus.tic) assert.equal(b.pay.focus.tic.who, 'A');
  // La voix : les répliques « A » sont dites par Laeti, avec sa direction ; « B » par Arthur.
  assert.equal(b.tts.voiceA, gv.b);
  assert.equal(b.tts.voiceB, 'Schedar');
  assert.match(b.tts.turns.find((t) => t.speaker === 'A').style, /voix de Laeti/);
  assert.doesNotMatch(b.tts.turns.find((t) => t.speaker === 'A').style, /voix de Jeff/);
  assert.match(b.tts.turns.find((t) => t.speaker === 'B').style, /calm man with dry, caustic humor/);
  // Reçu par le premier animateur : tout est comme avant.
  const a = await onAir(p, 1, 'A', 'arrivee');
  assert.equal(a.pay.host, 'Jeff');
  assert.equal(a.pay.hostGender, 'homme');
  assert.equal(a.pay.guest.away, 'Laeti');
  assert.match(a.pay.persona.a, /^Jeff \(nom complet/);
  assert.deepEqual(a.pay.persona.memA, ['Jeff a raté son train ce matin.']);
  let aMood = a;
  for (let i = 0; i < 60 && !aMood.pay.focus.mood.A; i++) aMood = await onAir(p, 1, 'A', 'arrivee');
  assert.equal(aMood.pay.focus.mood.A, p.run('__s.variety.mood.A'));
  assert.equal(a.tts.voiceA, gv.a);
  assert.match(a.tts.turns.find((t) => t.speaker === 'A').style, /voix de Jeff/);
});

test('invité reçu par la seconde animatrice : ses souvenirs lui reviennent, et seuls ses choix de titres sont évoqués', async () => {
  const p = loadPanel();
  p.run(STUDIO + "__reply = 'A: Tiens, te voilà.\\nB: Je passais par là.\\n@@MDJ@@' + JSON.stringify({ souvenirs: [{ who: 'A', text: 'A promis une crêpe à Arthur.' }, { who: 'B', text: 'Arthur a un nouveau camion.' }] });");
  const b = await onAir(p, 1, 'B', 'passage');
  // Ce que « A » (Laeti cette fois) retient va dans les souvenirs de Laeti ; rien de l'invité n'est retenu comme elle.
  assert.deepEqual(JSON.parse(JSON.stringify(b.ann.memory.souvenirs)), [{ who: 'B', text: 'A promis une crêpe à Arthur.' }]);
  const a = await onAir(p, 1, 'A', 'passage');
  assert.deepEqual(JSON.parse(JSON.stringify(a.ann.memory.souvenirs)), [{ who: 'A', text: 'A promis une crêpe à Arthur.' }]);
  // Choix d'animateur : celui de Laeti est présenté comme le choix de « A » ; celui de Jeff, absent, n'est pas évoqué.
  const pick = (who, name) => "__s.queue[0].pick = { who: '" + who + "', name: '" + name + "', kind: 'coeur', why: 'pour danser', title: 'Titre b de Artiste b', teased: false, discussed: false };";
  const mine = await onAir(p, 1, 'B', 'passage', pick('B', 'Laeti'));
  assert.equal(mine.pay.hostPick.who, 'A');
  assert.equal(mine.pay.hostPick.name, 'Laeti');
  const his = await onAir(p, 1, 'B', 'passage', pick('A', 'Jeff'));
  assert.equal(his.pay.hostPick, null);
  // Reçu par Jeff : l'inverse, comme avant.
  const jeff = await onAir(p, 1, 'A', 'passage', pick('A', 'Jeff'));
  assert.equal(jeff.pay.hostPick.who, 'A');
  assert.equal(jeff.pay.hostPick.name, 'Jeff');
  assert.equal((await onAir(p, 1, 'A', 'passage', pick('B', 'Laeti'))).pay.hostPick, null);
});

test('pas de pari pendant qu’un invité parle : ni vrai ou faux avec lui, ni question en suspens à son annonce, ni score sans l’absent', async () => {
  const p = loadPanel();
  p.run(STUDIO + "learn.guests.rock = { name: 'Tom', gender: 'homme', style: 'erudit', role: 'spécialiste rock, ancien disquaire', quirk: '', visits: 0 };" +
    "var __spec = (phase, stay) => ({ phase: phase, key: 'rock', name: 'Tom', gender: 'homme', style: 'erudit', role: 'spécialiste rock, ancien disquaire', quirk: '', visits: 0, voice: 'Charon', passages: 1, done: 0, stay: stay });" +
    // Le tirage est forcé sur le jeu : c'est la suite qu'on vérifie.
    "var __plan = planAnnouncement; var __jeu = true; planAnnouncement = function () { var pl = __plan.apply(null, arguments); if (__jeu) { pl.angle = ANGLES_DUO.find((a) => a.id === 'jeu'); pl.duo = true; } return pl; };");
  // Un spécialiste au micro : le jeu laisse la place à son regard d'expert.
  p.run("__pay = null; __s = __mk('passage', 0); __s.guest = __spec('passage', 'B'); __s.programme = { keys: ['x'], at: 0 };");
  const ann = await p.run("prepareAnnouncement(__s, 'talkover', __t('a'), __s.queue[0], Date.now() + 6e4, { voice: 'later' })");
  let pay = JSON.parse(JSON.stringify(p.run('__pay')));
  assert.equal(pay.express, null);
  assert.equal(pay.hook, null);
  assert.match(pay.angle, /avis de spécialiste/);
  assert.equal(pay.host, 'Laeti');
  assert.equal(ann.express, null);
  // Un invité seulement annoncé (les deux animateurs sont là) : pas de question en suspens, sa réponse tomberait
  // pendant la visite. Le vrai ou faux express, lui, se joue tout de suite entre les deux animateurs.
  p.run("__pay = null; __s = __mk('annonce', 0); __s.guest = __spec('annonce', 'B'); settings.chat = 'max'; settings.chatMix = 0;" +
    "planAnnouncement = function () { var pl = __plan.apply(null, arguments); pl.angle = ANGLES_DUO.find((a) => a.id === 'jeu'); pl.duo = true; pl.free = true; return pl; };");
  const ann2 = await p.run("prepareAnnouncement(__s, 'interlude', __t('a'), __s.queue[0], Date.now() + 6e4, { voice: 'later' })");
  pay = JSON.parse(JSON.stringify(p.run('__pay')));
  assert.equal(ann2.hook, null);
  assert.equal(pay.hook, null);
  assert.ok(pay.express && pay.express.score, 'le vrai ou faux express reste possible avant l’arrivée de l’invité');
  assert.equal(pay.host, 'Jeff');
  // Une réponse due pendant que l'invité parle : donnée sans le pari de l'animateur absent, et le score ne bouge pas.
  p.run("__pay = null; planAnnouncement = __plan; settings.chat = 'off'; __s = __mk('passage', 0); __s.guest = __spec('passage', 'B'); __s.score = { A: 1, B: 2 };" +
    "__s.hook = { id: 'h1', type: 'pari', forKey: 'b', title: 'Titre b de Artiste b', truth: 'vrai', bet: 'faux', won: false, question: 'q', answer: 'r', subjects: [] };");
  const ann3 = await p.run("prepareAnnouncement(__s, 'interlude', __t('a'), __s.queue[0], Date.now() + 6e4, { voice: 'later' })");
  pay = JSON.parse(JSON.stringify(p.run('__pay')));
  assert.equal(pay.hookAnswer.truth, 'vrai');
  assert.equal(pay.hookAnswer.bet, null);
  assert.equal(pay.hookAnswer.score, null);
  assert.equal(ann3.scoreAfter, null);
  assert.equal(ann3.hookAnswered, 'h1');
});

test('émission à un seul animateur : l’invité est toujours reçu par lui', async () => {
  const p = loadPanel();
  p.run(STUDIO + 'settings.duo = false;');
  const r = await onAir(p, 0, 'B', 'arrivee');
  assert.equal(r.pay.host, 'Jeff');
  assert.equal(r.pay.guest.away, 'Laeti');
  assert.match(r.pay.persona.a, /^Jeff \(nom complet/);
  assert.equal(r.tts.voiceA, p.run('geminiVoices().a'));
});
