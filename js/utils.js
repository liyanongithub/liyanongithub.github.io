/* ============================================================
   NORDIC DIGITAL LIBRARY — Utilities
   ============================================================ */

const Utils = (() => {

  /* ── Theme Management ────────────────────────────────── */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme || 'normal');
    Storage.setSetting('readingMode', theme);
    // Update active theme button
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  }

  function initTheme() {
    const saved = Storage.getSetting('readingMode') || 'normal';
    document.documentElement.setAttribute('data-theme', saved);
  }

  /* ── Navigation ──────────────────────────────────────── */
  function buildSidebar(activePage) {
    const pages = [
      { id: 'index',     label: 'Dashboard',   icon: iconGrid(),    href: 'index.html'    },
      { id: 'library',   label: 'My Library',  icon: iconBook(),    href: 'library.html'  },
      { id: 'featured',  label: 'Featured',    icon: iconStar(),    href: 'featured.html' },
      { id: 'authors',   label: 'Authors',     icon: iconUser(),    href: 'authors.html'  },
      { id: 'chat',      label: 'Chat',        icon: iconChat(),    href: 'chat.html'     },
      { id: 'settings',  label: 'Settings',    icon: iconGear(),    href: 'settings.html' },
    ];

    return `
      <aside class="sidebar">
        <div class="sidebar-logo">
          <div class="sidebar-logo-icon">📚</div>
        </div>
        <nav class="sidebar-nav">
          ${pages.slice(0, 5).map(p => `
            <a href="${p.href}" class="nav-item ${activePage === p.id ? 'active' : ''}" title="${p.label}">
              ${p.icon}
              <span class="nav-label">${p.label}</span>
            </a>
          `).join('')}
        </nav>
        <div class="sidebar-footer">
          <a href="settings.html" class="nav-item ${activePage === 'settings' ? 'active' : ''}" title="Settings">
            ${iconGear()}
            <span class="nav-label">Settings</span>
          </a>
        </div>
      </aside>`;
  }

  function buildHeader(title) {
    const modes = ['normal','relaxing','educational','intense','night'];
    const modeLabels = { normal:'標準', relaxing:'放鬆', educational:'學習', intense:'專注', night:'夜間' };
    const currentTheme = Storage.getSetting('readingMode') || 'normal';
    const userName = Storage.getSetting('userName') || 'R';
    const initial = userName.charAt(0).toUpperCase();

    return `
      <header class="header">
        <div style="width:140px"></div>
        <h1 class="header-title">Nordic Digital Library</h1>
        <div class="header-actions">
          <label class="header-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input type="text" id="headerSearch" placeholder="Global search..." autocomplete="off">
          </label>
          <div class="header-avatar" title="Profile">${initial}</div>
        </div>
      </header>`;
  }

  /* ── Book Rendering ──────────────────────────────────── */
  function renderBookCard(book, record, variant = 'face-out') {
    const rec = record || Storage.getRecord(book.id);
    const color = book.coverColor || generateColor(book.id);
    const textColor = book.coverTextColor || isLightColor(color) ? '#1e160a' : '#ffffff';
    const statusLabel = statusText(rec.status);
    const statusClass = rec.status || 'want-to-read';
    const stars = rec.rating ? '★'.repeat(rec.rating) : '';

    const coverContent = book.coverUrl
      ? `<img src="${book.coverUrl}" alt="${escHtml(book.title)}" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0">`
      : `<div class="book-cover-inner" style="position:absolute;bottom:0;left:0;right:0">
           <div class="book-cover-title">${escHtml(book.title)}</div>
           <div class="book-cover-author">${escHtml(book.author || '')}</div>
         </div>`;

    return `
      <div class="book-card face-out" data-id="${book.id}" onclick="window.location.href='book.html?id=${book.id}'">
        <div class="book-cover" style="background:${color};position:relative;">
          ${coverContent}
        </div>
        <div class="book-tooltip">
          <div class="tooltip-title">${escHtml(book.title)}</div>
          <div class="tooltip-author">${escHtml(book.author || '')}</div>
          <div class="tooltip-meta">
            <span class="tooltip-rating">${stars || '—'}</span>
            <span class="tooltip-status status-badge ${statusClass}">${statusLabel}</span>
          </div>
        </div>
      </div>`;
  }

  function renderSpineCard(book, record) {
    const rec = record || Storage.getRecord(book.id);
    const color = book.coverColor || generateColor(book.id);

    return `
      <div class="book-card spine-out" data-id="${book.id}" onclick="window.location.href='book.html?id=${book.id}'">
        <div class="book-spine" style="background:${color};">
          <span class="book-spine-text">${escHtml(book.title)}</span>
        </div>
        <div class="book-tooltip">
          <div class="tooltip-title">${escHtml(book.title)}</div>
          <div class="tooltip-author">${escHtml(book.author || '')}</div>
        </div>
      </div>`;
  }

  function renderLibraryCard(book, record) {
    const rec = record || Storage.getRecord(book.id);
    const color = book.coverColor || generateColor(book.id);
    const stars = rec.rating ? '★'.repeat(rec.rating) : '';
    const statusClass = rec.status || 'want-to-read';
    const progress = rec.progress || 0;

    const coverInner = book.coverUrl
      ? `<img src="${book.coverUrl}" alt="${escHtml(book.title)}" style="width:100%;height:100%;object-fit:cover;">`
      : `<div class="library-card-cover-placeholder" style="background:${color};">
           <div class="cover-title">${escHtml(book.title)}</div>
           <div class="cover-author">${escHtml(book.author || '')}</div>
         </div>`;

    return `
      <div class="library-card" data-id="${book.id}" onclick="window.location.href='book.html?id=${book.id}'">
        <div class="library-card-cover">
          ${coverInner}
        </div>
        <div class="library-card-title">${escHtml(book.title)}</div>
        <div class="library-card-author">${escHtml(book.author || '')}</div>
        <div class="library-card-footer">
          <span class="status-badge ${statusClass}" style="font-size:0.62rem">${statusText(rec.status)}</span>
          ${stars ? `<span style="color:#d4a843;font-size:0.7rem">${stars}</span>` : ''}
        </div>
        ${progress > 0 && progress < 100 ? `
          <div class="progress-bar" style="margin-top:6px">
            <div class="progress-bar-fill" style="width:${progress}%"></div>
          </div>` : ''}
      </div>`;
  }

  /* ── Search & Filter ─────────────────────────────────── */
  function filterBooks(books, records, { query, category, status, author, minRating, sort } = {}) {
    let result = [...books];

    if (query) {
      const q = query.toLowerCase();
      result = result.filter(b =>
        (b.title  || '').toLowerCase().includes(q) ||
        (b.author || '').toLowerCase().includes(q) ||
        (b.category || '').toLowerCase().includes(q)
      );
    }

    if (category && category !== 'all') {
      result = result.filter(b => b.category === category);
    }

    if (author && author !== 'all') {
      result = result.filter(b => b.author === author);
    }

    if (status && status !== 'all') {
      result = result.filter(b => {
        const rec = records[b.id];
        return rec ? rec.status === status : status === 'want-to-read';
      });
    }

    if (minRating) {
      result = result.filter(b => {
        const rec = records[b.id];
        return rec && rec.rating && rec.rating >= minRating;
      });
    }

    // Sort
    const sortFn = {
      'title':      (a, b) => a.title.localeCompare(b.title),
      'author':     (a, b) => (a.author || '').localeCompare(b.author || ''),
      'date-added': (a, b) => new Date(b.addedDate) - new Date(a.addedDate),
      'rating':     (a, b) => {
        const ra = records[a.id]?.rating || 0;
        const rb = records[b.id]?.rating || 0;
        return rb - ra;
      },
      'progress':   (a, b) => {
        const pa = records[a.id]?.progress || 0;
        const pb = records[b.id]?.progress || 0;
        return pb - pa;
      },
    }[sort || 'date-added'];

    if (sortFn) result.sort(sortFn);

    return result;
  }

  function getCategories(books) {
    const cats = new Set(books.map(b => b.category).filter(Boolean));
    return ['all', ...Array.from(cats).sort()];
  }

  function getAuthors(books) {
    const authors = new Set(books.map(b => b.author).filter(Boolean));
    return ['all', ...Array.from(authors).sort()];
  }

  /* ── Helpers ─────────────────────────────────────────── */
  function statusText(status) {
    return { 'want-to-read':'想讀', 'reading':'閱讀中', 'completed':'已讀', 'dropped':'放棄' }[status] || '想讀';
  }

  function generateColor(id) {
    // Generate a deterministic warm color from id
    const colors = [
      '#8B5E3C','#6B4C2A','#A07040','#C4956A',
      '#4A5568','#2D6A4F','#C0392B','#1A3A5C',
      '#8B4A2F','#5A7A5A','#7B8D97','#D4874A',
      '#3D5A80','#6B4226','#2E4057','#5B4A3F',
    ];
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash) + id.charCodeAt(i);
    return colors[Math.abs(hash) % colors.length];
  }

  function isLightColor(hex) {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 128;
  }

  function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('zh-TW', { year:'numeric', month:'long', day:'numeric' });
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  }

  function showToast(msg, duration = 2500) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), duration);
  }

  /* ── SVG Icons ───────────────────────────────────────── */
  function iconGrid() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>`;
  }
  function iconBook() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>`;
  }
  function iconStar() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>`;
  }
  function iconUser() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>`;
  }
  function iconChat() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>`;
  }
  function iconGear() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>`;
  }

  return {
    applyTheme, initTheme,
    buildSidebar, buildHeader,
    renderBookCard, renderSpineCard, renderLibraryCard,
    filterBooks, getCategories, getAuthors,
    statusText, generateColor, isLightColor,
    escHtml, formatDate, debounce, showToast,
    iconGrid, iconBook, iconStar, iconUser, iconChat, iconGear,
  };
})();
