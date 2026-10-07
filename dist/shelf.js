(() => {
  'use strict';

  const books = [
    {
      id: 'wellbeing', title: '잘 지내냐고 물으면',
      subtitle: '대답이 조금 길어질 것 같다', kind: '자전적 소설',
      cover: './assets/book-cover.png', ink: '#393b2f', paper: '#eee9dc', ready: true,
      description: '형의 어깨 너머로 바라보던 화면에서 밥을 두 사람분 짓는 저녁까지. 오래 말하지 못했던 마음과, 내 삶의 자리를 찾아가는 이야기.'
    },
    ...[
      ['evening', '#F1E6D1', '#405466'],
      ['rain', '#263A33', '#a9b5a3'],
      ['walk', '#5B4C39', '#e1d3ba'],
      ['letter', '#543A40', '#c39fa0'],
      ['window', '#405C66', '#f0e9d9'],
      ['summer', '#4C3627', '#d6b375'],
      ['home', '#ECE3CC', '#315a5d']
    ].map(([id, ink, paper], index) => {
      const number = String(index + 1).padStart(2, '0');
      return {
        id, ink, paper, number, title: `무제 ${number}`, coverTitle: '무제',
        subtitle: '', kind: '준비 중인 책',
        cover: `./assets/shelf/cover-${number}.svg`,
        description: '아직 제목이 붙지 않은 이야기입니다. 이 자리에 새로운 원고가 놓일 예정이에요.'
      };
    })
  ];

  function initializeShelf() {
    const $ = (id) => document.getElementById(id);
    const shelves = [$('shelf-1'), $('shelf-2')];
    const dialog = $('book-dialog');
    const detailCover = $('detail-cover-art');
    const closeButton = $('close-book');
    const openButton = $('open-book');
    const coverButton = $('cover-button');
    if (shelves.some((shelf) => !shelf) || !dialog || !detailCover ||
        !closeButton || !openButton || !coverButton) return;

    const buttons = new Map();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let lastShelfButton = null;
    let savedOverflow = null;
    let pointerStartedOnBackdrop = false;
    let hiddenSource = null;
    let coverFlight = null;
    let previewVersion = 0;
    let focusFrame = 0;

    // Older markup may still contain this credit; attribution lives in the site footer.
    dialog.querySelectorAll('#detail-book-author, .cover-author').forEach((node) => node.remove());
    detailCover.querySelectorAll('img').forEach((art) => { art.alt = ''; });

    function element(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function applyColors(node, book) {
      node.style.setProperty('--cover-ink', book.ink);
      node.style.setProperty('--cover-paper', book.paper);
    }

    function makeCover(book) {
      const cover = element('span', 'shelf-cover');
      cover.setAttribute('aria-hidden', 'true');
      applyColors(cover, book);
      const art = element('img', 'shelf-cover-art');
      art.src = book.cover;
      art.alt = '';
      art.width = 400;
      art.height = 600;
      art.draggable = false;
      art.decoding = 'async';
      cover.append(art);
      if (!book.ready) {
        const type = element('span', 'cover-typography');
        const title = element('h3', 'cover-title', book.coverTitle);
        title.style.whiteSpace = 'pre-line';
        type.append(
          title,
          element('span', 'cover-subtitle', book.number)
        );
        cover.append(type);
      }
      return cover;
    }

    function setText(id, text) {
      const node = $(id);
      if (node) node.textContent = text;
    }

    function isReading() {
      return /^#read(?:\/|$)/.test(window.location.hash) ||
        ($('reader-view') && !$('reader-view').hidden);
    }

    function lockScroll() {
      if (savedOverflow !== null) return;
      const style = document.documentElement.style;
      savedOverflow = {
        value: style.getPropertyValue('overflow'),
        priority: style.getPropertyPriority('overflow')
      };
      style.setProperty('overflow', 'hidden');
    }

    function restoreScroll() {
      if (savedOverflow === null) return;
      const style = document.documentElement.style;
      if (savedOverflow.value) {
        style.setProperty('overflow', savedOverflow.value, savedOverflow.priority);
      } else {
        style.removeProperty('overflow');
      }
      savedOverflow = null;
    }

    function restoreSource() {
      if (!hiddenSource) return;
      const { node, value, priority, button } = hiddenSource;
      if (value) node.style.setProperty('visibility', value, priority);
      else node.style.removeProperty('visibility');
      button.classList.remove('is-preview-source');
      hiddenSource = null;
    }

    function stopFlight() {
      if (!coverFlight) return;
      const animation = coverFlight;
      coverFlight = null;
      animation.cancel();
    }

    function cleanUpPreview() {
      ++previewVersion;
      cancelAnimationFrame(focusFrame);
      focusFrame = 0;
      stopFlight();
      restoreSource();
      restoreScroll();
      pointerStartedOnBackdrop = false;
      delete dialog.dataset.previewState;
    }

    function settlePreview() {
      stopFlight();
      if (dialog.open) dialog.dataset.previewState = 'settled';
    }

    function flyCover(sourceBounds, version) {
      const destination = coverButton.getBoundingClientRect();
      if (reducedMotion.matches || typeof coverButton.animate !== 'function' ||
          !sourceBounds.width || !sourceBounds.height || !destination.width || !destination.height) {
        settlePreview();
        return;
      }

      const x = sourceBounds.left - destination.left;
      const y = sourceBounds.top - destination.top;
      const scaleX = sourceBounds.width / destination.width;
      const scaleY = sourceBounds.height / destination.height;
      dialog.dataset.previewState = 'opening';
      try {
        const animation = coverButton.animate([
          {
            transformOrigin: '0 0',
            transform: `translate3d(${x}px, ${y}px, 0) scale(${scaleX}, ${scaleY})`
          },
          { transformOrigin: '0 0', transform: 'translate3d(0, 0, 0) scale(1, 1)' }
        ], { duration: 720, easing: 'cubic-bezier(0.18, 0.72, 0.2, 1)', fill: 'both' });
        coverFlight = animation;
        animation.finished.then(() => {
          if (version !== previewVersion || coverFlight !== animation || !dialog.open) return;
          settlePreview();
        }).catch(() => {
          // Closing, resizing, or choosing another book cancels this flight intentionally.
        });
      } catch {
        settlePreview();
      }
    }

    function selectBook(book, button) {
      cleanUpPreview();
      const version = previewVersion;
      const source = button.querySelector('.shelf-cover');
      const sourceBounds = source.getBoundingClientRect();
      lastShelfButton = button;
      dialog.dataset.book = book.id;
      dialog.dataset.ready = String(Boolean(book.ready));
      for (const [id, shelfButton] of buttons) {
        const selected = id === book.id;
        shelfButton.classList.toggle('is-selected', selected);
        shelfButton.setAttribute('aria-pressed', String(selected));
      }

      applyColors(dialog, book);
      applyColors(detailCover, book);
      applyColors(coverButton, book);
      detailCover.replaceChildren(...Array.from(source.childNodes, (node) => node.cloneNode(true)));
      detailCover.setAttribute('aria-hidden', 'true');
      setText('detail-book-kind', book.kind);
      setText('detail-book-title', book.title);
      setText('detail-book-subtitle', book.subtitle);
      setText('detail-book-description', book.description);
      setText('detail-book-quote', book.ready ? '나는 오래,\n말하지 못한 것들과 한 방에 살았다.' : '');
      if ($('detail-book-quote')) $('detail-book-quote').hidden = !book.ready;
      setText('detail-book-status', book.ready ? '현재 원고 6장' : '새 이야기를 준비하고 있어요');
      setText('open-book-label', book.ready ? '책 펼치기' : '준비 중인 책');
      setText('resume-label', book.ready
        ? '여섯 개의 이야기, 그리고 나의 자리.'
        : '아직 원고가 없는 책이에요.');
      openButton.disabled = !book.ready;
      coverButton.disabled = !book.ready;
      coverButton.setAttribute('aria-label', book.ready ? `${book.title} 펼치기` : `${book.title} · 준비 중인 책`);

      if (book.ready) window.dispatchEvent(new CustomEvent('w38:select-book'));
      if (!dialog.open) dialog.showModal();
      // A reopened, scrollable preview always starts with the cover in view.
      dialog.scrollTop = 0;
      lockScroll();
      closeButton.focus({ preventScroll: true });
      if (book.ready) {
        hiddenSource = {
          node: source, button,
          value: source.style.getPropertyValue('visibility'),
          priority: source.style.getPropertyPriority('visibility')
        };
        source.style.setProperty('visibility', 'hidden');
        button.classList.add('is-preview-source');
        flyCover(sourceBounds, version);
      } else {
        dialog.dataset.previewState = 'settled';
      }
    }

    function addEmptySlot(shelf) {
      const empty = element('div', 'shelf-empty');
      empty.setAttribute('aria-label', '다음 책을 위한 빈자리');
      empty.append(element('span', 'empty-caption', '비워 둔 자리'));
      shelf.append(empty);
    }

    shelves.forEach((shelf) => shelf.replaceChildren());
    books.forEach((book, index) => {
      const button = element('button', 'shelf-book');
      button.type = 'button';
      button.dataset.book = book.id;
      button.setAttribute('aria-label', `${book.title} 선택`);
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-controls', 'book-dialog');
      button.setAttribute('aria-pressed', String(Boolean(book.ready)));
      button.classList.toggle('is-selected', Boolean(book.ready));
      applyColors(button, book);
      const caption = element('span', 'shelf-book-caption');
      caption.append(
        element('span', 'shelf-book-title', book.title),
        element('span', 'shelf-book-state', book.ready ? '읽기 가능' : '준비 중')
      );
      button.append(makeCover(book), caption);
      button.addEventListener('click', () => selectBook(book, button));
      buttons.set(book.id, button);
      shelves[Math.floor(index / 4)].append(button);
      if (index === 3) addEmptySlot(shelves[0]);
      if (index === 4) addEmptySlot(shelves[1]);
    });
    dialog.dataset.book = 'wellbeing';
    dialog.dataset.ready = 'true';

    function closePreview() {
      // Release the flight immediately; native close is also used by the reader app.
      if (!dialog.open) return;
      settlePreview();
      dialog.close();
    }

    closeButton.addEventListener('click', closePreview);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closePreview();
    });

    function isBackdrop(event) {
      // The ready preview fills the viewport, so its empty inner space is backdrop too.
      return event.target === dialog ||
        event.target === dialog.querySelector('.book-detail-layout');
    }

    dialog.addEventListener('pointerdown', (event) => {
      pointerStartedOnBackdrop = event.button === 0 && isBackdrop(event);
    });
    dialog.addEventListener('pointercancel', () => { pointerStartedOnBackdrop = false; });
    dialog.addEventListener('click', (event) => {
      if (pointerStartedOnBackdrop && isBackdrop(event)) closePreview();
      pointerStartedOnBackdrop = false;
    });
    dialog.addEventListener('close', () => {
      if (dialog.open) return;
      cleanUpPreview();
      const returnTarget = lastShelfButton;
      const version = previewVersion;
      focusFrame = requestAnimationFrame(() => {
        focusFrame = 0;
        if (version === previewVersion && !dialog.open && !isReading() && returnTarget?.isConnected) {
          returnTarget.focus({ preventScroll: true });
        }
      });
    });
    window.addEventListener('hashchange', () => {
      if (/^#read(?:\/|$)/.test(window.location.hash) && dialog.open) closePreview();
    });
    // A viewport change invalidates FLIP coordinates; settle at the new layout immediately.
    window.addEventListener('resize', () => { if (coverFlight) settlePreview(); });
    reducedMotion.addEventListener('change', () => {
      if (reducedMotion.matches && coverFlight) settlePreview();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeShelf, { once: true });
  } else {
    initializeShelf();
  }
})();
