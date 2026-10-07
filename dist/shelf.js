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
    let lastShelfButton = null;
    let savedOverflow = null;
    let pointerStartedOnBackdrop = false;

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
          element('span', 'cover-subtitle', book.number),
          element('span', 'cover-author', '김승제 지음')
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

    function selectBook(book, button) {
      lastShelfButton = button;
      dialog.dataset.book = book.id;
      for (const [id, shelfButton] of buttons) {
        const selected = id === book.id;
        shelfButton.classList.toggle('is-selected', selected);
        shelfButton.setAttribute('aria-pressed', String(selected));
      }

      applyColors(dialog, book);
      applyColors(detailCover, book);
      applyColors(coverButton, book);
      const source = button.querySelector('.shelf-cover');
      detailCover.replaceChildren(...Array.from(source.childNodes, (node) => node.cloneNode(true)));
      detailCover.setAttribute('aria-hidden', 'true');
      setText('detail-book-kind', book.kind);
      setText('detail-book-title', book.title);
      setText('detail-book-subtitle', book.subtitle);
      setText('detail-book-author', '김승제 지음');
      setText('detail-book-description', book.description);
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
      lockScroll();
      closeButton.focus({ preventScroll: true });
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

    closeButton.addEventListener('click', () => dialog.close());

    function outsideDialog(event) {
      const bounds = dialog.getBoundingClientRect();
      return event.target === dialog && (
        event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom
      );
    }

    dialog.addEventListener('pointerdown', (event) => {
      pointerStartedOnBackdrop = outsideDialog(event);
    });
    dialog.addEventListener('pointercancel', () => { pointerStartedOnBackdrop = false; });
    dialog.addEventListener('click', (event) => {
      if (pointerStartedOnBackdrop && outsideDialog(event)) dialog.close();
      pointerStartedOnBackdrop = false;
    });
    dialog.addEventListener('close', () => {
      if (dialog.open) return;
      pointerStartedOnBackdrop = false;
      restoreScroll();
      const returnTarget = lastShelfButton;
      requestAnimationFrame(() => {
        if (!dialog.open && !isReading() && returnTarget?.isConnected) {
          returnTarget.focus({ preventScroll: true });
        }
      });
    });
    window.addEventListener('hashchange', () => {
      if (/^#read(?:\/|$)/.test(window.location.hash) && dialog.open) dialog.close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeShelf, { once: true });
  } else {
    initializeShelf();
  }
})();
