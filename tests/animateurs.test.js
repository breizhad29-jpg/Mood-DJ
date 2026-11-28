'use strict';
// 2.35 : la parole des animateurs. Fiches du duo Jeff & Laeti et leur mise à jour, dosage des fiches tenu
// par Mood DJ (tics, détails, running gags), conversations libres, coupures de parole, adresse aux auditeurs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadPanel, loadBackground } = require('./helpers');

const OLD = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'preset-jeff-laeti-2.34.json'), 'utf8'));
const TEXTS = ['hostPersona', 'cohostPersona', 'duoRelation', 'stationLore'];

test('duo Jeff & Laeti : « chef » réservé à Marielle, plus d’image à tout prix, plus de mode d’écoute', () => {
  const p = loadPanel();
  const J = p.run('PRESET_JEFF_LAETI');
  const all = TEXTS.map((k) => J[k]).join('\n');
  assert.doesNotMatch(all, /l’auditeur « chef »|nouveau « chef »/);
  assert.doesNotMatch(all, /Ça me fait un film|regarde la musique|Mes J’aime|mode Découverte/);
  assert.doesNotMatch(J.cohostPersona, /appelle l’auditeur/);
  // 2.41 : les graphies du Codex de l'auteur (« cheffe », « Annaëlle »).
  assert.match(J.hostPersona, /Cheffe, c’est le titre qu’il réserve à Marielle/);
  assert.match(J.stationLore, /Marielle, la journaliste/);
  assert.match(J.stationLore, /« T’as une sale mine, cheffe »/);
  assert.match(J.stationLore, /Annaëlle, dite Anna, l’éclairagiste/);
  assert.doesNotMatch(all, /Annaelle/);
  // « Cheffe » n'est pas entre guillemets dans la fiche : ce n'est pas une expression fétiche que Mood DJ pourrait proposer.
  assert.ok(!p.run('fileSayings(PRESET_JEFF_LAETI.hostPersona, "A")').some((x) => /chef/i.test(x.text)));
});

test('mise à jour du duo : anciens textes remplacés, souvenirs « chef » retirés, voix gardées', () => {
  const p = loadPanel();
  p.run('var __old = ' + JSON.stringify(OLD));
  for (const k of TEXTS) assert.equal(p.run('PRESET_OLD_PRINTS[textPrint(__old.' + k + ')]'), k, 'empreinte de ' + k);
  p.run("Object.assign(settings, __old, { hostName: 'Jeff', cohostName: 'Laeti', geminiVoice: 'Puck', presetRev: 0 });" +
    "hostMemory = { A: [{ t: 'Jeff appelle l’auditeur chef', at: 1 }, { t: 'Jeff a un vieux pulp préféré', at: 2 }, { t: 'Marielle est la seule chef de Jeff', at: 3 }], B: [], L: [] };" +
    "hostProfiles = [{ name: 'Jeff', persona: __old.hostPersona }]; loreProfiles = [{ name: 'Régie', lore: __old.stationLore, relation: __old.duoRelation }];");
  p.run('migratePreset()');
  for (const k of TEXTS) assert.equal(p.run('settings.' + k), p.run('PRESET_JEFF_LAETI.' + k), k);
  assert.equal(p.run('settings.geminiVoice'), 'Puck');
  assert.equal(p.run('settings.presetRev'), p.run('PRESET_REV'));
  assert.deepEqual([...p.run('hostMemory.A.map((m) => m.t)')], ['Jeff a un vieux pulp préféré', 'Marielle est la seule chef de Jeff']);
  assert.equal(p.run('hostProfiles[0].persona'), p.run('PRESET_JEFF_LAETI.hostPersona'));
  assert.equal(p.run('loreProfiles[0].relation'), p.run('PRESET_JEFF_LAETI.duoRelation'));
});

test('mise à jour du duo : une fiche retouchée n’est pas écrasée, sauf si on le demande', () => {
  const p = loadPanel();
  const mine = OLD.hostPersona + ' Il adore les crêpes.';
  p.run('settings.hostPersona = ' + JSON.stringify(mine) + '; settings.presetRev = 0; hostProfiles = []; loreProfiles = [];');
  assert.deepEqual(JSON.parse(JSON.stringify(p.run('refreshPresetTexts(false)'))), { updated: 0, edited: 1 });
  assert.equal(p.run('settings.hostPersona'), mine);
  assert.equal(p.run('refreshPresetTexts(true).updated'), 1);
  assert.equal(p.run('settings.hostPersona'), p.run('PRESET_JEFF_LAETI.hostPersona'));
  // Une fiche écrite par l'auditeur, sans rapport avec le duo, n'est jamais touchée.
  p.run("settings.hostPersona = 'Aime le funk. Manie : dit « chef » à tout le monde.'");
  assert.deepEqual(JSON.parse(JSON.stringify(p.run('refreshPresetTexts(true)'))), { updated: 0, edited: 0 });
});

test('fiches : expressions fétiches, détails personnels et running gags sont extraits', () => {
  const p = loadPanel();
  const say = p.run('fileSayings(PRESET_JEFF_LAETI.hostPersona, "A").concat(fileSayings(PRESET_JEFF_LAETI.cohostPersona, "B"))');
  const by = (t) => say.find((x) => x.text === t);
  assert.ok(by('Oki-doki').offer && !by('Oki-doki').rare);
  assert.ok(by('Whoa !').offer && by('Whoa !').rare);
  assert.ok(by('Bordel…').rare);
  assert.ok(!by('Hum. Ouais. Bref.').offer, 'une réaction citée est surveillée, pas proposée');
  assert.equal(p.run('fileGags(PRESET_JEFF_LAETI.duoRelation).length'), 3);
  assert.match(p.run('fileGags(PRESET_JEFF_LAETI.duoRelation)[0]'), /^l’accoutrement \(.*insiste\)$/);
  const facets = p.run('fileFacets(PRESET_JEFF_LAETI.hostPersona, "A").map((x) => x.text)');
  assert.ok(facets.some((x) => /^Manies/.test(x)) && facets.some((x) => /Marielle/.test(x)));
  assert.ok(!facets.some((x) => /^Tics|^Réactions/.test(x)));
  // Fiche courte tirée au sort : chaque phrase est un détail, sauf le rôle dans le duo.
  assert.equal(p.run("fileFacets('Aime le funk des années 70. Manie : note chaque solo de guitare sur 10. Dans la vie : a un chat qui s’appelle Riff. Ne supporte pas les fondus trop longs. Dans le duo : la mémoire de la station.', 'A').length"), 3);
});

test('dosage : jamais deux tics de suite, une expression dite passe au repos, un seul running gag par émission', () => {
  const p = loadPanel();
  p.run('Object.assign(settings, PRESET_JEFF_LAETI); var __s = { variety: { angles: [] } }; var __t = 1e12; var __log = [];');
  for (let i = 0; i < 80; i++) {
    p.run("__t += 4 * 60e3; var __f = ficheFocus(__s, " + (i % 3 ? "'talkover'" : "'interlude'") + ", ['A', 'B'], __t);" +
      "if (__f.tic) noteSayings(__s, 'Bon. ' + __f.tic.text + ' On enchaîne.', __t); __log.push(__f);");
  }
  const log = JSON.parse(JSON.stringify(p.run('__log')));
  assert.ok(log.some((f) => f.tic), 'un tic est proposé de temps en temps');
  assert.ok(log.filter((f) => f.tic).length < 40, 'mais pas à chaque fois');
  for (let i = 1; i < log.length; i++) {
    assert.ok(!(log[i].tic && log[i - 1].tic), 'deux tics de suite à ' + i);
    // 4 minutes plus tôt, l'expression a été dite : elle est au repos, et pas proposée de nouveau.
    if (log[i - 1].tic) assert.ok(log[i].rest.includes(log[i - 1].tic.text), 'repos à ' + i);
    if (log[i].tic) assert.ok(!log[i].rest.includes(log[i].tic.text));
  }
  assert.equal(log.filter((f) => f.gag).length, 1, 'un seul running gag dans l’émission');
  assert.ok(log.every((f) => f.hasGags));
  // 2.43.1 : l'humeur du jour n'est plus envoyée à chaque intervention, mais c'est la même toute l'émission.
  const moody = log.filter((f) => f.mood.A);
  assert.ok(moody.length > 5 && moody.length < 40, 'humeur envoyée ' + moody.length + ' fois sur 80');
  assert.notEqual(moody[0].mood.A, moody[0].mood.B);
  assert.ok(moody.every((f) => f.mood.A === moody[0].mood.A && f.mood.B === moody[0].mood.B), 'l’humeur du jour ne change pas pendant l’émission');
  // Seul à l'antenne : pas de running gag (il se joue à deux), et seulement les expressions de celui qui parle.
  const solo = JSON.parse(JSON.stringify(p.run("ficheFocus({ variety: { angles: [] } }, 'talkover', ['B'], 1e12)")));
  assert.equal(solo.hasGags, false);
  assert.equal(solo.mood.A, '');
});

test('mots trop entendus : « chef » est compté, les prénoms et les expressions fétiches ne le sont pas', () => {
  const p = loadPanel();
  const lines = ['Oki-doki, chef, on enchaîne.', 'Allez chef, un vrai générique.', 'Merci chef. Laeti adore ce générique.', 'Oki-doki, dit Laeti.'];
  const words = p.run('overused(' + JSON.stringify(lines) + ', new Set(["laeti", "oki-doki", "oki", "doki"]))');
  assert.deepEqual([...words].sort(), ['chef', 'générique']);
  // Deux fois seulement : un mot de 4 lettres n'est pas encore suspect.
  assert.ok(!p.run('overused(["Bref, on y va.", "Bref."], new Set())').includes('bref'));
});

test('radio dans une autre langue : fiche en anglais comprise, petits mots anglais jamais « à éviter », tic au repos sans le reconnaître', () => {
  const p = loadPanel();
  // Guillemets anglais ou droits, rubrique « Catchphrases », « once an hour ».
  const say = [...p.run("fileSayings('Dry wit. Catchphrases: “Okey-dokey” to wrap up; \"Blimey…\" once an hour; “Not bad.” as his biggest compliment. Loves 80s synths and film scores.', 'A')")];
  assert.deepEqual(say.map((x) => x.text), ['Okey-dokey', 'Blimey…', 'Not bad.']);
  assert.ok(say.every((x) => x.offer));
  assert.deepEqual(say.map((x) => x.rare), [false, true, false]);
  // En anglais, « that » et « with » ne remplissent pas la liste des mots à éviter ; un vrai mot répété, si.
  p.run("settings.radioLang = 'en'");
  const words = [...p.run('overused(["That was great, with that guitar.", "With that voice, that chorus about love.", "That guitar again, with love, about time."], new Set())')];
  assert.deepEqual(words.sort(), ['guitar']);
  // La fiche est en français, la radio en anglais : « Oki-doki » est dit « Okey-dokey », que Mood DJ ne peut pas
  // reconnaître dans le texte. L'expression proposée est donc comptée comme dite, et passe au repos.
  p.run('Object.assign(settings, PRESET_JEFF_LAETI); var __s = { variety: { angles: [] } }; var __log = [];');
  for (let i = 0; i < 60; i++) p.run("__log.push(ficheFocus(__s, 'interlude', ['A', 'B'], 1e12 + " + i + ' * 4 * 60e3))');
  const log = JSON.parse(JSON.stringify(p.run('__log')));
  assert.ok(log.some((f) => f.tic));
  for (let i = 1; i < log.length; i++) if (log[i - 1].tic) assert.ok(log[i].rest.includes(log[i - 1].tic.text), 'repos à ' + i);
});

test('fiche que Mood DJ ne sait pas découper : rien n’est interdit, la fiche est suivie comme avant', async () => {
  const p = loadPanel();
  p.run("Object.assign(settings, { hostPersona: 'ロック好き。ギターソロに点数をつける。', cohostPersona: 'fan de rock', duoRelation: '' }); hostMemory = { A: [], B: [], L: [] };");
  // À l'intro, l'humeur du jour est toujours donnée (ensuite, une fois sur trois environ).
  const f = JSON.parse(JSON.stringify(p.run("ficheFocus({ variety: { angles: [] } }, 'intro', ['A', 'B'], 1e12)")));
  assert.deepEqual([f.hasSayings, f.hasFacets, f.hasGags, f.tic, f.facet], [false, false, false, null, null]);
  const bg = loadBackground();
  await bg.run('writeAnnouncement({ kind: "talkover", host: "Alex", cohost: "Sam", duo: true, turns: 2, next: "X de Y", focus: ' + JSON.stringify(f) + ' })');
  const user = bg.__calls[0].body.messages[0].content;
  assert.doesNotMatch(user, /DOSAGE DES FICHES|Aucun détail personnel|Aucune expression fétiche/);
  assert.match(user, /HUMEUR DU JOUR/);
});

test('coupure de parole : « >> » est noté sur la réplique et n’est jamais lu', () => {
  const p = loadPanel();
  const r = JSON.parse(JSON.stringify(p.run("takeMarks(parseTurns('A: >> Bonsoir à tous.\\nB: Moi, ce que j’aime, c’est quand la basse…\\nA: >> {amused} … arrive enfin.\\nB: Laisse-moi >> finir !\\nB: >> Bon.', true))")));
  // Les deux dernières répliques sont du même animateur : une seule pour la voix (2.40).
  assert.deepEqual(r.turns.map((t) => !!t.cut), [false, false, true, false]);
  assert.equal(r.turns[2].emotion, 'amused');
  assert.equal(r.turns[2].text, '… arrive enfin.');
  assert.equal(r.turns[3].text, 'Laisse-moi finir ! Bon.');
  for (const t of r.turns) assert.doesNotMatch(t.text, />/);
});

test('dialogue moins haché : répliques du même animateur réunies, et pas de double silence autour d’une coupure', () => {
  const p = loadPanel();
  const turns = JSON.parse(JSON.stringify(p.run("takeMarks(parseTurns('A: Aïe.\\nA: {mock outrage} T’as un point, et tu le fais briller depuis ce matin.\\nB: Ça couine à chaque…\\nA: >> … respiration, oui.\\nA: On avait compris.\\nB: Bon.', true)).turns")));
  assert.deepEqual(turns.map((t) => t.speaker), ['A', 'B', 'A', 'B']);
  assert.equal(turns[0].text, 'Aïe. T’as un point, et tu le fais briller depuis ce matin.');
  assert.equal(turns[0].emotion, 'mock outrage');
  // La réplique qui coupe n'est jamais collée à la précédente du même animateur, mais la suivante la rejoint.
  assert.equal(turns[2].cut, true);
  assert.equal(turns[2].text, '… respiration, oui. On avait compris.');
  // Pour la voix : la phrase coupée finit sur un tiret, celle qui coupe ne commence pas par des points de suspension.
  p.run("var __t = " + JSON.stringify(turns) + ";");
  assert.equal(p.run('voiceCutText(__t, 1)'), 'Ça couine à chaque —');
  assert.equal(p.run('voiceCutText(__t, 2)'), 'respiration, oui. On avait compris.');
  assert.equal(p.run('voiceCutText(__t, 0)'), turns[0].text, 'les autres répliques ne changent pas');
  // Des points de suspension qui ne sont pas une coupure restent : le silence a un sens.
  p.run("var __u = [{ speaker: 'A', text: 'Écoutez, écoutez…' }, { speaker: 'B', text: 'J’entends rien.' }];");
  assert.equal(p.run('voiceCutText(__u, 0)'), 'Écoutez, écoutez…');
});

test('consignes du dialogue : des répliques qui s’enchaînent, plus de ping-pong de deux ou trois mots', async () => {
  const bg = loadBackground();
  const words = (t) => t.split(/\s+/).filter(Boolean).length;
  // Les exemples donnés à l'IA : aucune réplique de moins de six mots, et dix à vingt-quatre mots par réplique en moyenne.
  for (const name of ['DUO_EXAMPLES', 'DUO_EXAMPLES_CUT']) {
    for (const ex of [...bg.run(name)]) {
      const lines = ex.split('\n').map((l) => l.replace(/^[AB]: (>> )?/, ''));
      assert.ok(lines.every((l) => words(l) >= 6), name + ' : ' + lines.filter((l) => words(l) < 6).join(' | '));
      const mean = lines.reduce((n, l) => n + words(l), 0) / lines.length;
      assert.ok(mean >= 10 && mean <= 24, name + ' : ' + mean.toFixed(1) + ' mots par réplique');
      // Aucune description du son d'un morceau dans les exemples (l'IA n'entend pas la musique).
      assert.doesNotMatch(ex, /basse|guitare|solo|batterie|refrain/i);
    }
  }
  for (const ex of [...bg.run('DUO_EXAMPLES_CUT')]) assert.doesNotMatch(ex, />> …/, 'la réplique qui coupe enchaîne sans points de suspension');
  await bg.run("writeAnnouncement({ kind: 'interlude', host: 'Laeti', cohost: 'Jeff', duo: true, turns: 4, cuts: 1, next: 'X de Y' })");
  const b = bg.__calls[0].body;
  const all = b.system.map((x) => x.text).join('\n') + '\n' + b.messages[0].content;
  assert.match(all, /Pas de style télégraphique/);
  assert.match(all, /La plupart des phrases font entre huit et vingt mots/);
  assert.match(all, /elles ouvrent la réplique de celui qui réagit/);
  assert.match(all, /jamais d'échange en ping-pong de deux ou trois mots/);
  assert.match(all, /puis enchaîne directement, sans points de suspension/);
  assert.doesNotMatch(all, /sur leur propre ligne/);
});

test('programme : la part des interventions qui deviennent une conversation suit le niveau, et jamais sur « Jamais »', () => {
  const p = loadPanel();
  const share = (chat) => {
    p.run("Object.assign(settings, { chat: '" + chat + "', chatMix: 50, radioFreq: 'third', programme: true, voiceEngine: 'systeme' }); var __s = { lastLines: [], played: [], queue: [] }; var __free = [];" +
      "for (var i = 0; i < 400; i++) { var pl = planAnnouncement(__s, 'talkover', { title: 'A', artist: 'B' }, { title: 'C', artist: 'D', key: 'k' + i }, 1e12 + i * 6e5, 'programme', 3, false); __free.push(pl.free ? pl.angle.id : ''); }");
    return [...p.run('__free')];
  };
  assert.ok(share('off').every((x) => !x), 'sur « Jamais », toujours le programme');
  const some = share('parfois');
  const n = some.filter(Boolean).length;
  assert.ok(n > 160 && n < 240, 'environ une sur deux : ' + n + ' sur 400');
  assert.ok(some.includes('bavardage'), 'le bavardage sort');
  assert.ok(!some.includes('programme'));
  const often = share('souvent').filter(Boolean).length;
  assert.ok(often > 310 && often < 370, 'presque toutes : ' + often + ' sur 400');
  assert.equal(share('max').filter(Boolean).length, 400, 'toutes');
  // Invité au micro, dédicace, réponse d'un jeu, choix d'un animateur : jamais de conversation libre.
  p.run("settings.chat = 'max'; var __n = 0; for (var i = 0; i < 50; i++) if (planAnnouncement({ lastLines: [], played: [], queue: [] }, 'talkover', null, { title: 'C', artist: 'D', key: 'x' }, 1e12, 'programme', 3, true).free) __n++;");
  assert.equal(p.run('__n'), 0);
});

test('bavardage : 261 sujets sans doublon en six formats, rien « entre eux » pour un animateur seul, jamais deux fois le même format de suite', () => {
  const p = loadPanel();
  const duo = [...p.run('CHAT_DUO')];
  const solo = [...p.run('CHAT_SOLO')];
  const pools = JSON.parse(JSON.stringify(p.run('CHAT_POOL')));
  const all = duo.concat(...Object.values(pools));
  assert.equal(duo.length, 146);
  assert.equal(solo.length, 126);
  assert.equal(all.length, 261);
  assert.equal(new Set(all).size, 261);
  assert.deepEqual([...p.run('CHAT_FORMATS.map((f) => f.id)')], ['papotage', 'dilemme', 'minijeu', 'rubrique', 'nouvelles', 'auditeurs']);
  const between = [...p.run('CHAT_TOPICS.entreEux')];
  assert.ok(between.every((x) => !solo.includes(x)));
  // Ni saison, ni météo, ni actualité, ni musique : le papotage reste hors de ces sujets.
  for (const x of duo) assert.doesNotMatch(x, /(^|[^a-zà-ÿ])(hiver|été|printemps|automne|météo|noël|actualité|chanson|concert)s?([^a-zà-ÿ]|$)/i, x);
  // Seul à l'antenne (voix de l'ordinateur), en parlant à chaque titre : ni mini-jeu ni sujet « entre eux ».
  p.run("Object.assign(settings, { chat: 'souvent', chatMix: 50, radioFreq: 'every', programme: false, voiceEngine: 'systeme', loreLevel: 'discret' }); var __s = { lastLines: [], played: [], queue: [] }; var __t = []; var __f = []; var __at = [];" +
    "for (var i = 0; i < 150; i++) { var pl = planAnnouncement(__s, 'interlude', { title: 'A', artist: 'B' }, { title: 'C', artist: 'D', key: 'k' + i }, 1e12 + i * 4 * 6e4, null, 0, false); if (pl.angle.id === 'bavardage') { __t.push(pl.angle.base); __f.push(pl.angle.format); __at.push(i * 4); } }");
  const topics = [...p.run('__t')];
  const formats = [...p.run('__f')];
  const at = [...p.run('__at')];
  assert.ok(topics.length > 30, 'le bavardage sort : ' + topics.length);
  assert.ok(topics.every((x) => !between.includes(x) && !pools.minijeu.includes(x)));
  const fixed = topics.filter((x) => x !== '{choix}, ou {choix}');
  assert.equal(new Set(fixed).size, fixed.length, 'aucun sujet repris dans l’émission');
  assert.ok(new Set(formats).size >= 4, 'plusieurs formats sortent : ' + [...new Set(formats)].join(', '));
  assert.ok(!formats.includes('minijeu'));
  for (let i = 1; i < formats.length; i++) assert.notEqual(formats[i], formats[i - 1], 'le même format deux fois de suite');
  assert.ok(at.length > 30);
  // Univers de la station coupé : pas de « nouvelles de la station », qui s'appuient dessus.
  p.run("settings.loreLevel = 'off'; var __s2 = { lastLines: [], played: [], queue: [] }; var __f2 = [];" +
    "for (var i = 0; i < 150; i++) { var pl = planAnnouncement(__s2, 'interlude', null, { title: 'C', artist: 'D', key: 'z' + i }, 2e12 + i * 4 * 6e4, null, 0, false); if (pl.angle.id === 'bavardage') __f2.push(pl.angle.format); }");
  assert.ok(![...p.run('__f2')].includes('nouvelles'));
});

test('discussions autour de la musique : quinze types et le jeu, sujets sans doublon, tirés sans reprise', () => {
  const p = loadPanel();
  const T = JSON.parse(JSON.stringify(p.run('ANGLE_TOPICS')));
  const ids = [...p.run("ANGLES_DUO.filter((a) => !/^anecdote/.test(a.id) && a.id !== 'bavardage').map((a) => a.id)")];
  assert.deepEqual(ids.slice().sort(), ['auditeur', 'aveu', 'chambre', 'coulisses', 'debat', 'defi', 'devinette', 'jeu', 'lien', 'mode_emploi', 'question', 'rappel', 'reaction', 'teaser', 'vanne', 'verdict']);
  let n = 0;
  for (const k of Object.keys(T)) {
    assert.ok(ids.includes(k) && k !== 'jeu', k + ' a des sujets mais pas d’angle');
    assert.equal(new Set(T[k]).size, T[k].length, 'doublon dans ' + k);
    n += T[k].length;
  }
  assert.equal(n, 242);
  // Un angle qui parle du titre qu'on vient d'écouter ne sort pas s'il n'y en a pas (début d'émission).
  p.run("hasGemini = true; Object.assign(settings, { voiceEngine: 'gemini', duo: true, chat: 'off', programme: false, radioFreq: 'every' }); var __ids = {}; var __s = { lastLines: [], played: [], queue: [] };" +
    "for (var i = 0; i < 400; i++) { var pl = planAnnouncement(__s, 'interlude', null, { title: 'C', artist: 'D', key: 'k' + i }, 1e12 + i * 6e5, null, 0, false); __ids[pl.angle.id] = 1; }");
  const seen = Object.keys(JSON.parse(JSON.stringify(p.run('__ids'))));
  for (const id of ['debat', 'coulisses', 'verdict', 'lien', 'reaction']) assert.ok(!seen.includes(id), id + ' sans titre précédent');
  for (const id of ['mode_emploi', 'defi', 'aveu', 'teaser', 'question']) assert.ok(seen.includes(id), id + ' ne sort jamais');
  // Le sujet imposé est ajouté à la consigne de l'angle, avec son intitulé.
  p.run("var __pl; for (var i = 0; i < 300; i++) { __pl = planAnnouncement(__s, 'interlude', null, { title: 'C', artist: 'D', key: 'q' + i }, 3e12 + i * 6e5, null, 0, false); if (__pl.angle.id === 'defi') break; }");
  assert.match(p.run('__pl.angle.txt'), /Défi imposé cette fois : /);
});

test('sujets imposés : pas de reprise d’une émission à l’autre, même pour une petite liste', () => {
  const p = loadPanel();
  // Dix sujets seulement pour le « mode d'emploi » : sans mémoire, une émission sur dix rouvrait sur le même.
  // Douze émissions de quatre tirages : un sujet ne revient jamais avant sept autres (70 % de la liste).
  p.run("var __seq = []; for (var e = 0; e < 12; e++) { var __sh = { variety: { angles: [] } }; for (var i = 0; i < 4; i++) __seq.push(drawTopic(__sh, 'mode_emploi', ANGLE_TOPICS.mode_emploi, false)); }");
  const seq = [...p.run('__seq')];
  const last = {};
  seq.forEach((x, i) => { if (last[x] !== undefined) assert.ok(i - last[x] > 7, 'sujet revenu après ' + (i - last[x]) + ' tirages'); last[x] = i; });
  assert.equal(new Set(seq).size, 10, 'toute la liste finit par passer');
  // Un exemple des Réglages ne compte pas.
  const before = JSON.stringify(p.run('airLog.topics.mode_emploi'));
  p.run("drawTopic({ demo: 'x', variety: { angles: [] } }, 'mode_emploi', ANGLE_TOPICS.mode_emploi, false)");
  assert.equal(JSON.stringify(p.run('airLog.topics.mode_emploi')), before);
  // Sauvegarde abîmée : la mémoire repart propre, sans casser le démarrage.
  assert.deepEqual(JSON.parse(JSON.stringify(p.run("cleanAirLog({ gag: 3, chat: 'x', topics: { vanne: ['a', 4, 'b'], bad: 'non' } })"))), { gag: '', chat: [], topics: { vanne: ['a', 'b'], bad: [] } });
});

test('cases à remplir et variantes : chaque case a sa liste, deux cases identiques diffèrent, une variante une fois sur deux', () => {
  const p = loadPanel();
  const all = [...p.run('CHAT_DUO')].concat(...Object.values(JSON.parse(JSON.stringify(p.run('CHAT_POOL')))), ...Object.values(JSON.parse(JSON.stringify(p.run('ANGLE_TOPICS')))));
  const slots = JSON.parse(JSON.stringify(p.run('TOPIC_SLOTS')));
  const used = new Set(all.join(' ').match(/\{[a-z_]+\}/g).map((x) => x.slice(1, -1)));
  for (const k of used) assert.ok(Array.isArray(slots[k]) && slots[k].length >= 3, 'case sans liste : ' + k);
  assert.equal(all.filter((x) => x.includes('{')).length, 26);
  // Tous les sujets, une fois remplis, n'ont plus d'accolade ; « pour X ou pour Y » ne tire jamais deux fois le même mot.
  p.run("var __v = { variety: { angles: [] } };");
  for (const x of all) assert.doesNotMatch(p.run('fillSlots(__v, ' + JSON.stringify(x) + ')'), /[{}]/, x);
  for (let i = 0; i < 60; i++) {
    const m = p.run("fillSlots(__v, 'plutôt pour {usage} ou pour {usage}')").match(/^plutôt pour (.+) ou pour (.+)$/);
    assert.ok(m && m[1] !== m[2], m && m[0]);
    const d = p.run("fillSlots(__v, '{choix}, ou {choix}')").split(', ou ');
    assert.ok(d.length === 2 && d[0] !== d[1], d.join(' | '));
  }
  // Variantes : environ une fois sur deux, jamais une variante « à deux » pour un animateur seul, jamais sans famille.
  p.run("var __tw = []; for (var i = 0; i < 400; i++) __tw.push(drawTwist(__v, 'coulisses', false)); var __solo = []; for (var i = 0; i < 400; i++) __solo.push(drawTwist(__v, 'studio', true));");
  const tw = [...p.run('__tw')];
  const n = tw.filter(Boolean).length;
  assert.ok(n > 150 && n < 250, n + ' variantes sur 400');
  // Jamais une des quatre dernières variantes de l'émission.
  const said = tw.filter(Boolean);
  for (let i = 1; i < said.length; i++) assert.ok(!said.slice(Math.max(0, i - 4), i).includes(said[i]), 'variante revenue trop tôt : ' + said[i]);
  const duoOnly = [...p.run("TOPIC_TWISTS.recit.filter((x) => x.duo).map((x) => x.t)")];
  assert.ok(duoOnly.length > 0 && [...p.run('__solo')].every((x) => !duoOnly.includes(x)));
  assert.equal(p.run("drawTwist(__v, 'vanne', false)"), '');
  // Chaque famille citée existe, et la consigne finale porte le sujet rempli et sa variante.
  const of = JSON.parse(JSON.stringify(p.run('TWIST_OF')));
  for (const k of Object.keys(of)) assert.ok(p.run('Array.isArray(TOPIC_TWISTS[' + JSON.stringify(of[k]) + '])'), k);
  p.run("hasGemini = true; Object.assign(settings, { voiceEngine: 'gemini', duo: true, chat: 'off', programme: false, radioFreq: 'every' }); var __s = { lastLines: ['a', 'b', 'c'], played: [], queue: [] }; var __hit = null;" +
    "for (var i = 0; i < 600 && !__hit; i++) { var pl = planAnnouncement(__s, 'interlude', { title: 'A', artist: 'B' }, { title: 'C', artist: 'D', key: 'k' + i }, 1e12 + i * 6e5, null, 0, false); if (pl.duo && pl.angle.twist && pl.angle.base !== pl.angle.topic) __hit = pl.angle; }");
  const hit = JSON.parse(JSON.stringify(p.run('__hit')));
  assert.ok(hit, 'un sujet à case avec variante finit par sortir');
  assert.ok(hit.txt.includes(hit.topic) && hit.txt.includes('Variante de cette fois : ' + hit.twist + '.'));
  assert.doesNotMatch(hit.txt, /[{}]/);
});

test('phrases toutes faites : on parle aux auditeurs (« vous »), sans prénom', () => {
  const p = loadPanel();
  p.run("var __c = { host: 'Alex', cohost: 'Sam', listener: 'Luc', greet: 'Bonsoir', time: 'vingt heures', part: 'soirée', ambiance: 'rock du soir', weather: '', prev: { title: 'Wonderwall', artist: 'Oasis' }, next: { title: 'Song 2', artist: 'Blur' }, trend: 'monte' };");
  for (const kind of ['intro', 'interlude', 'talkover']) {
    for (let i = 0; i < 12; i++) {
      for (const text of [p.run("templateLine('" + kind + "', __c)"), p.run("templateDuo('" + kind + "', __c)")]) {
        assert.match(text, /Song 2/);
        assert.doesNotMatch(text, /\b(tu|toi|te|ton|ta|tes)\b|Luc|Installe-toi/i, text);
      }
    }
  }
  assert.match(p.run("templateDuo('interlude', __c)"), /Vous écoutez Mood DJ/);
  assert.doesNotMatch(p.run("templateLineEn('intro', Object.assign({ greetEn: 'Good evening', ambianceEn: 'rock' }, __c))"), /Luc/);
});

test('consignes : vouvoiement, français parlé, aucune allusion aux goûts ; dosage, dynamique et coupure transmis', async () => {
  const bg = loadBackground();
  await bg.run("writeAnnouncement({ kind: 'interlude', host: 'Jeff', cohost: 'Laeti', duo: true, turns: 4, lang: 'fr', next: 'X de Y', previous: 'Z de W', listener: 'Luc', listenMode: 'jaime', cuts: 1," +
    " dynamic: 'pas de vanne cette fois : un enthousiasme simple et sincère, partagé'," +
    " focus: { tic: { who: 'A', text: 'Oki-doki' }, rest: ['Whoa !'], facet: { who: 'B', text: 'Manies : le mug brûlant.' }, gag: '', hasGags: true, mood: { A: 'd’humeur taquine', B: 'd’humeur rêveuse' } }," +
    " change: { from: 'rock', to: 'jazz' }, persona: { a: 'Fiche A.', b: 'Fiche B.', relation: 'Relation.' } })");
  const body = bg.__calls[0].body;
  const system = body.system.map((x) => x.text).join('\n');
  const user = body.messages[0].content;
  assert.match(system, /toujours « vous »/);
  assert.match(system, /ÉCRIS POUR L'OREILLE/);
  assert.match(system, /Ne parle jamais des goûts des auditeurs/);
  assert.doesNotMatch(system + user, /tutoyant|radio musicale personnelle|MODE D'ÉCOUTE|Prénom de l'auditeur|Luc|à la demande de l'auditeur/);
  assert.match(user, /Dynamique de cette intervention[^\n]*enthousiasme simple et sincère/);
  assert.doesNotMatch(user, /Ils se chambrent/);
  assert.match(user, /commence par « >> »/);
  assert.match(user, /Expression fétiche : une seule au plus, « Oki-doki » \(A, Jeff\)/);
  assert.match(user, /Au repos, déjà entendues récemment, à ne pas dire : « Whoa ! »/);
  assert.match(user, /Un seul détail personnel peut affleurer[^\n]*\(B, Laeti\) : Manies : le mug brûlant\./);
  assert.match(user, /Aucun running gag cette fois\./);
  assert.match(user, /HUMEUR DU JOUR[^\n]*A, d’humeur taquine ; B, d’humeur rêveuse/);
  assert.match(user, /c'est la programmation de la station qui change/);
  // Sans dosage ni coupure demandés (bilan de fin, exemples des Réglages) : les consignes d'avant restent valables.
  await bg.run("writeAnnouncement({ kind: 'talkover', host: 'Alex', cohost: 'Sam', duo: true, turns: 2, next: 'X de Y' })");
  const plain = bg.__calls[1].body.messages[0].content;
  assert.match(plain, /Ils se chambrent/);
  assert.doesNotMatch(plain, /DOSAGE DES FICHES|« >> »/);
});

test('coanimateur seul à l’antenne : son humeur du jour est transmise', async () => {
  const bg = loadBackground();
  await bg.run("writeAnnouncement({ kind: 'talkover', host: 'Laeti', hostGender: 'femme', lang: 'fr', next: 'X de Y', focus: { tic: null, rest: [], facet: null, gag: '', hasGags: false, mood: { A: '', B: 'd’humeur joueuse' } } })");
  const user = bg.__calls[0].body.messages[0].content;
  assert.match(user, /HUMEUR DU JOUR[^\n]*: d’humeur joueuse\./);
  assert.doesNotMatch(user, /running gag/i);
});

test('voix Gemini d’office à la première clé, sauf si l’auditeur a choisi lui-même', () => {
  const p = loadPanel();
  p.run("var __toasts = []; toast = (m) => { __toasts.push(m); }; hasGemini = true;");
  p.run("Object.assign(settings, { voiceEngine: 'systeme', voiceChosen: false }); geminiVoicesByDefault();");
  assert.equal(p.run('settings.voiceEngine'), 'gemini');
  assert.equal(p.run('__toasts.length'), 1);
  // Il avait choisi la voix de l'ordinateur : on n'y touche pas.
  p.run("Object.assign(settings, { voiceEngine: 'systeme', voiceChosen: true }); geminiVoicesByDefault();");
  assert.equal(p.run('settings.voiceEngine'), 'systeme');
  // Clé déjà là avant la mise à jour : rien n'est changé d'office, la bascule est proposée une seule fois.
  p.run("Object.assign(settings, { voiceEngine: 'systeme', voiceChosen: false, voiceOffered: false }); __toasts = []; offerGeminiVoices(); offerGeminiVoices();");
  assert.equal(p.run('settings.voiceEngine'), 'systeme');
  assert.equal(p.run('__toasts.length'), 1);
});

test('consignes dans une autre langue : on s’adresse à l’ensemble des auditeurs', async () => {
  const bg = loadBackground();
  await bg.run("writeAnnouncement({ kind: 'talkover', host: 'Alex', lang: 'en', next: 'X de Y' })");
  const system = bg.__calls[0].body.system.map((x) => x.text).join('\n');
  assert.match(system, /à l'ensemble des auditeurs \(au pluriel\)/);
  assert.doesNotMatch(system, /tutoiement/);
});

// ------------------------------------------------ 2.36 : la mémoire des animateurs
test('souvenirs : cent par animateur, les quasi-doublons fusionnent, la version la plus complète reste', () => {
  const p = loadPanel();
  p.run("Object.assign(settings, { hostName: 'Jeff', cohostName: 'Laeti' }); hostMemory = { A: [], B: [], L: [] };");
  p.run("rememberSelf('A', 'Jeff chante sous la douche'); rememberSelf('A', 'Jeff a peur des pigeons'); rememberSelf('A', 'Jeff chante toujours sous la douche le matin');");
  // Le deuxième « douche » remplace le premier (plus complet) et repasse parmi les récents.
  assert.deepEqual([...p.run('hostMemory.A.map((m) => m.t)')], ['Jeff a peur des pigeons', 'Jeff chante toujours sous la douche le matin']);
  // Dans l'autre sens : la version courte arrive après, la longue est gardée.
  p.run("rememberSelf('A', 'Jeff chante sous la douche');");
  assert.deepEqual([...p.run('hostMemory.A.map((m) => m.t)')], ['Jeff a peur des pigeons', 'Jeff chante toujours sous la douche le matin']);
  // Un seul mot en commun (ou seulement le prénom) : deux souvenirs différents.
  assert.equal(p.run("memAlike('Jeff a peur des pigeons', 'Jeff a peur du vide')"), false);
  assert.equal(p.run("memAlike('Jeff adore le reggae', 'Jeff a un vieux pulp')"), false);
  assert.equal(p.run("memAlike('Laeti a un chat nommé Larsen', 'Laeti a un chat, Larsen, nommé comme ça à cause du micro')"), true);
  // Prudence : deux mots sur trois en commun ne suffisent pas, on préfère un doublon à un souvenir perdu.
  assert.equal(p.run("memAlike('Laeti adore le chocolat noir', 'Laeti adore le café noir')"), false);
  // Cent au plus : le plus ancien s'en va.
  p.run("hostMemory.A = []; for (let i = 0; i < 130; i++) rememberSelf('A', 'souvenir numero ' + i + ' objet' + i * 7);");
  assert.equal(p.run('hostMemory.A.length'), 100);
  assert.match(p.run('hostMemory.A[0].t'), /numero 30 /);
  assert.equal(p.run("cleanMemories(Array.from({ length: 150 }, (_, i) => ({ t: 'x' + i, at: i }))).length"), 100);
});

test('souvenirs rappelés à l’IA : les dix derniers à chaque fois, les anciens à tour de rôle', () => {
  const p = loadPanel();
  p.run("hostMemory = { A: Array.from({ length: 40 }, (_, i) => ({ t: 's' + i, at: i })), B: [{ t: 'seul', at: 1 }], L: [] }; var __s = { variety: {} };");
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    const list = [...p.run("memFor('A', __s)")];
    assert.equal(list.length, 14);
    assert.deepEqual(list.slice(-10), Array.from({ length: 10 }, (_, k) => 's' + (30 + k)), 'les dix plus récents, dans l’ordre, à la fin');
    for (const t of list.slice(0, 4)) seen.add(t);
  }
  // Huit annonces × quatre anciens : les trente anciens sont tous ressortis au moins une fois.
  assert.equal(seen.size, 30);
  assert.deepEqual([...p.run("memFor('B', __s)")], ['seul']);
  // Mode Éco : pas de souvenirs envoyés.
  p.run("settings.aiPower = 'eco';");
  assert.deepEqual([...p.run("memFor('A', __s)")], []);
});

test('détail du jour : la fiche et les souvenirs passent chacun leur tour, cent souvenirs ne noient pas la fiche', () => {
  const p = loadPanel();
  p.run("Object.assign(settings, { hostName: 'Jeff', cohostName: 'Laeti', hostPersona: 'Il collectionne les vieux pulps. Il répare lui-même son camion. Il déteste le café froid.', cohostPersona: '' });" +
    "hostMemory = { A: Array.from({ length: 100 }, (_, i) => ({ t: 'souvenir ' + i, at: i })), B: [], L: [] };");
  let file = 0;
  let mem = 0;
  for (let i = 0; i < 400; i++) {
    const f = p.run("ficheFocus({ variety: {} }, 'interlude', ['A'], Date.now()).facet");
    if (!f) continue;
    if (/^souvenir \d+$/.test(f.text)) mem++; else file++;
  }
  assert.ok(file > 60 && mem > 60, 'fiche ' + file + ', souvenirs ' + mem);
  // Dans une même émission, un détail ne revient pas tant qu'il en reste de nouveaux.
  p.run("var __s2 = { variety: {} }; var __got = []; for (let i = 0; i < 200 && __got.length < 20; i++) { const f = ficheFocus(__s2, 'interlude', ['A'], Date.now()).facet; if (f) __got.push(f.text); }");
  const got = [...p.run('__got')];
  assert.equal(new Set(got).size, got.length, got.join(' | '));
});
