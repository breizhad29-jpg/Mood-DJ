// Mood DJ — panneau et moteur DJ (monde isolé de l’extension) : état, réglages, journal technique et sauvegarde.
// Les fichiers mdj-*.js puis content.js sont chargés dans l’ordre du manifest et partagent la même portée :
// une fonction d’un fichier peut appeler celle d’un autre, mais le code exécuté au chargement ne doit
// utiliser que ce qui est défini dans les fichiers précédents (vérifié par tests/split.test.js).
// Dépend de core.js (MDJ_CORE), catalog.js (MDJ_CATALOG_RAW), i18n-en.js et ui-style.js (MDJ_CSS).
'use strict';

window.__moodDjContent = true;

const C = MDJ_CORE;
// Où restent les données (repris dans quelques textes de l'interface).
const WHERE = 'dans ce navigateur';
const CATALOG = C.parseCatalog(typeof MDJ_CATALOG_RAW === 'string' ? MDJ_CATALOG_RAW : '');
const LOOKAHEAD = 5;
const VERSION = '2.43.1';
// Catalogue intégré complet : CATALOG n'en garde que les styles présents (retirés ou non), plus les
// titres des styles ajoutés par l'IA (applyStyleSet).
const BASE_CATALOG = CATALOG.slice();
const CAT_BY_KEY = new Map(CATALOG.map((t) => [t.key, t]));
let customStyles = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = (o) => JSON.parse(JSON.stringify(o));
function debounce(fn, ms) {
  let t = null;
  return function () {
    const args = arguments;
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), ms);
  };
}
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('délai dépassé')), ms))]);
}

// ============================================================ état
const DEFAULT_SETTINGS = {
  fade: 6, eq: { bass: 0, mid: 0, treble: 0 }, boost: false, autoSound: true, tempo: 100, skipSilence: true,
  radio: true, radioFreq: 'third', announceAt: 'fondu', voiceURI: '', voiceGender: 'auto', claudeAnnounce: true, model: 'claude-sonnet-5-5', panelOpen: false, panelFull: false, hideYtBar: true, blockAutoplay: true, curveBrush: 'moyen', concerts: false, concertCountry: 'FR', guestFreq: 'rare', sfx: true, sing: false, schedule: [], showRecap: true, crossfade: true, soundKit: 'auto', emotion: 'auto', radioLang: 'fr', uiLang: 'auto', textEngine: 'claude', geminiTextModel: 'gemini-3.8-flash', rhythm: 'naturel',
  hostName: 'Alex', hostStyle: 'chaleureux', listenerName: '', weatherCity: '', interludes: 'parfois', jingles: true, radioBed: true,
  voiceEngine: 'systeme',
  geminiVoice: '', geminiVoiceB: '', geminiModel: 'gemini-3.8-flash-tts', duo: true, priority: true, debugLog: true, similarDepth: 'proche', useLearned: true, cohostName: 'Sam', cohostStyle: 'decale', cohostGender: 'auto',
  anecdotes: 'souvent', programme: true, aiPower: 'normal', aiCap: 'auto', hostPersona: '', cohostPersona: '', stationLore: '', loreLevel: 'discret', duoRelation: '', hostVoiceNote: '', cohostVoiceNote: '', hostCities: null, hostLore: '', cohostLore: '', hostPicks: 'rare', chat: 'parfois', chatMix: 50, games: 'parfois', castGuests: true, presetRev: 0,
  // voiceChosen : l'auditeur a choisi lui-même son moteur de voix ; voiceOffered : la bascule lui a déjà été proposée.
  voiceChosen: false, voiceOffered: false
};
const DEFAULT_SEL = {
  style: 'rock', sub: 'all', moment: 'route', energy: 3, mood: null, era: 'all', prompt: '',
  mode: 'continu', duration: '90', until: '18:30', source: 'all', cycle: 'auto', likesMix: 'off', curve: null, seed: null
};

let settings = clone(DEFAULT_SETTINGS);
let sel = clone(DEFAULT_SEL);
// Mes ambiances : des réglages d'Ambiance enregistrés sous un nom, à recharger d'un clic.
let savedAmb = [];
const AMB_FIELDS = ['style', 'sub', 'moment', 'energy', 'mood', 'era', 'prompt', 'mode', 'duration', 'until', 'source', 'cycle', 'likesMix', 'curve', 'seed'];
const ambSnap = (x) => { const o = {}; for (const k of AMB_FIELDS) o[k] = x[k] === undefined ? DEFAULT_SEL[k] : x[k]; return o; };
const sameAmb = (a, b) => AMB_FIELDS.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));
let learn = { skips: {}, skipNames: {}, recent: [] };
let cache = {};
// hasKey : une IA peut écrire les textes (clé Claude, ou clé Gemini). hasClaude : clé Claude seule.
let hasKey = false;
let hasClaude = false;
const syncTextKey = () => { hasKey = hasClaude || hasGemini; };
let hasGemini = false;
// Deux clés Gemini : la gratuite (geminiKey) et la payante en relais (geminiKey2).
let hasGemini1 = false;
let hasGemini2 = false;
// Sources à clé facultatives : Last.fm (tags, audience, artistes proches) et Discogs (éditions, crédits).
let hasLastfm = false;
let hasDiscogs = false;
// Concerts : Setlist.fm (ce qui est joué sur scène). Les prochaines dates passent par la recherche Google de Gemini
// (réglage « concerts », 2.43) ; hadTicketmaster : une clé Ticketmaster était enregistrée, elle vient d'être effacée.
let hasSetlist = false;
let hadTicketmaster = false;
let likes = { at: 0, items: [] };
let likedKeys = new Set();
let likedIds = new Set();
let meta = {};
let likesLoading = false;
let classifying = 0;
let session = null;
let ps = {};
let bridgeReady = false;
let tab = 'ambiance';
let starting = false;

// Pendant l'import d'une sauvegarde, plus aucune écriture (sauf le journal) jusqu'au rechargement :
// un réglage enregistré à ce moment écraserait ce qui vient d'être importé.
let importing = false;
function store(obj) {
  if (importing && !(obj && Object.keys(obj).length === 1 && 'debugLog' in obj)) return;
  try { chrome.storage.local.set(obj); } catch (e) { /* contexte de l'extension invalide */ }
}

// ===================================================== journal technique
// Garde les derniers évènements dans ce navigateur (jamais les clés API), pour comprendre
// ce qui s'est passé : à télécharger ou copier depuis Réglages › Journal technique.
const DEBUG_MAX = 4000;
let dbgBuf = [];
let dbgDirty = false;
function short(v) {
  try {
    return JSON.stringify(v, (k, x) => {
      if (x instanceof ArrayBuffer) return '<' + x.byteLength + ' octets>';
      if (typeof x === 'string' && x.length > 220) return x.slice(0, 220) + '…';
      if (typeof x === 'number' && !Number.isInteger(x)) return Math.round(x * 100) / 100;
      return x;
    });
  } catch (e) { return String(v); }
}
function dlog(cat, msg, data) {
  try {
    if (settings && settings.debugLog === false) return;
    const d = new Date();
    const line = d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0') +
      ' [' + cat + '] ' + msg + (data === undefined ? '' : ' ' + short(data));
    dbgBuf.push(line);
    if (dbgBuf.length > DEBUG_MAX + 300) dbgBuf = dbgBuf.slice(-DEBUG_MAX);
    dbgDirty = true;
  } catch (e) { /* ignore */ }
}
// Le journal (jusqu'à 4 000 lignes, près d'1 Mo) est réécrit en entier à chaque enregistrement : une fois
// toutes les 30 s suffit, plus à la fermeture de la page. L'export lit le journal en mémoire, toujours à jour.
setInterval(() => { if (dbgDirty) { dbgDirty = false; store({ debugLog: dbgBuf.slice(-DEBUG_MAX) }); } }, 30000);
window.addEventListener('pagehide', () => { if (dbgDirty) store({ debugLog: dbgBuf.slice(-DEBUG_MAX) }); });
document.addEventListener('visibilitychange', () => { if (document.hidden && dbgDirty) { dbgDirty = false; store({ debugLog: dbgBuf.slice(-DEBUG_MAX) }); } });
window.addEventListener('error', (e) => dlog('erreur', (e.message || 'erreur') + (e.filename ? ' @' + String(e.filename).split('/').pop() + ':' + e.lineno : '')));
window.addEventListener('unhandledrejection', (e) => dlog('erreur', 'promesse rejetée : ' + ((e.reason && e.reason.message) || String(e.reason))));
function snapshot() {
  const s = session;
  return {
    vid: ps.videoId, t: ps.time, dur: ps.duration, pause: ps.paused, etat: ps.state, pub: ps.ad, held: !!ps.held,
    audio: ps.audio, gain: ps.gain, vol: ps.volume, voixVol: ps.voiceVol, muet: ps.muted,
    session: s ? s.status : 'aucune', titre: s && s.current ? s.current.title : '', file: s ? s.queue.length : 0,
    annonce: s ? !!s.announcing : false, interlude: s ? !!s.inInterlude : false, enchainement: s ? !!s.advancing : false
  };
}
function debugText() {
  const head = [
    'Journal technique Mood DJ ' + VERSION + ' — exporté le ' + new Date().toLocaleString('fr-FR'),
    'Navigateur : ' + navigator.userAgent,
    'Clés : Claude ' + (hasClaude ? 'oui' : 'non') + ' · Gemini ' + (hasGemini ? 'oui' : 'non'),
    'Réglages : ' + short(settings),
    'État actuel : ' + short(snapshot()),
    '----'
  ];
  return head.concat(dbgBuf.slice(-DEBUG_MAX)).join('\n');
}
function downloadDebug() {
  try {
    const blob = new Blob([debugText()], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    const d = new Date();
    const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' +
      String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
    a.href = URL.createObjectURL(blob);
    a.download = 'mood-dj-journal-' + stamp + '.txt';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast('Journal téléchargé : ' + a.download + '. Tu peux le joindre dans la conversation avec Claude.');
  } catch (e) { toast('Téléchargement impossible : ' + e.message); }
}
async function copyDebug() {
  try { await navigator.clipboard.writeText(debugText()); toast('Journal copié : colle-le dans la conversation avec Claude.'); }
  catch (e) { toast('Copie impossible ici : utilise « Télécharger ».'); }
}
function markProblem() {
  dlog('SIGNAL', '========== Souci signalé par l\'utilisateur ==========', snapshot());
  store({ debugLog: dbgBuf.slice(-DEBUG_MAX) });
  toast('Moment noté dans le journal technique. Pense à le télécharger dans Réglages.');
}

// ======================================================== sauvegarde
// Exporter : un fichier avec les réglages, les J'aime classés, les découvertes et les mémoires des
// animateurs (jamais les clés API ni le journal). Importer : le même fichier, par exemple sur un autre
// ordinateur.
const BACKUP_KEYS = ['settings', 'sel', 'savedAmbiances', 'showHistory', 'learn', 'resolveCache', 'likes', 'trackMeta', 'learnedCat', 'artistCache', 'wikiCache', 'toldCache', 'dataVersion', 'customStyles', 'hostMemory', 'hostProfiles', 'loreProfiles', 'pickLog', 'airLog'];
async function exportData() {
  try {
    const all = await chrome.storage.local.get(BACKUP_KEYS);
    const out = { format: 'mood-dj-sauvegarde', version: VERSION, origine: 'extension', exporteLe: new Date().toISOString(), donnees: {} };
    for (const k of BACKUP_KEYS) if (all[k] !== undefined) out.donnees[k] = all[k];
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = 'mood-dj-sauvegarde-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    const n = (out.donnees.trackMeta ? Object.keys(out.donnees.trackMeta).length : 0);
    toast('Sauvegarde prête : ' + a.download + ' (' + n + ' titres classés, ' + ((out.donnees.learnedCat || []).length) + ' découvertes). Les clés API n\'y sont pas.', null, 8000);
    dlog('sauvegarde', 'export', { titres_classes: n, decouvertes: (out.donnees.learnedCat || []).length, octets: blob.size });
  } catch (e) { toast('Export impossible : ' + e.message); }
}
async function importData(file) {
  if (session && session.status !== 'ended') { toast("Arrête la sélection en cours avant d'importer une sauvegarde."); return; }
  try {
    const j = JSON.parse(await file.text());
    if (!j || j.format !== 'mood-dj-sauvegarde' || !j.donnees || typeof j.donnees !== 'object') throw new Error("ce fichier n'est pas une sauvegarde Mood DJ");
    const obj = {};
    for (const k of BACKUP_KEYS) if (j.donnees[k] !== undefined) obj[k] = j.donnees[k];
    // Réglages : un réglage connu garde son type (un fichier modifié ne peut pas y glisser n'importe quoi).
    if (obj.settings && typeof obj.settings === 'object') {
      for (const k of Object.keys(obj.settings)) {
        const def = DEFAULT_SETTINGS[k];
        if (def === undefined || def === null) continue;
        if (Array.isArray(def) ? !Array.isArray(obj.settings[k]) : typeof obj.settings[k] !== typeof def) delete obj.settings[k];
      }
    } else delete obj.settings;
    if (!Object.keys(obj).length) throw new Error('la sauvegarde est vide');
    importing = true;
    await chrome.storage.local.set(obj);
    dlog('sauvegarde', 'import', { depuis: j.origine || '?', version: j.version || '?', du: j.exporteLe || '?', elements: Object.keys(obj) });
    store({ debugLog: dbgBuf.slice(-DEBUG_MAX) });
    toast('Sauvegarde importée (' + (j.origine || 'Mood DJ') + ' ' + (j.version || '') + '). Rechargement…', null, 4000);
    setTimeout(() => location.reload(), 1500);
  } catch (e) { importing = false; toast('Import impossible : ' + e.message, null, 8000); }
}
function backupCard() {
  const file = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' }, onchange: (e) => { const f = e.target.files && e.target.files[0]; if (f) importData(f); e.target.value = ''; } });
  return h('div', { class: 'card' },
    h('h2', { class: 'label white' }, 'Sauvegarde'),
    h('div', { class: 'muted' }, "Un fichier avec tes réglages, tes J'aime classés, tes découvertes et la mémoire des animateurs, pour les garder ou les reprendre sur un autre ordinateur. Les clés API ne sont jamais dans le fichier."),
    h('div', { class: 'btns' },
      h('button', { class: 'btn small', type: 'button', onclick: () => exportData() }, 'Exporter'),
      h('button', { class: 'btn small', type: 'button', onclick: () => file.click() }, 'Importer'),
      file));
}

async function loadAll() {
  const d = await chrome.storage.local.get(['settings', 'sel', 'learn', 'resolveCache', 'apiKey', 'likes', 'trackMeta', 'elevenKey', 'geminiKey', 'geminiKey2', 'debugLog', 'learnedCat', 'artistCache', 'wikiCache', 'dataVersion', 'toldCache', 'savedAmbiances', 'lastfmKey', 'discogsToken', 'setlistfmKey', 'ticketmasterKey', 'showHistory', 'customStyles', 'hostMemory', 'hostProfiles', 'loreProfiles', 'pickLog', 'airLog', 'aiUsage']);
  showHistory = Array.isArray(d.showHistory) ? d.showHistory.filter((x) => x && x.id && Array.isArray(x.tracks)) : [];
  hasSetlist = !!d.setlistfmKey;
  // 2.43 : Ticketmaster est retiré. Sa clé ne sert plus à rien : elle est effacée de ce navigateur.
  hadTicketmaster = !!d.ticketmasterKey;
  if (hadTicketmaster) { try { chrome.storage.local.remove('ticketmasterKey'); } catch (e) { /* ignore */ } }
  hasLastfm = !!d.lastfmKey;
  hasDiscogs = !!d.discogsToken;
  savedAmb = Array.isArray(d.savedAmbiances) ? d.savedAmbiances.filter((a) => a && a.name && a.sel) : [];
  wikiCache = d.wikiCache && typeof d.wikiCache === 'object' ? d.wikiCache : {};
  toldCache = d.toldCache && typeof d.toldCache === 'object' ? d.toldCache : {};
  hostProfiles = Array.isArray(d.hostProfiles) ? d.hostProfiles.filter((x) => x && typeof x.name === 'string' && x.name).map((x) => Object.assign(x, { memories: cleanMemories(x.memories) })) : [];
  loreProfiles = Array.isArray(d.loreProfiles) ? d.loreProfiles.filter((x) => x && typeof x.name === 'string' && x.name).map((x) => Object.assign(x, { events: cleanMemories(x.events) })) : [];
  const hm = d.hostMemory && typeof d.hostMemory === 'object' ? d.hostMemory : {};
  hostMemory = { A: cleanMemories(hm.A), B: cleanMemories(hm.B), L: cleanMemories(hm.L) };
  pickLog = Array.isArray(d.pickLog) ? d.pickLog.filter((x) => x && typeof x.title === 'string').slice(-40) : [];
  airLog = cleanAirLog(d.airLog);
  aiUsage = d.aiUsage && typeof d.aiUsage === 'object' ? d.aiUsage : null;
  learned = Array.isArray(d.learnedCat) ? d.learnedCat : [];
  artistCache = d.artistCache && d.artistCache.pages ? d.artistCache : { names: {}, pages: {} };
  if (Array.isArray(d.debugLog)) dbgBuf = d.debugLog.slice(-DEBUG_MAX);
  settings = Object.assign(clone(DEFAULT_SETTINGS), d.settings || {});
  // 2.22.1 : l'animateur breton n'existe plus ; il devient chaleureux (ou décalé pour le coanimateur).
  if (settings.hostStyle === 'breton') settings.hostStyle = 'chaleureux';
  if (settings.cohostStyle === 'breton') settings.cohostStyle = 'decale';
  settings.eq = Object.assign({ bass: 0, mid: 0, treble: 0 }, settings.eq || {});
  mergeLearnedIntoCatalog();
  sel = Object.assign(clone(DEFAULT_SEL), d.sel || {});
  sel.prompt = sel.prompt || '';
  learn = Object.assign({ skips: {}, skipNames: {}, recent: [] }, d.learn || {});
  cache = d.resolveCache || {};
  hasClaude = !!d.apiKey;
  // 2.3 : ElevenLabs n'est plus proposé. Sa clé est effacée de ce navigateur et la voix passe sur Gemini.
  if (d.elevenKey || settings.voiceEngine === 'eleven' || 'elevenVoiceId' in settings || 'elevenModel' in settings) {
    if (d.elevenKey) { try { chrome.storage.local.remove('elevenKey'); } catch (e) { /* ignore */ } }
    const wasEleven = settings.voiceEngine === 'eleven';
    if (wasEleven) settings.voiceEngine = d.geminiKey ? 'gemini' : 'systeme';
    delete settings.elevenVoiceId; delete settings.elevenVoiceName; delete settings.elevenModel;
    if (d.elevenKey || wasEleven) elevenRemoved = { cle_effacee: !!d.elevenKey, voix: settings.voiceEngine };
    store({ settings });
  }
  hasGemini1 = !!d.geminiKey;
  hasGemini2 = !!d.geminiKey2;
  hasGemini = hasGemini1 || hasGemini2;
  syncTextKey();
  likes = d.likes && Array.isArray(d.likes.items) ? d.likes : { at: 0, items: [] };
  meta = d.trackMeta || {};
  // 2.2 : « Rap » et « Hip-hop » sont séparés. Les titres classés « rap » avant la séparation
  // sont revus une fois : par Claude s'il y a une clé (reclassement en arrière-plan),
  // sinon d'après l'année (avant 2004 : hip-hop). Les titres du catalogue intégré suivent seuls.
  if ((Number(d.dataVersion) || 0) < 22) {
    let toClaude = 0;
    let byYear = 0;
    for (const k of Object.keys(meta)) {
      const m = meta[k];
      if (!m || m.s !== 'rap') continue;
      if (hasKey) { delete meta[k]; toClaude++; } else if (m.y && m.y < 2004) { m.s = 'hiphop'; byYear++; }
    }
    for (const r of learned) if (r[2] === 'rap' && r[5] && r[5] < 2004) { r[2] = 'hiphop'; byYear++; }
    store({ trackMeta: meta, learnedCat: learned, dataVersion: 22 });
    mergeLearnedIntoCatalog();
    if (toClaude || byYear) dataMigration = { toClaude, byYear };
  }
  indexLikes();
  customStyles = Array.isArray(d.customStyles) ? d.customStyles.filter((x) => x && x.id && x.label) : [];
  applyStyleSet();
}
let dataMigration = null;

// Liste des styles (retirés, ajoutés) et catalogue qui va avec.
function applyStyleSet() {
  C.setStyleSet(settings.hiddenStyles || [], customStyles);
  const ok = new Set(C.STYLES.map((s) => s.id));
  CATALOG.length = 0;
  for (const t of BASE_CATALOG) if (ok.has(t.style)) CATALOG.push(t);
  const extra = C.parseCatalog(customStyles.map((cs) => (cs.tracks || []).join('\n')).join('\n'));
  for (const t of extra) if (ok.has(t.style)) CATALOG.push(t);
  CAT_BY_KEY.clear();
  for (const t of CATALOG) if (!CAT_BY_KEY.has(t.key)) CAT_BY_KEY.set(t.key, t);
  mergeLearnedIntoCatalog();
}
// Styles et sous-styles connus, pour l'IA qui classe tes titres.
const styleGuideText = () => C.STYLES.filter((s) => s.id !== 'all')
  .map((s) => s.id + ' : ' + (s.subs.length ? s.subs.map((x) => x[0] + (String(x[1]).toLowerCase() !== x[0] ? ' (' + x[1] + ')' : '')).join(', ') : '(aucun sous-style)'))
  .join('\n') + '\nautre : (aucun sous-style)';
let elevenRemoved = null;

const saveSettings = debounce(() => store({ settings }), 300);
const saveSel = debounce(() => store({ sel }), 400);
const saveMeta = debounce(() => store({ trackMeta: meta }), 1500);
const saveLearn = debounce(() => store({ learn }), 1000);
const saveCache = debounce(() => {
  const keys = Object.keys(cache);
  if (keys.length > 2500) {
    keys.sort((a, b) => (cache[a].at || 0) - (cache[b].at || 0));
    for (const k of keys.slice(0, keys.length - 2000)) delete cache[k];
  }
  store({ resolveCache: cache });
}, 2000);

// 2.36 : une première clé Gemini vient d'être enregistrée. Tant que l'auditeur n'a pas choisi lui-même son moteur
// de voix, Mood DJ passe aux voix Gemini : sinon la voix de l'ordinateur restait, sans duo, et il fallait trouver le réglage.
function geminiVoicesByDefault() {
  if (settings.voiceEngine !== 'systeme' || settings.voiceChosen) return;
  settings.voiceEngine = 'gemini';
  settings.voiceOffered = true;
  saveSettings();
  dlog('session', 'voix Gemini activées (première clé Gemini enregistrée)');
  toast('Clé Gemini enregistrée : les animateurs passent aux voix Gemini, avec le duo.', { label: 'Garder la voix de l’ordinateur', fn: () => { settings.voiceEngine = 'systeme'; settings.voiceChosen = true; saveSettings(); render(); } }, 14000);
}
// Clé Gemini déjà là avant la 2.36, voix de l'ordinateur : on ne change rien d'office (c'est peut-être un choix),
// mais on le propose une fois.
function offerGeminiVoices() {
  if (!hasGemini || settings.voiceEngine !== 'systeme' || settings.voiceChosen || settings.voiceOffered) return;
  settings.voiceOffered = true;
  saveSettings();
  toast('Tu as une clé Gemini, mais c’est la voix de l’ordinateur qui parle : pas de duo.', { label: 'Passer aux voix Gemini', fn: () => { settings.voiceEngine = 'gemini'; settings.voiceChosen = true; saveSettings(); render(); toast('Voix Gemini activées.'); } }, 20000);
}
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.apiKey) { hasClaude = !!changes.apiKey.newValue; syncTextKey(); render(); }
    // Consommation du jour, tenue par le service : affichée au prochain affichage des Réglages.
    if (area === 'local' && changes.aiUsage) aiUsage = changes.aiUsage.newValue || null;
    if (area === 'local' && changes.geminiKey) { const had = hasGemini; hasGemini1 = !!changes.geminiKey.newValue; hasGemini = hasGemini1 || hasGemini2; syncTextKey(); if (!had && hasGemini) geminiVoicesByDefault(); render(); }
    if (area === 'local' && changes.lastfmKey) { hasLastfm = !!changes.lastfmKey.newValue; render(); }
    if (area === 'local' && changes.setlistfmKey) { hasSetlist = !!changes.setlistfmKey.newValue; render(); }
    if (area === 'local' && changes.discogsToken) { hasDiscogs = !!changes.discogsToken.newValue; render(); }
    if (area === 'local' && changes.geminiKey2) { const had = hasGemini; hasGemini2 = !!changes.geminiKey2.newValue; hasGemini = hasGemini1 || hasGemini2; syncTextKey(); if (!had && hasGemini) geminiVoicesByDefault(); render(); }
  });
} catch (e) { /* ignore */ }
