// Mood DJ — panneau et moteur DJ (monde isolé de l’extension) : spécialiste invité, préparation et diffusion des annonces, voix.
// Les fichiers mdj-*.js puis content.js sont chargés dans l’ordre du manifest et partagent la même portée :
// une fonction d’un fichier peut appeler celle d’un autre, mais le code exécuté au chargement ne doit
// utiliser que ce qui est défini dans les fichiers précédents (vérifié par tests/split.test.js).
'use strict';

// ------------------------------------------------------- spécialiste invité
// De temps en temps, un invité passe dans l'émission : il prend la place du coanimateur (le dialogue
// reste à deux voix), parle en spécialiste pendant deux ou trois interventions, puis repart.
// Étapes : « annonce » (l'animateur prévient qu'il arrive), « arrivee », « passage », « depart ».
const GUEST_ROLES = {
  rock: [['rock', 'spécialiste rock, ancien disquaire', 'rock'], ['guitare', 'guitariste de studio', 'pince']],
  poprock: [['rock', 'spécialiste rock, ancien disquaire', 'rock'], ['pop', 'journaliste musical, spécialiste pop', 'tele']],
  pop: [['pop', 'journaliste musical, spécialiste pop', 'tele']],
  country: [['country', 'spécialiste de la country, fan de Nashville', 'chaleureux']],
  electro: [['electro', 'DJ et producteur de musique électronique', 'pro']],
  rap: [['rap', 'journaliste spécialiste du rap', 'decale']],
  hiphop: [['rap', 'journaliste spécialiste du rap', 'decale']],
  metal: [['metal', 'spécialiste metal, ancien bassiste', 'rock']],
  blues: [['blues', 'bluesman et guitariste', 'conteur']],
  soul: [['soul', 'spécialiste soul et funk', 'chaleureux']],
  reggae: [['reggae', 'spécialiste du reggae', 'zen']],
  jazz: [['jazz', 'critique de jazz', 'erudit']],
  variete: [['chanson', 'spécialiste de la chanson française', 'conteur']],
  latino: [['latino', 'spécialiste des musiques latines', 'chaleureux']],
  classique: [['classique', 'musicologue', 'erudit']],
  bo: [['cinema', 'critique de cinéma, passionné de musiques de films', 'tele']],
  lofi: [['beats', 'producteur de beats lo-fi', 'zen']],
  asie: [['asie', 'spécialiste de la pop asiatique', 'morning']],
  monde: [['monde', 'spécialiste des musiques du monde', 'generaliste']],
  all: [['histoire', 'historien de la musique', 'erudit'], ['son', 'ingénieur du son', 'pince']]
};
const GUEST_NAMES = {
  femme: ['Emma', 'Sarah', 'Inès', 'Léa', 'Nina', 'Clara', 'Jade', 'Alice', 'Chloé', 'Manon', 'Rose', 'Zoé', 'Elsa', 'Lou'],
  homme: ['Lucas', 'Adam', 'Hugo', 'Karim', 'Théo', 'Paul', 'Bastien', 'Nathan', 'Samir', 'Jules', 'Nolan', 'Gabin', 'Léo', 'Tom']
};
const GUEST_QUIRKS = [
  'finit toujours par conseiller un album à écouter', 'ne jure que par les vinyles', 'a toujours une anecdote de concert',
  'compte les temps avec les doigts sur la table', 'adore les faces B', "parle des instruments comme de vieux amis",
  "a un avis tranché et l'assume", 'cite volontiers le producteur derrière un son', 'connaît les studios mieux que les artistes',
  "s'enthousiasme pour les intros"
];
const GUEST_EVERY = { rare: 60, souvent: 30 };
const guestOn = () => settings.guestFreq && settings.guestFreq !== 'off' && useGemini() && hasKey && settings.claudeAnnounce;
function guestRoleFor(s, next) {
  const st = (next && next.style) || C.onlyStyle(s.sel) || '';
  const list = GUEST_ROLES[st] || GUEST_ROLES.all;
  return list[Math.floor(Math.random() * list.length)];
}
// Un invité par spécialité, retenu d'une émission à l'autre : si Gwen revient, c'est la même Gwen.
function guestProfile(role) {
  learn.guests = learn.guests || {};
  let g = learn.guests[role[0]];
  if (!g || !g.name) {
    const gender = Math.random() < 0.5 ? 'femme' : 'homme';
    const taken = new Set([(settings.hostName || 'Alex').trim(), (settings.cohostName || 'Sam').trim()].concat(Object.values(learn.guests).map((x) => x.name)));
    const names = GUEST_NAMES[gender].filter((n) => !taken.has(n));
    g = learn.guests[role[0]] = { name: pick(names.length ? names : GUEST_NAMES[gender]), gender, style: role[2], role: role[1], quirk: pick(GUEST_QUIRKS), visits: 0 };
  }
  g.role = g.gender === 'femme' ? roleFem(role[1]) : role[1];
  g.style = validStyle(g.style || role[2], 'erudit');
  return g;
}
// Spécialité au féminin pour une invitée.
function roleFem(r) {
  return r.replace('ancien disquaire', 'ancienne disquaire').replace('ancien bassiste', 'ancienne bassiste').replace('sonneur de bagad', 'sonneuse de bagad')
    .replace('producteur', 'productrice').replace('passionné', 'passionnée').replace('historien', 'historienne').replace('ingénieur', 'ingénieure')
    .replace('bluesman et guitariste', 'chanteuse de blues et guitariste');
}
// Émission à deux voix : les deux animateurs sont à l'antenne.
const duoOnAir = () => useGemini() && !!settings.duo;
const hostNames = () => ({ A: (settings.hostName || 'Alex').trim() || 'Alex', B: (settings.cohostName || 'Sam').trim() || 'Sam' });
function guestVoice(g, own) {
  const gv = geminiVoices();
  // Ni la voix de l'animateur qui reçoit l'invité, ni celle de l'absent : l'un ou l'autre peut le recevoir (2.42).
  const taken = duoOnAir() ? [gv.a, gv.b] : [gv.a];
  let v = settings.guestVoices && settings.guestVoices[g.name];
  // own : la voix choisie pour un personnage du duo (Camille, Arthur).
  if (!v) v = own || (GEMINI_DEFAULTS[g.style] || GEMINI_DEFAULTS.erudit)[g.gender];
  if (!v || taken.includes(v)) v = (GEMINI_VOICES.find((x) => x[1] === g.gender && !taken.includes(x[0])) || [v])[0];
  return v;
}
// Qui reçoit l'invité (2.42) : 'A' ou 'B'. Jusque-là c'était toujours le premier animateur, et le second cédait sa
// place à chaque fois. D'une visite à l'autre, un invité tombe maintenant sur l'un puis sur l'autre ; un nouveau venu
// est reçu par celui qui n'a pas reçu l'invité précédent. first : le prénom de l'animateur qu'un personnage rencontre
// en premier (Arthur et Jeff). Retenu par prénom : l'auditeur peut inverser ses deux animateurs.
function guestStay(key, first) {
  if (!duoOnAir()) return 'A';
  const n = hostNames();
  const side = (name) => (name && name === n.B ? 'B' : name && name === n.A ? 'A' : '');
  const other = (x) => (x === 'A' ? 'B' : 'A');
  const all = learn.guests || {};
  const p = all[key];
  if (p && side(p.with)) return other(side(p.with));
  // Déjà venu, mais avant la 2.42 : c'était avec le premier animateur.
  if (p && p.visits > 0) return 'B';
  if (side(first)) return side(first);
  const last = Object.values(all).filter((x) => x && x.visits > 0).sort((a, b) => (b.last || 0) - (a.last || 0))[0];
  if (!last) return 'A';
  return side(last.with) ? other(side(last.with)) : 'B';
}
// Étape de l'invité pour la prochaine intervention ; crée l'invité quand c'est le moment.
function guestPhaseFor(s, next) {
  if (!s) return '';
  if (s.guest) return s.guest.phase;
  if (!guestOn() || !next || s.ambianceChange) return '';
  const now = Date.now();
  const every = (GUEST_EVERY[settings.guestFreq] || 60) * 60e3;
  if (!s.guestNextAt) s.guestNextAt = s.startedAt + Math.max(12 * 60e3, every * 0.45);
  if (now < s.guestNextAt || s.hook) return '';
  // Avec le duo Jeff & Laeti, une partie des passages revient à un personnage de leur univers (2.41).
  const c = castPick(s);
  if (c) {
    s.guest = castGuest(c, 'annonce');
    s.castSeen = (s.castSeen || []).concat([c.key]);
    dlog('annonce', 'personnage prévu', { nom: c.name, visites: s.guest.visits, passages: s.guest.passages, recu_par: hostNames()[s.guest.stay] });
    return 'annonce';
  }
  const role = guestRoleFor(s, next);
  const g = guestProfile(role);
  s.guest = { phase: 'annonce', key: role[0], name: g.name, gender: g.gender, style: g.style, role: g.role, quirk: g.quirk,
    visits: g.visits || 0, voice: guestVoice(g), passages: Math.random() < 0.5 ? 1 : 2, done: 0, stay: guestStay(role[0]) };
  dlog('annonce', 'invité prévu', { nom: g.name, specialite: g.role, style: g.style, visites: g.visits || 0, recu_par: hostNames()[s.guest.stay] });
  return 'annonce';
}
// Un personnage du duo en invité. Il est gardé comme les autres invités (nombre de passages, dernière venue).
function castGuest(c, phase) {
  learn.guests = learn.guests || {};
  const p = learn.guests[c.key] || (learn.guests[c.key] = { visits: 0 });
  Object.assign(p, { name: c.name, gender: c.gender, style: 'chaleureux', role: c.role, quirk: '' });
  return { phase, key: c.key, cast: c.key, name: c.name, gender: c.gender, style: 'chaleureux', role: c.role, quirk: '',
    visits: p.visits || 0, voice: guestVoice({ name: c.name, gender: c.gender, style: 'chaleureux' }, c.voice), passages: pick(c.passages), done: 0,
    stay: guestStay(c.key, c.first) };
}
const guestSpeaks = (phase) => phase === 'arrivee' || phase === 'passage' || phase === 'depart';
// L'étape de l'invité déjà prévu, sans en prévoir un nouveau (2.43.1). Sert à vérifier qu'une annonce prête est
// toujours la bonne. guestPhaseFor, lui, prévoit un invité dès que son heure est passée : appelé dans cette
// vérification, il déclarait périmée l'annonce déjà écrite et dite (journal du 28/11, 15:52 : Arthur « prévu » à
// 9 secondes de la fin du titre, annonce refaite, interlude coupé après 20 secondes d'attente ; trois invités
// prévus dans le journal, trois annonces jetées). L'invité est maintenant prévu à la préparation suivante.
const guestPhaseNow = (s) => (s && s.guest ? s.guest.phase : '');
// Une intervention avec l'invité a été dite : on passe à l'étape suivante.
function guestAdvance(s, phase) {
  const g = s && s.guest;
  if (!g || g.phase !== phase) return;
  if (phase === 'annonce') g.phase = 'arrivee';
  else if (phase === 'arrivee') {
    g.phase = g.passages > 0 ? 'passage' : 'depart';
    s.guestList = (s.guestList || []).concat([{ name: g.name, role: g.role }]);
  }
  else if (phase === 'passage') { g.done++; if (g.done >= g.passages) g.phase = 'depart'; }
  else if (phase === 'depart') {
    const p = learn.guests && learn.guests[g.key];
    const n = hostNames();
    // with : l'animateur qui l'a reçu, pour que ce soit l'autre la prochaine fois.
    if (p) { p.visits = (p.visits || 0) + 1; p.last = Date.now(); p.with = g.stay === 'B' ? n.B : n.A; }
    saveLearn();
    s.guestsSeen = (s.guestsSeen || 0) + 1;
    s.guest = null;
    s.guestNextAt = Date.now() + (GUEST_EVERY[settings.guestFreq] || 60) * 60e3;
    radioLog(s, 'Invité : ' + g.name + (g.gender === 'femme' ? ' est repartie' : ' est reparti') + ', ' + (g.stay === 'B' ? n.A : n.B) + ' revient.');
    return;
  }
  radioLog(s, 'Invité : ' + g.name + ' (' + g.role + ')' + (g.phase === 'arrivee' ? ' arrive à la prochaine intervention.' : g.phase === 'depart' ? ' repart à la prochaine intervention.' : ' est en studio.'));
}
// Réglages : les invités déjà venus (on peut en oublier un : une nouvelle personne prendra sa place).
function guestListView() {
  const list = Object.entries(learn.guests || {}).filter((e) => e[1] && e[1].name && e[1].visits > 0);
  if (!list.length || settings.guestFreq === 'off') return null;
  return h('div', { class: 'section', style: { gap: '6px' } },
    h('div', { class: 'label' }, 'Invités déjà venus'),
    list.map(([key, g]) => h('div', { class: 'row' },
      h('span', { class: 'muted' }, g.name + ', ' + g.role + ' · ' + g.visits + ' passage' + (g.visits > 1 ? 's' : '')),
      h('button', {
        class: 'x', type: 'button', 'aria-label': 'Oublier ' + g.name,
        // Un personnage du duo (2.41) ne se remplace pas : l'oublier remet seulement ses passages à zéro.
        title: 'Oublier ' + g.name + (/^perso:/.test(key) ? ' : ses passages repartent de zéro' : ' : un autre invité viendra pour cette spécialité'),
        onclick: () => { delete learn.guests[key]; saveLearn(); toast(g.name + (g.gender === 'femme' ? ' oubliée.' : ' oublié.'), null, 3000); render(); }
      }, icon('x', 14)))));
}
const GUEST_ANGLES = {
  arrivee: "Un invité arrive en studio : A l'accueille, l'invité se présente en une phrase avec sa spécialité, puis donne tout de suite son regard d'expert sur le titre suivant, à partir de la fiche.",
  passage: "L'invité donne son avis de spécialiste et une anecdote d'expert tirée de la fiche ; A réagit, n'est pas forcément d'accord.",
  depart: "Dernière intervention de l'invité : un dernier mot d'expert sur le titre suivant, A le remercie, et c'est l'invité qui lance le titre (« je vous laisse avec… »)."
};

// opts.voice === 'later' : le texte est écrit tout de suite, la voix seulement quand on la demande (ann.voice()).
// Préparée dès le début du titre, la voix était payée puis jetée chaque fois qu'un titre était zappé (2.36).
async function prepareAnnouncement(s, kind, prev, next, atMs, opts) {
  const now = atMs || Date.now();
  const tp = timeParts(new Date(now));
  const role = roleFor(s, next);
  const progList = role === 'programme' ? programmeOf(s, next) : null;
  // Spécialiste invité : pendant son passage, il remplace le coanimateur (toujours en duo).
  const gPhase = kind === 'intro' ? '' : guestPhaseFor(s, next);
  const guest = gPhase && s.guest ? s.guest : null;
  const gTalks = !!(guest && guestSpeaks(gPhase));
  // L'invité est reçu par le second animateur (2.42) : pour cette intervention, c'est lui que l'IA appelle « A »,
  // avec son prénom, sa fiche, ses souvenirs, ses choix de titres et sa voix. Le premier a quitté le micro.
  const stayB = gTalks && guest.stay === 'B' && duoOnAir();
  // Dédicace ou demande sur ce titre : lue juste avant lui.
  const dedic = next && next.dedic && !next.dedic.done && kind !== 'intro' ? next.dedic : null;
  const plan = planAnnouncement(s, kind, prev, next, atMs, role, progList ? progList.length : 0, !!(gTalks || dedic || hookDue(s, next) || (next && next.pick)));
  // Exemple « anecdote » des Réglages : une vraie histoire sur le titre, tirée des fiches.
  if (s.demo === 'anecdote') {
    plan.angle = (plan.duo ? ANGLES_DUO : ANGLES_SOLO).find((a) => a.id === 'anecdote_oeuvre') || plan.angle;
    plan.long = true;
    if (plan.duo) plan.turns = Math.max(plan.turns || 0, 4);
  }
  const cast = castOf(guest);
  if (gTalks && cast) {
    // Un personnage n'est pas un spécialiste : pas de fiche sur le titre, une conversation à sa façon. Le programme
    // garde sa forme quand il s'ouvre ; ailleurs, la chronique ou la culture courte laissent la place.
    plan.duo = true;
    if (plan.angle && plan.angle.id === 'programme') plan.angle = Object.assign({}, plan.angle, { txt: plan.angle.txt + ' ' + CAST_ANGLES[gPhase] });
    else {
      const talk = gPhase === 'passage' ? otherAngle(s, kind, true, prev) : null;
      plan.angle = { id: 'perso_' + gPhase, txt: CAST_ANGLES[gPhase] + (talk ? ' ' + talk.txt : ''), topic: talk ? talk.topic || '' : '' };
      plan.long = false;
      plan.free = true;
      if (!plan.pivot) plan.pivot = drawPivot(s, false);
    }
    plan.turns = Math.max(plan.turns || 0, gPhase === 'arrivee' ? 4 : 3);
    if (plan.opener === 'B' && gPhase === 'arrivee') plan.opener = 'A';
  } else if (gTalks) {
    plan.duo = true;
    // Pas de vrai ou faux pendant qu'un invité parle (2.42) : le pari et le score sont ceux des deux animateurs.
    if (plan.angle && plan.angle.id !== 'jeu' && (plan.angle.id === 'programme' || plan.angle.facts)) plan.angle = Object.assign({}, plan.angle, { txt: plan.angle.txt + ' ' + GUEST_ANGLES[gPhase] });
    else plan.angle = { id: 'invite_' + gPhase, txt: GUEST_ANGLES[gPhase], facts: 'next' };
    plan.turns = Math.max(plan.turns || 0, gPhase === 'arrivee' ? 4 : 3);
    if (gPhase === 'arrivee') plan.long = true;
    if (plan.opener === 'B' && gPhase === 'arrivee') plan.opener = 'A';
  }
  if (dedic && plan.duo) plan.turns = Math.max(plan.turns || 0, 3);
  const duo = plan.duo;
  const v = s.variety;
  // En duo, une annonce dite par un seul animateur alterne entre les deux (2.35) : avant, c'était toujours
  // l'animateur principal, qui parlait donc bien plus que l'autre. Sur un choix d'animateur, c'est celui qui a
  // choisi le titre qui le lance.
  const duoShow = settings.voiceEngine === 'gemini' && hasGemini && settings.duo;
  const soloB = !duo && duoShow && !s.demo && kind !== 'intro' && (next && next.pick ? next.pick.who === 'B' : Math.random() < (v.soloLast === 'B' ? 0.25 : v.soloLast === 'A' ? 0.75 : 0.5));
  if (!duo && duoShow && !s.demo) v.soloLast = soloB ? 'B' : 'A';
  const speakers = duo ? (gTalks ? [stayB ? 'B' : 'A'] : ['A', 'B']) : [soloB ? 'B' : 'A'];
  const live = !!(settings.claudeAnnounce && hasKey);
  const desc = (t) => spokenTitle(t.title) + ' de ' + t.artist + (t.year ? ' (' + t.year + ')' : '');
  let inProg = programmeOn() && (role === 'chronique' || role === 'culture') && !plan.free;
  const ch = changeFor(s, next);
  if (ch) {
    plan.angle = { id: 'changement', txt: duo
      ? "L'ambiance change avec ce titre : ils l'annoncent avec entrain, l'un réagit au virage (surpris, ravi ou taquin), puis ils lancent le titre."
      : "L'ambiance change avec ce titre : annonce le virage avec entrain, puis le titre." };
    plan.long = false;
    if (duo && progList && progList.length >= 2) plan.turns = Math.max(plan.turns, 3);
  }
  // Titres verrouillés avant un changement : ils appartiennent encore à l'ancienne ambiance.
  const oldAmb = s.ambianceChange && !s.ambianceChange.done && next && s.ambianceChange.locked.includes(next.key) ? s.ambianceChange.from : '';
  const c = {
    host: (settings.hostName || 'Alex').trim() || 'Alex', cohost: (settings.cohostName || 'Sam').trim() || 'Sam',
    // Le prénom de l'auditeur ne sert plus qu'à signer ses dédicaces : les animateurs parlent à tous les auditeurs.
    listener: (settings.listenerName || '').trim(),
    greet: tp.greet, time: tp.time, part: tp.part, prev, next, trend: trendOf(prev, next), ambiance: plainLabel(s.sel),
    weather: plan.sayWeather ? await weatherLine() : ''
  };
  c.timeEn = tp.timeEn;
  c.greetEn = tp.greetEn;
  c.ambianceEn = s.sel ? ambianceEn(s.sel) : c.ambiance;
  c.weatherEn = c.weather ? fmtWeatherEn(weatherCache.data) : '';
  if (plan.sayWeather && !c.weather) { plan.sayWeather = false; s.variety.weatherAt = plan.prevWeatherAt; }
  // Conversation libre à la place du programme : les titres à venir ne sont pas présentés cette fois.
  const progShown = progList && progList.length >= 2 && !plan.free ? progList : null;
  // Conversation à l'ouverture d'un programme : elle sert d'accroche, puis les titres à venir sont rappelés.
  const upcoming = plan.free && progList && progList.length >= 2 ? progList : null;
  // Réponse au jeu posé pendant le programme (vrai ou faux, question en suspens).
  let hookAnswer = null;
  if (hookDue(s, next)) {
    hookAnswer = Object.assign({}, s.hook);
    // Un invité au micro : le pari était celui de l'animateur absent. La réponse est donnée, sans pari ni score.
    if (gTalks) { hookAnswer.bet = null; hookAnswer.won = null; }
    else if (s.hook.type === 'pari' && duo && s.hook.bet) {
      hookAnswer.score = scoreAfter(s, s.hook.won);
      if (!s.hook.won && Math.random() < 0.35) hookAnswer.gage = pick(GAGES);
    }
  }
  // Éphéméride (culture courte, au plus 2 fois par émission, espacées de 40 min).
  let eph = null;
  if (live && role === 'culture' && !plan.free && !hookAnswer && !ch && (v.ephN || 0) < 2 && now - (v.ephAt || 0) > 40 * 60e3 && Math.random() < 0.4) {
    const items = await ephemerideItems(new Date(now), s);
    if (items.length) {
      eph = { date: dayLabel(new Date(now)), items };
      plan.angle = { id: 'ephemeride', txt: duo
        ? "Un moment éphéméride : l'un raconte un fait musical qui s'est passé un jour comme aujourd'hui, l'autre réagit, puis ils relancent le titre."
        : "Un moment éphéméride : raconte un fait musical qui s'est passé un jour comme aujourd'hui, puis relance le titre." };
      plan.long = true;
      if (duo) plan.turns = 3;
      v.ephAt = now;
      v.ephN = (v.ephN || 0) + 1;
    }
  }
  let facts = '';
  let factSrc = '';
  let gTitle = '';
  // Sujets de l'anecdote (artiste, titre, style) : pour ne pas raconter deux fois la même histoire.
  const subjects = [];
  const styleSubject = (t) => 'g:' + (((t && t.style) || (s.sel && s.sel.style) || '') + '/' + ((t && t.sub) || (s.sel && s.sel.sub) || ''));
  if (plan.angle && plan.angle.facts && live) {
    if (plan.angle.facts === 'genre') {
      const g = await genreFacts(prev || next, s.sel);
      if (g) { facts = 'Fiche du style « ' + g.title + ' » (Wikipédia) : ' + g.text; factSrc = 'style'; gTitle = g.title; }
      else facts = 'AUCUNE FICHE';
      subjects.push(styleSubject(prev || next));
    } else {
      const whoList = (plan.angle.facts === 'both' ? [prev, next] : [plan.angle.facts === 'prev' ? prev : next]).filter(Boolean);
      // Pas de flash concert dans un jeu : ses dates ne font pas une affirmation à deviner.
      const got = await Promise.all(whoList.map((t) => factsFor(t, { concerts: plan.angle.id !== 'jeu' && t === next })));
      facts = got.map((f) => f.text).filter(Boolean).join('\n');
      factSrc = got.map((f) => f.src).filter(Boolean).join(' / ');
      whoList.forEach((t, i) => { if (got[i].text) subjects.push('a:' + C.artistKey(t.artist), 's:' + C.keyOf(t.artist, t.title)); });
      // Rien sur ce titre ni sur ce groupe : une anecdote de culture musicale sur le style à la place.
      if (!facts && /^anecdote/.test(plan.angle.id) && whoList.length) {
        const who = whoList[whoList.length - 1];
        const g = await genreFacts(who, s.sel);
        if (g) { facts = 'REPLI\nFiche du style « ' + g.title + ' » (Wikipédia) : ' + g.text; factSrc = 'style (repli)'; }
        else facts = 'AUCUNE FICHE';
        subjects.push(styleSubject(who));
      }
    }
  }
  // Anecdote sans aucune fiche (2.39) : ni le titre, ni l'artiste, ni le style. L'IA recevait alors « raconte un
  // fait de culture générale vrai et connu » : elle inventait, ou décrivait le son d'un morceau qu'elle n'entend
  // pas (« cette ligne de basse toute ronde »). Une conversation qui n'a pas besoin de fiche prend la place.
  if (facts === 'AUCUNE FICHE' && plan.angle && /^anecdote/.test(plan.angle.id)) {
    dlog('annonce', 'anecdote sans fiche : une autre conversation à la place', { angle: plan.angle.id, pour: next ? next.title : '' });
    plan.angle = otherAngle(s, kind, duo, prev);
    plan.long = false;
    plan.free = true;
    if (!plan.pivot) plan.pivot = drawPivot(s, !duo);
    inProg = false;
    facts = '';
    factSrc = '';
    subjects.length = 0;
  }
  // Feuilleton de la soirée : la culture du style racontée en épisodes, dans l'ordre de l'article.
  let episode = null;
  if (inProg && gTitle && plan.angle && plan.angle.id === 'anecdote_culture') {
    v.episodes = v.episodes || {};
    const ep = v.episodes[gTitle] || (v.episodes[gTitle] = { n: 0, last: '' });
    ep.n++;
    episode = { n: ep.n, title: gTitle, prev: ep.last };
    plan.episodeRef = ep;
  }
  // Le jeu (2.38) : un type de conversation parmi les autres, tiré par planAnnouncement. À l'ouverture d'un
  // programme, en « À chaque titre » : vrai ou faux ou question en suspens sur le deuxième titre annoncé, réponse
  // juste avant lui. Sinon : vrai ou faux express sur le titre suivant. Sans fiche fiable, pas de jeu : une autre
  // conversation prend sa place.
  let express = null;
  let hook = null;
  let hookFacts = '';
  if (plan.angle && plan.angle.id === 'jeu') {
    const gameOn = live && !s.hook && !hookAnswer && !eph && !ch;
    // Pas de question en suspens quand un invité est annoncé : sa réponse tomberait pendant sa visite.
    if (gameOn && !guest && upcoming && settings.radioFreq === 'every') {
      const t2 = upcoming[1];
      const f = await factsFor(t2, { concerts: false });
      if (f.text) {
        const type = Math.random() < 0.57 ? 'pari' : 'question';
        const truth = flip();
        const b = drawBet(truth);
        const bets = duo && type === 'pari';
        hook = { id: uid(), type, forKey: t2.key, title: desc(t2), truth, bet: bets ? b.bet : null, won: bets ? b.won : null,
          subjects: ['a:' + C.artistKey(t2.artist), 's:' + C.keyOf(t2.artist, t2.title)] };
        hookFacts = f.text;
        // La fiche du titre suivant ne sert pas à ce jeu-là.
        facts = '';
        factSrc = '';
        subjects.length = 0;
        plan.angle = Object.assign({}, plan.angle, { txt: duo ? GAME_ANGLE.hook.duo : GAME_ANGLE.hook.solo });
      }
    }
    if (!hook && gameOn && facts && facts !== 'AUCUNE FICHE') {
      const truth = flip();
      const b = drawBet(truth);
      express = { truth, bet: b.bet, won: b.won, score: duo ? scoreAfter(s, b.won) : null, gage: duo && !b.won && Math.random() < 0.35 ? pick(GAGES) : '' };
    }
    if (hook || express) {
      if (duo) plan.turns = Math.max(plan.turns, 4);
    } else {
      plan.angle = otherAngle(s, kind, duo, prev);
      facts = '';
      factSrc = '';
      subjects.length = 0;
    }
  }
  const told = subjects.length ? toldFor(subjects) : [];
  const rub = inProg ? rubriqueFor(role, plan.angle, { hookAnswer, express, eph, episode, next }) : null;
  const stats = live && !hook && !express ? statsFor(s, next, now) : '';
  const local = facts && facts !== 'AUCUNE FICHE' ? localHint(facts.replace(/^REPLI\n/, '')) : '';
  const pub = (h) => h && { type: h.type, title: h.title, truth: h.truth, bet: h.bet, won: h.won, question: h.question || '', answer: h.answer || '', said: h.said || '', score: h.score || null, gage: h.gage || '' };
  // Niveau d'émotion de cette intervention (fixe, ou choisi par le mode Auto).
  const emo = s.demo === 'chant' && emotionFor(s, kind, prev, next, {}) === 'sobre' ? 'expressif'
    : emotionFor(s, kind, prev, next, { dedic, guestPhase: gPhase, won: !!((hookAnswer && hookAnswer.won) || (express && express.won)), change: !!ch });
  if (s && !s.demo) s.lastEmotion = emo;
  if (emotionSetting() === 'auto') dlog('annonce', 'émotions auto : ' + emo, { kind, energie: next && next.energy, moment: (s.sel || sel).moment, humeur: (s.sel || sel).mood || '' });
  let text = '';
  let hidden = {};
  let fromClaude = false;
  let textInfo = 'phrases toutes faites';
  const t0 = Date.now();
  // Seul à l'antenne, un animateur ne parle que de ses propres choix (il ne dirait pas « mon choix » pour celui de l'autre).
  const picks = live && !s.demo ? pickPayload(s, prev, next, duo, gTalks, soloB, stayB) : null;
  // Dosage des fiches, dynamique du dialogue et humeur du jour : tirés par Mood DJ (voir ficheFocus).
  const focus = live && !s.demo ? ficheFocus(s, kind, speakers, now) : null;
  // Pour l'IA, celui qui reçoit l'invité est « A » : son expression, son détail et son humeur changent d'étiquette.
  const asA = (x) => (x ? Object.assign({}, x, { who: 'A' }) : null);
  const focusView = stayB && focus ? Object.assign({}, focus, { tic: asA(focus.tic), facet: asA(focus.facet), mood: { A: focus.mood.B, B: '' } }) : focus;
  const me = stayB ? { name: c.cohost, style: settings.cohostStyle, gender: hostGenders().cohost } : { name: c.host, style: settings.hostStyle, gender: hostGenders().host };
  const dyn = live && duo && !gTalks && !s.demo ? pickDynamic(s, plan.angle, emo) : null;
  // Émission à deux sans invité au micro : les deux fiches partent toujours, que l'annonce soit un dialogue ou dite
  // par un seul. La partie fixe des consignes est alors la même pour toutes les annonces, et son cache sert à chacune.
  const team = duoShow && !gTalks;
  let memory = null;
  if (live) {
    try {
      text = await withTimeout(claude('announce', {
        kind, host: me.name, style: me.style, solo: duo ? '' : soloB ? 'B' : 'A', sparse: settings.radioFreq === 'change', time: tp.time, partOfDay: tp.part, lang: radioLang(),
        ambiance: oldAmb || (plan.momentOk || (s.sel && s.sel.prompt && s.sel.prompt.trim()) ? c.ambiance : styleText(s.sel)),
        change: ch ? { from: ch.from, to: ch.to } : null,
        previous: prev ? desc(prev) : '', next: desc(next), trend: c.trend,
        weather: c.weather, recent: (s.lastLines || []).slice(aiPower() === 'max' ? -8 : aiPower() === 'eco' ? -3 : -5),
        angle: plan.angle ? plan.angle.txt : '', sayTime: plan.sayTime, sayStation: plan.sayStation,
        momentOk: plan.momentOk, yearOk: plan.yearOk, avoid: plan.avoid, openers: plan.openers,
        turns: duo && aiPower() === 'max' && kind !== 'talkover' ? Math.min(8, (plan.turns || 4) + 2) : plan.turns, opener: plan.opener, facts, long: plan.long, show: s.id || '',
        role: plan.free ? null : plan.role, programme: progShown ? progShown.map(desc) : null, upcoming: upcoming ? upcoming.map(desc) : null, chatMode: !!plan.free, chatShow: !!(plan.free && chatAlways()), pivot: plan.pivot || '', programmeCycle: settings.radioFreq === 'every', told,
        rubrique: rub ? rub.name : '', hook: pub(hook), hookFacts, hookAnswer: pub(hookAnswer), express, ephemeride: eph, episode, stats, local,
        duo, cohost: gTalks ? guest.name : c.cohost, cohostStyle: gTalks ? guest.style : settings.cohostStyle,
        hostGender: me.gender, cohostGender: gTalks ? guest.gender : hostGenders().cohost,
        show: s.show ? { name: s.show.name, wake: !!s.show.wake } : null,
        dedic: dedic ? { to: dedic.to, msg: dedic.msg, from: dedic.from || c.listener, request: dedic.request } : null,
        guest: guest ? { phase: gPhase, name: guest.name, gender: guest.gender, role: guest.role, quirk: guest.quirk, visits: guest.visits, away: stayB ? c.host : c.cohost, cast: !!cast, fiche: cast ? cast.fiche : '' } : null,
        tags: settings.voiceEngine === 'gemini' && hasGemini, emotion: emo, sfx: settings.sfx !== false, sing: !!settings.sing || s.demo === 'chant', singNow: s.demo === 'chant',
        power: aiPower(), persona: personaPayload(duo, gTalks, s, team, stayB), lore: s.demo ? null : lorePayload(s, kind, plan.angle && plan.angle.id === 'bavardage' ? (plan.angle.lore === 'focus' ? 'focus' : true) : false),
        focus: focusView, dynamic: dyn ? dyn.txt : '', cuts: duo && !gTalks ? plan.cuts : undefined,
        ...(picks ? picks.view : {})
      }), aiTimeout(12000));
      textInfo = 'Claude (' + secs(Date.now() - t0) + ')';
      // Lignes cachées du jeu (question posée, vraie réponse) : jamais lues à l'antenne.
      const cut = typeof text === 'string' ? text.indexOf('\n@@MDJ@@') : -1;
      if (cut >= 0) { try { hidden = JSON.parse(text.slice(cut + 8)) || {}; } catch (e) { hidden = {}; } text = text.slice(0, cut); }
      if (hidden.cache) dlog('api', 'cache des consignes', { lus: hidden.cache.lus, ecrits: hidden.cache.ecrits, hors_cache: hidden.cache.autres });
      // Mémoire des animateurs : gardée avec l'annonce, et retenue seulement si elle passe à l'antenne
      // (une annonce refaite ou un exemple des Réglages ne laisse aucun faux souvenir).
      if (!s.demo) {
        memory = {
          // Seul à l'antenne, B écrit ses souvenirs sous « SOUVENIR A » (« toi ») : ils lui reviennent.
          souvenirs: (Array.isArray(hidden.souvenirs) ? hidden.souvenirs : []).filter((m) => m && (m.who === 'A' || (m.who === 'B' && !gTalks)))
            // Même chose pour le second animateur quand c'est lui qui reçoit l'invité (il était « A » dans le texte).
            .map((m) => (soloB || stayB ? { who: 'B', text: m.text } : m)),
          lore: Array.isArray(hidden.lore) ? hidden.lore : [],
          thread: duo ? String(hidden.suivi || '').slice(0, 200) : null
        };
      }
      fromClaude = !!text;
    } catch (e) { text = ''; textInfo = 'phrases toutes faites (Claude : ' + e.message + ')'; }
  } else if (!hasKey) {
    textInfo = 'phrases toutes faites (pas de clé Claude)';
  }
  c.sayTime = plan.sayTime;
  c.change = ch;
  c.programme = progShown;
  if (!text) {
    const cs = soloB ? Object.assign({}, c, { host: c.cohost }) : c;
    text = duo && kind !== 'talkover' ? (fbEnglish() ? templateDuoEn : templateDuo)(kind, c) : (fbEnglish() ? templateLineEn : templateLine)(kind, cs);
    // Sans Claude, la réponse au jeu est quand même donnée.
    if (hookAnswer) text = (duo && kind !== 'talkover' ? 'A: ' : '') + hookAnswerLine(hookAnswer) + (duo && kind !== 'talkover' ? '\n' : ' ') + text;
    // Sans Claude, la dédicace est quand même lue, en une phrase simple.
    if (dedic) {
      const who = dedic.from || c.listener;
      const line = fbEnglish()
        ? (dedic.request ? 'A request' : 'A dedication') + (who ? ' from ' + who : '') + (dedic.to ? ' for ' + dedic.to : '') + (dedic.msg ? ': ' + dedic.msg : '') + '.'
        : (dedic.request ? 'Une demande' + (who ? ' de ' + who : '') : 'Une dédicace' + (who ? ' de ' + who : '')) + (dedic.to ? ' pour ' + dedic.to : '') + (dedic.msg ? ' : ' + dedic.msg : '') + '.';
      text = (duo && kind !== 'talkover' ? 'A: ' : '') + line + (duo && kind !== 'talkover' ? '\n' : ' ') + text;
    }
  }
  if (!fromClaude) { hook = null; express = null; }
  if (hook) { hook.question = hidden.question || ''; hook.answer = hidden.answer || ''; }
  const marks = takeMarks(parseTurns(text, duo));
  const turns = marks.turns;
  const plain = stripTags(turns.map((t) => t.text).join(' '));
  const sfx = fromClaude && settings.sfx !== false && emo !== 'sobre' && emo !== 'intime' ? marks.sfx : [];
  if (marks.sfx.length || turns.some((t) => t.emotion)) dlog('annonce', 'émotions', { tons: turns.filter((t) => t.emotion).map((t) => t.speaker + ' ' + t.emotion), bruitages: sfx.map((x) => x.name + ' @' + Math.round(x.at * 100) + '%') });
  // Exemples des Réglages : leur texte reste dans leur propre fausse émission. Une vraie annonce, elle, n'entre dans
  // « les dernières interventions » qu'au moment où elle passe à l'antenne (sayIt).
  if (s.demo) s.lastLines = (s.lastLines || []).concat([plain]).slice(-24);
  // Expressions fétiches entendues dans ce texte : elles passent « au repos » pour les prochaines interventions.
  const said = s.demo ? [] : noteSayings(s, plain, now);
  if (focus || said.length) dlog('annonce', 'dosage des fiches', { qui: speakers.join('+'), tic_permis: focus && focus.tic ? focus.tic.text : '', detail: focus && focus.facet ? focus.facet.text.slice(0, 80) : '', gag: (focus && focus.gag) || '',
    au_repos: focus ? focus.rest.length : 0, entendus: said.join(' | '), dynamique: dyn ? dyn.id : '', bavardage: (plan.angle && plan.angle.format) || '', retour: plan.pivot || '', sujet: (plan.angle && plan.angle.topic) || '', variante: (plan.angle && plan.angle.twist) || '', coupure: turns.filter((t) => t.cut).length, libre: !!plan.free });
  if (plan.episodeRef) plan.episodeRef.last = plain.slice(0, 300);
  // Mémoire des anecdotes : pour un vrai ou faux, c'est le vrai fait qui est retenu, jamais la version modifiée.
  // Elle est notée « déjà racontée » quand l'annonce passe à l'antenne (sayIt), plus dès sa préparation (2.39) :
  // une annonce préparée puis jamais dite faisait perdre son histoire pour 90 jours.
  const toldNote = fromClaude && subjects.length ? { subjects: subjects.slice(), text: express ? hidden.answer || '' : plain } : null;
  if (plan.angle) dlog('annonce', 'angle : ' + plan.angle.id + (plan.role ? ' [' + plan.role + ']' : '') + (duo ? ' (duo, ' + plan.turns + ' répliques, ' + plan.opener + ' ouvre)' : ''),
    { heure: plan.sayTime, meteo: plan.sayWeather, station: plan.sayStation, moment: plan.momentOk, annee: plan.yearOk, fiche: factSrc || false, deja_raconte: told.length,
      rubrique: rub ? rub.name : '', jeu: hook ? hook.type + ' (' + hook.truth + ')' : express ? 'express (' + express.truth + ')' : hookAnswer ? 'réponse' : '', feuilleton: episode ? episode.n : 0,
      clin_oeil: [stats ? 'stats' : '', local ? 'local' : ''].filter(Boolean).join('+'), eviter: plan.avoid.join(', ') });
  // La voix : fabriquée une seule fois, tout de suite ou plus tard selon l'appelant.
  const synth = async () => {
  let audio = null;
  let engine = '';
  let voiceInfo = "voix de l'ordinateur";
  const t1 = Date.now();
  if (settings.voiceEngine === 'gemini' && !hasGemini) voiceWarn(s, "Aucune clé Gemini enregistrée : colle-la dans Réglages › Voix, puis clique sur Enregistrer.");
  if (useGemini()) {
    engine = 'Gemini';
    try {
      const gv = geminiVoices();
      // L'invité parle avec sa propre voix, seulement si Claude a bien écrit son passage.
      const gVoice = gTalks && fromClaude;
      // Les répliques « A » sont alors celles du second animateur : sa voix et sa direction.
      const asB = soloB || (gVoice && stayB);
      const styleB = gVoice ? (cast ? cast.voiceStyle : (GEMINI_STYLES[guest.style] || gv.styleB) + ', a guest expert visiting the studio') : gv.styleB;
      // Déchaîné : la voix elle-même est poussée (énergie, écarts de ton et de volume), pas seulement
      // le texte. Sans ça, l'indication de jeu de chaque réplique était lissée par le style de base, et
      // « Déchaîné » sonnait plus sage qu'« Expressif » (où les rares indications ressortent).
      const lvl = emo;
      const base = (st) => st + (lvl === 'dechaine' ? '. Overall energy: very high, theatrical and over the top, big swings in pitch, pace and volume, laughs come easily and loudly'
        : lvl === 'intime' ? '. Overall: intimate late-night tone, very close to the microphone, soft, tender and slow, gentle breaths and pauses, never loud' : '');
      const line = (e) => (!e ? '' : lvl === 'intime' ? '. Delivery for this line, softly and intimately: ' + e : lvl === 'dechaine' ? '. Delivery for this line, played BIG and exaggerated, far more intense than a normal radio host: ' + e : '. Delivery for this line: ' + e);
      const cutIn = '. This line interrupts the other speaker: jump in immediately, no pause before it';
      const cutOff = '. This line gets cut off by the other speaker: stop abruptly on the last word, no falling intonation, no trailing pause';
      const styled = turns.map((t, i) => Object.assign({}, t, { text: voiceCutText(turns, i), style: base(t.speaker === 'B' ? styleB : asB ? gv.styleB : gv.styleA) + line(t.emotion) + (t.cut ? cutIn : '') + (turns[i + 1] && turns[i + 1].cut ? cutOff : '') }));
      const r = await withTimeout(claude('gemini-tts', { turns: styled, voiceA: asB ? gv.b : gv.a, voiceB: gVoice ? guest.voice : gv.b, style: asB ? gv.styleB : gv.styleA }), duo || kind === 'interlude' ? 40000 : 25000);
      audio = b64ToBuffer(r.b64);
      voiceInfo = 'Gemini' + (duo ? ' en duo' : '') + ' (' + secs(Date.now() - t1) + (r.cle && hasGemini2 ? ', clé ' + r.cle : '') + ')';
    } catch (e) {
      voiceInfo = "voix de l'ordinateur (Gemini : " + e.message + ')';
      voiceWarn(s, 'Voix Gemini : ' + e.message);
    }
  }
  return { audio, engine, voiceInfo };
  };
  const infoOf = (voiceInfo) => 'texte : ' + textInfo + ' · ' + voiceInfo + (useGemini() ? ' · émotions ' + (EMO_NAMES[emo] || emo) + (emotionSetting() === 'auto' ? ' (auto)' : '') : '');
  const ann = { text: plain, audio: null, engine: '', voiced: false, voiceP: null, s, kind, role: plan.free ? null : plan.role, saysTime: !!(plan.sayTime || plan.sayWeather), info: infoOf('voix à venir'),
    hook, hookAnswered: hookAnswer ? hookAnswer.id : null, scoreAfter: (hookAnswer && hookAnswer.score) || (express && express.score) || null,
    express, rubrique: fromClaude && rub ? rub.name : '', sting: fromClaude && gTalks && gPhase === 'arrivee' ? 'invite' : fromClaude && rub ? rub.sting : '',
    guestPhase: fromClaude ? gPhase : '', guestName: guest ? guest.name : '', sfx, dedic,
    memory: fromClaude ? memory : null, told: toldNote, pickRefs: fromClaude && picks ? picks.refs : null, solo: duo ? '' : soloB ? 'B' : 'A' };
  // ann.voice() : fabrique la voix (une seule fois, même demandée de plusieurs endroits) et rend l'annonce complète.
  ann.voice = () => ann.voiceP || (ann.voiceP = synth().then((v) => { ann.audio = v.audio; ann.engine = v.engine; ann.info = infoOf(v.voiceInfo); ann.voiced = true; return ann; }));
  if (!opts || opts.voice !== 'later') await ann.voice();
  return ann;
}

async function getAnnouncement(s, kind, prev, next) {
  const fits = (pf) => pf && pf.key === next.key && pf.kind === kind && pf.promise && (pf.role || null) === roleFor(s, next) && (pf.progKeys || '') === progKeysFor(s, next) &&
    (pf.hookId || '') === hookIdFor(s, next) && (pf.guestPhase || '') === (kind === 'intro' ? '' : guestPhaseNow(s)) && (pf.dedicId || '') === dedicIdOf(next);
  for (const pf of [s.prefetch, s.startPrefetch]) {
    if (!fits(pf)) continue;
    const r = await pf.promise;
    // La voix d'une annonce préparée à l'avance n'est peut-être pas encore faite : on l'attend ici.
    if (r) return r.voice ? r.voice() : r;
  }
  return prepareAnnouncement(s, kind, prev, next);
}

const KIND_NAMES = { intro: 'Intro', talkover: 'Annonce', interlude: 'Interlude', outro: 'Bilan de fin' };
const ROLE_NAMES = { programme: 'Programme', chronique: 'Chronique', culture: 'Culture' };
async function sayIt(ann, opts) {
  const o = opts || {};
  if (!ann || !ann.text) { dlog('annonce', 'rien à dire (texte vide)'); return; }
  if (ann.voice && !ann.voiced) await ann.voice();
  const s = ann.s;
  // Retenue maintenant qu'elle passe à l'antenne (2.37). Elle l'était dès sa préparation : une annonce préparée puis
  // jamais dite restait dans « les dernières interventions » montrées à l'IA, qui y répondait à l'annonce suivante
  // (journal du 28/11 : le verdict d'un vrai ou faux que les auditeurs n'avaient jamais entendu).
  if (s && !s.demo && ann.kind !== 'outro') s.lastLines = (s.lastLines || []).concat([ann.text]).slice(-24);
  if (s && ann.hookAnswered && s.hook && s.hook.id === ann.hookAnswered) {
    if (ann.scoreAfter) s.score = ann.scoreAfter;
    if (s.hook.answer) rememberTold(s.hook.subjects || [], s.hook.answer);
    dlog('annonce', 'jeu : réponse donnée', { type: s.hook.type, vrai: s.hook.truth, score: s.score || null });
    s.hook = null;
  }
  if (s && ann.express && ann.express.score) s.score = ann.express.score;
  if (s && ann.guestPhase) guestAdvance(s, ann.guestPhase);
  if (s && ann.dedic && !ann.dedic.done) {
    ann.dedic.done = true;
    s.dedicList = (s.dedicList || []).concat([{ to: ann.dedic.to, msg: ann.dedic.msg, request: ann.dedic.request }]);
    dlog('annonce', (ann.dedic.request ? 'demande' : 'dédicace') + ' lue', { pour: ann.dedic.to });
  }
  if (s && !s.demo && ann.told) rememberTold(ann.told.subjects, ann.told.text);
  // Mémoire et choix des animateurs : retenus maintenant que l'annonce passe vraiment.
  if (s && !s.demo && ann.memory) {
    for (const m of ann.memory.souvenirs) rememberSelf(m.who, m.text);
    for (const t of ann.memory.lore) rememberSelf('L', t);
    if (ann.memory.thread !== null && s.variety) s.variety.thread = ann.memory.thread;
  }
  if (s && !s.demo && ann.pickRefs) {
    if (ann.pickRefs.tease) ann.pickRefs.tease.teased = true;
    if (ann.pickRefs.after) { ann.pickRefs.after.discussed = true; if (s.pickPending === ann.pickRefs.after) s.pickPending = null; }
  }
  if (s && ann.hook) {
    s.hook = Object.assign({}, ann.hook, { said: ann.text.slice(0, 600) });
    dlog('annonce', 'jeu lancé : ' + (ann.hook.type === 'pari' ? 'vrai ou faux' : 'question en suspens'), { sur: ann.hook.title, vrai: ann.hook.truth, pari: ann.hook.bet || '' });
  }
  dlog('annonce', 'texte', { kind: ann.kind, role: ann.role || '', rubrique: ann.rubrique || '', texte: ann.text });
  radioLog(ann.s, (ann.kind === 'intro' ? 'Intro' : ROLE_NAMES[ann.role] || KIND_NAMES[ann.kind] || 'Annonce') +
    (ann.role && ann.kind === 'interlude' ? ' (interlude)' : '') + (ann.rubrique ? ' « ' + ann.rubrique + ' »' : '') + ' : ' + (ann.info || ''));
  // Petit jingle de la rubrique, juste avant la voix.
  if (ann.sting && settings.jingles && !o.noSting) await callSafe('playSting', ann.sting);
  if (ann.audio) {
    const dur = wavSeconds(ann.audio);
    if (o.onVoiceStart) o.onVoiceStart(dur);
    scheduleSfx(ann.sfx, dur);
    const r = await call('playVoice', ann.audio).catch(() => null);
    if (r && r.ok) return;
    clearSfx();
    // Pas de réponse : la voix joue peut-être encore. On la coupe avant de passer à celle de l'ordinateur,
    // pour ne jamais entendre les deux en même temps.
    if (!r) await callSafe('stopVoice');
    const why = VOICE_REASONS[r && r.reason] || 'lecture impossible';
    radioLog(ann.s, 'Voix ' + (ann.engine || '') + ' reçue mais pas lue (' + why + ") : voix de l'ordinateur.");
    voiceWarn(ann.s, 'Voix ' + (ann.engine || '') + ' reçue mais pas lue : ' + why + '.');
  }
  // Voix de l'ordinateur : les bruitages passent avant ou après la phrase.
  const sx = ann.sfx || [];
  for (const x of sx.filter((y) => y.at < 0.5)) await callSafe('playSfx', x.name);
  if ('speechSynthesis' in window) await speak(ann.text);
  for (const x of sx.filter((y) => y.at >= 0.5)) await callSafe('playSfx', x.name);
}

// Bruitages calés dans la voix Gemini, à la place où Claude les a mis (au prorata du texte).
let sfxTimers = [];
function clearSfx() { for (const id of sfxTimers) clearTimeout(id); sfxTimers = []; }
function scheduleSfx(list, dur) {
  clearSfx();
  for (const x of list || []) {
    const ms = Math.max(0, (dur > 0 ? x.at * dur : 0) * 1000 - 150);
    sfxTimers.push(setTimeout(() => callSafe('playSfx', x.name), ms));
  }
}
// Habillage sonore (jingles, fond des interludes) : dans le style de l'ambiance, ou le classique Mood DJ.
const KIT_NAMES = { pop: 'pop', rock: 'rock', electro: 'électro', hiphop: 'hip-hop', chill: 'chill / nuit', jazz: 'jazz', funk: 'funk / disco',
  reggae: 'reggae', tropical: 'latino / tropical', celtique: 'celtique', orchestre: 'orchestre', acoustique: 'acoustique' };
const kitOpts = () => (settings.soundKit === 'classique' ? { kit: 'pop', energy: 2 } : C.soundKit(soundSel()));
// Émotions : un niveau fixe (Sobre, Intime, Expressif, Déchaîné) ou « Auto ».
const EMO_SETTINGS = ['auto', 'sobre', 'intime', 'expressif', 'dechaine'];
const EMO_NAMES = { sobre: 'sobre', intime: 'intime', expressif: 'expressif', dechaine: 'déchaîné' };
const emotionSetting = () => (EMO_SETTINGS.includes(settings.emotion) ? settings.emotion : 'auto');
// Niveau sans contexte (réglage fixe ; en Auto, la valeur moyenne).
const emotionLevel = () => { const x = emotionSetting(); return x === 'auto' ? 'expressif' : x; };
// Auto : le niveau de chaque intervention selon le moment, l'humeur, l'énergie des titres, le style
// de l'animateur et ce qui se passe à l'antenne. ev : { dedic, guestPhase, won, change }.
const CALM_HOSTS = new Set(['zen', 'nuit']);
const HOT_HOSTS = new Set(['morning', 'sport', 'rock', 'tele']);
function emotionFor(s, kind, prev, next, ev) {
  const set = emotionSetting();
  if (set !== 'auto') return set;
  const e = ev || {};
  const sx = (s && s.sel) || sel;
  const moment = sx.moment || '';
  const mood = sx.mood || '';
  const hostSt = settings.hostStyle || 'chaleureux';
  const hour = new Date().getHours();
  const en = (next && next.energy) || sx.energy || 3;
  const pe = (prev && prev.energy) || en;
  // Intime : coucher, méditation, tard dans la nuit sur un titre doux, romantique, dédicace émue.
  if (moment === 'coucher' || moment === 'meditation') return 'intime';
  if ((hour >= 23 || hour < 6) && en <= 2) return 'intime';
  if (mood === 'romantique' && en <= 3 && !e.won) return 'intime';
  if (e.dedic && !e.dedic.request && en <= 2) return 'intime';
  let lv = 1; // 0 sobre, 1 expressif, 2 déchaîné
  if (moment === 'fete' || moment === 'sport') lv = 2;
  else if (moment === 'travail' || moment === 'matinee') lv = 0;
  if (['melancolique', 'nostalgique', 'sombre', 'planant', 'reconfortant'].includes(mood)) lv -= 1;
  if (['epique', 'rageur', 'motivant'].includes(mood)) lv += 1;
  if (en >= 5) lv += 1;
  else if (en <= 1) lv -= 1;
  if (en - pe >= 2) lv += 1;
  else if (pe - en >= 2) lv -= 1;
  // Les temps forts de l'émission montent d'un cran, le temps d'une intervention.
  if (e.won || e.guestPhase === 'arrivee' || e.change) lv += 1;
  if (kind === 'intro' || kind === 'interlude') lv += 0; // la place de s'exprimer, sans pousser
  else if (kind === 'talkover' && lv >= 2 && en < 4) lv = 1;
  if (CALM_HOSTS.has(hostSt)) lv = Math.min(lv, 1);
  if (HOT_HOSTS.has(hostSt)) lv = Math.max(lv, 1);
  lv = Math.max(0, Math.min(2, lv));
  if (lv === 0 && (hour >= 22 || hour < 6) && CALM_HOSTS.has(hostSt)) return 'intime';
  return ['sobre', 'expressif', 'dechaine'][lv];
}

// Durée d'une voix WAV (Gemini) : pour lancer le titre suivant sous les derniers mots.
function wavSeconds(buf) {
  try {
    if (!buf || buf.byteLength < 44) return 0;
    const dv = new DataView(buf);
    const tag = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
    if (tag(0) !== 'RIFF') return buf.byteLength / 48000;
    let off = 12;
    let byteRate = 0;
    while (off + 8 <= buf.byteLength) {
      const id = tag(off);
      const size = dv.getUint32(off + 4, true);
      if (id === 'fmt ') byteRate = dv.getUint32(off + 16, true);
      if (id === 'data') return byteRate ? Math.min(size, buf.byteLength - off - 8) / byteRate : 0;
      off += 8 + size + (size % 2);
    }
  } catch (e) { /* ignore */ }
  return 0;
}
// Le titre suivant démarre doucement sous les derniers mots, et le fond sonore s'efface en même temps.
const RAMP_LEAD = 3;
async function startRamp(s, next) {
  // Émission arrêtée entre-temps : le titre suivant ne démarre pas.
  if (session !== s || s.status !== 'playing') return;
  s.ramping = next;
  next.announceKind = null;
  if (settings.radioBed) callSafe('bedStop', RAMP_LEAD + 1);
  dlog(s.inIntro ? 'intro' : 'interlude', 'fondu enchaîné : le titre ' + (s.inIntro ? 'd\'ouverture' : 'suivant') + ' démarre sous les derniers mots', { titre: next.title });
  await playTrack(s, next, { silent: true });
  const t0 = Date.now();
  while (session === s && s.current === next && Date.now() - t0 < 6000 && !(ps.videoId === next.videoId && (ps.time || 0) > 0.15 && !ps.paused)) await sleep(100);
  if (session !== s || s.current !== next || s.status !== 'playing') return;
  next.fadedIn = true;
  next.fadeInAt = Date.now();
  callSafe('fadeTo', 0.3, 1.5);
}

// Ouverture de l'émission : jingle, fond sonore et intro d'abord, musique en pause.
// Avec une voix Gemini (durée connue), le premier titre démarre sous les 4 dernières
// secondes de la voix. « Suivant » coupe l'intro comme un interlude.
const INTRO_LEAD = 4;
const INTRO_WAIT = 60000;
async function runIntro(s, first) {
  // De la musique passe déjà (nouvelle sélection lancée en cours d'écoute) : elle continue tout
  // doucement pendant la préparation, au lieu d'un long silence, puis s'efface quand l'intro est prête.
  const waitMusic = !ps.paused && !ps.ad && !!ps.videoId;
  if (waitMusic) await callSafe('fadeTo', 0.3, 1.5);
  else {
    await callSafe('fadeTo', 0, 0.4);
    await callSafe('pause');
  }
  const tI = Date.now();
  dlog('intro', 'début', { titre: first.title, musique_d_attente: waitMusic, etat: snapshot() });
  s.inIntro = true;
  s.inInterlude = true;
  s.announcing = true;
  s.skipInterlude = false;
  s.introWaiting = waitMusic;
  const abortP = new Promise((res) => { s.abortInterlude = () => res(null); });
  const guard = setInterval(() => {
    if (session !== s || ps.ad || ps.paused || s.ramping || s.introWaiting) return;
    callSafe('fadeTo', 0, 0.2);
    callSafe('pause');
  }, 700);
  let rampTimer = null;
  try {
    // L'intro est d'abord préparée en entier (texte et voix), sous un message de chargement :
    // le jingle, le fond sonore et la voix s'enchaînent ensuite sans blanc. 60 s au plus.
    s.note = "Les animateurs préparent l'émission…";
    render();
    const annP = getAnnouncement(s, 'intro', null, first);
    const ann = await Promise.race([annP, sleep(INTRO_WAIT).then(() => null), abortP]);
    dlog('intro', 'annonce ' + (ann ? 'prête' : 'absente') + ' après ' + (Date.now() - tI) + ' ms', ann ? { voix: ann.audio ? 'oui' : 'ordinateur' } : undefined);
    // La musique d'attente s'efface avant le jingle.
    if (s.introWaiting) {
      s.introWaiting = false;
      if (!s.skipInterlude && session === s) {
        await callSafe('fadeTo', 0, 1.5);
        await sleep(1500);
        await callSafe('pause');
      }
    }
    if (ann && session === s && !s.skipInterlude) {
      s.note = "Ouverture de l'émission…";
      render();
      if (settings.jingles) await jingle(s, 0);
      if (settings.radioBed && !s.skipInterlude) callSafe('bedStart', 0.45, kitOpts());
    }
    if (s.skipInterlude) { /* coupée par l'auditeur */ }
    else if (!ann) radioLog(s, "Intro sautée : l'annonce n'était pas prête au bout de " + Math.round(INTRO_WAIT / 1000) + ' s, la musique démarre.');
    else if (session === s) {
      const onVoiceStart = (dur) => {
        if (!(dur > INTRO_LEAD + 2)) return;
        rampTimer = setTimeout(() => {
          rampTimer = null;
          if (session === s && s.inIntro && !s.skipInterlude) s.rampP = startRamp(s, first);
        }, (dur - INTRO_LEAD) * 1000);
      };
      await sayIt(ann, { onVoiceStart });
    }
    // Sans fondu enchaîné (voix de l'ordinateur) : le fond sonore s'efface pendant que la musique monte.
    if (settings.radioBed && !s.ramping) callSafe('bedStop', 2.5);
  } finally {
    if (rampTimer) clearTimeout(rampTimer);
    clearInterval(guard);
    dlog('intro', 'fin après ' + (Date.now() - tI) + ' ms', { fondu_enchaine: s.ramping === first, coupe: !!s.skipInterlude });
    s.inIntro = false;
    s.introWaiting = false;
    s.inInterlude = false;
    s.abortInterlude = null;
    s.announcing = false;
    s.note = '';
  }
}

async function runInterlude(s, prev, next) {
  s.note = 'Interlude radio…';
  render();
  // Musique coupée et en pause. YouTube Music peut relancer tout seul son propre
  // titre suivant en fin de morceau : on le garde en pause tant que l'interlude dure.
  await callSafe('fadeTo', 0, 0.4);
  await callSafe('pause');
  let reguards = 0;
  const tI = Date.now();
  dlog('interlude', 'début', { avant: next ? next.title : '', etat: snapshot() });
  s.inInterlude = true;
  s.skipInterlude = false;
  const abortP = new Promise((res) => { s.abortInterlude = () => res(null); });
  const guard = setInterval(() => {
    if (session !== s || ps.ad || ps.paused || s.ramping) return;
    reguards++;
    callSafe('fadeTo', 0, 0.2);
    callSafe('pause');
  }, 700);
  try {
    const annP = getAnnouncement(s, 'interlude', prev, next);
    // Une rubrique a son propre petit jingle : il remplace celui de l'interlude.
    const early = await Promise.race([annP, sleep(250).then(() => null)]);
    let jinglePlayed = false;
    if (settings.jingles && !(early && early.sting)) { await jingle(s, s.transitions % 3); jinglePlayed = true; }
    // « Suivant » pendant le jingle : le fond sonore ne démarre pas (il tournait ensuite sur les titres suivants).
    if (settings.radioBed && !s.skipInterlude) callSafe('bedStart', 0.45, kitOpts());
    // Pas plus de 20 s de blanc si l'annonce n'est pas prête.
    const tA = Date.now();
    const ann = await Promise.race([annP, sleep(20000).then(() => null), abortP]);
    dlog('interlude', 'annonce ' + (ann ? 'prête' : 'absente') + ' après ' + (Date.now() - tA) + ' ms d\'attente', ann ? { voix: ann.audio ? 'oui' : 'ordinateur' } : undefined);
    if (s.skipInterlude) { /* coupé par l'auditeur */ }
    else if (!ann) radioLog(s, "Interlude écourté : l'annonce n'était pas prête au bout de 20 s, la musique reprend.");
    else if (session === s) {
      let rampTimer = null;
      const onVoiceStart = (dur) => {
        if (!next || !(dur > RAMP_LEAD + 3)) return;
        rampTimer = setTimeout(() => {
          rampTimer = null;
          if (session === s && s.inInterlude && !s.skipInterlude) s.rampP = startRamp(s, next);
        }, (dur - RAMP_LEAD) * 1000);
      };
      await sayIt(ann, { noSting: jinglePlayed, onVoiceStart });
      if (rampTimer) clearTimeout(rampTimer);
    }
    // Sans fondu enchaîné (voix de l'ordinateur) : le fond sonore s'efface pendant que la musique monte.
    if (settings.radioBed && !s.skipInterlude && !s.ramping) {
      callSafe('bedStop', 2.5);
      await sleep(300);
    }
  } finally {
    clearInterval(guard);
    // Interlude coupé ou émission arrêtée : plus de fond sonore, quoi qu'il se soit passé au-dessus.
    if (settings.radioBed && (s.skipInterlude || session !== s || s.status !== 'playing')) callSafe('bedStop', 0.3);
    dlog('interlude', 'fin après ' + (Date.now() - tI) + ' ms', { remis_en_pause: reguards, coupe: !!s.skipInterlude });
    s.inInterlude = false;
    s.abortInterlude = null;
    if (reguards) radioLog(s, 'YouTube Music a voulu relancer un titre pendant l\'interlude : remis en pause.');
    s.note = '';
  }
}

let testingVoice = false;
async function testGeminiVoice(which) {
  if (testingVoice) return;
  testingVoice = true;
  const gv = geminiVoices();
  const host = (settings.hostName || 'Alex').trim() || 'Alex';
  const cohost = (settings.cohostName || 'Sam').trim() || 'Sam';
  const role = gv.gB === 'femme' ? 'ta coanimatrice' : 'ton coanimateur';
  const en = fbEnglish();
  let turns;
  let label;
  if (en && which === 'B') {
    turns = [{ speaker: 'A', text: 'And I\'m ' + cohost + ', your co-host on Mood DJ! <chuckle> See you during the interludes.', style: gv.styleB }];
    label = 'Voix de ' + cohost + ' : ' + gv.b;
  } else if (en && which === 'duo') {
    turns = [
      { speaker: 'A', text: 'You\'re listening to Mood DJ, with ' + host + '…', style: gv.styleA },
      { speaker: 'B', text: '… and ' + cohost + '! <laugh> Shall we play the next track?', style: gv.styleB },
      { speaker: 'A', text: 'Here we go!', style: gv.styleA }
    ];
    label = 'Duo : ' + gv.a + ' et ' + gv.b;
  } else if (en) {
    turns = [{ speaker: 'A', text: 'Hi, ' + host + ' here on Mood DJ. <short pause> This is my voice for the announcements.', style: gv.styleA }];
    label = 'Voix de ' + host + ' : ' + gv.a;
  } else if (which === 'B') {
    turns = [{ speaker: 'A', text: 'Et moi, c\'est ' + cohost + ', ' + role + ' sur Mood DJ ! <chuckle> On se retrouve pendant les interludes.', style: gv.styleB }];
    label = 'Voix de ' + cohost + ' : ' + gv.b;
  } else if (which === 'duo') {
    turns = [
      { speaker: 'A', text: 'Tu écoutes Mood DJ, avec ' + host + '…', style: gv.styleA },
      { speaker: 'B', text: '… et ' + cohost + ' ! <laugh> On lance le titre suivant ?', style: gv.styleB },
      { speaker: 'A', text: 'Allez, c\'est parti !', style: gv.styleA }
    ];
    label = 'Duo : ' + gv.a + ' et ' + gv.b;
  } else {
    turns = [{ speaker: 'A', text: 'Salut, ici ' + host + ' sur Mood DJ. <short pause> C\'est ma voix pour les annonces.', style: gv.styleA }];
    label = 'Voix de ' + host + ' : ' + gv.a;
  }
  toast('Test en cours… (' + label + ')', null, 8000);
  await callSafe('initAudio');
  try {
    const r = await withTimeout(claude('gemini-tts', {
      turns, voiceA: which === 'B' ? gv.b : gv.a, voiceB: gv.b, style: turns[0].style
    }), which === 'duo' ? 40000 : 25000);
    const p = await call('playVoice', b64ToBuffer(r.b64)).catch(() => null);
    if (p && p.ok) toast(label + '.');
    else toast('Voix Gemini reçue mais pas lue : ' + (VOICE_REASONS[p && p.reason] || 'lecture impossible') + '.', null, 12000);
  } catch (e) {
    toast('Voix Gemini : ' + e.message, null, 15000);
  } finally {
    testingVoice = false;
  }
}

// Exemples à écouter depuis les Réglages : annonce, interlude, anecdote, spécialiste invité.
// L'anecdote et l'invité portent sur le titre en cours s'il y en a un, sinon sur un classique.
let demoBusy = false;
async function demoAnnouncement(what) {
  if (demoBusy) { toast('Un exemple est déjà en préparation.', null, 2500); return; }
  if (session && session.announcing) { toast("L'animateur parle déjà : réessaie juste après.", null, 3000); return; }
  const live = settings.claudeAnnounce && hasKey;
  if ((what === 'anecdote' || what === 'guest' || what === 'perso') && !live) { toast("Il faut la clé Claude (et « Claude écrit les annonces ») pour cet exemple.", null, 5000); return; }
  if ((what === 'guest' || what === 'perso') && !useGemini()) { toast("L'invité a besoin des voix Gemini : choisis Gemini dans Réglages › Voix.", null, 5000); return; }
  if (what === 'chant') {
    if (!live) { toast("Pour le chant, il faut une IA pour les textes (clé Claude ou Gemini, et « L'IA écrit les annonces »).", null, 6000); return; }
    if (!useGemini()) { toast('Le chant a besoin des voix Gemini : choisis Gemini dans Réglages › Voix.', null, 5000); return; }
    if (emotionSetting() === 'sobre') { toast('Le chant marche avec les émotions Auto, Intime, Expressif ou Déchaîné.', null, 5000); return; }
  }
  demoBusy = true;
  try {
    toast(what === 'anecdote' ? "Recherche d'une anecdote…" : what === 'guest' ? "L'invité arrive en studio…" : what === 'perso' ? 'Camille arrive au micro…' : what === 'chant' ? 'Les animateurs chauffent leur voix…' : what === 'bavardage' ? 'Les animateurs cherchent de quoi parler…' : "Préparation de l'exemple…", null, 4000);
    await callSafe('initAudio');
    await sleep(500);
    const fake = { id: 'demo', sel: session ? session.sel : sel, lastLines: session ? session.lastLines : [], played: [], queue: [], demo: what };
    const mk = (title, artist, energy, year, style) => ({ title, artist, energy, year, style, sub: '', key: C.keyOf(artist, title) });
    const np = nowPlaying();
    const cur = np.videoId && np.artist ? (session && session.current && session.current.videoId === np.videoId ? session.current : trackFromItem({ v: np.videoId, t: np.title, a: np.artist })) : null;
    const prev = mk('Riders on the Storm', 'The Doors', 2, 1971, 'rock');
    const next = (what === 'anecdote' || what === 'guest') && cur ? cur : mk('Born to Run', 'Bruce Springsteen', 5, 1975, 'rock');
    const kind = what === 'talkover' ? 'talkover' : 'interlude';
    if (what === 'perso') fake.guest = castGuest(CAST_JEFF_LAETI[0], 'arrivee');
    if (what === 'guest') {
      const role = guestRoleFor(fake, next);
      const g = guestProfile(role);
      fake.guest = { phase: 'arrivee', key: role[0], name: g.name, gender: g.gender, style: g.style, role: g.role, quirk: g.quirk,
        visits: g.visits || 0, voice: guestVoice(g), passages: 1, done: 0, stay: guestStay(role[0]) };
    }
    const ann = await prepareAnnouncement(fake, kind, prev, next);
    if (kind === 'interlude') {
      if (settings.jingles) await jingle(fake, 1);
      if (settings.radioBed) callSafe('bedStart', 0.45, kitOpts());
    }
    await sayIt(ann);
    if (kind === 'interlude' && settings.radioBed) callSafe('bedStop', 1.5);
  } catch (e) {
    toast('Exemple impossible : ' + e.message, null, 6000);
  } finally {
    demoBusy = false;
  }
}

function voices() {
  try { return window.speechSynthesis.getVoices() || []; } catch (e) { return []; }
}

const MALE_NAMES = /\b(thomas|paul|henri|nicolas|daniel|jacques|claude|mathieu|antoine|guillaume|jean|pierre|r[ée]mi|alain|fabrice|gr[ée]goire|yves|denis|louis|vincent|olivier|f[ée]lix|g[ée]rard|maxime|alexandre|jerome|j[ée]r[ôo]me)\b/i;
const FEMALE_NAMES = /\b(hortense|julie|am[ée]lie|audrey|aur[ée]lie|marie|virginie|c[ée]line|denise|[ée]lo[iï]se|sylvie|caroline|chantal|ariane|brigitte|coralie|jacqueline|jos[ée]phine|l[ée]a|vivienne|yvette|charline|sophie|clara|manon|juliette|alice|camille|louise|google fran[cç]ais)\b/i;

function voiceGender(v) {
  const n = (v && v.name) || '';
  if (/\bfemale\b|femme/i.test(n)) return 'femme';
  if (/\bmale\b|homme/i.test(n)) return 'homme';
  if (FEMALE_NAMES.test(n)) return 'femme';
  if (MALE_NAMES.test(n)) return 'homme';
  return '';
}

// Voix de l'ordinateur dans la langue de la radio (le nom est resté « frenchVoices »).
function frenchVoices() {
  const lang = radioLang();
  const main = (RADIO_LANG_LIST.find((x) => x[0] === lang) || RADIO_LANG_LIST[0])[2];
  const vs = voices().filter((x) => String(x.lang).toLowerCase().startsWith(lang));
  const m = new RegExp(main.replace('-', '[-_]'), 'i');
  return vs.filter((x) => m.test(x.lang)).concat(vs.filter((x) => !m.test(x.lang)));
}

function pickVoice() {
  const vs = voices();
  if (settings.voiceURI) {
    const v = vs.find((x) => x.voiceURI === settings.voiceURI);
    if (v) return v;
  }
  const fr = frenchVoices();
  if (settings.voiceGender && settings.voiceGender !== 'auto') {
    const g = fr.find((x) => voiceGender(x) === settings.voiceGender);
    if (g) return g;
  }
  return fr[0] || null;
}

function speak(text) {
  return new Promise((resolve) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = (RADIO_LANG_LIST.find((x) => x[0] === radioLang()) || RADIO_LANG_LIST[0])[2];
      const v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; }
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(); } };
      u.onend = fin;
      u.onerror = fin;
      setTimeout(fin, 25000);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) {
      resolve();
    }
  });
}

async function onTrackStarted(s, track) {
  if (s.timerFading) return;
  const fade = effectiveFade();
  // Après un fondu enchaîné réel, le titre monte plus lentement pendant que l'autre descend.
  const fadeIn = track.xfadeIn || (fade > 0 ? Math.min(2.5, fade * 0.5) : 0);
  track.xfadeIn = 0;
  track.fadeInAt = Date.now();
  const kind = track.announceKind;
  dlog('piste', 'démarrée', { intervention: kind || 'aucune', fondu: fade, montee: fadeIn, etat: snapshot() });
  // Un choix d'animateur qui passe : on pourra en reparler à la prochaine intervention.
  if (track.pick && !track.pick.discussed) s.pickPending = track.pick;
  logPickOutcome((s.played || [])[s.played.length - 1]);
  maybePlanPick(s);
  if (kind === 'fadevoice') {
    const fv = s.fadeVoice;
    s.announcing = true;
    try {
      if (fv && !fv.finished) {
        callSafe('fadeTo', 0.3, 0.6);
        await fv.done;
      }
    } finally {
      s.announcing = false;
      if (s.fadeVoice === fv) s.fadeVoice = null;
    }
    track.fadeInAt = Date.now();
    if (session !== s || s.current !== track || track.fadingOut || s.timerFading) return;
    callSafe('fadeTo', 1, fv && !fv.finished ? 1.5 : fadeIn || 1.2);
    return;
  }
  if (kind === 'intro' || kind === 'talkover') {
    const prev = kind === 'intro' ? null : (s.played[s.played.length - 1] || null);
    s.announcing = true;
    try {
      const annP = getAnnouncement(s, kind, prev, track);
      // 2.36 : la voix n'est plus fabriquée d'avance (« Suivant » en plein titre : le texte est prêt, pas la voix).
      // Si l'annonce n'est pas prête tout de suite, le titre joue à plein volume et ne baisse qu'au moment où
      // l'animateur parle ; avant, la musique attendait baissée, jusqu'à 15 s.
      const NOT_YET = {};
      const quick = kind === 'talkover' ? await Promise.race([annP, sleep(350).then(() => NOT_YET)]) : null;
      const waiting = quick === NOT_YET;
      if (session !== s || s.current !== track) return;
      if (waiting) callSafe('fadeTo', 1, fadeIn || 1.2);
      else callSafe('fadeTo', 0.28, 0.8);
      if (kind === 'intro' && settings.jingles) await jingle(s, 0);
      // Sur un titre déjà lancé, l'annonce n'est pas attendue plus de 15 s : sinon, pas d'annonce.
      const ann = kind !== 'talkover' ? await annP : waiting ? await Promise.race([annP, sleep(15000).then(() => null)]) : quick;
      if (session !== s || s.current !== track) return;
      if (!ann) { dlog('annonce', 'annonce pas prête après 15 s : titre lancé sans elle'); radioLog(s, 'Annonce trop longue à préparer : titre lancé sans elle.'); }
      else {
        if (waiting) {
          if (track.fadingOut || s.timerFading) return;
          dlog('annonce', 'voix prête après le démarrage du titre : la musique baisse maintenant');
          callSafe('fadeTo', 0.28, 0.8);
          await sleep(600);
          if (session !== s || s.current !== track) return;
        }
        await sayIt(ann);
      }
    } finally {
      s.announcing = false;
    }
    track.fadeInAt = Date.now();
    if (session !== s || s.current !== track || track.fadingOut || s.timerFading) return;
    callSafe('fadeTo', 1, 1.5);
  } else {
    // Après un interlude : montée plus douce, le temps que le fond sonore s'efface.
    callSafe('fadeTo', 1, track.afterInterlude ? Math.max(fadeIn, 2.5) : fadeIn);
  }
}

async function advance(reason) {
  const s = session;
  if (!s || s.advancing || s.status !== 'playing') return;
  s.advancing = true;
  try {
    const cur = s.current;
    if (cur) {
      cur.countedSec = reason === 'ended' ? (cur.duration || cur.lastTime || 0) : (cur.lastTime || 0);
      s.playedSec += cur.countedSec;
      s.played.push(cur);
      if (!cur.guest) remember(cur);
      s.current = null;
      recordShow(s);
    }
    if (s.timer.kind === 'end' && cur) { await endSession('timer', 0); return; }
    if (s.finishing) { await endSession('fin', 0); return; }
    let next = s.queue.shift();
    if (!next) {
      if (s.mode === 'fixe' && !s.filling && !needMore(s)) { await endSession('fin', 0); return; }
      s.note = 'Recherche du titre suivant…';
      render();
      ensureQueue();
      await waitQueue(s, 1, 30000);
      if (session !== s) return;
      next = s.queue.shift();
    }
    if (!next) { await endSession('vide', 0); return; }
    s.note = '';
    s.transitions++;
    let kind = announceKind(s, s.transitions, reason, false, next);
    const ch = changeFor(s, next);
    if (ch && kind) { ch.done = true; dlog('session', "nouvelle ambiance annoncée", { de: ch.from, vers: ch.to, titre: next.title }); }
    dlog('piste', 'enchaînement (' + reason + ')', { rang: s.transitions, prevu: kind || 'rien', report: s.pendingKind || '', suivant: next ? next.title : '', restait: s.lastRemaining, etat: snapshot() });
    if (s.fadeVoice) {
      if (s.fadeVoice.key === next.key && reason === 'ended') kind = 'fadevoice';
      else { hush(); s.fadeVoice = null; s.announcing = false; }
    }
    if (!kind) radioLog(s, quietReason(s.transitions, reason, s.pendingKind));
    if (kind === 'interlude') {
      await runInterlude(s, cur, next);
      if (session !== s || s.status !== 'playing') return;
      if (s.ramping === next) {
        // Le titre a déjà démarré sous la voix : il monte maintenant à plein volume.
        await s.rampP;
        s.ramping = null;
        s.rampP = null;
        if (session === s && s.current === next && !next.fadingOut) { next.fadeInAt = Date.now(); callSafe('fadeTo', 1, 2); }
        return;
      }
      s.ramping = null;
      next.announceKind = null;
      next.afterInterlude = true;
    } else {
      next.announceKind = kind;
    }
    await playTrack(s, next);
  } finally {
    s.advancing = false;
  }
}

// Fait taire l'animateur tout de suite (voix, fond sonore, voix de l'ordinateur).
function hush() {
  clearSfx();
  callSafe('stopVoice');
  callSafe('bedStop', 0.3);
  try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
}

async function skip() {
  const s = session;
  if (s && s.status === 'playing' && s.inInterlude) {
    // Suivant pendant un interlude : l'animateur se tait et le titre annoncé démarre.
    if (!s.skipInterlude) {
      s.skipInterlude = true;
      hush();
      if (s.abortInterlude) s.abortInterlude();
      radioLog(s, (s.inIntro ? 'Intro coupée' : 'Interlude coupé') + ' : le titre annoncé démarre.');
    }
    return;
  }
  if (!s || s.status !== 'playing' || s.advancing) return;
  if (s.announcing) { hush(); radioLog(s, 'Annonce coupée : passage au titre suivant.'); }
  const cur = s.current;
  if (cur) {
    cur.skipped = true;
    const ak = C.artistKey(cur.artist);
    learn.skips[ak] = (learn.skips[ak] || 0) + 1;
    learn.skipNames = learn.skipNames || {};
    learn.skipNames[ak] = cur.artist;
    saveLearn();
  }
  s.lastUserNextAt = Date.now();
  callSafe('xfadeDrop', 'titre passé');
  await callSafe('fadeTo', 0, 0.5);
  await sleep(450);
  advance('skip');
}

function onUserNext() {
  const s = session;
  if (!s || s.status !== 'playing') return;
  s.lastUserNextAt = Date.now();
  skip();
}

// Bouton « précédent » : au-delà de 4 s on revient au début du titre, sinon au titre d'avant.
function onUserPrev() {
  const s = session;
  if (!s || s.status !== 'playing') return;
  s.lastUserNextAt = Date.now();
  if ((ps.time || 0) > 4 || !s.played.length) {
    callSafe('seek', 0);
    return;
  }
  previous();
}

async function previous() {
  const s = session;
  if (!s || s.status !== 'playing' || s.advancing) return;
  const prev = s.played.pop();
  if (!prev) return;
  s.advancing = true;
  try {
    s.lastUserNextAt = Date.now();
    s.playedSec = Math.max(0, s.playedSec - (prev.countedSec || 0));
    if (s.current) s.queue.unshift(s.current);
    s.current = null;
    await callSafe('fadeTo', 0, 0.3);
    await playTrack(s, Object.assign({}, prev, { announceKind: null }));
  } finally {
    s.advancing = false;
  }
}

async function endSession(reason, fadeSecs) {
  const s = session;
  if (!s || s.status === 'ended') return;
  dlog('session', 'fin (' + reason + ')', snapshot());
  s.status = 'ending';
  // L'animateur se tait tout de suite (voix, fond sonore), et un interlude en cours est abandonné : avant, « Arrêter »
  // laissait la voix finir, et le titre suivant pouvait encore démarrer après l'arrêt.
  hush();
  s.skipInterlude = true;
  if (s.abortInterlude) s.abortInterlude();
  if (s.fadeVoice) { s.fadeVoice = null; s.announcing = false; }
  callSafe('xfadeDrop', 'fin de session');
  if (fadeSecs > 0) {
    await callSafe('fadeTo', 0, fadeSecs);
    await sleep(fadeSecs * 1000 + 150);
  }
  if (reason !== 'stop') await callSafe('pause');
  // Fin normale d'une sélection (durée atteinte) : les animateurs font le bilan. Pas après la minuterie : la
  // musique venait de s'éteindre en fondu, et les animateurs reprenaient la parole à plein volume.
  if (reason === 'fin') await playRecap(s).catch((e) => dlog('annonce', 'bilan raté : ' + e.message));
  // Une nouvelle émission a démarré pendant le bilan : on clôt l'ancienne sans toucher au lecteur.
  if (session !== s) {
    if (s.current) { s.playedSec += s.current.lastTime || 0; s.played.push(s.current); remember(s.current); s.current = null; }
    s.status = 'ended';
    s.endedReason = reason;
    recordShow(s);
    dlog('session', 'bilan interrompu par une nouvelle émission');
    return;
  }
  try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  await callSafe('fadeTo', 1, reason === 'stop' ? 0.8 : 0);
  await callSafe('setRate', 1);
  await callSafe('setInterceptNext', false);
  if (s.current) { s.playedSec += s.current.lastTime || 0; s.played.push(s.current); remember(s.current); s.current = null; }
  s.status = 'ended';
  s.endedReason = reason;
  recordShow(s);
  const msg = {
    fin: 'Sélection terminée.',
    timer: 'Minuterie terminée : la musique est en pause.',
    stop: 'Mood DJ est arrêté, la musique continue normalement.',
    vide: "Plus de titres disponibles pour cette ambiance."
  }[reason];
  s.note = msg || '';
  render();
  if (msg) toast(msg);
}

// Titre choisi à la main dans YouTube Music pendant une sélection : il passe dans le mix,
// puis la sélection reprend (pas de mise en pause).
function adoptGuest(s, cur) {
  cur.countedSec = cur.lastTime || 0;
  s.playedSec += cur.countedSec;
  s.played.push(cur);
  if (!cur.guest) remember(cur);
  s.transitions++;
  announceKind(s, s.transitions, 'guest', false);
  const g = {
    key: 'yt:' + ps.videoId, videoId: ps.videoId, title: ps.title || 'Titre choisi dans YouTube Music', artist: ps.author || '',
    duration: ps.duration || 0, type: '', style: cur.style || '', sub: '', energy: cur.energy || 3, year: 0, flags: '', guest: true,
    fadedIn: true, fadingOut: false, fadeInAt: Date.now(), lastTime: ps.time || 0, lastTickAt: Date.now(), silenceSkipped: 0
  };
  s.current = g;
  s.expecting = null;
  s.prefetch = null;
  s.lastRemaining = null;
  callSafe('fadeTo', 1, 0.3);
  const msg = 'Tu as choisi « ' + g.title + ' » dans YouTube Music : il passe dans le mix, la sélection reprend juste après.';
  radioLog(s, msg);
  toast(msg, null, 7000);
  render();
}

async function suspend(message) {
  const s = session;
  if (!s || s.status !== 'playing') return;
  s.status = 'suspended';
  hush();
  s.skipInterlude = true;
  if (s.abortInterlude) s.abortInterlude();
  if (s.fadeVoice) { s.fadeVoice = null; s.announcing = false; }
  callSafe('xfadeDrop', 'Mood DJ en pause');
  if (s.current) { s.queue.unshift(s.current); s.current = null; }
  await callSafe('fadeTo', 1, 0.5);
  await callSafe('setRate', 1);
  await callSafe('setInterceptNext', false);
  s.note = message;
  radioLog(s, message + ' Le cycle et les annonces reprendront avec « Reprendre ».');
  render();
  toast(message, { label: 'Reprendre', fn: resume }, 12000);
}

async function resume() {
  const s = session;
  if (!s || s.status !== 'suspended') return;
  await callSafe('initAudio');
  s.status = 'playing';
  s.note = '';
  await callSafe('setInterceptNext', true);
  let next = s.queue.shift();
  if (!next) { ensureQueue(); await waitQueue(s, 1, 30000); next = s.queue.shift(); }
  if (!next) { await endSession('vide', 0); return; }
  // Le cycle reprend où il en était : on recompte les titres pour les annonces et interludes.
  s.transitions++;
  const k = announceKind(s, s.transitions, 'resume', false, next);
  next.announceKind = k === 'interlude' ? 'talkover' : k;
  radioLog(s, 'Reprise : le cycle continue (énergie, annonces et interludes).');
  await playTrack(s, next);
  render();
}

function setTimer(kind) {
  const s = session;
  if (!s) return;
  const min = Number(kind);
  s.timer = { kind, endAt: min ? Date.now() + min * 60000 : 0 };
  if (s.timerFading) { s.timerFading = false; callSafe('fadeTo', 1, 1); }
  if (s.mode === 'continu' && s.sel.moment === 'coucher') {
    setSpan(s, min ? contentTime(s) / 60 + min : C.cycleMinutes(s.sel));
  }
  render();
}
