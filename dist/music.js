(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const card = $('chapter-music');
  const audio = $('chapter-audio');
  if (!card || !audio) return;
  const toggle = $('music-toggle');
  const status = $('music-status');
  const slider = $('music-volume');
  const settings = $('music-settings');
  const settingsToggle = $('music-settings-toggle');
  const STORAGE_KEY = 'w38-music-volume-v1';
  let catalog = null;
  let track = null;
  let chapterId = null;
  let loadedId = null;
  let wanted = false;
  let version = 0;
  let confirmedVersion = null;
  let phase = 'paused';
  let switchTimer = 0;
  let loadTimer = 0;
  let fadeFrame = 0;
  let context = null;
  let transitionGain = null;
  let volumeGain = null;
  let volume = 0.24;
  let transitionLevel = 0;
  let graphAttempted = false;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null && Number.isFinite(Number(saved))) volume = Math.max(0, Math.min(1, Number(saved)));
  } catch { /* Music controls still work without persistent storage. */ }
  slider.value = String(Math.round(volume * 100));

  function paint(message) {
    card.dataset.state = phase;
    toggle.disabled = !track;
    toggle.setAttribute('aria-pressed', String(wanted));
    toggle.setAttribute('aria-label', wanted ? '배경음악 일시정지' : '배경음악 재생');
    $('music-toggle-icon').setAttribute('href', wanted ? '#i-music-pause' : '#i-music-play');
    if (message !== undefined) status.textContent = message;
  }

  function paintVolume() {
    const percent = Math.round(volume * 100);
    $('music-volume-value').textContent = `${percent}%`;
    slider.setAttribute('aria-valuetext', `${percent}%`);
    if (volumeGain) volumeGain.gain.setValueAtTime(volume, context.currentTime);
    else audio.volume = volume * transitionLevel;
  }

  function ensureAudioGraph() {
    if (graphAttempted) return;
    graphAttempted = true;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      context = new AudioContext();
      const source = context.createMediaElementSource(audio);
      transitionGain = context.createGain();
      volumeGain = context.createGain();
      transitionGain.gain.value = 0;
      volumeGain.gain.value = volume;
      source.connect(transitionGain).connect(volumeGain).connect(context.destination);
      audio.volume = 1;
      context.addEventListener('statechange', () => {
        if (wanted && confirmedVersion === version && context.state !== 'running') {
          fail('음악이 일시 중단됐어요. 재생을 눌러 이어 들어 주세요.');
        }
      });
    } catch {
      context?.close().catch(() => {});
      context = null;
      transitionGain = null;
      volumeGain = null;
    }
  }

  function level(value, seconds = 0) {
    cancelAnimationFrame(fadeFrame);
    if (transitionGain) {
      const gain = transitionGain.gain;
      const now = context.currentTime;
      if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
      else {
        const current = gain.value;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(current, now);
      }
      if (seconds) gain.linearRampToValueAtTime(value, now + seconds);
      else gain.setValueAtTime(value, now);
      transitionLevel = value;
      return;
    }
    const from = transitionLevel;
    const began = performance.now();
    function step(now) {
      const fraction = seconds ? Math.min(1, (now - began) / (seconds * 1000)) : 1;
      transitionLevel = from + (value - from) * fraction;
      audio.volume = volume * transitionLevel;
      if (fraction < 1) fadeFrame = requestAnimationFrame(step);
    }
    step(began);
  }

  function cancelPending() {
    ++version;
    confirmedVersion = null;
    clearTimeout(switchTimer);
    clearTimeout(loadTimer);
    switchTimer = 0;
  }

  function pause(message = '음악을 잠시 멈췄어요.') {
    cancelPending();
    wanted = false;
    audio.pause();
    level(0);
    phase = 'paused';
    paint(message);
  }

  function fail(message) {
    pause(message);
    phase = 'error';
    paint();
  }

  function watchLoading(token) {
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => {
      if (token === version && wanted) fail('음악을 불러오지 못했어요. 재생을 눌러 다시 시도해 주세요.');
    }, 20000);
  }

  // Called directly from the first click: play() and resume() keep that user gesture.
  function play(token) {
    if (token !== version || !wanted || !track) return;
    ensureAudioGraph();
    level(0);
    if (loadedId !== chapterId || audio.error) {
      audio.pause();
      audio.src = track.src;
      audio.load();
      loadedId = chapterId;
    }
    phase = 'loading';
    paint('음악을 불러오고 있어요…');
    watchLoading(token);
    const resume = context ? context.resume() : Promise.resolve();
    const started = audio.play();
    Promise.all([resume, started]).then(() => {
      // An old play result must never stop or relabel a newer chapter's music.
      if (token !== version || !wanted) return;
      if (audio.paused || (context && context.state !== 'running')) {
        fail('재생을 한 번 더 눌러 음악을 시작해 주세요.');
        return;
      }
      confirmedVersion = token;
      clearTimeout(loadTimer);
      level(1, 1.3);
      phase = 'playing';
      paint('이야기 곁에서 조용히 흐르는 음악');
    }).catch(error => {
      if (token !== version || !wanted) return;
      fail(error.name === 'NotAllowedError'
        ? '재생을 한 번 더 눌러 음악을 시작해 주세요.'
        : '음악을 불러오지 못했어요. 재생을 눌러 다시 시도해 주세요.');
    });
  }

  function selectChapter(id) {
    if (id === chapterId && track) return;
    cancelPending();
    chapterId = id;
    track = catalog?.tracks[id] || null;
    if (!track) {
      pause('이 장의 음악을 준비하고 있어요.');
      card.hidden = true;
      return;
    }
    card.hidden = false;
    $('music-title').textContent = track.title;
    $('music-title').href = track.page;
    $('music-caption').textContent = track.caption;
    settings.hidden = true;
    settingsToggle.setAttribute('aria-expanded', 'false');
    if (!wanted) {
      audio.pause();
      level(0);
      if (loadedId !== id) {
        audio.removeAttribute('src');
        audio.load();
        loadedId = null;
      }
      phase = 'paused';
      paint('재생을 누르면 음악이 시작돼요.');
      return;
    }
    phase = 'loading';
    paint('다음 이야기의 음악으로…');
    const token = version;
    level(0, 0.45);
    switchTimer = setTimeout(() => {
      switchTimer = 0;
      if (token === version && wanted) play(token);
    }, 450);
  }

  function syncReader() {
    const reader = $('reader-view');
    selectChapter(reader.hidden ? null : reader.dataset.chapter);
  }

  toggle.addEventListener('click', () => {
    if (!track) return;
    if (wanted) pause();
    else {
      cancelPending();
      wanted = true;
      play(version);
    }
  });
  slider.addEventListener('input', () => {
    volume = Math.max(0, Math.min(1, Number(slider.value) / 100));
    paintVolume();
    try { localStorage.setItem(STORAGE_KEY, String(volume)); } catch { /* Optional preference. */ }
  });
  settingsToggle.addEventListener('click', () => {
    settings.hidden = !settings.hidden;
    settingsToggle.setAttribute('aria-expanded', String(!settings.hidden));
  });
  card.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !settings.hidden) {
      settings.hidden = true;
      settingsToggle.setAttribute('aria-expanded', 'false');
      settingsToggle.focus();
    }
  });
  audio.addEventListener('waiting', () => {
    if (!wanted || audio.paused || loadedId !== chapterId || switchTimer) return;
    phase = 'loading';
    paint('음악을 불러오고 있어요…');
    watchLoading(version);
  });
  audio.addEventListener('playing', () => {
    if (!wanted) { audio.pause(); return; }
    // The media element can play before the Web Audio context is unlocked.
    if (audio.paused || loadedId !== chapterId || switchTimer || confirmedVersion !== version || (context && context.state !== 'running')) return;
    clearTimeout(loadTimer);
    phase = 'playing';
    paint('이야기 곁에서 조용히 흐르는 음악');
  });
  audio.addEventListener('pause', () => {
    if (audio.paused && wanted && phase === 'playing' && !switchTimer) pause();
  });
  audio.addEventListener('error', () => {
    if (wanted && !switchTimer && audio.error) fail('음악을 불러오지 못했어요. 재생을 눌러 다시 시도해 주세요.');
  });
  window.addEventListener('w38:reader-change', syncReader);
  window.addEventListener('pagehide', () => pause());
  paintVolume();
  fetch('./content/music.json').then(response => {
    if (!response.ok) throw new Error('Music catalog unavailable');
    return response.json();
  }).then(data => {
    catalog = data;
    syncReader();
  }).catch(() => {
    // A failed soundtrack must not interfere with the manuscript or reader.
    card.hidden = true;
  });
})();
