// Mood DJ — pont avec YouTube Music.
// Ce script tourne dans le « monde » de la page (world: MAIN) : il a accès au
// lecteur de YouTube Music et à sa configuration. Il ne fait que ce que le
// panneau (content.js) lui demande, via window.postMessage.
(function () {
  'use strict';
  if (window.__moodDjBridge) return;
  window.__moodDjBridge = true;

  const ORIGIN = location.origin;
  // Filtre « Titres » de la recherche YouTube Music.
  const SONGS_PARAMS = 'EgWKAQIIAWoMEA4QChADEAQQCRAF';

  const send = (msg) => window.postMessage(Object.assign({ __mdj: 'bridge' }, msg), ORIGIN);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const player = () => document.getElementById('movie_player');
  const videoEl = () => document.querySelector('video');
  const app = () => document.querySelector('ytmusic-app');
  const cfg = (k) => {
    try {
      if (window.ytcfg && typeof window.ytcfg.get === 'function') return window.ytcfg.get(k);
      return window.ytcfg && window.ytcfg.data_ ? window.ytcfg.data_[k] : undefined;
    } catch (e) {
      return undefined;
    }
  };

  function currentId() {
    const p = player();
    try {
      const d = p && p.getVideoData && p.getVideoData();
      return (d && d.video_id) || '';
    } catch (e) {
      return '';
    }
  }

  async function waitFor(fn, ms, step) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try {
        if (fn()) return true;
      } catch (e) { /* ignore */ }
      await sleep(step || 120);
    }
    return false;
  }

  // ---------------------------------------------------------------- audio
  const A = {
    ctx: null, src: null, video: null,
    low: null, mid: null, high: null, boostLow: null, presence: null,
    comp: null, makeup: null, limiter: null, fade: null, analyser: null,
    buf: null, eq: { bass: 0, mid: 0, treble: 0 }, boost: false,
    // Repli sans Web Audio : fondus par le volume du lecteur.
    volFallback: { base: null, timer: null, gain: 1 }
  };

  function buildGraph() {
    const c = A.ctx;
    A.low = c.createBiquadFilter(); A.low.type = 'lowshelf'; A.low.frequency.value = 110;
    A.mid = c.createBiquadFilter(); A.mid.type = 'peaking'; A.mid.frequency.value = 1000; A.mid.Q.value = 0.8;
    A.high = c.createBiquadFilter(); A.high.type = 'highshelf'; A.high.frequency.value = 7000;
    A.boostLow = c.createBiquadFilter(); A.boostLow.type = 'lowshelf'; A.boostLow.frequency.value = 80;
    A.presence = c.createBiquadFilter(); A.presence.type = 'peaking'; A.presence.frequency.value = 3000; A.presence.Q.value = 1;
    A.comp = c.createDynamicsCompressor();
    A.makeup = c.createGain();
    A.limiter = c.createDynamicsCompressor();
    A.limiter.threshold.value = -1; A.limiter.knee.value = 0; A.limiter.ratio.value = 20;
    A.limiter.attack.value = 0.003; A.limiter.release.value = 0.1;
    A.fade = c.createGain();
    A.analyser = c.createAnalyser(); A.analyser.fftSize = 2048;
    A.buf = new Float32Array(A.analyser.fftSize);
    A.low.connect(A.mid); A.mid.connect(A.high); A.high.connect(A.boostLow);
    A.boostLow.connect(A.presence); A.presence.connect(A.comp); A.comp.connect(A.makeup);
    A.makeup.connect(A.limiter); A.limiter.connect(A.fade); A.fade.connect(c.destination);
    applyEq();
    applyBoost();
  }

  function attachVideo() {
    const v = videoEl();
    if (!A.ctx || !v || v === A.video) return !!A.video;
    try {
      if (A.src) { try { A.src.disconnect(); } catch (e) { /* ignore */ } }
      A.src = A.ctx.createMediaElementSource(v);
      A.src.connect(A.low);
      A.src.connect(A.analyser);
      A.video = v;
      return true;
    } catch (e) {
      return false;
    }
  }

  async function initAudio() {
    if (A.ctx && A.ctx.state === 'running' && A.video) { attachVideo(); return { ok: true }; }
    try {
      // Le contexte audio sert aussi aux voix et aux jingles : on le crée même
      // si aucun titre n'a encore été lancé sur la page.
      if (!A.ctx) {
        A.ctx = new AudioContext({ latencyHint: 'playback' });
        buildGraph();
      }
      if (A.ctx.state !== 'running') {
        await Promise.race([A.ctx.resume(), sleep(1500)]);
      }
      if (A.ctx.state !== 'running') return { ok: false, reason: 'suspended' };
      if (!videoEl()) return { ok: false, reason: 'no-video', voice: true };
      const ok = attachVideo();
      return { ok };
    } catch (e) {
      return { ok: false, reason: String(e && e.message || e) };
    }
  }

  function applyEq() {
    if (!A.low) return;
    A.low.gain.value = A.eq.bass;
    A.mid.gain.value = A.eq.mid;
    A.high.gain.value = A.eq.treble;
  }

  function applyBoost() {
    if (!A.comp) return;
    if (A.boost) {
      A.boostLow.gain.value = 4; A.presence.gain.value = 2.5;
      A.comp.threshold.value = -22; A.comp.knee.value = 18; A.comp.ratio.value = 3;
      A.comp.attack.value = 0.01; A.comp.release.value = 0.25;
      A.makeup.gain.value = 1.35;
    } else {
      A.boostLow.gain.value = 0; A.presence.gain.value = 0;
      A.comp.threshold.value = 0; A.comp.knee.value = 0; A.comp.ratio.value = 1;
      A.makeup.gain.value = 1;
    }
  }

  function currentGain() {
    if (A.fade && A.video) return A.fade.gain.value;
    return A.volFallback.gain;
  }

  function fadeTo(target, secs) {
    target = Math.max(0, Math.min(1, Number(target)));
    secs = Math.max(0, Number(secs) || 0);
    if (A.fade && A.video && A.ctx) {
      const g = A.fade.gain;
      const now = A.ctx.currentTime;
      const cur = g.value;
      g.cancelScheduledValues(now);
      if (Math.abs(cur - target) < 0.001) { g.setValueAtTime(target, now); return; }
      if (secs < 0.05) {
        // Pas de saut brutal de volume (il fait « clac ») : rampe de 25 ms.
        g.setValueAtTime(cur, now);
        g.linearRampToValueAtTime(target, now + 0.025);
        return;
      }
      const n = 96;
      const curve = new Float32Array(n);
      const up = target > cur;
      for (let i = 0; i < n; i++) {
        const x = i / (n - 1);
        const shape = up ? Math.sin(x * Math.PI / 2) : 1 - Math.cos(x * Math.PI / 2);
        curve[i] = cur + (target - cur) * shape;
      }
      try {
        g.setValueCurveAtTime(curve, now + 0.01, secs);
      } catch (e) {
        g.setValueAtTime(cur, now);
        g.linearRampToValueAtTime(target, now + secs);
      }
      return;
    }
    // Repli : volume du lecteur.
    const p = player();
    if (!p || !p.setVolume) return;
    const F = A.volFallback;
    if (F.base === null) F.base = p.getVolume ? p.getVolume() : 100;
    if (F.timer) clearInterval(F.timer);
    const start = F.gain;
    const t0 = Date.now();
    const dur = secs * 1000;
    const step = () => {
      const x = dur ? Math.min(1, (Date.now() - t0) / dur) : 1;
      F.gain = start + (target - start) * x;
      try { p.setVolume(Math.round(F.base * F.gain)); } catch (e) { /* ignore */ }
      if (x >= 1) { clearInterval(F.timer); F.timer = null; if (F.gain >= 0.999) F.base = null; }
    };
    if (!dur) step(); else F.timer = setInterval(step, 100);
  }

  // ------------------------------------------------- fondu enchaîné réel
  // YouTube Music ne lit qu'un titre à la fois. Pour que deux titres se chevauchent, la fin du
  // titre en cours est rejouée dans un second lecteur YouTube, visible (iframe), calé à la même seconde et
  // muet. Au moment du fondu, le son passe du lecteur principal au second lecteur (en 0,15 s), le
  // lecteur principal lance le titre suivant qui monte, et la fin du titre caché descend.
  // Si quoi que ce soit cloche (titre non intégrable, pub, lecture refusée, décalage), on garde le
  // fondu habituel.
  const X = { frame: null, vid: '', info: {}, timeAt: 0, phase: 'idle', err: '', timer: null, ramp: null,
    seeks: 0, lastSeekAt: 0, lead: 0.25, drift: null, unmuteAt: 0, plays: 0, listenTries: 0, created: 0, got: false,
    // 2.43.1 : ce que le second lecteur a fait (états, à combien de ms), les échecs de suite, la pause après trois.
    states: [], fails: 0, restUntil: 0, restSaid: false };
  // États du lecteur intégré de YouTube : -1 pas démarré, 0 fini, 1 lecture, 2 pause, 3 chargement, 5 prêt.
  function xNote(what) {
    if (X.states.length < 40) X.states.push(Math.round((Date.now() - X.created) / 100) / 10 + 's:' + what);
  }
  const X_ORIGIN = 'https://www.youtube.com';

  function xCmd(func, args) {
    try { X.frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: args || [], id: 1, channel: 'widget' }), X_ORIGIN); } catch (e) { /* ignore */ }
  }

  window.addEventListener('message', (e) => {
    if (!X.frame || e.source !== X.frame.contentWindow) return;
    let m = null;
    try { m = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (err) { return; }
    if (!m) return;
    X.got = true;
    if ((m.event === 'infoDelivery' || m.event === 'initialDelivery') && m.info) {
      Object.assign(X.info, m.info);
      if (typeof m.info.currentTime === 'number') X.timeAt = Date.now();
    } else if (m.event === 'onStateChange') {
      X.info.playerState = m.info;
      xNote('état ' + m.info);
    } else if (m.event === 'onError') {
      xNote('erreur ' + m.info);
      X.err = 'erreur ' + m.info + (m.info === 101 || m.info === 150 ? ' (titre non intégrable)' : '');
    }
  });

  function xTime() {
    const i = X.info;
    if (typeof i.currentTime !== 'number') return null;
    const playing = i.playerState === 1;
    return i.currentTime + (playing ? ((Date.now() - X.timeAt) / 1000) * (i.playbackRate || 1) : 0);
  }

  function mainTime() {
    const p = player();
    try { return p && p.getCurrentTime ? p.getCurrentTime() : (videoEl() ? videoEl().currentTime : 0); } catch (e) { return 0; }
  }

  function xfadeDrop(why) {
    if (X.timer) { clearInterval(X.timer); X.timer = null; }
    if (X.ramp) { clearInterval(X.ramp); X.ramp = null; }
    if (X.frame) {
      if (why) blog('fondu enchaîné : second lecteur retiré (' + why + ')');
      try { (X.box || X.frame).remove(); } catch (e) { /* ignore */ }
    }
    X.box = null;
    X.frame = null; X.vid = ''; X.info = {}; X.phase = 'idle'; X.err = ''; X.drift = null;
    return true;
  }

  // Suivi du second lecteur pendant la préparation : le son s'ouvre (volume 0), puis il se cale sur
  // le lecteur principal à quelques centièmes près.
  function xSync() {
    if (!X.frame) return;
    if (X.err) {
      if (X.phase !== 'failed') {
        // Le détail sert à comprendre : chez certains, le fondu enchaîné échoue à chaque titre.
        blog('fondu enchaîné impossible : ' + X.err, { suite: X.states.join(' · '), etat: X.info.playerState, muet: X.info.muted, volume: X.info.volume, essais: X.plays, a_repondu: X.got, echecs_de_suite: X.fails + 1 });
        X.phase = 'failed';
        X.fails++;
        // Trois échecs de suite : inutile de recharger le titre dans un second lecteur à chaque fin de morceau.
        if (X.fails >= 3) { X.restUntil = Date.now() + 30 * 60e3; X.restSaid = false; }
      }
      return;
    }
    if (currentId() !== X.vid) { xfadeDrop('le titre a changé'); return; }
    if (!X.got && X.listenTries < 20) {
      X.listenTries++;
      try { X.frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), X_ORIGIN); } catch (e) { /* ignore */ }
      return;
    }
    const v = videoEl();
    const p = player();
    const mainPaused = !v || v.paused || (p && p.classList && p.classList.contains('ad-showing'));
    const st = X.info.playerState;
    if (mainPaused) { if (st === 1) xCmd('pauseVideo'); X.drift = null; return; }
    if (X.phase === 'muted') {
      if (st === 1 && typeof X.info.currentTime === 'number') {
        // Le son s'ouvre à volume nul : la lecture avec le son doit être acceptée maintenant, pas au
        // moment du fondu.
        xCmd('setVolume', [0]); xCmd('unMute'); xCmd('playVideo');
        X.phase = 'unmuting'; X.unmuteAt = Date.now(); X.plays = 1;
        xNote('son ouvert');
      } else if (Date.now() - X.created > 15000) {
        X.err = 'le second lecteur ne démarre pas';
      }
      return;
    }
    if (X.phase === 'unmuting' || X.phase === 'sync' || X.phase === 'ready') {
      if (st !== 1) {
        if (Date.now() - X.unmuteAt > 1800 * X.plays) {
          if (X.plays >= 3) { X.err = 'lecture avec le son refusée par le navigateur (aucun clic sur la page depuis son ouverture ?)'; return; }
          X.plays++; xCmd('playVideo');
          xNote('relance');
        }
        return;
      }
      if (X.phase === 'unmuting') { X.phase = 'sync'; X.fails = 0; }
      const rate = v.playbackRate || 1;
      if (Math.abs((X.info.playbackRate || 1) - rate) > 0.01) xCmd('setPlaybackRate', [rate]);
      const it = xTime();
      const mt = mainTime();
      if (it === null) return;
      const d = it - mt;
      X.drift = Math.round(d * 1000) / 1000;
      const tol = X.seeks >= 5 ? 0.25 : 0.12;
      if (Math.abs(d) <= tol) { if (X.phase !== 'ready') X.phase = 'ready'; return; }
      X.phase = 'sync';
      if (Date.now() - X.lastSeekAt < 1600 || X.seeks >= 8) return;
      // Le saut arrive avec un temps de chargement : on vise un peu plus loin, et on ajuste cette
      // avance d'après l'écart mesuré au saut précédent.
      if (X.seeks > 0 && X.lastSeekAt) X.lead = Math.max(0, Math.min(1.5, X.lead - d));
      X.seeks++; X.lastSeekAt = Date.now();
      xCmd('seekTo', [mt + X.lead, true]);
    }
  }

  function xfadePrep(videoId, t) {
    if (!videoId) return { ok: false };
    if (X.frame && X.vid === videoId) return xfadeStatus();
    // Après trois échecs de suite, le second lecteur n'est plus ouvert pendant une demi-heure : fondu habituel.
    if (Date.now() < X.restUntil) {
      if (!X.restSaid) { X.restSaid = true; blog('fondu enchaîné : trois échecs de suite, plus de second lecteur pendant 30 minutes (fondu habituel)'); }
      return { ok: false, reason: 'en pause après trois échecs' };
    }
    if (X.restUntil) { X.restUntil = 0; X.fails = 0; }
    xfadeDrop();
    const at = Math.max(0, Math.floor(Number(t) || mainTime()) + 2);
    // Le second lecteur reste visible pendant qu'il joue (règles de YouTube pour les lecteurs
    // intégrés : au moins 200 × 200 px, à l'écran, non recouvert, commandes et logo intacts).
    // Une petite « deuxième platine » en bas à gauche, au-dessus de la barre de lecture.
    const box = document.createElement('div');
    box.id = 'mooddj-deck';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Mood DJ : fin du titre pour le fondu enchaîné');
    box.style.cssText = 'position:fixed;left:16px;bottom:88px;z-index:2147483600;width:356px;padding:6px;border-radius:10px;' +
      'background:#181818;border:1px solid #3a3a3a;box-shadow:0 6px 24px rgba(0,0,0,.6);font:12px Roboto,Arial,sans-serif;color:#ccc;' +
      'opacity:1;visibility:visible;display:block;transform:none';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:8px;padding:0 2px 6px';
    const lab = document.createElement('span');
    lab.style.cssText = 'flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    let title = '';
    try { title = (player().getVideoData() || {}).title || ''; } catch (e) { title = ''; }
    lab.textContent = 'Mood DJ · fondu enchaîné' + (title ? ' · ' + title : '');
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Fermer';
    close.title = 'Fermer ce lecteur : fondu habituel pour ce titre';
    close.style.cssText = 'border:1px solid #4a4a4a;background:#2a2a2a;color:#fff;border-radius:12px;padding:2px 10px;font:inherit;cursor:pointer';
    close.addEventListener('click', () => xfadeDrop('fermé à la main'));
    head.append(lab, close);
    const f = document.createElement('iframe');
    f.title = 'Lecteur YouTube : fin du titre en cours';
    f.allow = 'autoplay; encrypted-media';
    f.width = '344';
    f.height = '200';
    f.style.cssText = 'display:block;width:344px;height:200px;border:0;border-radius:6px;background:#000';
    box.append(head, f);
    f.src = X_ORIGIN + '/embed/' + encodeURIComponent(videoId) + '?enablejsapi=1&autoplay=1&mute=1&controls=1&fs=0&rel=0&iv_load_policy=3&playsinline=1&start=' + at +
      '&origin=' + encodeURIComponent(location.origin);
    Object.assign(X, { frame: f, box, vid: videoId, info: {}, timeAt: 0, phase: 'muted', err: '', seeks: 0, lastSeekAt: 0, lead: 0.25, drift: null, unmuteAt: 0, plays: 0, listenTries: 0, created: Date.now(), got: false, states: [] });
    f.addEventListener('load', () => {
      try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), X_ORIGIN); } catch (e) { /* ignore */ }
    });
    document.body.appendChild(box);
    X.timer = setInterval(xSync, 350);
    blog('fondu enchaîné : second lecteur en préparation', { id: videoId, depuis: at });
    return { ok: true };
  }

  function xfadeStatus() {
    return { vid: X.vid, phase: X.phase, err: X.err, drift: X.drift, seeks: X.seeks };
  }

  // Le passage de relais : le second lecteur prend le son, puis descend sur « secs » secondes.
  function xfadeGo(secs) {
    const v = videoEl();
    const p = player();
    if (!X.frame && Date.now() < X.restUntil) return { ok: false, reason: 'en pause après trois échecs de suite' };
    if (!X.frame || X.vid !== currentId()) return { ok: false, reason: 'pas de second lecteur pour ce titre' };
    if (X.err) return { ok: false, reason: X.err };
    if (X.phase !== 'ready') return { ok: false, reason: 'second lecteur pas encore calé (' + X.phase + (X.drift !== null ? ', écart ' + X.drift + ' s' : '') + ')' };
    if (!v || v.paused) return { ok: false, reason: 'musique en pause' };
    const it = xTime();
    if (it === null || Math.abs(it - mainTime()) > 0.35) return { ok: false, reason: 'écart trop grand' };
    let base = 100;
    try {
      base = A.volFallback.base !== null ? A.volFallback.base : (p && p.getVolume ? p.getVolume() : 100);
      if (p && p.isMuted && p.isMuted()) base = 0;
    } catch (e) { base = 100; }
    let g = 1;
    try { g = currentGain(); } catch (e) { g = 1; }
    const top = Math.max(0, Math.min(100, base * g));
    if (X.timer) { clearInterval(X.timer); X.timer = null; }
    X.phase = 'out';
    // Bascule : 150 ms, le lecteur principal descend pendant que le caché monte.
    fadeTo(0, 0.15);
    const swap = 150;
    const hold = 700;
    const out = Math.max(1, Number(secs) || 6) * 1000;
    const t0 = Date.now();
    let last = -1;
    X.ramp = setInterval(() => {
      const e = Date.now() - t0;
      let lv;
      if (e < swap) lv = top * (e / swap);
      else if (e < swap + hold) lv = top;
      else {
        const x = Math.min(1, (e - swap - hold) / out);
        lv = top * Math.cos(x * Math.PI / 2);
        if (x >= 1) { xfadeDrop(); return; }
      }
      const r = Math.round(lv);
      if (r !== last) { last = r; xCmd('setVolume', [r]); }
      if (X.info.playerState === 0) xfadeDrop();
    }, 40);
    blog('fondu enchaîné : relais au second lecteur', { volume: Math.round(top), descente_s: out / 1000, ecart: X.drift });
    return { ok: true, level: top };
  }

  // -------------------------------------------------- voix, jingles, fond
  const R = { voiceIn: null, bedGain: null, bedTimer: null, bedNodes: [], jingleGain: null };

  function radioChain() {
    if (!A.ctx || R.voiceIn) return !!A.ctx;
    const c = A.ctx;
    // Traitement « radio » de la voix : coupe-bas, présence, compression.
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90;
    const pres = c.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 3200; pres.Q.value = 0.9; pres.gain.value = 3;
    const warm = c.createBiquadFilter(); warm.type = 'lowshelf'; warm.frequency.value = 180; warm.gain.value = 2;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.005; comp.release.value = 0.2;
    const out = c.createGain(); out.gain.value = 1.1;
    // Volume général de l'animateur (voix, jingles, fond) : il suit le volume de YouTube Music.
    R.master = c.createGain(); R.master.gain.value = radioVolume(); R.master.connect(c.destination);
    hp.connect(warm); warm.connect(pres); pres.connect(comp); comp.connect(out); out.connect(R.master);
    R.voiceIn = hp;
    R.jingleGain = c.createGain(); R.jingleGain.gain.value = 0.5; R.jingleGain.connect(R.master);
    R.bedGain = c.createGain(); R.bedGain.gain.value = 0; R.bedGain.connect(R.master);
    return true;
  }

  function radioVolume() {
    const p = player();
    const v = videoEl();
    try { if (p && p.isMuted && p.isMuted()) return 0; } catch (e) { /* ignore */ }
    if (v && v.muted) return 0;
    let vol = A.volFallback.base !== null ? A.volFallback.base / 100 : (v ? v.volume : 1);
    if (!isFinite(vol)) vol = 1;
    return Math.max(0, Math.min(1, vol));
  }
  function syncRadioVolume(now) {
    if (!R.master || !A.ctx) return;
    const target = radioVolume();
    const g = R.master.gain;
    if (Math.abs(g.value - target) < 0.01) return;
    if (now) { g.cancelScheduledValues(A.ctx.currentTime); g.setValueAtTime(target, A.ctx.currentTime); }
    else g.setTargetAtTime(target, A.ctx.currentTime, 0.12);
  }

  // PCM 16 bits brut (sans en-tête WAV) -> AudioBuffer.
  function pcmToBuffer(buf, rate) {
    const n = Math.floor(buf.byteLength / 2);
    const dv = new DataView(buf, 0, n * 2);
    const out = A.ctx.createBuffer(1, Math.max(1, n), rate || 24000);
    const ch = out.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = dv.getInt16(i * 2, true) / 32768;
    return out;
  }

  // Lecture de secours sans Web Audio (contexte audio bloqué par le navigateur).
  function playVoiceElement(buf) {
    return new Promise((resolve) => {
      let url = '';
      try {
        url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
        const el = new Audio(url);
        el.volume = radioVolume();
        let done = false;
        const stops = R.voiceStops || (R.voiceStops = new Set());
        const stop = () => { try { el.pause(); } catch (e) { /* ignore */ } fin({ ok: true, element: true, stopped: true }); };
        const fin = (r) => { if (!done) { done = true; stops.delete(stop); try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } resolve(r); } };
        stops.add(stop);
        el.onended = () => fin({ ok: true, element: true });
        el.onerror = () => fin({ ok: false, reason: 'decode' });
        const pr = el.play();
        if (pr && pr.catch) pr.catch(() => fin({ ok: false, reason: 'blocked' }));
        setTimeout(() => fin({ ok: true, element: true }), 90000);
      } catch (e) {
        resolve({ ok: false, reason: 'audio' });
      }
    });
  }

  async function playVoice(buf) {
    if (!buf || !buf.byteLength) return { ok: false, reason: 'empty' };
    if (A.ctx && A.ctx.state !== 'running') { try { await Promise.race([A.ctx.resume(), sleep(800)]); } catch (e) { /* ignore */ } }
    if (!A.ctx || A.ctx.state !== 'running' || !radioChain()) return playVoiceElement(buf);
    syncRadioVolume(true);
    const head = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
    const isWav = String.fromCharCode.apply(null, head) === 'RIFF';
    let audio;
    try { audio = await A.ctx.decodeAudioData(buf.slice(0)); } catch (e) {
      if (isWav) return { ok: false, reason: 'decode' };
      try { audio = pcmToBuffer(buf, 24000); } catch (e2) { return { ok: false, reason: 'decode' }; }
    }
    const src = A.ctx.createBufferSource();
    src.buffer = audio;
    src.connect(R.voiceIn);
    return new Promise((resolve) => {
      let done = false;
      const stops = R.voiceStops || (R.voiceStops = new Set());
      const stop = () => { try { src.stop(); } catch (e) { /* ignore */ } fin(); };
      const fin = () => { if (!done) { done = true; stops.delete(stop); resolve({ ok: true, duration: audio.duration }); } };
      stops.add(stop);
      src.onended = fin;
      setTimeout(fin, audio.duration * 1000 + 1500);
      src.start();
    });
  }

  // Coupe la voix en cours (titre suivant demandé pendant une annonce ou un interlude).
  function stopVoice() {
    const stops = R.voiceStops ? Array.from(R.voiceStops) : [];
    for (const f of stops) f();
    return { ok: true, stopped: stops.length };
  }

  function tone(freq, start, dur, type, gainPeak, dest) {
    const c = A.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gainPeak, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, start + dur);
    o.connect(g); g.connect(dest);
    o.start(start); o.stop(start + dur + 0.05);
    return o;
  }

  function noiseBuffer(sec) {
    const c = A.ctx;
    const b = c.createBuffer(1, Math.floor(c.sampleRate * sec), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // ---------------------------------------------- habillage sonore par ambiance
  // Tout est synthétisé (aucun fichier) : quelques instruments simples, et pour chaque famille de
  // musique (rock, électro, jazz, celtique…) un jingle et un fond d'interlude dans son style. Le jingle
  // garde la même signature de 4 notes (l'identité de la station), arrangée à la manière du style.
  const midiHz = (n) => 440 * Math.pow(2, (n - 69) / 12);
  let distCurve = null;
  function distortion() {
    if (!distCurve) {
      distCurve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; distCurve[i] = Math.tanh(3.5 * x); }
    }
    const w = A.ctx.createWaveShaper(); w.curve = distCurve; w.oversample = '2x';
    return w;
  }
  function vca(at, attack, peak, hold, release, dest) {
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.setValueAtTime(peak, at + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0008, at + attack + hold + release);
    g.connect(dest);
    return g;
  }
  function osc(type, f, at, end, dest, detune) {
    const o = A.ctx.createOscillator();
    o.type = type; o.frequency.value = f; if (detune) o.detune.value = detune;
    o.connect(dest); o.start(at); o.stop(end + 0.05);
    return o;
  }
  const INS = {
    // Nappe : deux scies désaccordées, filtrées.
    pad(at, f, dur, gain, dest, cut) {
      const lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cut || 1400;
      lp.connect(vca(at, Math.min(0.7, dur * 0.3), gain, Math.max(0, dur * 0.5), dur * 0.4 + 0.2, dest));
      osc('sawtooth', f, at, at + dur + 0.6, lp, -7); osc('sawtooth', f, at, at + dur + 0.6, lp, 7);
    },
    // Cordes : attaque lente et léger vibrato.
    strings(at, f, dur, gain, dest) {
      const lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      lp.connect(vca(at, Math.min(1.2, dur * 0.4), gain, dur * 0.4, dur * 0.4 + 0.4, dest));
      const lfo = A.ctx.createOscillator(); const ld = A.ctx.createGain(); lfo.frequency.value = 5.2; ld.gain.value = 9;
      lfo.connect(ld); lfo.start(at); lfo.stop(at + dur + 1);
      for (const d of [-8, 0, 8]) { const o = osc('sawtooth', f, at, at + dur + 0.8, lp, d); ld.connect(o.detune); }
    },
    // Cuivres : le filtre s'ouvre sur l'attaque.
    brass(at, f, dur, gain, dest) {
      const lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
      lp.frequency.setValueAtTime(400, at); lp.frequency.exponentialRampToValueAtTime(2600, at + 0.12); lp.frequency.exponentialRampToValueAtTime(1500, at + dur);
      lp.connect(vca(at, 0.05, gain, dur * 0.6, 0.35, dest));
      osc('sawtooth', f, at, at + dur + 0.4, lp, -4); osc('sawtooth', f, at, at + dur + 0.4, lp, 4);
    },
    // Piano électrique (façon Rhodes).
    keys(at, f, dur, gain, dest) {
      tone(f, at, dur, 'sine', gain, dest);
      tone(f * 2, at, Math.max(0.2, dur * 0.4), 'sine', gain * 0.22, dest);
      tone(f * 3.98, at, 0.12, 'sine', gain * 0.1, dest);
    },
    // Clavinet funky : court et nasillard.
    clav(at, f, dur, gain, dest) {
      const bp = A.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.4;
      bp.connect(vca(at, 0.004, gain, 0.02, Math.min(0.25, dur), dest));
      osc('square', f, at, at + 0.35, bp);
    },
    // Corde pincée (guitare acoustique).
    pluck(at, f, dur, gain, dest) {
      const lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(4000, at); lp.frequency.exponentialRampToValueAtTime(700, at + 0.4);
      lp.connect(vca(at, 0.003, gain, 0.01, Math.min(1.4, dur + 0.4), dest));
      osc('sawtooth', f, at, at + 1.5, lp); osc('triangle', f * 2, at, at + 0.6, lp);
    },
    marimba(at, f, dur, gain, dest) { tone(f, at, 0.45, 'sine', gain, dest); tone(f * 4, at, 0.06, 'sine', gain * 0.35, dest); },
    bass(at, f, dur, gain, dest) { tone(f, at, dur, 'triangle', gain, dest); tone(f, at, dur * 0.7, 'sine', gain * 0.9, dest); },
    synthBass(at, f, dur, gain, dest) {
      const lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
      lp.frequency.setValueAtTime(1400, at); lp.frequency.exponentialRampToValueAtTime(220, at + Math.min(0.25, dur));
      lp.connect(vca(at, 0.005, gain, dur * 0.5, 0.12, dest));
      osc('sawtooth', f, at, at + dur + 0.2, lp);
    },
    // Accord de guitare saturée (quinte + octave).
    power(at, f, dur, gain, dest) {
      const w = distortion();
      const lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800;
      const pre = A.ctx.createGain(); pre.gain.value = 0.6;
      pre.connect(w); w.connect(lp); lp.connect(vca(at, 0.005, gain, dur * 0.6, 0.18, dest));
      for (const k of [1, 1.4983, 2]) osc('sawtooth', f * k, at, at + dur + 0.25, pre, k === 2 ? 5 : 0);
    },
    // Flûte irlandaise (tin whistle) : sinus avec vibrato et un peu de souffle.
    whistle(at, f, dur, gain, dest) {
      const g = vca(at, 0.03, gain, dur * 0.7, 0.1, dest);
      const o = osc('sine', f, at, at + dur + 0.15, g);
      const lfo = A.ctx.createOscillator(); const ld = A.ctx.createGain(); lfo.frequency.value = 6; ld.gain.value = 12;
      lfo.connect(ld); ld.connect(o.detune); lfo.start(at + 0.08); lfo.stop(at + dur + 0.2);
      noiseHit(at, 0.06, 3000, 1, gain * 0.15, dest);
    }
  };
  const DR = {
    kick: (at, g, d) => drum(at, 120, 45, 0.32, g, d),
    snare: (at, g, d) => { noiseHit(at, 0.18, 1900, 0.7, g, d); drum(at, 200, 160, 0.1, g * 0.5, d); },
    rim: (at, g, d) => { noiseHit(at, 0.04, 2500, 3, g, d); tone(1700, at, 0.04, 'square', g * 0.15, d); },
    clap: (at, g, d) => { for (const o of [0, 0.012, 0.024]) noiseHit(at + o, 0.09, 1300, 1.2, g, d); },
    hat: (at, g, d, open) => noiseHit(at, open ? 0.25 : 0.045, 8000, 0.8, g, d, 'highpass'),
    ride: (at, g, d) => noiseHit(at, 0.5, 5200, 0.6, g, d, 'highpass'),
    shaker: (at, g, d) => noiseHit(at, 0.07, 6000, 1, g, d),
    brush: (at, g, d) => noiseHit(at, 0.22, 3500, 0.5, g, d),
    conga: (at, g, d, high) => drum(at, high ? 380 : 260, high ? 330 : 220, 0.18, g, d),
    clave: (at, g, d) => tone(2500, at, 0.05, 'sine', g, d),
    bodhran: (at, g, d) => { drum(at, 110, 70, 0.28, g, d); noiseHit(at, 0.08, 400, 1, g * 0.4, d); },
    tom: (at, g, d, f) => drum(at, f || 180, (f || 180) * 0.6, 0.3, g, d),
    timpani: (at, g, d) => { drum(at, 98, 92, 1.2, g, d); noiseHit(at, 0.05, 300, 1, g * 0.3, d); },
    crash: (at, g, d) => noiseHit(at, 1.6, 6000, 0.4, g, d, 'highpass'),
    crackle(at, len, g, d) { for (let i = 0; i < len * 9; i++) noiseHit(at + Math.random() * len, 0.008, 3000 + Math.random() * 4000, 2, g * (0.3 + Math.random() * 0.7), d); }
  };

  // Grilles d'accords, en demi-tons depuis la tonique : [basse, notes de l'accord].
  const PROG = {
    major: [[0, [0, 4, 7]], [9, [9, 12, 16]], [5, [5, 9, 12]], [7, [7, 11, 14]]],
    minor: [[0, [0, 3, 7]], [8, [8, 12, 15]], [3, [3, 7, 10]], [10, [10, 14, 17]]],
    jazz: [[2, [2, 5, 9, 12]], [7, [7, 11, 14, 17]], [0, [0, 4, 7, 11]], [9, [9, 12, 16, 19]]],
    jazzMinor: [[2, [2, 5, 8, 12]], [7, [7, 11, 14, 17]], [0, [0, 3, 7, 10]], [0, [0, 3, 7, 10]]],
    reggae: [[0, [0, 4, 7]], [5, [5, 9, 12]], [0, [0, 4, 7]], [7, [7, 11, 14]]],
    modal: [[0, [0, 7, 12]], [0, [0, 7, 12]], [10, [10, 14, 17]], [5, [5, 9, 12]]]
  };
  // Tempo, tonalité et grille par famille. L'énergie (1 à 5) accélère un peu et ajoute des percussions.
  const KITS = {
    pop: { bpm: [92, 118], root: 60, prog: 'major', cut: 2400 },
    rock: { bpm: [108, 142], root: 52, prog: 'major', cut: 3200 },
    electro: { bpm: [118, 128], root: 57, prog: 'minor', cut: 3000 },
    hiphop: { bpm: [84, 94], root: 57, prog: 'minor', cut: 1800, swing: 0.6 },
    chill: { bpm: [70, 82], root: 60, prog: 'jazz', cut: 1100, swing: 0.58 },
    jazz: { bpm: [96, 140], root: 58, prog: 'jazz', cut: 2400, swing: 0.66 },
    funk: { bpm: [104, 118], root: 57, prog: 'minor', cut: 2800 },
    reggae: { bpm: [72, 80], root: 55, prog: 'reggae', cut: 2000 },
    tropical: { bpm: [96, 112], root: 60, prog: 'major', cut: 2600 },
    celtique: { bpm: [96, 112], root: 62, prog: 'modal', cut: 2200, ternary: true },
    orchestre: { bpm: [64, 80], root: 55, prog: 'major', cut: 2600 },
    acoustique: { bpm: [88, 104], root: 55, prog: 'major', cut: 2600 }
  };
  function kitConf(o) {
    const k = (o && KITS[o.kit]) ? o.kit : 'pop';
    const conf = KITS[k];
    const energy = Math.max(1, Math.min(5, Number(o && o.energy) || 3));
    let prog = conf.prog;
    if (o && o.minor) prog = prog === 'jazz' ? 'jazzMinor' : prog === 'major' || prog === 'reggae' ? 'minor' : prog;
    return { name: k, conf, energy, prog: PROG[prog], minor: !!(o && o.minor), bpm: conf.bpm[0] + (conf.bpm[1] - conf.bpm[0]) * (energy - 1) / 4 };
  }

  // Une mesure du fond sonore. t : début, beat : durée d'un temps, ch : [basse, accord], k : rang.
  function bedBar(K, t, beat, ch, k, bus) {
    const r = K.conf.root;
    const e = K.energy;
    const bassF = midiHz(r - 24 + ch[0]);
    const notes = ch[1].map((x) => midiHz(r + x));
    const sw = (i) => t + (K.conf.swing && i % 2 ? (Math.floor(i / 2) + K.conf.swing) * beat : (i / 2) * beat);
    const bar = beat * 4;
    switch (K.name) {
      case 'rock':
        for (let i = 0; i < 8; i++) { INS.power(t + i * beat / 2, midiHz(r - 12 + ch[0]), beat * 0.4, 0.05, bus); INS.bass(t + i * beat / 2, bassF, beat * 0.45, 0.16, bus); }
        for (const b of [0, 2]) DR.kick(t + b * beat, 0.5, bus);
        if (e >= 4) DR.kick(t + 2.5 * beat, 0.4, bus);
        for (const b of [1, 3]) DR.snare(t + b * beat, 0.22, bus);
        for (let i = 0; i < 8; i++) DR.hat(t + i * beat / 2, 0.05, bus);
        if (k % 4 === 0) DR.crash(t, 0.08, bus);
        break;
      case 'electro': {
        for (let b = 0; b < 4; b++) { DR.kick(t + b * beat, 0.55, bus); DR.hat(t + (b + 0.5) * beat, 0.07, bus, e >= 4); }
        if (e >= 3) for (const b of [1, 3]) DR.clap(t + b * beat, 0.12, bus);
        for (let i = 0; i < 8; i++) if (i % 2) INS.synthBass(t + i * beat / 2, bassF * 2, beat * 0.4, 0.14, bus);
        // Nappe « pompée » par la grosse caisse.
        for (let b = 0; b < 4; b++) notes.forEach((f) => INS.pad(t + b * beat + 0.08, f, beat * 0.8, 0.022, bus, 2600));
        break;
      }
      case 'hiphop':
        DR.kick(t, 0.55, bus); DR.kick(sw(3), 0.4, bus); DR.kick(t + 2.5 * beat, 0.35, bus);
        for (const b of [1, 3]) DR.snare(t + b * beat, 0.26, bus);
        for (let i = 0; i < 8; i++) DR.hat(sw(i), i % 2 ? 0.03 : 0.05, bus);
        notes.forEach((f) => INS.keys(t, f, bar * 0.9, 0.05, bus));
        INS.bass(t, bassF, beat * 1.5, 0.2, bus); INS.bass(t + 2.5 * beat, bassF, beat, 0.16, bus);
        DR.crackle(t, bar, 0.03, bus);
        break;
      case 'chill':
        notes.forEach((f, i) => INS.keys(t + i * 0.03, f, bar * 0.95, 0.045, bus));
        INS.bass(t, bassF, beat * 2, 0.14, bus); INS.bass(t + 2.5 * beat, bassF, beat * 1.2, 0.1, bus);
        if (e >= 2) { DR.kick(t, 0.3, bus); DR.kick(sw(5), 0.22, bus); for (const b of [1, 3]) DR.rim(t + b * beat, 0.08, bus); }
        DR.crackle(t, bar, 0.025, bus);
        break;
      case 'jazz': {
        // Contrebasse qui marche, cymbale ride en swing, accords du piano en contretemps.
        const walk = [ch[0], ch[1][1] || ch[0] + 4, ch[1][2] || ch[0] + 7, ch[0] + 11];
        walk.forEach((n, b) => INS.bass(t + b * beat, midiHz(r - 24 + n), beat * 0.9, 0.18, bus));
        for (const i of [0, 2, 3, 4, 6, 7]) DR.ride(sw(i), i % 2 ? 0.025 : 0.04, bus);
        for (const b of [1, 3]) DR.brush(t + b * beat, 0.05, bus);
        for (const i of [3, 7]) notes.forEach((f) => INS.keys(sw(i), f, beat * 0.8, 0.035, bus));
        break;
      }
      case 'funk':
        DR.kick(t, 0.5, bus); DR.kick(t + 2.75 * beat, 0.35, bus); DR.kick(t + 2 * beat, 0.4, bus);
        for (const b of [1, 3]) DR.snare(t + b * beat, 0.22, bus);
        for (let i = 0; i < 16; i++) DR.hat(t + i * beat / 4, i % 2 ? 0.02 : 0.045, bus);
        for (const q of [0, 0.75, 1.5, 2.5, 3.25]) INS.synthBass(t + q * beat, bassF * (q === 1.5 ? 2 : 1), beat * 0.3, 0.16, bus);
        for (const q of [0.5, 1.5, 2.5, 3.5]) notes.forEach((f) => INS.clav(t + q * beat, f, 0.15, 0.03, bus));
        break;
      case 'reggae':
        // One drop : grosse caisse et rim sur le 3e temps, accords « skank » sur les contretemps.
        DR.kick(t + 2 * beat, 0.45, bus); DR.rim(t + 2 * beat, 0.12, bus);
        for (let i = 0; i < 8; i++) DR.hat(t + i * beat / 2, 0.025, bus);
        for (const b of [1, 3]) notes.forEach((f) => INS.clav(t + b * beat, f, 0.12, 0.035, bus));
        [0, 1.5, 2, 3].forEach((q, i) => INS.bass(t + q * beat, midiHz(r - 24 + ch[0] + [0, 7, 12, 7][i]), beat * 0.7, 0.18, bus));
        break;
      case 'tropical': {
        // Clave 3-2, congas, shaker, marimba.
        for (const q of [0, 1.5, 3]) DR.clave(t + q * beat, 0.08, bus);
        for (const q of [1, 2.5, 3.5]) DR.conga(t + q * beat, 0.16, bus, q !== 2.5);
        for (let i = 0; i < 8; i++) DR.shaker(t + i * beat / 2, 0.035, bus);
        if (e >= 3) DR.kick(t, 0.3, bus);
        [0, 1, 2, 3, 2, 1, 0, 2].forEach((n, i) => INS.marimba(t + i * beat / 2, notes[n % notes.length] * 2, 0.3, 0.05, bus));
        INS.bass(t, bassF, beat * 1.2, 0.16, bus); INS.bass(t + 1.5 * beat, bassF * 1.5, beat, 0.14, bus);
        break;
      }
      case 'celtique': {
        // 6/8 : deux temps pointés par mesure, bourdon continu, bodhrán et flûte parcimonieuse.
        const eighth = bar / 6;
        INS.pad(t, midiHz(r - 12), bar, 0.025, bus, 900); INS.pad(t, midiHz(r - 5), bar, 0.02, bus, 900);
        for (let i = 0; i < 6; i++) DR.bodhran(t + i * eighth, i % 3 === 0 ? 0.3 : 0.1, bus);
        const scale = [0, 2, 4, 7, 9, 12, 14];
        if (k % 2 === 0 || e >= 3) for (let i = 0; i < 6; i++) if (Math.random() < 0.6) INS.whistle(t + i * eighth, midiHz(r + 12 + scale[Math.floor(Math.random() * scale.length)]), eighth * 0.9, 0.05, bus);
        break;
      }
      case 'orchestre':
        notes.forEach((f) => INS.strings(t, f, bar, 0.018, bus));
        INS.strings(t, bassF, bar, 0.03, bus);
        if (k % 2 === 0 && e >= 2) DR.timpani(t, 0.22, bus);
        if (e >= 4) INS.brass(t + 3 * beat, notes[0] * 2, beat * 0.9, 0.04, bus);
        break;
      case 'acoustique':
        // Guitare en arpèges (picking), basse alternée, shaker léger.
        for (let i = 0; i < 8; i++) {
          if (i % 2 === 0) INS.pluck(t + i * beat / 2, i % 4 === 0 ? bassF * 2 : bassF * 3, beat, 0.07, bus);
          else INS.pluck(t + i * beat / 2, notes[(i >> 1) % notes.length], beat * 0.8, 0.045, bus);
        }
        if (e >= 3) for (let i = 0; i < 8; i++) DR.shaker(t + i * beat / 2, 0.025, bus);
        break;
      default: // pop
        notes.forEach((f) => INS.pad(t, f, bar, 0.03, bus, 1600));
        for (let i = 0; i < 8; i++) INS.keys(t + i * beat / 2, notes[i % notes.length] * 2, beat * 0.4, 0.025, bus);
        INS.bass(t, bassF, beat * 1.8, 0.16, bus); INS.bass(t + 2 * beat, bassF, beat * 1.8, 0.14, bus);
        if (e >= 3) { for (const b of [0, 2]) DR.kick(t + b * beat, 0.35, bus); for (const b of [1, 3]) DR.clap(t + b * beat, 0.09, bus); }
        for (let i = 0; i < 8; i++) DR.hat(t + i * beat / 2, 0.03, bus);
    }
  }

  // Jingle de la famille : la signature de 4 notes, arrangée dans le style. Variante : transposition.
  async function playKitJingle(K, variant, dest) {
    const c = A.ctx;
    const t0 = c.currentTime + 0.05;
    const r = K.conf.root + [0, 2, -3][Math.abs(Number(variant) || 0) % 3];
    const sig = (K.minor ? [0, 3, 7, 12] : [0, 4, 7, 12]).map((x) => midiHz(r + 12 + x));
    const chord = (K.minor ? [0, 3, 7] : [0, 4, 7]).map((x) => midiHz(r + x));
    let end = t0 + 2.2;
    switch (K.name) {
      case 'rock': {
        [200, 170, 140, 110].forEach((f, i) => DR.tom(t0 + i * 0.1, 0.4, dest, f));
        const t1 = t0 + 0.45;
        sig.forEach((f, i) => INS.power(t1 + i * 0.16, f / 4, 0.15, 0.09, dest));
        INS.power(t1 + 0.7, chord[0] / 2, 1.2, 0.1, dest); DR.kick(t1 + 0.7, 0.6, dest); DR.crash(t1 + 0.7, 0.18, dest);
        end = t1 + 2;
        break;
      }
      case 'electro': {
        const n = c.createBufferSource(); n.buffer = noiseBuffer(1.1);
        const hp = c.createBiquadFilter(); hp.type = 'bandpass'; hp.Q.value = 3;
        hp.frequency.setValueAtTime(400, t0); hp.frequency.exponentialRampToValueAtTime(9000, t0 + 1);
        n.connect(hp); hp.connect(vca(t0, 0.9, 0.25, 0, 0.15, dest)); n.start(t0); n.stop(t0 + 1.1);
        const t1 = t0 + 1.05;
        DR.kick(t1, 0.7, dest);
        chord.forEach((f) => INS.pad(t1, f * 2, 0.5, 0.05, dest, 5000));
        sig.forEach((f, i) => INS.synthBass(t1 + 0.12 + i * 0.12, f, 0.11, 0.1, dest));
        end = t1 + 1.2;
        break;
      }
      case 'hiphop': {
        // « Scratch » : souffle filtré qui va et vient, puis kick, caisse claire et accord.
        for (const [a, b, at] of [[600, 2600, 0], [2600, 500, 0.12], [700, 3000, 0.26]]) {
          const n = c.createBufferSource(); n.buffer = noiseBuffer(0.14);
          const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 8;
          bp.frequency.setValueAtTime(a, t0 + at); bp.frequency.exponentialRampToValueAtTime(b, t0 + at + 0.11);
          n.connect(bp); bp.connect(vca(t0 + at, 0.01, 0.5, 0.08, 0.03, dest)); n.start(t0 + at); n.stop(t0 + at + 0.14);
        }
        const t1 = t0 + 0.5;
        DR.kick(t1, 0.6, dest); DR.snare(t1 + 0.35, 0.3, dest); DR.kick(t1 + 0.55, 0.4, dest); DR.snare(t1 + 0.9, 0.3, dest);
        sig.forEach((f, i) => INS.keys(t1 + i * 0.22, f, 0.5, 0.12, dest));
        chord.forEach((f) => INS.keys(t1 + 0.9, f, 1.4, 0.09, dest));
        end = t1 + 2.2;
        break;
      }
      case 'chill':
        DR.crackle(t0, 2.6, 0.05, dest);
        sig.forEach((f, i) => INS.keys(t0 + 0.2 + i * 0.3, f, 1.2, 0.1, dest));
        chord.concat([midiHz(r + 11)]).forEach((f, i) => INS.keys(t0 + 1.5 + i * 0.04, f, 1.8, 0.07, dest));
        end = t0 + 3.3;
        break;
      case 'jazz':
        DR.brush(t0, 0.15, dest); DR.ride(t0 + 0.3, 0.06, dest);
        INS.bass(t0 + 0.1, midiHz(r - 12 - 2), 0.18, 0.25, dest); INS.bass(t0 + 0.28, midiHz(r - 12), 0.6, 0.25, dest);
        sig.forEach((f, i) => INS.keys(t0 + 0.3 + i * (i % 2 ? 0.1 : 0.2), f, 0.6, 0.11, dest));
        [0, 4, 7, 11, 14].map((x) => midiHz(r + x - (K.minor && x === 4 ? 1 : 0))).forEach((f, i) => INS.keys(t0 + 1.05 + i * 0.03, f, 1.8, 0.06, dest));
        DR.ride(t0 + 1.05, 0.08, dest);
        end = t0 + 3;
        break;
      case 'funk':
        DR.clap(t0, 0.2, dest);
        sig.forEach((f, i) => { INS.clav(t0 + 0.2 + i * 0.12, f, 0.12, 0.09, dest); DR.hat(t0 + 0.2 + i * 0.12, 0.06, dest); });
        INS.synthBass(t0 + 0.7, chord[0] / 2, 0.25, 0.2, dest); INS.synthBass(t0 + 0.95, chord[0], 0.2, 0.16, dest);
        DR.kick(t0 + 0.7, 0.55, dest); DR.snare(t0 + 1.0, 0.25, dest);
        chord.forEach((f) => INS.brass(t0 + 1.2, f * 2, 0.6, 0.06, dest));
        end = t0 + 2.2;
        break;
      case 'reggae':
        DR.rim(t0, 0.15, dest);
        sig.forEach((f, i) => { INS.clav(t0 + 0.25 + i * 0.25, f, 0.14, 0.08, dest); });
        INS.bass(t0 + 0.25, chord[0] / 2, 0.4, 0.25, dest); INS.bass(t0 + 0.75, chord[0] * 0.75, 0.4, 0.22, dest);
        DR.kick(t0 + 1.25, 0.5, dest); DR.rim(t0 + 1.25, 0.15, dest);
        chord.forEach((f) => INS.clav(t0 + 1.25, f * 2, 0.2, 0.06, dest));
        end = t0 + 2.4;
        break;
      case 'tropical':
        [0, 0.08, 0.16, 0.24].forEach((q, i) => DR.conga(t0 + q, 0.25, dest, i % 2 === 0));
        sig.forEach((f, i) => INS.marimba(t0 + 0.4 + i * 0.13, f * 2, 0.3, 0.14, dest));
        DR.clave(t0 + 0.4, 0.12, dest); DR.clave(t0 + 0.92, 0.12, dest);
        chord.forEach((f) => INS.marimba(t0 + 1.0, f * 2, 0.4, 0.1, dest));
        INS.bass(t0 + 1.0, chord[0] / 2, 0.8, 0.22, dest);
        end = t0 + 2.2;
        break;
      case 'celtique':
        for (let i = 0; i < 6; i++) DR.bodhran(t0 + i * 0.09, 0.12 + i * 0.04, dest);
        INS.pad(t0 + 0.3, midiHz(r - 12), 2.4, 0.04, dest, 900); INS.pad(t0 + 0.3, midiHz(r - 5), 2.4, 0.03, dest, 900);
        sig.forEach((f, i) => { INS.whistle(t0 + 0.55 + i * 0.2 - 0.04, f * 2 * 1.122, 0.04, 0.05, dest); INS.whistle(t0 + 0.55 + i * 0.2, f * 2, 0.19, 0.09, dest); });
        INS.whistle(t0 + 1.4, sig[3] * 2, 0.8, 0.09, dest); DR.bodhran(t0 + 1.4, 0.4, dest);
        end = t0 + 2.8;
        break;
      case 'orchestre':
        for (let i = 0; i < 12; i++) DR.timpani(t0 + i * 0.06, 0.05 + i * 0.012, dest);
        sig.forEach((f, i) => INS.brass(t0 + 0.75 + i * 0.22, f, i === 3 ? 1 : 0.22, 0.07, dest));
        chord.forEach((f) => INS.strings(t0 + 1.4, f, 1.8, 0.04, dest)); INS.strings(t0 + 1.4, chord[0] / 2, 1.8, 0.05, dest);
        DR.timpani(t0 + 1.4, 0.35, dest);
        end = t0 + 3.6;
        break;
      case 'acoustique':
        sig.forEach((f, i) => INS.pluck(t0 + 0.1 + i * 0.18, f, 0.5, 0.12, dest));
        [chord[0] / 2].concat(chord, [chord[0] * 2]).forEach((f, i) => INS.pluck(t0 + 0.9 + i * 0.03, f, 1.6, 0.08, dest));
        DR.shaker(t0 + 0.9, 0.06, dest);
        end = t0 + 2.6;
        break;
      default:
        return null;
    }
    await sleep((end - c.currentTime + 0.3) * 1000);
    return { ok: true, kit: K.name };
  }

  // Jingle synthétisé : souffle filtré qui monte, arpège, accord final. Variante 0 à 2.
  // Avec une ambiance (opts.kit), jingle dans le style de la musique.
  async function playJingle(variant, opts) {
    if (!A.ctx || A.ctx.state !== 'running' || !radioChain()) return { ok: false };
    syncRadioVolume(true);
    if (opts && opts.kit && opts.kit !== 'pop') {
      const r = await playKitJingle(kitConf(opts), variant, R.jingleGain);
      if (r) return r;
    }
    const c = A.ctx;
    const t0 = c.currentTime + 0.05;
    const dest = R.jingleGain;
    const sets = [
      [523.25, 659.25, 783.99, 1046.5],
      [440, 554.37, 659.25, 880],
      [392, 493.88, 587.33, 783.99]
    ];
    const notes = sets[Math.abs(Number(variant) || 0) % sets.length];
    const n = c.createBufferSource();
    n.buffer = noiseBuffer(1.2);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t0);
    bp.frequency.exponentialRampToValueAtTime(6000, t0 + 0.9);
    const ng = c.createGain();
    ng.gain.setValueAtTime(0, t0);
    ng.gain.linearRampToValueAtTime(0.35, t0 + 0.7);
    ng.gain.linearRampToValueAtTime(0, t0 + 1.1);
    n.connect(bp); bp.connect(ng); ng.connect(dest);
    n.start(t0); n.stop(t0 + 1.2);
    notes.forEach((f, i) => {
      tone(f, t0 + 0.55 + i * 0.11, 0.45, 'triangle', 0.32, dest);
      tone(f * 2, t0 + 0.55 + i * 0.11, 0.25, 'sine', 0.08, dest);
    });
    const tEnd = t0 + 0.55 + notes.length * 0.11;
    notes.forEach((f) => tone(f / 2, tEnd, 1.4, 'sine', 0.16, dest));
    tone(notes[0] / 4, tEnd, 1.2, 'sine', 0.22, dest);
    await sleep((tEnd - c.currentTime + 1.3) * 1000);
    return { ok: true };
  }

  // Petit jingle de rubrique (moins d'une seconde) : un motif différent par rubrique.
  const STINGS = {
    histoire: [392, 523.25, 659.25],
    culture: [523.25, 659.25, 783.99, 1046.5],
    pari: [659.25, 587.33, 659.25, 880],
    ephemeride: [440, 554.37, 659.25, 880],
    feuilleton: [293.66, 349.23, 440, 587.33],
    invite: [523.25, 783.99, 659.25, 1046.5, 1318.51]
  };
  async function playSting(variant) {
    if (!A.ctx || A.ctx.state !== 'running' || !radioChain()) return { ok: false };
    syncRadioVolume(true);
    const c = A.ctx;
    const t0 = c.currentTime + 0.03;
    const dest = R.jingleGain;
    const notes = STINGS[variant] || STINGS.culture;
    notes.forEach((f, i) => {
      tone(f, t0 + i * 0.12, 0.35, 'triangle', 0.3, dest);
      tone(f * 2, t0 + i * 0.12, 0.18, 'sine', 0.07, dest);
    });
    const tEnd = t0 + notes.length * 0.12;
    tone(notes[notes.length - 1] / 2, tEnd, 0.7, 'sine', 0.14, dest);
    if (variant === 'pari') tone(1318.51, tEnd + 0.05, 0.25, 'square', 0.04, dest);
    await sleep((tEnd - c.currentTime + 0.45) * 1000);
    return { ok: true, variant: STINGS[variant] ? variant : 'culture' };
  }

  // Bruitages de plateau, synthétisés (aucun fichier) : applaudissements, acclamations, « ba-dum-tss »,
  // roulement de tambour, buzzer, petite victoire. Ils passent par le même volume que les jingles.
  function noiseHit(start, dur, freq, q, gainPeak, dest, type) {
    const c = A.ctx;
    const n = c.createBufferSource();
    n.buffer = noiseBuffer(Math.max(0.05, dur + 0.05));
    const f = c.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gainPeak, start + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, start + dur);
    n.connect(f); f.connect(g); g.connect(dest);
    n.start(start); n.stop(start + dur + 0.05);
  }
  function drum(start, f0, f1, dur, gainPeak, dest) {
    const c = A.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, start);
    o.frequency.exponentialRampToValueAtTime(f1, start + dur);
    g.gain.setValueAtTime(gainPeak, start);
    g.gain.exponentialRampToValueAtTime(0.0008, start + dur);
    o.connect(g); g.connect(dest);
    o.start(start); o.stop(start + dur + 0.05);
  }
  // Foule : de nombreux claquements de mains au hasard, qui montent puis s'éteignent.
  function crowdClaps(t0, len, density, gainPeak, dest) {
    const n = Math.floor(len * density);
    for (let i = 0; i < n; i++) {
      const x = Math.random();
      const at = t0 + x * len;
      const env = Math.min(1, x / 0.15) * Math.min(1, (1 - x) / 0.35);
      noiseHit(at, 0.05 + Math.random() * 0.04, 900 + Math.random() * 1800, 0.9 + Math.random(), gainPeak * (0.4 + 0.6 * env) * (0.6 + Math.random() * 0.4), dest);
    }
  }
  const SFX_LEN = { applaudissements: 3, acclamations: 3.2, badumtss: 1.3, roulement: 2.1, buzzer: 0.9, victoire: 1.2 };
  async function playSfx(name) {
    if (!A.ctx || A.ctx.state !== 'running' || !radioChain()) return { ok: false };
    if (!SFX_LEN[name]) return { ok: false, reason: 'inconnu' };
    syncRadioVolume(true);
    const c = A.ctx;
    const t0 = c.currentTime + 0.03;
    const dest = R.jingleGain;
    if (name === 'applaudissements') {
      crowdClaps(t0, 2.8, 70, 0.22, dest);
    } else if (name === 'acclamations') {
      crowdClaps(t0, 3, 60, 0.18, dest);
      // Rumeur de foule : un souffle filtré qui gonfle, et quelques « ouh ! » aigus.
      const n = c.createBufferSource(); n.buffer = noiseBuffer(3.2);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.7;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.16, t0 + 0.6); g.gain.linearRampToValueAtTime(0.1, t0 + 2.2); g.gain.linearRampToValueAtTime(0, t0 + 3.1);
      n.connect(bp); bp.connect(g); g.connect(dest); n.start(t0); n.stop(t0 + 3.2);
      for (let i = 0; i < 5; i++) {
        const at = t0 + 0.3 + Math.random() * 1.6;
        const o = c.createOscillator(); const og = c.createGain(); o.type = 'sawtooth';
        const f = 520 + Math.random() * 260;
        o.frequency.setValueAtTime(f, at); o.frequency.linearRampToValueAtTime(f * 1.35, at + 0.25); o.frequency.linearRampToValueAtTime(f * 0.9, at + 0.55);
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
        og.gain.setValueAtTime(0, at); og.gain.linearRampToValueAtTime(0.025, at + 0.08); og.gain.exponentialRampToValueAtTime(0.0008, at + 0.6);
        o.connect(lp); lp.connect(og); og.connect(dest); o.start(at); o.stop(at + 0.65);
      }
    } else if (name === 'badumtss') {
      drum(t0, 220, 110, 0.22, 0.5, dest);
      drum(t0 + 0.2, 160, 80, 0.28, 0.55, dest);
      noiseHit(t0 + 0.42, 0.9, 7000, 0.6, 0.18, dest, 'highpass');
      noiseHit(t0 + 0.42, 0.12, 2500, 1, 0.12, dest);
    } else if (name === 'roulement') {
      for (let i = 0; i < 34; i++) {
        const at = t0 + i * 0.052;
        noiseHit(at, 0.06, 2200, 0.8, 0.06 + 0.16 * (i / 34), dest);
      }
      drum(t0 + 1.8, 180, 70, 0.3, 0.55, dest);
      noiseHit(t0 + 1.8, 0.7, 6500, 0.6, 0.2, dest, 'highpass');
    } else if (name === 'buzzer') {
      tone(110, t0, 0.7, 'square', 0.12, dest);
      tone(116.5, t0, 0.7, 'sawtooth', 0.06, dest);
    } else if (name === 'victoire') {
      [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => { tone(f, t0 + i * 0.09, 0.5, 'triangle', 0.22, dest); tone(f * 2, t0 + i * 0.09, 0.3, 'sine', 0.05, dest); });
      noiseHit(t0 + 0.3, 0.6, 9000, 0.6, 0.05, dest, 'highpass');
    }
    await sleep(SFX_LEN[name] * 1000);
    return { ok: true };
  }

  // Fond sonore des interludes, dans le style de l'ambiance (opts.kit, opts.energy, opts.minor) :
  // une boucle de 4 mesures, programmée un peu à l'avance pour rester en rythme.
  function bedStart(level, opts) {
    if (!A.ctx || A.ctx.state !== 'running' || !radioChain()) return { ok: false };
    bedStop(0);
    const c = A.ctx;
    const K = kitConf(opts || { kit: 'pop', energy: 2 });
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = K.conf.cut; lp.Q.value = 0.5;
    // Le fond reste sous la voix : un peu plus bas pour les familles chargées en percussions.
    const trim = c.createGain(); trim.gain.value = { rock: 0.7, electro: 0.75, funk: 0.8, hiphop: 0.85 }[K.name] || 1;
    lp.connect(trim); trim.connect(R.bedGain);
    R.bedNodes = [lp, trim];
    const beat = 60 / K.bpm;
    const bar = beat * 4;
    let k = 0;
    let next = c.currentTime + 0.1;
    const pump = () => {
      if (!R.bedNodes.length) return;
      while (next < c.currentTime + 1.5) {
        try { bedBar(K, next, beat, K.prog[k % K.prog.length], k, lp); } catch (e) { /* ignore */ }
        next += bar;
        k++;
      }
    };
    pump();
    R.bedTimer = setInterval(pump, 250);
    R.bedKit = K.name;
    const g = R.bedGain.gain;
    g.cancelScheduledValues(c.currentTime);
    g.setValueAtTime(g.value, c.currentTime);
    g.linearRampToValueAtTime(Math.max(0, Math.min(1, Number(level) || 0.5)), c.currentTime + 1.2);
    return { ok: true };
  }

  function bedStop(fadeSec) {
    if (R.bedTimer) { clearInterval(R.bedTimer); R.bedTimer = null; }
    const nodes = R.bedNodes;
    R.bedNodes = [];
    if (!A.ctx || !R.bedGain) return { ok: true };
    const c = A.ctx;
    const g = R.bedGain.gain;
    const f = Math.max(0.05, Number(fadeSec) || 0.05);
    g.cancelScheduledValues(c.currentTime);
    g.setValueAtTime(g.value, c.currentTime);
    g.linearRampToValueAtTime(0, c.currentTime + f);
    setTimeout(() => { for (const n of nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } } }, f * 1000 + 3000);
    return { ok: true };
  }

  function rmsDb() {
    if (!A.analyser || !A.video) return null;
    try {
      A.analyser.getFloatTimeDomainData(A.buf);
      let sum = 0;
      for (let i = 0; i < A.buf.length; i++) sum += A.buf[i] * A.buf[i];
      const rms = Math.sqrt(sum / A.buf.length);
      return rms > 0 ? 20 * Math.log10(rms) : -120;
    } catch (e) {
      return null;
    }
  }

  // --------------------------------------------------------------- search
  function textOf(t) {
    if (!t) return '';
    if (t.simpleText) return t.simpleText;
    if (Array.isArray(t.runs)) return t.runs.map((r) => r.text || '').join('');
    return '';
  }

  function dig(o, path) {
    let x = o;
    for (const k of path) {
      if (!x || typeof x !== 'object') return undefined;
      x = x[k];
    }
    return x;
  }

  function findKey(o, key, depth) {
    if (!o || typeof o !== 'object' || (depth || 0) > 12) return undefined;
    if (o[key]) return o[key];
    for (const k in o) {
      const r = findKey(o[k], key, (depth || 0) + 1);
      if (r) return r;
    }
    return undefined;
  }

  const toSec = (s) => s.split(':').reduce((acc, x) => acc * 60 + Number(x), 0);

  function parseRow(r) {
    const cols = (r.flexColumns || []).map((c) => (c.musicResponsiveListItemFlexColumnRenderer || {}).text || {});
    const runs0 = (cols[0] && cols[0].runs) || [];
    let videoId = (r.playlistItemData && r.playlistItemData.videoId) || '';
    let mvt = '';
    for (const run of runs0) {
      const we = run.navigationEndpoint && run.navigationEndpoint.watchEndpoint;
      if (we && we.videoId) {
        videoId = videoId || we.videoId;
        mvt = dig(we, ['watchEndpointMusicSupportedConfigs', 'watchEndpointMusicConfig', 'musicVideoType']) || mvt;
      }
    }
    if (!videoId) {
      const we = findKey(r.overlay, 'watchEndpoint');
      if (we && we.videoId) {
        videoId = we.videoId;
        mvt = dig(we, ['watchEndpointMusicSupportedConfigs', 'watchEndpointMusicConfig', 'musicVideoType']) || mvt;
      }
    }
    if (!videoId) return null;
    const subRuns = [];
    for (let i = 1; i < cols.length; i++) for (const run of (cols[i].runs || [])) subRuns.push(run);
    for (const fc of (r.fixedColumns || [])) {
      const t = (fc.musicResponsiveListItemFixedColumnRenderer || {}).text;
      if (t && t.runs) for (const run of t.runs) subRuns.push(run);
      else if (t && t.simpleText) subRuns.push({ text: t.simpleText });
    }
    let duration = 0;
    const artists = [];
    for (const run of subRuns) {
      const tx = (run.text || '').trim();
      if (/^\d{1,2}(:\d{2}){1,2}$/.test(tx)) { duration = toSec(tx); continue; }
      const be = run.navigationEndpoint && run.navigationEndpoint.browseEndpoint;
      const pageType = be && dig(be, ['browseEndpointContextSupportedConfigs', 'browseEndpointContextMusicConfig', 'pageType']);
      if (pageType === 'MUSIC_PAGE_TYPE_ARTIST' || pageType === 'MUSIC_PAGE_TYPE_USER_CHANNEL') artists.push(tx);
    }
    return {
      videoId,
      title: runs0.map((x) => x.text || '').join(''),
      artists,
      subtitle: subRuns.map((x) => x.text || '').join(''),
      duration,
      type: mvt
    };
  }

  function parseItems(json) {
    const out = [];
    const seen = new Set();
    const walk = (o, depth) => {
      if (!o || typeof o !== 'object' || depth > 45) return;
      if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return; }
      if (o.musicResponsiveListItemRenderer) {
        const it = parseRow(o.musicResponsiveListItemRenderer);
        if (it && !seen.has(it.videoId)) { seen.add(it.videoId); out.push(it); }
      }
      for (const k in o) if (k !== 'musicResponsiveListItemRenderer') walk(o[k], depth + 1);
    };
    walk(json, 0);
    return out;
  }

  function baseHeaders() {
    const h = { 'Content-Type': 'application/json' };
    const cn = cfg('INNERTUBE_CONTEXT_CLIENT_NAME');
    const cv = cfg('INNERTUBE_CLIENT_VERSION') || dig(cfg('INNERTUBE_CONTEXT'), ['client', 'clientVersion']);
    if (cn) h['X-Youtube-Client-Name'] = String(cn);
    if (cv) h['X-Youtube-Client-Version'] = String(cv);
    return h;
  }

  function apiUrl(path) {
    const key = cfg('INNERTUBE_API_KEY');
    return '/youtubei/v1/' + path + '?prettyPrint=false' + (key ? '&key=' + encodeURIComponent(key) : '');
  }

  async function search(query, songsOnly) {
    const context = cfg('INNERTUBE_CONTEXT');
    if (!context) throw new Error('Configuration YouTube Music introuvable (recharge la page).');
    const body = { context, query: String(query || '') };
    if (songsOnly !== false) body.params = SONGS_PARAMS;
    const res = await fetch(apiUrl('search'), {
      method: 'POST', credentials: 'omit', headers: baseHeaders(), body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Recherche impossible (HTTP ' + res.status + ')');
    return parseItems(await res.json()).slice(0, 12);
  }

  // ------------------------------------------------------- playlist (compte)
  function getCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function sha1Hex(str) {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function authHeaders() {
    const sapisid = getCookie('SAPISID') || getCookie('__Secure-3PAPISID');
    if (!sapisid || !cfg('LOGGED_IN')) return null;
    const ts = Math.floor(Date.now() / 1000);
    const hash = await sha1Hex(ts + ' ' + sapisid + ' ' + ORIGIN);
    const headers = Object.assign(baseHeaders(), {
      Authorization: 'SAPISIDHASH ' + ts + '_' + hash,
      'X-Origin': ORIGIN,
      'X-Goog-AuthUser': String(cfg('SESSION_INDEX') || 0)
    });
    const visitor = cfg('VISITOR_DATA');
    if (visitor) headers['X-Goog-Visitor-Id'] = visitor;
    return headers;
  }

  function authContext() {
    const context = JSON.parse(JSON.stringify(cfg('INNERTUBE_CONTEXT') || {}));
    const delegated = cfg('DELEGATED_SESSION_ID');
    if (delegated) { context.user = context.user || {}; context.user.onBehalfOfUser = delegated; }
    return context;
  }

  async function createPlaylist(title, description, videoIds) {
    const headers = await authHeaders();
    if (!headers) throw new Error('Connecte-toi à YouTube Music pour enregistrer une playlist.');
    const res = await fetch(apiUrl('playlist/create'), {
      method: 'POST', credentials: 'include', headers,
      body: JSON.stringify({ context: authContext(), title, description, privacyStatus: 'PRIVATE', videoIds })
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok || !data || !data.playlistId) {
      const msg = data && data.error && data.error.message;
      throw new Error('Création de la playlist refusée' + (msg ? ' : ' + msg : ' (HTTP ' + res.status + ')'));
    }
    return { playlistId: data.playlistId };
  }

  async function rate(videoId, action) {
    const headers = await authHeaders();
    if (!headers) throw new Error("Connecte-toi à YouTube Music pour utiliser J'aime.");
    const path = action === 'remove' ? 'like/removelike' : action === 'dislike' ? 'like/dislike' : 'like/like';
    const res = await fetch(apiUrl(path), {
      method: 'POST', credentials: 'include', headers,
      body: JSON.stringify({ context: authContext(), target: { videoId } })
    });
    if (!res.ok) throw new Error("YouTube Music a refusé l'action (HTTP " + res.status + ')');
    return true;
  }

  // ------------------------------------------------- playlists et J'aime
  function findContinuation(o) {
    let cmd = null;
    let ncd = null;
    const walk = (x, d) => {
      if (cmd || !x || typeof x !== 'object' || d > 45) return;
      if (x.continuationCommand && x.continuationCommand.token) { cmd = x.continuationCommand.token; return; }
      if (!ncd && x.nextContinuationData && x.nextContinuationData.continuation) ncd = x.nextContinuationData.continuation;
      for (const k in x) walk(x[k], d + 1);
    };
    walk(o, 0);
    return cmd || ncd;
  }

  function playlistPart(json) {
    // Les titres d'une playlist sont dans musicPlaylistShelfRenderer ; on évite ainsi les suggestions.
    const shelf = findKey(json, 'musicPlaylistShelfRenderer');
    return shelf || json;
  }

  async function browseTracks(browseId, max, withAuth) {
    const limit = Math.max(1, Math.min(5000, Number(max) || 500));
    let headers = baseHeaders();
    let context = cfg('INNERTUBE_CONTEXT');
    if (!context) throw new Error('Configuration YouTube Music introuvable (recharge la page).');
    if (withAuth) {
      const h = await authHeaders();
      if (!h) throw new Error("Connecte-toi à YouTube Music pour utiliser tes J'aime.");
      headers = h;
      context = authContext();
    }
    const opts = { method: 'POST', credentials: withAuth ? 'include' : 'omit', headers };
    const out = [];
    const seen = new Set();
    let body = { context, browseId };
    let first = true;
    for (let page = 0; page < 60 && out.length < limit; page++) {
      const res = await fetch(apiUrl('browse'), Object.assign({}, opts, { body: JSON.stringify(body) }));
      if (!res.ok) {
        if (first) throw new Error('Lecture de la playlist impossible (HTTP ' + res.status + ')');
        break;
      }
      const json = await res.json();
      const part = first ? playlistPart(json) : json;
      for (const it of parseItems(part)) {
        if (!seen.has(it.videoId)) { seen.add(it.videoId); out.push(it); }
      }
      const token = findContinuation(part) || (first ? null : findContinuation(json));
      first = false;
      if (!token) break;
      body = { context, continuation: token };
    }
    return out.slice(0, limit);
  }

  const PLAYLISTS_PARAMS = 'EgeKAQQoADgBahIQChADEAUQBBAJEBAQDhAVEBE%3D';

  async function searchPlaylists(query) {
    const context = cfg('INNERTUBE_CONTEXT');
    if (!context) throw new Error('Configuration YouTube Music introuvable (recharge la page).');
    const res = await fetch(apiUrl('search'), {
      method: 'POST', credentials: 'omit', headers: baseHeaders(),
      body: JSON.stringify({ context, query: String(query || ''), params: PLAYLISTS_PARAMS })
    });
    if (!res.ok) throw new Error('Recherche impossible (HTTP ' + res.status + ')');
    const json = await res.json();
    const out = [];
    const walk = (o, depth) => {
      if (!o || typeof o !== 'object' || depth > 45) return;
      if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return; }
      const r = o.musicResponsiveListItemRenderer;
      if (r) {
        const be = r.navigationEndpoint && r.navigationEndpoint.browseEndpoint;
        const pageType = be && dig(be, ['browseEndpointContextSupportedConfigs', 'browseEndpointContextMusicConfig', 'pageType']);
        if (be && be.browseId && pageType === 'MUSIC_PAGE_TYPE_PLAYLIST') {
          const cols = (r.flexColumns || []).map((c) => textOf((c.musicResponsiveListItemFlexColumnRenderer || {}).text));
          out.push({ browseId: be.browseId, title: cols[0] || '', subtitle: cols.slice(1).join(' • ') });
        }
        return;
      }
      for (const k in o) walk(o[k], depth + 1);
    };
    walk(json, 0);
    return out.slice(0, 10);
  }

  // ---------------------------------------------- artistes similaires
  const normName = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
  const pageTypeOf = (be) => dig(be, ['browseEndpointContextSupportedConfigs', 'browseEndpointContextMusicConfig', 'pageType']);

  // Page artiste YouTube Music à partir d'un nom (via la recherche de titres).
  async function findArtist(name) {
    const context = cfg('INNERTUBE_CONTEXT');
    if (!context) throw new Error('Configuration YouTube Music introuvable (recharge la page).');
    const res = await fetch(apiUrl('search'), {
      method: 'POST', credentials: 'omit', headers: baseHeaders(),
      body: JSON.stringify({ context, query: String(name || ''), params: SONGS_PARAMS })
    });
    if (!res.ok) throw new Error('Recherche impossible (HTTP ' + res.status + ')');
    const json = await res.json();
    const want = normName(name);
    let first = null;
    let exact = null;
    const walk = (o, d) => {
      if (exact || !o || typeof o !== 'object' || d > 50) return;
      if (Array.isArray(o)) { for (const x of o) walk(x, d + 1); return; }
      const be = o.navigationEndpoint && o.navigationEndpoint.browseEndpoint;
      if (typeof o.text === 'string' && be && be.browseId && pageTypeOf(be) === 'MUSIC_PAGE_TYPE_ARTIST') {
        const hit = { id: be.browseId, name: o.text };
        if (!first) first = hit;
        if (normName(o.text) === want) { exact = hit; return; }
      }
      for (const k in o) walk(o[k], d + 1);
    };
    walk(json, 0);
    return exact || first;
  }

  // Titres les plus écoutés et « Vous aimerez peut-être aussi » d'un artiste.
  // Présentation de l'artiste (en-tête ou bloc « À propos » de sa page).
  function aboutText(json, head) {
    const txt = (o) => (o && o.runs ? o.runs.map((r) => r.text || '').join('') : (o && o.simpleText) || '');
    let t = head ? txt(head.description) : '';
    if (!t) {
      const d = findKey(json, 'musicDescriptionShelfRenderer');
      if (d) t = txt(d.description);
    }
    t = String(t || '').replace(/\s+/g, ' ').trim();
    if (t.length > 1000) t = t.slice(0, 1000).replace(/[^.!?]*$/, '') || t.slice(0, 1000);
    return t;
  }

  async function artistPage(browseId, nSongs) {
    const context = cfg('INNERTUBE_CONTEXT');
    if (!context) throw new Error('Configuration YouTube Music introuvable (recharge la page).');
    const res = await fetch(apiUrl('browse'), {
      method: 'POST', credentials: 'omit', headers: baseHeaders(),
      body: JSON.stringify({ context, browseId })
    });
    if (!res.ok) throw new Error('Page artiste illisible (HTTP ' + res.status + ')');
    const json = await res.json();
    const head = json.header && (json.header.musicImmersiveHeaderRenderer || json.header.musicVisualHeaderRenderer || json.header.musicHeaderRenderer);
    const name = head && head.title && head.title.runs ? head.title.runs.map((r) => r.text || '').join('') : '';
    const list = findKey(json, 'sectionListRenderer');
    const sections = (list && list.contents) || [];
    let songs = [];
    let moreId = '';
    let similar = [];
    for (const sec of sections) {
      if (sec.musicShelfRenderer && !songs.length) {
        const shelf = sec.musicShelfRenderer;
        songs = parseItems(shelf.contents || []);
        const be = (shelf.bottomEndpoint && shelf.bottomEndpoint.browseEndpoint) ||
          dig(shelf, ['title', 'runs', 0, 'navigationEndpoint', 'browseEndpoint']);
        if (be && be.browseId) moreId = be.browseId;
      }
      const car = sec.musicCarouselShelfRenderer;
      if (car && car.contents && car.contents.length) {
        const items = car.contents.map((c) => c.musicTwoRowItemRenderer).filter(Boolean);
        const artists = items.filter((it) => it.navigationEndpoint && it.navigationEndpoint.browseEndpoint &&
          pageTypeOf(it.navigationEndpoint.browseEndpoint) === 'MUSIC_PAGE_TYPE_ARTIST');
        if (artists.length && artists.length === items.length) {
          similar = artists.map((it) => ({
            id: it.navigationEndpoint.browseEndpoint.browseId,
            name: (it.title && it.title.runs ? it.title.runs.map((r) => r.text || '').join('') : '')
          })).filter((x) => x.id && x.name);
        }
      }
    }
    const want = Math.max(1, Math.min(50, Number(nSongs) || 5));
    if (want > songs.length && moreId) {
      try {
        const more = await browseTracks(moreId, want, false);
        const seen = new Set(songs.map((x) => x.videoId));
        for (const it of more) if (!seen.has(it.videoId)) { seen.add(it.videoId); songs.push(it); }
      } catch (e) { /* on garde le top 5 */ }
    }
    for (const it of songs) if (!it.artists || !it.artists.length) it.artists = name ? [name] : [];
    return { id: browseId, name, songs: songs.slice(0, want), similar, about: aboutText(json, head) };
  }

  // -------------------------------------------------------------- lecture
  // YouTube interdit le lecteur réduit pour les contenus « conçus pour les enfants » :
  // dans ce cas on laisse la page du lecteur ouverte pour que la musique continue.
  function miniplayerAllowed() {
    try {
      const p = player();
      const pr = p && p.getPlayerResponse && p.getPlayerResponse();
      const mode = dig(pr, ['playabilityStatus', 'miniplayer', 'miniplayerRenderer', 'playbackMode']);
      return !mode || mode === 'PLAYBACK_MODE_ALLOW';
    } catch (e) {
      return true;
    }
  }

  async function play(videoId, opts) {
    opts = opts || {};
    track.expectId = videoId;
    track.playAt = Date.now();
    track.ourPauseAt = Date.now() + 3000;
    track.held = null;
    const a = app();
    const p = player();
    const wasPageOpen = !!(a && a.playerUiState === 'PLAYER_PAGE_OPEN');
    const ep = {
      commandMetadata: { webCommandMetadata: { url: '/watch?v=' + videoId, webPageType: 'WEB_PAGE_TYPE_WATCH', rootVe: 3832 } },
      watchEndpoint: {
        videoId,
        watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { musicVideoType: opts.type || 'MUSIC_VIDEO_TYPE_ATV' } }
      }
    };
    let method = '';
    let ok = false;
    if (a) {
      try {
        a.dispatchEvent(new CustomEvent('yt-navigate', { bubbles: true, composed: true, detail: { endpoint: ep } }));
        method = 'navigate';
      } catch (e) { /* ignore */ }
      ok = await waitFor(() => currentId() === videoId, 5000);
    }
    if (!ok && p && typeof p.loadVideoById === 'function') {
      try { p.loadVideoById(videoId); method = 'load'; } catch (e) { /* ignore */ }
      ok = await waitFor(() => currentId() === videoId, 5000);
    }
    let kids = false;
    if (ok && a && !wasPageOpen && !opts.showPage) {
      // YouTube Music ouvre la page du lecteur : on la referme si elle était fermée,
      // sauf pour les contenus où le lecteur réduit est interdit (sinon la lecture s'arrête).
      const opened = await waitFor(() => a.playerUiState === 'PLAYER_PAGE_OPEN', 1500);
      await sleep(300);
      kids = !miniplayerAllowed();
      if (opened && !kids) {
        const btn = document.querySelector('ytmusic-player-bar .toggle-player-page-button');
        if (btn) btn.click();
        // Filet de sécurité : si la réduction a mis la lecture en pause, on rouvre et on relance.
        await sleep(1200);
        const st = p && p.getPlayerState ? p.getPlayerState() : -1;
        if (currentId() === videoId && st === 2 && a.playerUiState !== 'PLAYER_PAGE_OPEN') {
          const b2 = document.querySelector('ytmusic-player-bar .toggle-player-page-button');
          if (b2) b2.click();
          if (p && p.playVideo) p.playVideo();
          kids = true;
        }
      }
    }
    // Le nouveau titre doit vraiment jouer : après un interlude, le lecteur était en pause.
    if (ok && p && typeof p.getPlayerState === 'function') {
      for (let i = 0; i < 4; i++) {
        let st = -2;
        try { st = p.getPlayerState(); } catch (e) { /* ignore */ }
        if (st === 1 || st === 3) break;
        if (currentId() === videoId && (st === 2 || st === 5 || st === -1) && p.playVideo) {
          try { p.playVideo(); } catch (e) { /* ignore */ }
        }
        await sleep(600);
      }
    }
    if (ok) attachVideo();
    return { ok, method, kids };
  }

  // ------------------------------------------- fins de titre et déplacements
  const track = { lastEnded: null, lastSeek: null, el: null };
  // Petit journal du pont, renvoyé au journal technique de Mood DJ.
  function blog(msg, data) { send({ kind: 'evt', type: 'log', msg, data }); }

  // Fin de titre retenue : on met en pause juste avant la fin pour que YouTube Music
  // n'enchaîne pas son propre titre (bout de musique à plein volume, coupure sèche).
  // Vraie durée du titre. Vers la fin, YouTube Music précharge son titre suivant pour l'enchaîner
  // sans blanc : getDuration() gonfle alors d'une quinzaine de secondes. La durée officielle
  // (videoDetails.lengthSeconds) ne bouge pas.
  function realDuration(p, v) {
    let d = 0;
    try { d = (p && p.getDuration && p.getDuration()) || 0; } catch (e) { d = 0; }
    if (!d && v && isFinite(v.duration)) d = v.duration;
    let len = 0;
    try {
      const r = p && p.getPlayerResponse && p.getPlayerResponse();
      const vd = r && r.videoDetails;
      if (vd && (!vd.videoId || vd.videoId === currentId())) len = Number(vd.lengthSeconds) || 0;
    } catch (e) { len = 0; }
    const id = currentId();
    if (len > 20 && (!d || d > len + 2)) {
      if (d && track.inflated !== id) { track.inflated = id; blog('durée gonflée par YouTube Music (préchargement) : ' + Math.round(d) + ' s au lieu de ' + len + ' s'); }
      return len + 0.5;
    }
    // Deuxième garde-fou : la durée vue en début de titre ne doit pas gonfler ensuite
    // (la fiche du titre peut elle aussi basculer sur le titre préchargé).
    let t = 0;
    try { t = (p && p.getCurrentTime && p.getCurrentTime()) || 0; } catch (e) { t = 0; }
    const locks = track.durLock || (track.durLock = {});
    if (id && d > 20 && t > 3 && t < d - 30 && !locks[id]) {
      locks[id] = d;
      const ids = Object.keys(locks);
      if (ids.length > 60) delete locks[ids[0]];
    }
    const locked = id && locks[id];
    if (locked && d > locked + 2) {
      if (track.inflated !== id) { track.inflated = id; blog('durée gonflée par YouTube Music : ' + Math.round(d) + ' s au lieu de ' + Math.round(locked) + ' s'); }
      return locked;
    }
    return d;
  }

  function checkHold() {
    if (!interceptNext) return;
    const v = videoEl();
    const p = player();
    if (!v || v.paused || !p) return;
    if (p.classList && p.classList.contains('ad-showing')) return;
    let dur = 0;
    let t = 0;
    try { dur = realDuration(p, v); t = p.getCurrentTime ? p.getCurrentTime() : v.currentTime; } catch (e) { return; }
    if (!isFinite(dur) || dur < 20) return;
    const rem = dur - t;
    const id = currentId();
    // On garde la dernière mesure du titre précédent : le nouveau titre envoie ses propres mesures avant « playing ».
    if (track.lastRem && track.lastRem.id !== id) track.prevRem = track.lastRem;
    track.lastRem = { id, rem, at: Date.now() };
    // Musique déjà fondue au silence : on retient plus tôt, car YouTube Music enchaîne parfois 1 à 1,5 s avant la fin.
    let g = 1;
    try { g = currentGain(); } catch (e) { g = 1; }
    const holdAt = g <= 0.1 ? 1.7 : 0.7;
    if (rem > holdAt || rem < -1 || (track.held && track.held.id === id)) return;
    track.held = { id, at: Date.now() };
    try { p.pauseVideo ? p.pauseVideo() : v.pause(); } catch (e) { /* ignore */ }
    blog('fin de titre retenue (évite l\'enchaînement de YouTube Music)', { id, reste: Math.round(rem * 100) / 100 });
    setTimeout(() => {
      // Mood DJ a pris le relais (interlude en cours) : la fin reste retenue jusqu'à son titre.
      if (track.held && track.held.ack) return;
      if (track.held && track.held.id === id && currentId() === id && interceptNext) {
        blog('fin retenue sans relève depuis 8 s : YouTube Music reprend la main');
        track.held = null;
        try { p.playVideo(); } catch (e) { /* ignore */ }
      }
    }, 8000);
  }

  function checkForeign() {
    const id = currentId();
    if (!id || id === track.lastSeenId) return;
    const prev = track.lastSeenId;
    track.lastSeenId = id;
    if (!interceptNext || !prev || id === track.expectId || Date.now() - (track.playAt || 0) < 3000) return;
    const p = player();
    if (p && p.classList && p.classList.contains('ad-showing')) return;
    fadeTo(0, 0.03);
    const lr = [track.lastRem, track.prevRem].find((r) => r && r.id === prev);
    if (lr && lr.rem < 3 && Date.now() - lr.at < 3000) {
      blog('fin de titre : YouTube Music a enchaîné son propre titre ' + (Math.round(lr.rem * 10) / 10) + ' s avant la fin annoncée ; son coupé, Mood DJ reprend', { de: prev, vers: id });
    } else {
      blog('titre lancé hors de Mood DJ : son coupé en attendant Mood DJ', { de: prev, vers: id });
    }
  }

  function watchVideo() {
    const v = videoEl();
    if (!v || v === track.el) return;
    track.el = v;
    v.addEventListener('timeupdate', checkHold);
    v.addEventListener('playing', checkForeign);
    v.addEventListener('loadeddata', checkForeign);
    v.addEventListener('ended', () => { track.lastEnded = { id: currentId(), at: Date.now() }; });
    // Qui a mis la musique en pause ? (pour le journal technique)
    v.addEventListener('pause', () => {
      if (!interceptNext) return;
      const now = Date.now();
      const pl = player();
      if (v.ended || (isFinite(v.duration) && v.duration - v.currentTime < 1.5)) return;
      if (pl && pl.classList && pl.classList.contains('ad-showing')) return;
      let qui;
      if (now - (track.ourPauseAt || 0) < 2000 || (track.held && track.held.id === currentId())) qui = 'par Mood DJ';
      else if (youThereShown()) qui = 'par YouTube Music (fenêtre « Toujours là ? »)';
      else if (now - (track.pageActionAt || 0) < 2500) qui = 'par toi, sur la page YouTube Music';
      else qui = "depuis l'extérieur de la page (touche multimédia, casque, système, ou YouTube Music lui-même)";
      let t = 0;
      try { t = v.currentTime; } catch (e) { t = 0; }
      track.pausedAt = now;
      if (qui !== 'par Mood DJ') blog('musique mise en pause ' + qui, { t: Math.round(t * 10) / 10, onglet_cache: document.hidden });
    });
    v.addEventListener('play', () => {
      if (!interceptNext || !track.pausedAt) return;
      const secs = Math.round((Date.now() - track.pausedAt) / 1000);
      track.pausedAt = 0;
      if (secs >= 3) blog('musique relancée après ' + secs + ' s de pause');
    });
    v.addEventListener('seeking', () => {
      const p = player();
      let dur = 0;
      try { dur = (p && p.getDuration && p.getDuration()) || v.duration || 0; } catch (e) { dur = v.duration || 0; }
      track.lastSeek = { id: currentId(), to: v.currentTime, dur, at: Date.now() };
    });
  }

  // -------------------------------------------- bouton « suivant » de YTM
  let interceptNext = false;
  let lastNextAt = 0;
  document.addEventListener('click', (e) => {
    if (!interceptNext) return;
    const path = e.composedPath ? e.composedPath() : [];
    const inBar = (cls) => path.some((el) => el && el.classList && el.classList.contains(cls) &&
      el.closest && el.closest('ytmusic-player-bar'));
    const isNext = inBar('next-button');
    const isPrev = !isNext && inBar('previous-button');
    if (!isNext && !isPrev) return;
    // Mood DJ est prioritaire : YouTube Music ne traite pas ce clic (sinon il lance
    // son propre titre en même temps que Mood DJ).
    e.preventDefault();
    e.stopImmediatePropagation();
    const now = Date.now();
    if (now - lastNextAt < 400) return;
    lastNextAt = now;
    if (isNext) fadeTo(0, 0);
    send({ kind: 'evt', type: isNext ? 'next' : 'prev' });
  }, true);

  document.addEventListener('pointerdown', () => { track.pageActionAt = Date.now(); }, true);
  document.addEventListener('keydown', (e) => { if (!/^Media/.test(e.key || '')) track.pageActionAt = Date.now(); }, true);

  // Raccourcis clavier de YouTube Music (Maj+N, Maj+P) et touches multimédia du clavier.
  document.addEventListener('keydown', (e) => {
    if (!interceptNext) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''))) return;
    const k = e.key || '';
    const isNext = k === 'MediaTrackNext' || (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (k === 'N' || k === 'n'));
    const isPrev = k === 'MediaTrackPrevious' || (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (k === 'P' || k === 'p'));
    if (!isNext && !isPrev) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const now = Date.now();
    if (now - lastNextAt < 400) return;
    lastNextAt = now;
    if (isNext) fadeTo(0, 0);
    send({ kind: 'evt', type: isNext ? 'next' : 'prev' });
  }, true);

  // Fenêtre « Vous êtes toujours là ? » de YouTube Music : confirmée pour ne pas couper la musique.
  let lastYouThere = 0;
  const STILL_THERE = /toujours l[àa]|still (there|watching|listening)|continuer (à|a) (regarder|écouter)|continue (watching|listening)|vidéo (a été )?mise en pause|video paused/i;
  // Fenêtre « Vous êtes toujours là ? » (ancienne et nouvelle présentation de YouTube Music).
  function nodeShown(d) {
    if (!d || !d.isConnected) return false;
    const dlg = d.closest('tp-yt-paper-dialog') || d;
    return d.offsetParent !== null || (getComputedStyle(dlg).display !== 'none' && !dlg.hasAttribute('aria-hidden'));
  }
  function youThereNode() {
    for (const d of document.querySelectorAll('ytmusic-you-there-renderer')) if (nodeShown(d)) return d;
    for (const c of document.querySelectorAll('tp-yt-paper-dialog, yt-confirm-dialog-renderer, ytmusic-popup-container [role="dialog"]')) {
      if (STILL_THERE.test((c.textContent || '').slice(0, 400)) && nodeShown(c)) return c;
    }
    return null;
  }
  function youThereShown() { return !!youThereNode(); }
  function dismissYouThere() {
    if (!interceptNext) return;
    if (!youThereShown()) return;
    const d = youThereNode();
    const now = Date.now();
    if (now - lastYouThere < 4000) return;
    const YES = /oui|yes|continuer|continue/i;
    const real = Array.from(d.querySelectorAll('button, tp-yt-paper-button, [role="button"]'));
    const wrap = Array.from(d.querySelectorAll('#confirm-button, yt-button-renderer, yt-button-shape'));
    const b = real.find((x) => YES.test(x.textContent || '')) || wrap.find((x) => YES.test(x.textContent || '')) || real[0] || wrap[0];
    if (!b) return;
    lastYouThere = now;
    try { b.click(); } catch (e) { /* ignore */ }
    setTimeout(() => {
      const p = player();
      try { if (p && p.getPlayerState && p.getPlayerState() === 2 && p.playVideo) p.playVideo(); } catch (e) { /* ignore */ }
    }, 700);
    send({ kind: 'evt', type: 'youthere' });
  }

  function claimMediaKeys() {
    if (!interceptNext || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        lastNextAt = Date.now();
        fadeTo(0, 0);
        send({ kind: 'evt', type: 'next' });
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        lastNextAt = Date.now();
        send({ kind: 'evt', type: 'prev' });
      });
    } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------ état
  function state() {
    const p = player();
    const v = videoEl();
    let d = {};
    try { d = (p && p.getVideoData && p.getVideoData()) || {}; } catch (e) { d = {}; }
    let st = -1;
    try { st = p && p.getPlayerState ? p.getPlayerState() : -1; } catch (e) { /* ignore */ }
    const a = app();
    let time = 0;
    try { time = p && p.getCurrentTime ? p.getCurrentTime() : (v ? v.currentTime : 0); } catch (e) { time = v ? v.currentTime : 0; }
    return {
      videoId: d.video_id || '',
      title: d.title || '',
      author: d.author || '',
      time: Number(time) || 0,
      duration: realDuration(p, v),
      state: st,
      paused: v ? v.paused : true,
      ad: !!(p && p.classList && p.classList.contains('ad-showing')),
      rmsDb: rmsDb(),
      audio: !!(A.ctx && A.ctx.state === 'running' && A.video),
      gain: currentGain(),
      rate: v ? v.playbackRate : 1,
      volume: A.volFallback.base !== null ? A.volFallback.base : (p && p.getVolume ? p.getVolume() : 100),
      muted: !!(p && p.isMuted && p.isMuted()),
      loggedIn: !!cfg('LOGGED_IN'),
      pageOpen: !!(a && a.playerUiState === 'PLAYER_PAGE_OPEN'),
      lastEnded: track.lastEnded,
      lastSeek: track.lastSeek,
      held: track.held && track.held.id === (d.video_id || '') ? track.held : null,
      voiceVol: R.master ? Math.round(R.master.gain.value * 100) / 100 : null
    };
  }

  // Chrome ralentit les minuteurs d'un onglet caché resté silencieux plusieurs minutes (un tic par
  // minute). Après une longue pause, le titre suivant pouvait jouer 28 s volume coupé avant que
  // Mood DJ le voie démarrer. Les évènements du lecteur (playing, timeupdate) ne sont pas ralentis :
  // ils envoient aussi l'état.
  let lastStateAt = 0;
  function pushState() {
    lastStateAt = Date.now();
    send({ kind: 'evt', type: 'state', data: state() });
  }
  function onMediaTick() {
    if (Date.now() - lastStateAt < 450) return;
    checkForeign();
    syncRadioVolume(false);
    pushState();
  }
  function watchMediaTicks() {
    const v = videoEl();
    if (!v || v === track.tickEl) return;
    track.tickEl = v;
    v.addEventListener('timeupdate', onMediaTick);
    v.addEventListener('playing', () => { lastStateAt = 0; onMediaTick(); });
  }

  setInterval(() => {
    watchVideo();
    watchMediaTicks();
    if (A.ctx && videoEl() !== A.video) attachVideo();
    claimMediaKeys();
    dismissYouThere();
    checkHold();
    checkForeign();
    syncRadioVolume(false);
    pushState();
  }, 500);

  // ------------------------------------------------------------- RPC
  const methods = {
    ping: () => ({ ok: true, hasPlayer: !!player(), loggedIn: !!cfg('LOGGED_IN') }),
    initAudio: () => initAudio(),
    stopVoice: () => stopVoice(),
    state: () => state(),
    search: (q, songsOnly) => search(q, songsOnly),
    play: (videoId, opts) => play(videoId, opts),
    pause: () => {
      track.ourPauseAt = Date.now();
      if (X.frame) xfadeDrop('pause');
      const p = player();
      // Pause demandée par Mood DJ sur une fin retenue (interlude) : la retenue tient jusqu'au titre
      // suivant de Mood DJ, avec un garde-fou de 2 minutes s'il ne venait jamais.
      const h = track.held;
      if (h && h.id === currentId() && !h.ack) {
        h.ack = true;
        setTimeout(() => {
          if (track.held === h && currentId() === h.id && interceptNext) {
            blog('fin retenue sans relève depuis 2 min : YouTube Music reprend la main');
            track.held = null;
            try { p.playVideo(); } catch (e) { /* ignore */ }
          }
        }, 120000);
      }
      if (p && p.pauseVideo) p.pauseVideo();
      return true;
    },
    resume: () => { const p = player(); if (p && p.playVideo) p.playVideo(); return true; },
    seek: (t) => {
      const p = player();
      const x = Math.max(0, Number(t) || 0);
      if (p && p.seekTo) p.seekTo(x, true);
      else { const v = videoEl(); if (v) v.currentTime = x; }
      return true;
    },
    fadeTo: (target, secs) => { fadeTo(target, secs); return true; },
    xfadePrep: (id, t) => xfadePrep(id, t),
    xfadeStatus: () => xfadeStatus(),
    xfadeGo: (secs) => xfadeGo(secs),
    xfadeDrop: (why) => xfadeDrop(why),
    setEq: (eq) => { A.eq = Object.assign({ bass: 0, mid: 0, treble: 0 }, eq || {}); applyEq(); return true; },
    setBoost: (on) => { A.boost = !!on; applyBoost(); return true; },
    setRate: (r) => {
      const v = videoEl();
      if (v) { v.preservesPitch = true; v.playbackRate = Math.max(0.5, Math.min(2, Number(r) || 1)); }
      return true;
    },
    setInterceptNext: (on) => { interceptNext = !!on; return true; },
    createPlaylist: (title, description, ids) => createPlaylist(title, description, ids),
    browseTracks: (browseId, max, withAuth) => browseTracks(browseId, max, withAuth),
    rate: (videoId, action) => rate(videoId, action),
    setVolume: (v) => {
      const p = player();
      if (!p || !p.setVolume) return false;
      const x = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
      if (A.volFallback.base !== null) A.volFallback.base = x;
      if (p.isMuted && p.isMuted() && x > 0 && p.unMute) p.unMute();
      p.setVolume(A.volFallback.base !== null ? Math.round(x * A.volFallback.gain) : x);
      return true;
    },
    ytNext: () => { const p = player(); if (p && p.nextVideo) p.nextVideo(); return true; },
    playVoice: (buf) => playVoice(buf),
    playJingle: (variant, opts) => playJingle(variant, opts),
    playSting: (variant) => playSting(variant),
    playSfx: (name) => playSfx(name),
    bedStart: (level, opts) => bedStart(level, opts),
    bedStop: (fade) => bedStop(fade),
    ytPrev: () => { const p = player(); if (p && p.previousVideo) p.previousVideo(); return true; },
    searchPlaylists: (q) => searchPlaylists(q),
    findArtist: (name) => findArtist(name),
    artistPage: (id, n) => artistPage(id, n)
  };

  window.addEventListener('message', async (e) => {
    if (e.source !== window) return;
    const m = e.data;
    if (!m || m.__mdj !== 'content' || m.kind !== 'req' || typeof m.method !== 'string') return;
    const fn = methods[m.method];
    if (!fn) { send({ kind: 'res', id: m.id, ok: false, error: 'Méthode inconnue' }); return; }
    try {
      const result = await fn.apply(null, Array.isArray(m.args) ? m.args : []);
      send({ kind: 'res', id: m.id, ok: true, result });
    } catch (err) {
      send({ kind: 'res', id: m.id, ok: false, error: String((err && err.message) || err) });
    }
  });

  send({ kind: 'evt', type: 'ready' });
})();
