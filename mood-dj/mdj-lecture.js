// Mood DJ — panneau et moteur DJ (monde isolé de l’extension) : déroulement de l’émission : tic, changement d’ambiance, historique.
// Les fichiers mdj-*.js puis content.js sont chargés dans l’ordre du manifest et partagent la même portée :
// une fonction d’un fichier peut appeler celle d’un autre, mais le code exécuté au chargement ne doit
// utiliser que ce qui est défini dans les fichiers précédents (vérifié par tests/split.test.js).
'use strict';

// ------------------------------------------------------------ tic
let lastLive = 0;
let lastSnap = 0;
let lastSnapKey = '';
function onTick() {
  const s = session;
  if (s && s.status === 'playing') engineTick(s);
  const now = Date.now();
  if (s && s.status !== 'ended') {
    // État noté quand il change (titre, pause, annonce, interlude…), sinon toutes les 30 s en
    // lecture et toutes les 10 min en pause : le journal du 24/11 en était à 37 % de lignes
    // d'état, dont 5 h identiques pendant une pause.
    const snap = snapshot();
    const key = [snap.vid, snap.pause, snap.etat, snap.pub, snap.held, snap.audio, snap.muet, snap.session, snap.titre, snap.annonce, snap.interlude, snap.enchainement, Math.round(snap.dur || 0)].join('|');
    const every = snap.pause ? 600000 : 30000;
    if ((key !== lastSnapKey && now - lastSnap > 2000) || now - lastSnap > every) {
      lastSnap = now;
      lastSnapKey = key;
      dlog('état', '', snap);
    }
  }
  if (now - lastLive > 450) { lastLive = now; updateLive(); }
}

function onSeek(s, cur, remaining, fade) {
  s.lastSeekAt = Date.now();
  s.silentSince = 0;
  if (cur.fadingOut && remaining > fade + 1) {
    // On est revenu en arrière après le début du fondu : on remet le son.
    cur.fadingOut = false;
    callSafe('fadeTo', 1, 0.4);
  }
}

function engineTick(s) {
  const now = Date.now();
  const cur = s.current;
  if (!cur || s.advancing) return;
  if (ps.ad) {
    if (ps.gain < 0.99 && !s.adGainFixed) { s.adGainFixed = true; callSafe('fadeTo', 1, 0); }
    cur.fadedIn = true;
    return;
  }
  s.adGainFixed = false;
  if (s.expecting) {
    if (ps.videoId === s.expecting.videoId) s.expecting = null;
    else if (now - s.expecting.since < 10000) return;
    else s.expecting = null;
  }
  if (ps.videoId && ps.videoId !== cur.videoId) {
    if (now - s.lastUserNextAt < 5000) return;
    // Fin naturelle ou curseur amené au bout : YouTube Music a enchaîné tout seul.
    const ended = ps.lastEnded && ps.lastEnded.id === cur.videoId && now - ps.lastEnded.at < 10000;
    const seekEnd = ps.lastSeek && ps.lastSeek.id === cur.videoId && now - ps.lastSeek.at < 10000 &&
      ps.lastSeek.dur && ps.lastSeek.dur - ps.lastSeek.to < 10;
    const nearEnd = seekEnd || (s.lastRemaining !== null && s.lastRemaining <= 6);
    if (ended && !nearEnd) {
      // Une vraie fin arrive en fin de titre : une « fin » après moins de 15 s d'écoute d'un titre normal,
      // ou plus de 4 fins en une minute, ne vient pas du lecteur (ou d'une page qui l'imite) : ignorée.
      s.endedTimes = (s.endedTimes || []).filter((x) => now - x < 60000);
      const tooSoon = now - (cur.fadeInAt || 0) < 15000 && (cur.duration || 999) > 40;
      if (tooSoon || s.endedTimes.length >= 4) {
        if (!s.endedIgnoredAt || now - s.endedIgnoredAt > 10000) dlog('piste', 'fin de titre suspecte ignorée', { titre: cur.title, apres_s: Math.round((now - (cur.fadeInAt || 0)) / 1000), fins_en_1_min: s.endedTimes.length });
        s.endedIgnoredAt = now;
        return;
      }
      s.endedTimes.push(now);
    }
    if (ended || nearEnd) { advance('ended'); return; }
    if (settings.priority !== false) {
      // Choisi par toi dans YouTube Music (clic ou touche sur la page) : il entre dans le mix.
      if (now - lastPageAction < 5000) { adoptGuest(s, cur); return; }
      // Changé par YouTube Music tout seul : Mood DJ reprend la main (au plus 3 fois par minute).
      s.takeovers = (s.takeovers || []).filter((x) => now - x < 60000).concat([now]);
      if (s.takeovers.length <= 3) {
        radioLog(s, 'YouTube Music a changé de titre de lui-même : Mood DJ reprend la main.');
        advance('takeover');
        return;
      }
    }
    suspend('Tu as lancé un autre titre : Mood DJ est en pause.');
    return;
  }
  if (ps.videoId !== cur.videoId) return;
  if (cur.guest && ps.title && cur.title !== ps.title && cur.title === 'Titre choisi dans YouTube Music') { cur.title = ps.title; cur.artist = ps.author || ''; }

  // Nouveau titre chargé mais resté en pause (souvent juste après un interlude) : on relance.
  if (!cur.fadedIn && ps.paused && cur.playAt) {
    const since = now - cur.playAt;
    if (since > 2500 && since < 20000 && now - (cur.kickAt || 0) > 3000) {
      cur.kickAt = now;
      callSafe('resume');
      if (!cur.kickLogged) { cur.kickLogged = true; radioLog(s, 'Le nouveau titre était resté en pause : lecture relancée.'); }
    }
  }

  // Durée gardée depuis le début du titre : si YouTube Music la gonfle vers la fin
  // (préchargement de son titre suivant), on garde la vraie.
  // Deuxième repère : la durée donnée par YouTube Music quand le titre a été trouvé (fiche du
  // titre), qui ne dépend pas du lecteur. Le journal du 24/11 montre deux fins ratées où la
  // durée gonflée (229 → 246 s, 179 → 233 s) n'avait été arrêtée par aucun garde-fou.
  if (ps.duration > 20 && ps.time > 3 && !cur.lockDur) cur.lockDur = ps.duration;
  const rawDur = ps.duration || cur.duration || 0;
  const listed = cur.listedDur > 20 && !(cur.lockDur && cur.listedDur < cur.lockDur - 5) ? cur.listedDur : 0;
  const refs = [cur.lockDur, listed].filter((x) => x > 20);
  const ref = refs.length ? Math.min.apply(null, refs) : 0;
  const dur = ref && rawDur > ref + 3 ? ref : rawDur;
  if (dur !== rawDur && !cur.durWarned) { cur.durWarned = true; dlog('piste', 'durée gonflée ignorée', { annoncee: rawDur, gardee: dur, debut: cur.lockDur || 0, fiche: cur.listedDur || 0 }); }
  if (cur.prevRawDur && Math.abs(rawDur - cur.prevRawDur) > 3 && !cur.durJumpLogged) {
    cur.durJumpLogged = true;
    dlog('piste', 'durée changée par YouTube Music', { avant: cur.prevRawDur, apres: rawDur, gardee: dur, t: ps.time, vid: ps.videoId });
  }
  cur.prevRawDur = rawDur;
  const t = ps.time || 0;
  if (dur && !cur.duration) cur.duration = dur;
  const remaining = dur ? dur - t : Infinity;
  s.lastRemaining = remaining;
  const fade = effectiveFade();

  // Déplacement dans le titre (barre de YouTube Music ou panneau) : on se recale.
  if (cur.lastTickAt) {
    const expected = cur.lastTime + (ps.paused ? 0 : ((now - cur.lastTickAt) / 1000) * (ps.rate || 1));
    if (Math.abs(t - expected) > 2.5) onSeek(s, cur, remaining, fade);
  }
  cur.lastTime = t;
  cur.lastTickAt = now;

  // Filet de sécurité : jamais de titre coincé en silence au milieu.
  if (cur.fadedIn && !cur.fadingOut && !s.announcing && !s.timerFading && !ps.paused &&
      typeof ps.gain === 'number' && ps.gain < 0.9 && remaining > fade + 2 &&
      now - (cur.fadeInAt || 0) > 5000 && now - (s.lastGainFix || 0) > 3000) {
    s.lastGainFix = now;
    callSafe('fadeTo', 1, 0.5);
  }

  if (!cur.fadedIn && t > 0.15 && !ps.paused) {
    cur.fadedIn = true;
    onTrackStarted(s, cur);
  }
  const rate = effectiveRate();
  if (Math.abs((ps.rate || 1) - rate) > 0.005) callSafe('setRate', rate);

  // Fin d'une sélection fixe (durée ou heure d'arrivée) : on ne coupe pas le titre en cours.
  // À l'heure d'arrivée, le titre en cours est le dernier. On ne coupe en fondu que si on dépasse
  // la cible de plus de 6 min (un titre très long).
  if (s.mode === 'fixe' && !s.ending) {
    const left = s.endAt ? (s.endAt - now) / 1000 : s.targetSec - (s.playedSec + t);
    if (s.endAt && left <= 0 && !s.finishing) {
      s.finishing = true;
      for (const x of s.queue.splice(0)) s.usedKeys.delete(x.key);
      dlog('session', "heure d'arrivée atteinte : le titre en cours est le dernier", { titre: cur.title });
      render();
    }
    if (left <= -360 + Math.max(fade, 1) + 0.2) {
      s.ending = true;
      endSession('fin', Math.max(fade, 1));
      return;
    }
  }

  // Minuterie.
  if (s.timer.endAt) {
    const left = s.timer.endAt - now;
    if (left <= 60000 && !s.timerFading) {
      s.timerFading = true;
      callSafe('fadeTo', 0, Math.max(1, left / 1000));
    }
    if (left <= 0) { endSession('timer', 0); return; }
  }

  // Silences en début et en fin de titre.
  const quietGenre = cur.style === 'classique' || cur.style === 'bo' || s.sel.moment === 'coucher';
  if (settings.skipSilence && !quietGenre && typeof ps.rmsDb === 'number' && !ps.paused && now - (s.lastSeekAt || 0) > 4000) {
    const silent = ps.rmsDb < -60;
    if (silent) { if (!s.silentSince) s.silentSince = now; } else s.silentSince = 0;
    if (silent && s.silentSince) {
      const quiet = now - s.silentSince;
      if (t < 12 && quiet > 1500 && cur.silenceSkipped < 15) {
        cur.silenceSkipped += 2;
        s.silentSince = 0;
        callSafe('seek', t + 2);
      } else if (dur && t > 30 && remaining < 30 && quiet > 2000) {
        s.silentSince = 0;
        advance('ended');
        return;
      }
    }
  }

  // Prépare l'annonce suivante, avec l'heure du moment où elle sera dite. 2.36 : le texte est écrit après 20 s
  // d'écoute (8 s avant), et la voix seulement dans la dernière minute et quart (VOICE_LEAD). Un titre zappé dans
  // ses premières secondes ne coûte plus rien, et zappé plus tard, il ne coûte plus que le texte.
  // Si la file change (réglages, retour en arrière…), l'annonce est refaite pour le bon titre.
  const nx = s.queue[0];
  // Annonce préparée trop tôt après une longue pause : l'heure qu'elle donne serait fausse.
  const late = s.prefetch && s.prefetch.planned && s.prefetch.ready && s.prefetch.ready.saysTime && !ps.paused &&
    Math.abs(now + remaining * 1000 - s.prefetch.planned) > 180000;
  const stale = s.prefetch && nx && !s.fadeVoice && now - (s.prefetch.at || 0) > 8000 &&
    (late || s.prefetch.key !== nx.key || announceKind(s, s.transitions + 1, 'ended', true, nx) !== s.prefetch.kind ||
      (s.prefetch.role || null) !== roleFor(s, nx) || (s.prefetch.progKeys || '') !== progKeysFor(s, nx) || (s.prefetch.hookId || '') !== hookIdFor(s, nx) ||
      // guestPhaseNow, pas guestPhaseFor : vérifier ne doit pas prévoir un invité (voir mdj-annonces.js).
      (s.prefetch.guestPhase || '') !== guestPhaseNow(s) || (s.prefetch.dedicId || '') !== dedicIdOf(nx));
  // Voix ratée (incident passager) : un nouvel essai dans les dernières secondes, pour la voix seule (le texte est gardé).
  const pf0 = s.prefetch;
  if (pf0 && pf0.ready && pf0.ready.voiced && !pf0.ready.audio && !pf0.retried && !stale && !s.fadeVoice && nx && pf0.key === nx.key &&
      useGemini() && remaining < 45 && remaining > 8) {
    pf0.retried = true;
    s.voiceErrorShown = true;
    dlog('annonce', 'voix : nouvel essai', { pour: nx.title, reste: remaining });
    pf0.ready.voiced = false;
    pf0.ready.voiceP = null;
    pf0.ready.voice().catch(() => {});
  }
  // La voix de l'annonce prête : fabriquée quand la fin du titre approche.
  if (pf0 && pf0.ready && !stale && !pf0.voiceAsked && nx && pf0.key === nx.key && remaining < VOICE_LEAD) {
    pf0.voiceAsked = true;
    const tv = Date.now();
    pf0.ready.voice().then((r) => dlog('annonce', 'voix prête en ' + (Date.now() - tv) + ' ms', { kind: r.kind, voix: r.audio ? r.audio.byteLength + ' octets' : 'ordinateur', info: r.info })).catch(() => {});
  }
  if (settings.radio && nx && dur && (!s.prefetch || stale) && (t >= TEXT_AFTER || remaining < VOICE_LEAD) && remaining > 0.3) {
    const k = announceKind(s, s.transitions + 1, 'ended', true, nx);
    const pf = { key: nx.key, kind: k, role: roleFor(s, nx), progKeys: progKeysFor(s, nx), hookId: hookIdFor(s, nx), guestPhase: guestPhaseFor(s, nx), dedicId: dedicIdOf(nx), at: now, planned: now + remaining * 1000, promise: null, ready: null, retried: false, voiceAsked: false };
    if (k) {
      dlog('annonce', 'préparation' + (late ? " (refaite : l'heure annoncée aurait été fausse)" : stale ? ' (file ou réglage changé)' : ''), { kind: k, role: pf.role || '', pour: nx.title, a_t: t, reste: remaining });
      pf.promise = prepareAnnouncement(s, k, cur, nx, now + remaining * 1000, { voice: 'later' }).catch((e) => { dlog('annonce', 'préparation ratée : ' + e.message); return null; });
      pf.promise.then((r) => {
        pf.ready = r;
        dlog('annonce', 'texte prêt en ' + (Date.now() - now) + ' ms', r ? { kind: r.kind, info: r.info } : null);
      });
    }
    s.prefetch = pf;
  }

  // Annonce sur le fondu : la voix démarre sur la fin du titre et fait le pont avec le suivant.
  const pfr = s.prefetch;
  if (settings.radio && settings.announceAt !== 'intro' && pfr && pfr.kind === 'talkover' && pfr.ready && pfr.ready.text && pfr.ready.voiced &&
      nx && pfr.key === nx.key && !s.fadeVoice && !s.announcing && !ps.paused && dur > 30) {
    const lead = fadeVoiceLead(fade, pfr.ready);
    if (remaining <= lead && remaining > 1) {
      const fv = { key: pfr.key, finished: false };
      dlog('annonce', 'voix sur le fondu', { reste: remaining, fondu: fade, avance: lead, duree_voix: voiceSeconds(pfr.ready) });
      s.fadeVoice = fv;
      s.announcing = true;
      callSafe('fadeTo', 0.3, 0.8);
      fv.done = sayIt(Object.assign({}, pfr.ready, { info: (pfr.ready.info || '') + ' · sur le fondu' })).finally(() => { fv.finished = true; });
    }
  }

  // Fondu enchaîné réel : la fin du titre est rejouée dans un second lecteur, visible, pendant que le
  // suivant monte (voir yt-bridge.js). Préparé 30 s avant, tenté au début du fondu, sinon fondu habituel.
  if (settings.crossfade !== false && fade >= 3 && dur > 60 && !cur.fadingOut && !cur.xfTried) {
    const ok = crossfadeAllowed(s, cur, nx);
    if (ok && !cur.xfPrep && remaining <= fade + 30 && remaining > fade + 5) {
      cur.xfPrep = now;
      callSafe('xfadePrep', cur.videoId, t);
    } else if (!ok && cur.xfPrep) {
      cur.xfPrep = 0;
      cur.xfTried = true;
      callSafe('xfadeDrop', 'plus de fondu enchaîné pour ce titre');
    }
    if (ok && cur.xfPrep && remaining <= fade + 1.5) {
      cur.xfTried = true;
      cur.xfPending = true;
      // Une voix parle sur le passage : la fin du titre s'efface plus vite pour lui laisser la place.
      const talk = s.fadeVoice || announceKind(s, s.transitions + 1, 'ended', true, nx);
      call('xfadeGo', talk ? Math.min(fade, 4) : fade).then((r) => r, () => null).then((r) => {
        cur.xfPending = false;
        if (session !== s || s.current !== cur || s.advancing) { if (r && r.ok) callSafe('xfadeDrop', 'enchaînement annulé'); return; }
        if (r && r.ok) {
          cur.fadingOut = true;
          const n = s.queue[0];
          if (n) n.xfadeIn = Math.max(2, fade * 0.6);
          dlog('piste', 'fondu enchaîné réel', { titre: cur.title, suivant: n ? n.title : '', fondu: fade });
          advance('ended');
        } else {
          dlog('piste', 'fondu enchaîné impossible, fondu habituel', { raison: (r && r.reason) || 'pas de réponse' });
          callSafe('xfadeDrop');
        }
      });
      return;
    }
  }
  if (cur.xfPending) return;

  // Le fondu se termine 1,5 s avant la fin officielle : la durée annoncée par YouTube Music peut
  // dépasser le vrai fichier d'une seconde ou plus, et son titre suivant partirait alors en plein fondu.
  if (!cur.fadingOut && fade > 0 && dur > fade * 3 && remaining <= fade + 1.5) {
    cur.fadingOut = true;
    callSafe('fadeTo', 0, Math.max(0.3, remaining - 1.5));
  }
  if ((dur && remaining <= 0.35) || ps.state === 0 || (ps.held && ps.held.id === cur.videoId)) advance('ended');
}

// Texte de l'annonce suivante : écrit après 20 s d'écoute. Voix : fabriquée quand il reste moins de 75 s (Gemini
// met 5 à 15 s, 40 s au pire), ou tout de suite si le titre est déjà près de sa fin.
const TEXT_AFTER = 20;
const VOICE_LEAD = 75;
// Durée d'une annonce : celle de la voix Gemini, sinon estimée d'après le texte (2,6 mots par seconde).
function voiceSeconds(ann) {
  const d = ann && ann.audio ? wavSeconds(ann.audio) : 0;
  return d > 0 ? d : Math.max(2, String((ann && ann.text) || '').trim().split(/\s+/).length / 2.6);
}
// Avance de la voix sur la fin du titre (2.36). Elle partait toujours 8,5 s avant la fin, quelle que soit sa
// longueur : une annonce de 30 s débordait de plus de 20 s sur le titre suivant, chant compris. Elle part
// maintenant d'autant plus tôt qu'elle est longue : 60 % de sa durée sur la fin du titre, le reste sur l'intro du
// suivant, sans jamais couvrir plus des 22 dernières secondes.
function fadeVoiceLead(fade, ann) {
  const base = Math.max(fade, 2) + 2.5;
  return Math.max(base, Math.min(22, voiceSeconds(ann) * 0.6));
}

// Fondu enchaîné réel autorisé pour ce passage ? Pas avant un interlude (la musique s'arrête),
// ni en fin de sélection ou de minuterie, ni pendant une pub.
function crossfadeAllowed(s, cur, nx) {
  if (!nx || ps.ad || ps.paused || s.finishing || s.ending || s.timerFading || s.inInterlude) return false;
  if (s.timer && s.timer.kind === 'end') return false;
  if (s.mode === 'fixe' && s.endAt && s.endAt - Date.now() < 30000) return false;
  return announceKind(s, s.transitions + 1, 'ended', true, nx) !== 'interlude';
}

// « Changer maintenant » : la nouvelle ambiance commence dès le titre suivant, sans attendre les
// 3 titres déjà prévus. Restent seulement le prochain titre si son annonce est déjà en route, et
// les titres demandés ou dédicacés.
function changeAmbianceNow() {
  const s = session;
  if (!s || s.status !== 'playing' || !s.ambianceChange || s.ambianceChange.done) return;
  const keep = s.fadeVoice ? 1 : 0;
  const head = s.queue.slice(0, keep);
  const rest = s.queue.slice(keep);
  const asked = rest.filter((t) => t.dedic && !t.dedic.done);
  for (const t of rest) if (!asked.includes(t)) s.usedKeys.delete(t.key);
  // Pour « Annuler » : les titres de l'ancienne ambiance retirés ici reviendraient.
  if (s.ambUndo) {
    const oldLocked = s.ambianceChange.locked || [];
    s.ambUndo.lockedDropped = rest.filter((t) => !asked.includes(t) && oldLocked.includes(t.key));
  }
  s.queue = head.concat(asked);
  // Un jeu posé sur un titre retiré n'aura pas sa réponse : on l'oublie.
  if (s.hook && !s.queue.some((t) => t.key === s.hook.forKey)) s.hook = null;
  s.ambianceChange.locked = s.queue.map((t) => t.key);
  s.ambianceChange.now = true;
  dlog('session', "changement d'ambiance immédiat", { vers: s.ambianceChange.to, gardes: s.queue.map((t) => t.title) });
  ensureQueue();
  toast('Nouvelle ambiance dès le ' + (keep ? 'titre d\'après le prochain' : 'prochain titre') + (settings.radio ? " : l'animateur l'annoncera." : '.'), s.ambUndo ? { label: 'Annuler', fn: undoAmbiance } : null, 8000);
  render();
}

// ------------------------------------------- changer d'ambiance pendant une émission
// Pendant une émission, les réglages de l'onglet Ambiance restent en attente : rien ne bouge tant
// que tu n'as pas cliqué sur « Mettre à jour l'ambiance » (ou « Annuler les modifications »). Une fois
// appliquée, la nouvelle ambiance peut encore être annulée tant qu'elle n'a pas commencé.
const AMB_KEYS = ['style', 'sub', 'moment', 'energy', 'mood', 'era', 'source', 'cycle', 'likesMix', 'curve', 'seed', 'prompt'];
const MUSIC_KEYS = ['style', 'sub', 'moment', 'energy', 'mood', 'era', 'source', 'cycle'];
const sameJ = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
function pendingAmb(s) {
  if (!s || !(s.status === 'playing' || s.status === 'suspended')) return null;
  const prompt = (sel.prompt || '').trim() !== (s.sel.prompt || '').trim();
  const others = MUSIC_KEYS.some((k) => !sameJ(sel[k], s.sel[k])) || !sameJ(sel.seed, s.sel.seed);
  const curve = !sameJ(sel.curve, s.sel.curve);
  const mix = (sel.likesMix || 'off') !== (s.sel.likesMix || 'off');
  if (!prompt && !others && !curve && !mix) return null;
  const relaunch = prompt ? 'description' : s.mode !== 'continu' && (others || curve) ? 'fixe'
    : sel.source !== s.sel.source || (sel.era === 'actuel') !== (s.sel.era === 'actuel') ? 'source'
      : mix && !others && !curve ? 'melange' : '';
  return { prompt, others, curve, mix, relaunch, curveOnly: curve && !others && !prompt };
}
// Les réglages de l'onglet Ambiance reprennent ceux de l'émission en cours.
function revertSelToSession(s) {
  for (const k of AMB_KEYS) sel[k] = s.sel[k] === undefined ? DEFAULT_SEL[k] : clone(s.sel[k]);
  saveSel();
}
function cancelPendingAmb() {
  const s = session;
  if (!s) return;
  revertSelToSession(s);
  toast("Modifications annulées : l'ambiance de l'émission ne change pas.", null, 4000);
  render();
}
function refreshSessionSel(s) {
  s.label = selLabel(s.sel);
  if (s.source === 'likes' || s.source === 'similar') s.levels = C.poolLevels(s.pool, s.sel);
  if (s.mix) s.mix.levels = C.poolLevels(s.mix.pool, s.sel);
  else if (s.source !== 'live') s.levels = C.catalogLevels(CATALOG, s.sel);
  s.loop = C.momentById(s.sel.moment).loop;
  setSpan(s, C.cycleMinutes(s.sel));
  applySound();
}

// « Mettre à jour l'ambiance » (now : dès le titre suivant).
function applyAmbiance(now) {
  const s = session;
  const p = pendingAmb(s);
  if (!p) return;
  if (p.relaunch) {
    const why = { description: 'Nouvelle description : il faut relancer la sélection pour que l’IA repense les titres.',
      fixe: 'En sélection fixe, la liste est déjà prête : il faut relancer la sélection.',
      source: 'Nouvelle source de titres : il faut relancer la sélection.',
      melange: 'Nouveau mélange avec les titres similaires : il faut relancer la sélection.' }[p.relaunch];
    toast(why, { label: 'Relancer', fn: () => startFromUi(false) }, 8000);
    return;
  }
  const undo = { sel: clone(s.sel), change: s.ambianceChange ? clone(s.ambianceChange) : null, removed: [], lockedDropped: [], curveOnly: p.curveOnly, at: Date.now() };
  const keepN = lockedCount(s);
  const cut = s.queue.splice(keepN);
  for (const t of cut) {
    if (t.dedic && !t.dedic.done) { s.queue.push(t); continue; }
    s.usedKeys.delete(t.key);
    undo.removed.push(t);
  }
  if (p.curveOnly) {
    // Seule la courbe d'énergie change : pas d'annonce de changement d'ambiance.
    s.sel.curve = sel.curve ? clone(sel.curve) : null;
    dlog('session', "courbe d'énergie modifiée en cours de route", { points: (s.sel.curve || []).length || 'courbe du moment' });
  } else {
    const fromLabel = s.ambianceChange && !s.ambianceChange.done ? s.ambianceChange.from : plainLabel(s.sel);
    s.sel = Object.assign(clone(sel), { mode: s.sel.mode });
    // L'animateur annoncera la nouvelle ambiance sur le premier titre après les titres verrouillés.
    const locked = s.queue.slice(0, keepN);
    s.ambianceChange = { from: fromLabel, to: plainLabel(s.sel), toEn: ambianceEn(s.sel), locked: locked.map((t) => t.key), at: Date.now(), done: false };
    dlog('session', "changement d'ambiance", { de: fromLabel, vers: s.ambianceChange.to, apres: locked.map((t) => t.title) });
  }
  refreshSessionSel(s);
  s.ambUndo = undo;
  ensureQueue();
  if (now && !p.curveOnly && s.status === 'playing') { changeAmbianceNow(); return; }
  const n = p.curveOnly ? 0 : s.ambianceChange.locked.length;
  toast(p.curveOnly ? "Nouvelle courbe d'énergie : elle s'applique " + (keepN ? 'après les titres déjà prévus.' : 'aux titres à venir.')
    : n ? 'Nouvelle ambiance après le titre en cours et ' + (n === 1 ? 'le titre déjà prévu' : 'les ' + n + ' titres déjà prévus') + (settings.radio ? " : l'animateur l'annoncera." : '.')
      : 'Les prochains titres suivent ta nouvelle ambiance.', { label: 'Annuler', fn: undoAmbiance }, 9000);
  render();
}

// Annuler la dernière mise à jour, tant que la nouvelle ambiance n'a pas commencé.
function canUndoAmb(s) {
  const u = s && s.ambUndo;
  if (!u || !(s.status === 'playing' || s.status === 'suspended')) return false;
  if (u.curveOnly) return Date.now() - u.at < 10 * 60e3;
  return !!(s.ambianceChange && !s.ambianceChange.done);
}
function undoAmbiance() {
  const s = session;
  if (!canUndoAmb(s)) { toast("Trop tard pour annuler : la nouvelle ambiance a déjà commencé. Choisis l'ancienne dans l'onglet Ambiance.", null, 7000); return; }
  const u = s.ambUndo;
  s.ambUndo = null;
  // On garde les titres de l'ancienne ambiance encore en file, puis ceux qui avaient été retirés.
  const ch = s.ambianceChange;
  const oldKeys = new Set(u.curveOnly ? s.queue.slice(0, lockedCount(s)).map((t) => t.key) : (ch ? ch.locked : []));
  const keep = s.queue.filter((t) => oldKeys.has(t.key));
  const asked = s.queue.filter((t) => !oldKeys.has(t.key) && t.dedic && !t.dedic.done);
  for (const t of s.queue) if (!keep.includes(t) && !asked.includes(t)) s.usedKeys.delete(t.key);
  const back = u.lockedDropped.concat(u.removed).filter((t) => !keep.includes(t) && !asked.includes(t) && !s.played.includes(t) && s.current !== t);
  for (const t of back) s.usedKeys.add(t.key);
  s.queue = keep.concat(back, asked);
  s.sel = u.sel;
  s.ambianceChange = u.change;
  refreshSessionSel(s);
  revertSelToSession(s);
  dlog('session', 'mise à jour d\'ambiance annulée', { retour: plainLabel(s.sel), titres_revenus: back.length });
  ensureQueue();
  toast(u.curveOnly ? "Courbe d'énergie précédente rétablie." : 'Ambiance précédente rétablie : « ' + plainLabel(s.sel) + ' ».', null, 5000);
  render();
}

// Les réglages changés pendant une émission ne s'appliquent plus tout seuls : on rafraîchit
// seulement l'affichage (bandeau « Mettre à jour l'ambiance »).
const liveUpdate = debounce(() => render(), 250);

// Bandeau de l'onglet Ambiance : modifications en attente pendant une émission.
function pendingAmbBar() {
  const s = session;
  const p = pendingAmb(s);
  if (!p) return null;
  const from = plainLabel(s.sel);
  const to = plainLabel(sel);
  const what = p.curveOnly ? "Courbe d'énergie modifiée." : p.prompt ? 'Nouvelle description.' : 'Ambiance modifiée : « ' + from + ' » → « ' + to + ' ».';
  const btns = p.relaunch
    ? [h('button', { class: 'btn primary small', type: 'button', onclick: () => startFromUi(false) }, 'Relancer la sélection')]
    : [h('button', { class: 'btn primary small', type: 'button', onclick: () => applyAmbiance(false) }, p.curveOnly ? 'Appliquer la courbe' : "Mettre à jour l'ambiance"),
      !p.curveOnly && s.status === 'playing' ? h('button', { class: 'btn small', type: 'button', title: 'Sans attendre les titres déjà prévus', onclick: () => applyAmbiance(true) }, 'Dès le titre suivant') : null];
  btns.push(h('button', { class: 'btn small', type: 'button', onclick: cancelPendingAmb }, 'Annuler les modifications'));
  return h('div', { class: 'card pendingamb', role: 'status' },
    h('div', { class: 'label white' }, what),
    h('div', { class: 'muted' }, p.relaunch === 'description' ? "Pour une nouvelle description, l'IA doit repenser toute la sélection."
      : p.relaunch ? 'Ce changement demande de relancer la sélection.'
        : "Rien ne change dans l'émission tant que tu n'as pas validé." + (p.curveOnly ? '' : ' Les titres déjà annoncés restent.')),
    h('div', { class: 'btns' }, btns));
}

// ------------------------------------------------- historique des émissions
// Chaque émission est notée au fil de l'eau (titres joués, invités, score des jeux) : rien n'est
// perdu si l'onglet se ferme. Les 60 dernières sont gardées.
let showHistory = [];
const HISTORY_MAX = 60;
const saveHistory = debounce(() => store({ showHistory }), 1500);
function recordShow(s) {
  if (!s || s.id === 'demo' || s.saveOnly) return;
  const played = s.played.concat(s.current ? [s.current] : []).filter((t) => t && t.title);
  if (!played.length) return;
  const e = {
    id: s.id, at: s.startedAt, end: Date.now(), label: selLabel(s.sel), styles: styleText(s.sel),
    moment: C.momentById(s.sel.moment).label, mode: s.mode, sel: clone(ambSnap(s.sel)),
    tracks: played.slice(-300).map((t) => ({ a: t.artist, t: t.title, v: t.videoId || '', sk: !!t.skipped, g: !!t.guest })),
    guests: (s.guestList || []).slice(0, 10), dedics: (s.dedicList || []).slice(0, 20), score: s.score || null, sec: Math.round(s.playedSec || 0),
    host: (settings.hostName || 'Alex').trim() || 'Alex', cohost: (settings.cohostName || 'Sam').trim() || 'Sam'
  };
  const i = showHistory.findIndex((x) => x.id === e.id);
  if (i >= 0) showHistory[i] = e; else showHistory.unshift(e);
  showHistory = showHistory.slice(0, HISTORY_MAX);
  saveHistory();
}

async function playlistFromTracks(name, ids) {
  const list = ids.filter(Boolean);
  if (!list.length) { toast('Aucun titre à enregistrer.'); return; }
  if (!ps.loggedIn) { toast('Connecte-toi à YouTube Music pour enregistrer une playlist.'); return; }
  try {
    const r = await call('createPlaylist', name.slice(0, 150), 'Créée par Mood DJ', list);
    toast('Playlist enregistrée dans ta bibliothèque (' + list.length + ' titres).', {
      label: 'Ouvrir', fn: () => window.open('https://music.youtube.com/playlist?list=' + encodeURIComponent(r.playlistId), '_blank')
    }, 12000);
  } catch (e) { toast(e.message); }
}

async function savePlaylist(s) {
  const tracks = s.played.concat(s.current ? [s.current] : [], s.queue).filter((t) => t && t.videoId);
  if (!tracks.length) { toast('Aucun titre à enregistrer.'); return; }
  if (!ps.loggedIn) { toast('Connecte-toi à YouTube Music pour enregistrer une playlist.'); return; }
  const date = new Date().toLocaleDateString(uiLocale(), { day: '2-digit', month: '2-digit' });
  const title = ('Mood DJ · ' + plainLabel(s.sel) + ' · ' + date).slice(0, 150);
  try {
    const r = await call('createPlaylist', title, 'Créée par Mood DJ', tracks.map((t) => t.videoId));
    toast('Playlist enregistrée dans ta bibliothèque (' + tracks.length + ' titres).', {
      label: 'Ouvrir',
      fn: () => window.open('https://music.youtube.com/playlist?list=' + encodeURIComponent(r.playlistId), '_blank')
    }, 12000);
  } catch (e) {
    toast(e.message);
  }
}
