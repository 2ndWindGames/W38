(() => {
  'use strict';

  const STORAGE_KEY = 'w38-library-reader-v1';
  const TEXT_URL = './content/manuscript.txt';
  const $ = (id) => document.getElementById(id);
  const ui = Object.fromEntries([
    'library-view', 'reader-view', 'main-content', 'reading-main', 'open-book',
    'open-book-label', 'cover-button', 'resume-label', 'desktop-chapter-list',
    'mobile-chapter-list', 'chapter-number', 'chapter-title', 'chapter-period',
    'current-chapter-label', 'chapter-body', 'previous-chapter',
    'previous-chapter-title', 'next-chapter', 'next-chapter-title',
    'next-chapter-caption', 'chapter-position', 'reading-percent',
    'reading-progress-bar', 'open-toc', 'toc-dialog', 'close-toc',
    'toggle-settings', 'reading-settings', 'font-size', 'font-size-value',
    'toggle-theme', 'theme-icon', 'app-status'
  ].map((id) => [id, $(id)]));
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const state = {
    book: null, load: 'loading', view: 'library', chapterId: null,
    progress: 0, restoring: false, generation: 0, pendingOpen: false,
    storageAvailable: true, storageWarned: false
  };
  const saved = { lastChapter: null, progress: {}, fontSize: 19, theme: 'light' };
  let saveTimer;
  let statusTimer;
  let scrollFrame;
  let resizeFrame;
  let fetchController;

  function notify(message, { persistent = false, fallback = false } = {}) {
    clearTimeout(statusTimer);
    ui['app-status'].replaceChildren(document.createTextNode(message));
    if (fallback) {
      const link = document.createElement('a');
      link.href = TEXT_URL;
      link.textContent = '원고를 텍스트로 읽기';
      link.style.textDecoration = 'underline';
      link.style.marginLeft = '12px';
      ui['app-status'].append(link);
    }
    ui['app-status'].hidden = false;
    if (!persistent) statusTimer = setTimeout(() => { ui['app-status'].hidden = true; }, 6500);
  }

  function storageWarning() {
    if (state.storageWarned || state.load === 'error') return;
    state.storageWarned = true;
    const note = document.querySelector('.reading-note');
    if (note) note.textContent = '이 브라우저에서는 읽던 위치를 저장할 수 없어요. 이 창에서는 계속 이어 읽을 수 있어요.';
    notify('읽기 설정과 위치를 이 브라우저에 저장할 수 없어요. 이 창에서는 계속 사용할 수 있습니다.');
  }

  function loadSaved() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!value || typeof value !== 'object') return;
      if (typeof value.lastChapter === 'string') saved.lastChapter = value.lastChapter;
      if (typeof value.fontSize === 'number' && Number.isFinite(value.fontSize)) {
        saved.fontSize = clamp(value.fontSize, 16, 26);
      }
      if (value.theme === 'dark') saved.theme = 'dark';
      if (value.progress && typeof value.progress === 'object') {
        for (const [id, progress] of Object.entries(value.progress)) {
          if (/^[a-z0-9-]+$/.test(id) && typeof progress === 'number' && Number.isFinite(progress)) {
            saved.progress[id] = clamp(progress);
          }
        }
      }
    } catch {
      state.storageAvailable = false;
    }
  }

  function persist() {
    clearTimeout(saveTimer);
    if (!state.storageAvailable) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      state.storageAvailable = false;
      storageWarning();
    }
  }

  function progressBounds() {
    const rect = ui['chapter-body'].getBoundingClientRect();
    const headerHeight = document.querySelector('.reader-header').getBoundingClientRect().height;
    const top = rect.top + window.scrollY;
    const start = Math.max(0, top - headerHeight - 20);
    const music = document.getElementById('chapter-music');
    const musicBounds = music && !music.hidden ? music.getBoundingClientRect() : null;
    const overlapsText = musicBounds && musicBounds.left < rect.right && musicBounds.right > rect.left;
    const visibleBottom = overlapsText ? Math.min(window.innerHeight, musicBounds.top) : window.innerHeight;
    const end = Math.max(start, top + rect.height - visibleBottom + 32);
    return { start, end };
  }

  function measureProgress() {
    const { start, end } = progressBounds();
    if (end <= start) return window.scrollY >= end && end > 0 ? 1 : 0;
    return clamp((window.scrollY - start) / (end - start));
  }

  function paintProgress(progress) {
    const percent = Math.round(clamp(progress) * 100);
    ui['reading-progress-bar'].style.width = `${percent}%`;
    ui['reading-percent'].textContent = `${percent}%`;
    const track = ui['reading-progress-bar'].parentElement;
    track.setAttribute('aria-valuenow', String(percent));
    track.setAttribute('aria-valuetext', `현재 이야기 ${percent}%`);
  }

  function capturePosition({ write = true } = {}) {
    if (state.view !== 'reader' || !state.chapterId) return;
    // During a layout restore, the remembered fraction is more reliable than the
    // intermediate scroll position created by hiding or replacing the page.
    if (!state.restoring) state.progress = measureProgress();
    saved.progress[state.chapterId] = state.progress;
    saved.lastChapter = state.chapterId;
    paintProgress(state.progress);
    if (write) persist();
  }

  function scrollInstantly(top) {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo({ top, left: 0, behavior: 'instant' });
    root.style.scrollBehavior = previous;
  }

  async function restorePosition(progress, { focus = false } = {}) {
    const generation = ++state.generation;
    const id = state.chapterId;
    state.restoring = true;
    state.progress = clamp(progress);
    paintProgress(state.progress);
    await document.fonts.ready;
    await frame();
    await frame();
    if (generation !== state.generation || state.view !== 'reader' || state.chapterId !== id) return;
    const { start, end } = progressBounds();
    const target = progress <= 0 ? 0 : start + (end - start) * clamp(progress);
    scrollInstantly(target);
    if (focus) ui['reading-main'].focus({ preventScroll: true });
    // Programmatic scroll events must settle before scroll saving resumes.
    await frame();
    await frame();
    if (generation !== state.generation || state.view !== 'reader' || state.chapterId !== id) return;
    state.restoring = false;
    state.progress = measureProgress();
    capturePosition();
  }

  function closeSettings({ focus = false } = {}) {
    ui['reading-settings'].hidden = true;
    ui['toggle-settings'].setAttribute('aria-expanded', 'false');
    if (focus) ui['toggle-settings'].focus({ preventScroll: true });
  }

  function closeToc() {
    if (ui['toc-dialog'].open) ui['toc-dialog'].close();
    ui['open-toc'].setAttribute('aria-expanded', 'false');
  }

  function applyFont() {
    document.documentElement.style.setProperty('--reader-font', `${saved.fontSize}px`);
    ui['font-size'].value = String(saved.fontSize);
    ui['font-size-value'].textContent = String(saved.fontSize);
    ui['font-size'].setAttribute('aria-valuetext', `${saved.fontSize}픽셀`);
  }

  function applyTheme() {
    const dark = saved.theme === 'dark';
    document.body.dataset.theme = saved.theme;
    ui['toggle-theme'].setAttribute('aria-pressed', String(dark));
    ui['toggle-theme'].setAttribute('aria-label', dark ? '밝은 화면으로 전환' : '어두운 화면으로 전환');
    ui['theme-icon'].setAttribute('href', dark ? '#i-sun' : '#i-moon');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#252923' : '#f8f5ef';
  }

  function chapterById(id) {
    return state.book?.chapters.find((chapter) => chapter.id === id);
  }

  function updateResumeLabel() {
    if (!state.book || $('book-dialog').dataset.book !== 'wellbeing') return;
    const chapter = chapterById(saved.lastChapter);
    ui['open-book-label'].textContent = chapter ? '이어서 읽기' : '책 펼치기';
    ui['resume-label'].textContent = chapter
      ? `마지막으로 읽은 이야기 · ${chapter.title} ${Math.round((saved.progress[chapter.id] || 0) * 100)}%`
      : '여섯 개의 이야기, 그리고 나의 자리.';
  }

  function buildToc() {
    for (const id of ['desktop-chapter-list', 'mobile-chapter-list']) {
      const fragment = document.createDocumentFragment();
      state.book.chapters.forEach((chapter, index) => {
        const link = document.createElement('a');
        link.href = `#read/${encodeURIComponent(chapter.id)}`;
        link.className = 'chapter-link';
        link.dataset.chapter = chapter.id;
        const number = document.createElement('span');
        number.className = 'chapter-link-number';
        number.textContent = String(index + 1).padStart(2, '0');
        const title = document.createElement('span');
        title.className = 'chapter-link-title';
        title.textContent = chapter.title;
        link.append(number, title);
        link.addEventListener('click', (event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          closeToc();
          navigateChapter(chapter.id);
        });
        fragment.append(link);
      });
      ui[id].replaceChildren(fragment);
    }
  }

  function renderBody(chapter, index) {
    const fragment = document.createDocumentFragment();
    chapter.blocks.forEach((block, blockIndex) => {
      // Keep every manuscript block in the source file. Only the duplicated
      // book metadata and chapter heading are omitted from the reading body.
      if (index === 0 && blockIndex === 0 && block.type === 'note') return;
      if (block.type === 'heading' && block.text.trim() === chapter.originalTitle.trim()) return;
      if (!block.text.trim()) return;
      const element = document.createElement(block.type === 'heading' ? 'h2' : 'p');
      if (block.type === 'note') element.className = 'prose-note';
      if (block.type === 'verse') element.className = 'prose-verse';
      element.textContent = block.text.trim();
      fragment.append(element);
    });
    ui['chapter-body'].replaceChildren(fragment);
  }

  function showChapter(chapter) {
    if (state.view === 'reader' && state.chapterId === chapter.id) {
      closeSettings();
      closeToc();
      ui['reading-main'].focus({ preventScroll: true });
      return;
    }
    capturePosition();
    ++state.generation;
    state.restoring = true;
    state.view = 'reader';
    state.chapterId = chapter.id;
    state.progress = saved.progress[chapter.id] || 0;
    saved.lastChapter = chapter.id;
    const index = state.book.chapters.indexOf(chapter);
    closeSettings();
    closeToc();
    ui['library-view'].hidden = true;
    ui['reader-view'].hidden = false;
    document.querySelector('.skip-link').setAttribute('href', '#reading-main');
    ui['chapter-number'].textContent = `CHAPTER ${String(index + 1).padStart(2, '0')}`;
    ui['chapter-title'].textContent = chapter.title;
    ui['chapter-period'].textContent = chapter.period;
    ui['current-chapter-label'].textContent = chapter.title;
    ui['chapter-position'].textContent = `${String(index + 1).padStart(2, '0')} / ${String(state.book.chapters.length).padStart(2, '0')}`;
    renderBody(chapter, index);
    ui['reader-view'].dataset.chapter = chapter.id;
    window.dispatchEvent(new CustomEvent('w38:reader-change'));
    document.querySelectorAll('.chapter-link').forEach((link) => {
      if (link.dataset.chapter === chapter.id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    ui['previous-chapter'].disabled = index === 0;
    ui['previous-chapter-title'].textContent = state.book.chapters[index - 1]?.title || '첫 번째 이야기';
    const next = state.book.chapters[index + 1];
    ui['next-chapter-caption'].textContent = next ? '다음 이야기' : '책을 덮고';
    ui['next-chapter-title'].textContent = next ? next.title : '서재로 가기';
    ui['next-chapter'].setAttribute('aria-label', next ? `다음 이야기: ${next.title}` : '서재로 가기');
    document.title = `${chapter.title} · ${state.book.title}`;
    persist();
    restorePosition(state.progress, { focus: true });
  }

  function showLibrary({ focus = true } = {}) {
    capturePosition();
    const generation = ++state.generation;
    state.restoring = false;
    state.view = 'library';
    state.chapterId = null;
    closeSettings();
    closeToc();
    ui['reader-view'].hidden = true;
    delete ui['reader-view'].dataset.chapter;
    window.dispatchEvent(new CustomEvent('w38:reader-change'));
    ui['library-view'].hidden = false;
    document.querySelector('.skip-link').setAttribute('href', '#main-content');
    document.title = `나의 서재 · ${state.book?.title || '잘 지내냐고 물으면'}`;
    updateResumeLabel();
    requestAnimationFrame(() => {
      if (generation !== state.generation || state.view !== 'library') return;
      scrollInstantly(0);
      if (focus) ui['main-content'].focus({ preventScroll: true });
    });
  }

  function route({ initial = false } = {}) {
    if (!state.book) return;
    const hash = location.hash;
    const match = /^#read\/([a-z0-9-]+)$/.exec(hash);
    const chapter = match && chapterById(match[1]);
    if (chapter) showChapter(chapter);
    else {
      if (hash !== '#library') history.replaceState(null, '', `${location.pathname}${location.search}#library`);
      showLibrary({ focus: !initial });
    }
  }

  function navigateChapter(id) {
    if (!state.book) return;
    const chapter = chapterById(id);
    if (!chapter) return;
    const hash = `#read/${chapter.id}`;
    if (location.hash === hash) showChapter(chapter);
    else location.hash = hash;
  }

  function openBook() {
    if ($('book-dialog').open) $('book-dialog').close();
    if (state.load === 'error') {
      location.assign(TEXT_URL);
      return;
    }
    if (!state.book) {
      state.pendingOpen = true;
      notify('원고를 불러오고 있어요. 준비되면 책을 펼칠게요.');
      return;
    }
    navigateChapter(chapterById(saved.lastChapter)?.id || state.book.chapters[0].id);
  }

  function validateBook(book) {
    if (!book || typeof book.title !== 'string' || !Array.isArray(book.chapters) || !book.chapters.length) {
      throw new Error('Invalid manuscript');
    }
    const ids = new Set();
    for (const chapter of book.chapters) {
      if (!chapter || typeof chapter.id !== 'string' || !/^[a-z0-9-]+$/.test(chapter.id) || ids.has(chapter.id)
          || typeof chapter.title !== 'string' || typeof chapter.originalTitle !== 'string'
          || typeof chapter.period !== 'string' || !Array.isArray(chapter.blocks)
          || !chapter.blocks.every((block) => block && typeof block.text === 'string'
            && ['paragraph', 'heading', 'note', 'verse'].includes(block.type))) {
        throw new Error('Invalid chapter');
      }
      ids.add(chapter.id);
    }
    return book;
  }

  async function loadBook() {
    fetchController = new AbortController();
    const timeout = setTimeout(() => fetchController.abort(), 15000);
    for (const id of ['open-book', 'cover-button']) ui[id].setAttribute('aria-busy', 'true');
    ui['open-book-label'].textContent = '원고 불러오는 중…';
    try {
      const response = await fetch('./content/manuscript.json', { signal: fetchController.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.book = validateBook(await response.json());
      state.load = 'ready';
      buildToc();
      updateResumeLabel();
      clearTimeout(statusTimer);
      ui['app-status'].hidden = true;
      route({ initial: true });
      if (state.pendingOpen) {
        state.pendingOpen = false;
        openBook();
      }
      if (!state.storageAvailable) storageWarning();
    } catch {
      state.load = 'error';
      state.pendingOpen = false;
      state.book = null;
      showLibrary({ focus: false });
      ui['open-book-label'].textContent = '원고 텍스트 읽기';
      ui['resume-label'].textContent = '원고 화면을 불러오지 못했어요. 텍스트 원고는 바로 열 수 있어요.';
      notify('원고 화면을 불러오지 못했어요.', { persistent: true, fallback: true });
    } finally {
      clearTimeout(timeout);
      for (const id of ['open-book', 'cover-button']) ui[id].removeAttribute('aria-busy');
    }
  }

  loadSaved();
  applyFont();
  applyTheme();
  try { history.scrollRestoration = 'manual'; } catch { /* The reader still works without this optional API. */ }
  const progressTrack = ui['reading-progress-bar'].parentElement;
  progressTrack.setAttribute('role', 'progressbar');
  progressTrack.setAttribute('aria-label', '현재 이야기 읽기 진행률');
  progressTrack.setAttribute('aria-valuemin', '0');
  progressTrack.setAttribute('aria-valuemax', '100');
  paintProgress(0);
  ui['open-toc'].setAttribute('aria-controls', 'toc-dialog');
  ui['open-toc'].setAttribute('aria-expanded', 'false');
  window.addEventListener('w38:select-book', () => {
    if (state.load === 'error') {
      ui['open-book-label'].textContent = '원고 텍스트 읽기';
      ui['resume-label'].textContent = '화면을 불러오지 못했어요. 텍스트 원고를 열 수 있어요.';
    } else if (state.load === 'loading') {
      ui['open-book-label'].textContent = '원고 불러오는 중…';
    } else updateResumeLabel();
  });
  ui['open-book'].addEventListener('click', openBook);
  ui['cover-button'].addEventListener('click', openBook);
  window.addEventListener('hashchange', () => route());
  document.querySelector('.skip-link').addEventListener('click', (event) => {
    event.preventDefault();
    const target = state.view === 'reader' ? ui['reading-main'] : ui['main-content'];
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  ui['previous-chapter'].addEventListener('click', () => {
    if (!state.book) return;
    const index = state.book.chapters.findIndex((chapter) => chapter.id === state.chapterId);
    if (index > 0) navigateChapter(state.book.chapters[index - 1].id);
  });
  ui['next-chapter'].addEventListener('click', () => {
    if (!state.book) return;
    const index = state.book.chapters.findIndex((chapter) => chapter.id === state.chapterId);
    if (index < 0) return;
    const next = state.book.chapters[index + 1];
    if (next) navigateChapter(next.id);
    else location.hash = '#library';
  });
  ui['open-toc'].addEventListener('click', () => {
    if (!state.book || state.view !== 'reader') return;
    closeSettings();
    if (!ui['toc-dialog'].open) ui['toc-dialog'].showModal();
    ui['open-toc'].setAttribute('aria-expanded', 'true');
    (ui['mobile-chapter-list'].querySelector('[aria-current="page"]') || ui['close-toc']).focus();
  });
  ui['close-toc'].addEventListener('click', closeToc);
  ui['toc-dialog'].addEventListener('close', () => ui['open-toc'].setAttribute('aria-expanded', 'false'));
  ui['toc-dialog'].addEventListener('click', (event) => {
    if (event.target !== ui['toc-dialog']) return;
    const box = ui['toc-dialog'].getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeToc();
  });
  ui['toggle-settings'].addEventListener('click', () => {
    const opening = ui['reading-settings'].hidden;
    ui['reading-settings'].hidden = !opening;
    ui['toggle-settings'].setAttribute('aria-expanded', String(opening));
    if (opening) ui['font-size'].focus();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!ui['reading-settings'].hidden && !ui['reading-settings'].parentElement.contains(event.target)) closeSettings();
  });
  document.addEventListener('focusin', (event) => {
    if (!ui['reading-settings'].hidden && !ui['reading-settings'].parentElement.contains(event.target)) closeSettings();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      state.pendingOpen = false;
      if (!ui['reading-settings'].hidden) {
        event.preventDefault();
        closeSettings({ focus: true });
      }
    }
  });
  ui['font-size'].addEventListener('input', () => {
    capturePosition({ write: false });
    const progress = state.progress;
    saved.fontSize = clamp(Number(ui['font-size'].value) || 19, 16, 26);
    applyFont();
    persist();
    if (state.view === 'reader') restorePosition(progress);
  });
  ui['toggle-theme'].addEventListener('click', () => {
    saved.theme = saved.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    persist();
  });
  window.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null;
      if (state.view !== 'reader' || state.restoring) return;
      capturePosition({ write: false });
      clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 250);
    });
  }, { passive: true });
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (state.view === 'reader' && !state.restoring) capturePosition();
    });
  });
  window.addEventListener('pagehide', () => { capturePosition(); persist(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { capturePosition(); persist(); }
  });
  loadBook();
})();
