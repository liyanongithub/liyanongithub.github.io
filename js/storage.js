/* ============================================================
   NORDIC DIGITAL LIBRARY — Storage Manager (localStorage)
   ============================================================ */

const Storage = (() => {
  const KEYS = {
    settings:  'ndl.settings',
    books:     'ndl.books',
    records:   'ndl.records',
    chat:      'ndl.chat',
  };

  /* ── Settings ────────────────────────────────────────── */
  const defaultSettings = {
    openaiApiKey:        '',
    openaiModel:         'gpt-4o-mini',
    librarianName:       '小書',
    librarianGreeting:   '歡迎回來！今天想讀點什麼？',
    googleClientId:      '',
    googleDriveFolderId: '',
    readingMode:         'normal',
    lastSyncDate:        null,
    userName:            '',
  };

  function getSettings() {
    try {
      const raw = localStorage.getItem(KEYS.settings);
      return raw ? { ...defaultSettings, ...JSON.parse(raw) } : { ...defaultSettings };
    } catch { return { ...defaultSettings }; }
  }

  function saveSettings(settings) {
    localStorage.setItem(KEYS.settings, JSON.stringify(settings));
  }

  function getSetting(key) {
    return getSettings()[key];
  }

  function setSetting(key, value) {
    const s = getSettings();
    s[key] = value;
    saveSettings(s);
  }

  /* ── Books ───────────────────────────────────────────── */
  function getBooks() {
    try {
      const raw = localStorage.getItem(KEYS.books);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function saveBooks(books) {
    localStorage.setItem(KEYS.books, JSON.stringify(books));
  }

  function getBook(id) {
    return getBooks().find(b => b.id === id) || null;
  }

  function addBook(book) {
    const books = getBooks();
    const idx = books.findIndex(b => b.id === book.id);
    if (idx >= 0) {
      // Update existing but preserve user-set fields
      books[idx] = { ...book, ...preserveUserFields(books[idx]) };
    } else {
      books.push(book);
    }
    saveBooks(books);
    return book;
  }

  function updateBook(id, updates) {
    const books = getBooks();
    const idx = books.findIndex(b => b.id === id);
    if (idx >= 0) {
      books[idx] = { ...books[idx], ...updates };
      saveBooks(books);
      return books[idx];
    }
    return null;
  }

  function deleteBook(id) {
    const books = getBooks().filter(b => b.id !== id);
    saveBooks(books);
    const records = getRecords();
    delete records[id];
    saveRecords(records);
  }

  function preserveUserFields(existing) {
    // Fields the user may have manually set — don't overwrite with Drive sync
    const userFields = ['title','author','category','tags','description',
                        'publishDate','publisher','pageCount','coverUrl'];
    const preserved = {};
    userFields.forEach(f => {
      if (existing[f] !== undefined && existing[f] !== '') {
        preserved[f] = existing[f];
      }
    });
    return preserved;
  }

  /* ── Reading Records ─────────────────────────────────── */
  const defaultRecord = {
    status:       'want-to-read',
    progress:     0,
    startDate:    null,
    finishDate:   null,
    rating:       null,
    notes:        '',
    review:       '',
    readCount:    0,
    lastReadDate: null,
  };

  function getRecords() {
    try {
      const raw = localStorage.getItem(KEYS.records);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  function saveRecords(records) {
    localStorage.setItem(KEYS.records, JSON.stringify(records));
  }

  function getRecord(bookId) {
    const records = getRecords();
    return records[bookId] ? { ...defaultRecord, ...records[bookId] } : { ...defaultRecord };
  }

  function saveRecord(bookId, updates) {
    const records = getRecords();
    records[bookId] = { ...defaultRecord, ...(records[bookId] || {}), ...updates };

    // Auto-set dates
    const rec = records[bookId];
    if (rec.status === 'reading' && !rec.startDate) {
      rec.startDate = new Date().toISOString().split('T')[0];
    }
    if (rec.status === 'completed' && !rec.finishDate) {
      rec.finishDate = new Date().toISOString().split('T')[0];
      if (rec.readCount === 0) rec.readCount = 1;
      rec.progress = 100;
    }
    rec.lastReadDate = new Date().toISOString().split('T')[0];

    saveRecords(records);
    return records[bookId];
  }

  /* ── Chat History ────────────────────────────────────── */
  const MAX_CHAT = 100;

  function getChatHistory() {
    try {
      const raw = localStorage.getItem(KEYS.chat);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function saveChatHistory(messages) {
    // Keep last MAX_CHAT messages
    const trimmed = messages.slice(-MAX_CHAT);
    localStorage.setItem(KEYS.chat, JSON.stringify(trimmed));
  }

  function addChatMessage(role, content) {
    const history = getChatHistory();
    const msg = { role, content, timestamp: new Date().toISOString() };
    history.push(msg);
    saveChatHistory(history);
    return msg;
  }

  function clearChatHistory() {
    localStorage.removeItem(KEYS.chat);
  }

  /* ── Stats Helpers ───────────────────────────────────── */
  function getStats() {
    const books   = getBooks();
    const records = getRecords();
    const now     = new Date();
    const thisYear  = now.getFullYear();
    const thisMonth = now.getMonth();

    let completedThisYear  = 0;
    let completedThisMonth = 0;
    let totalRatings       = 0;
    let ratingCount        = 0;
    const categoryCounts   = {};

    books.forEach(book => {
      const rec = records[book.id];
      if (!rec) return;

      if (rec.status === 'completed' && rec.finishDate) {
        const d = new Date(rec.finishDate);
        if (d.getFullYear() === thisYear) completedThisYear++;
        if (d.getFullYear() === thisYear && d.getMonth() === thisMonth) completedThisMonth++;
      }

      if (rec.rating) {
        totalRatings += rec.rating;
        ratingCount++;
      }

      if (book.category) {
        categoryCounts[book.category] = (categoryCounts[book.category] || 0) + 1;
      }
    });

    const topCategory = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    return {
      totalBooks:         books.length,
      completedThisYear,
      completedThisMonth,
      avgRating:          ratingCount ? (totalRatings / ratingCount).toFixed(1) : '—',
      topCategory,
      categoryCounts,
      currentlyReading:   books.filter(b => records[b.id]?.status === 'reading'),
    };
  }

  /* ── Export / Import ─────────────────────────────────── */
  function exportData() {
    return JSON.stringify({
      version:  1,
      exported: new Date().toISOString(),
      books:    getBooks(),
      records:  getRecords(),
      settings: getSettings(),
    }, null, 2);
  }

  function importData(jsonString) {
    const data = JSON.parse(jsonString);
    if (data.books)   saveBooks(data.books);
    if (data.records) saveRecords(data.records);
    if (data.settings) {
      // Don't overwrite API keys from import
      const current = getSettings();
      saveSettings({
        ...data.settings,
        openaiApiKey:   current.openaiApiKey,
        googleClientId: current.googleClientId,
      });
    }
  }

  function clearAllData() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  }

  /* ── Mock Data (for first run) ───────────────────────── */
  function initMockData() {
    if (getBooks().length > 0) return;

    const mockBooks = [
      {
        id: 'mock-1', title: 'HÅND VÆRK', author: 'Louise Campbell',
        category: '設計', coverUrl: '', description: '北歐當代設計精華，展現手工藝術之美。',
        publishDate: '2022', publisher: 'Gestalten', pageCount: 240,
        coverColor: '#8B5E3C', addedDate: '2024-01-10', driveFileId: '', driveViewUrl: ''
      },
      {
        id: 'mock-2', title: 'Life Work', author: 'Donald Hall',
        category: '文學', coverUrl: '', description: '詩人的生命哲學，從工作中尋找意義。',
        publishDate: '2020', publisher: 'Beacon Press', pageCount: 176,
        coverColor: '#F5F0E8', coverTextColor: '#2C2416', addedDate: '2024-01-15', driveFileId: '', driveViewUrl: ''
      },
      {
        id: 'mock-3', title: 'Outdoor Interiors', author: 'Vinita Gujarat',
        category: '設計', coverUrl: '', description: '戶外空間的室內設計哲學，模糊內外界線。',
        publishDate: '2023', publisher: 'Rizzoli', pageCount: 288,
        coverColor: '#6B8A5A', addedDate: '2024-02-01', driveFileId: '', driveViewUrl: ''
      },
      {
        id: 'mock-4', title: 'Danish Creatives', author: 'Various Authors',
        category: '藝術', coverUrl: '', description: '丹麥創意工作者的生活與工作空間。',
        publishDate: '2021', publisher: 'Frame Publishers', pageCount: 320,
        coverColor: '#2C3E50', addedDate: '2024-02-10', driveFileId: '', driveViewUrl: ''
      },
      {
        id: 'mock-5', title: 'François Halard', author: 'François Halard',
        category: '攝影', coverUrl: '', description: '法國攝影師的室內攝影藝術，捕捉靈魂之所。',
        publishDate: '2020', publisher: 'Rizzoli', pageCount: 256,
        coverColor: '#7B8D97', addedDate: '2024-02-20', driveFileId: '', driveViewUrl: ''
      },
      {
        id: 'mock-6', title: 'Finn Juhl', author: 'Christian Bundegaard',
        category: '設計', coverUrl: '', description: '丹麥設計大師芬·尤爾的傳記與作品集。',
        publishDate: '2019', publisher: 'Hatje Cantz', pageCount: 304,
        coverColor: '#D4874A', addedDate: '2024-03-01', driveFileId: '', driveViewUrl: ''
      },
      {
        id: 'mock-7', title: 'Nordic Living', author: 'Sara Norrman',
        category: '生活', coverUrl: '', description: '北歐生活美學，簡約中的豐盛。',
        publishDate: '2022', publisher: 'Pavilion Books', pageCount: 208,
        coverColor: '#C4A882', addedDate: '2024-03-15', driveFileId: '', driveViewUrl: ''
      },
      {
        id: 'mock-8', title: 'The Power of Now', author: 'Eckhart Tolle',
        category: '心靈', coverUrl: '', description: '當下的力量，活在當下的靈性修行。',
        publishDate: '1997', publisher: 'New World Library', pageCount: 236,
        coverColor: '#8B9B6A', addedDate: '2024-03-20', driveFileId: '', driveViewUrl: ''
      },
      {
        id: 'mock-9', title: 'Sapiens', author: 'Yuval Noah Harari',
        category: '歷史', coverUrl: '', description: '人類大歷史，從動物到上帝的演化旅程。',
        publishDate: '2011', publisher: 'Harper', pageCount: 443,
        coverColor: '#4A5568', addedDate: '2024-04-01', driveFileId: '', driveViewUrl: ''
      },
      {
        id: 'mock-10', title: 'Atomic Habits', author: 'James Clear',
        category: '自我成長', coverUrl: '', description: '原子習慣，細微改變帶來巨大成就。',
        publishDate: '2018', publisher: 'Avery', pageCount: 320,
        coverColor: '#2D6A4F', addedDate: '2024-04-10', driveFileId: '', driveViewUrl: ''
      },
      {
        id: 'mock-11', title: '挪威的森林', author: '村上春樹',
        category: '文學', coverUrl: '', description: '青春與迷失，愛與死亡的抒情小說。',
        publishDate: '1987', publisher: '講談社', pageCount: 296,
        coverColor: '#C0392B', addedDate: '2024-04-15', driveFileId: '', driveViewUrl: ''
      },
      {
        id: 'mock-12', title: 'Thinking Fast and Slow', author: 'Daniel Kahneman',
        category: '心理學', coverUrl: '', description: '快思慢想，諾貝爾獎得主的行為經濟學。',
        publishDate: '2011', publisher: 'Farrar Straus Giroux', pageCount: 499,
        coverColor: '#1A3A5C', addedDate: '2024-05-01', driveFileId: '', driveViewUrl: ''
      },
    ];

    const mockRecords = {
      'mock-1': { status: 'completed', progress: 100, rating: 5, startDate: '2024-01-10', finishDate: '2024-01-25', notes: '非常精彩的設計書，充滿靈感。', readCount: 1 },
      'mock-2': { status: 'completed', progress: 100, rating: 4, startDate: '2024-01-20', finishDate: '2024-02-05', notes: '文字優美，引人深思。', readCount: 1 },
      'mock-3': { status: 'reading',   progress: 65, rating: null, startDate: '2024-04-01', notes: '正在閱讀中，設計理念很新穎。', readCount: 0 },
      'mock-4': { status: 'completed', progress: 100, rating: 5, startDate: '2024-02-10', finishDate: '2024-03-01', notes: '最愛的攝影書之一！', readCount: 1 },
      'mock-5': { status: 'want-to-read', progress: 0, rating: null, notes: '', readCount: 0 },
      'mock-6': { status: 'want-to-read', progress: 0, rating: null, notes: '', readCount: 0 },
      'mock-7': { status: 'completed', progress: 100, rating: 4, startDate: '2024-03-15', finishDate: '2024-04-01', notes: '北歐生活美學的完美詮釋。', readCount: 1 },
      'mock-8': { status: 'reading',   progress: 30, rating: null, startDate: '2024-05-01', notes: '', readCount: 0 },
      'mock-9': { status: 'completed', progress: 100, rating: 5, startDate: '2024-04-01', finishDate: '2024-04-20', notes: '改變世界觀的一本書。', readCount: 1 },
      'mock-10': { status: 'want-to-read', progress: 0, rating: null, notes: '', readCount: 0 },
      'mock-11': { status: 'completed', progress: 100, rating: 5, startDate: '2024-02-01', finishDate: '2024-02-15', notes: '村上春樹的代表作，值得反覆閱讀。', readCount: 2 },
      'mock-12': { status: 'reading',   progress: 45, rating: null, startDate: '2024-05-10', notes: '很燒腦但很有收穫。', readCount: 0 },
    };

    saveBooks(mockBooks);
    saveRecords(mockRecords);
  }

  return {
    getSettings, saveSettings, getSetting, setSetting,
    getBooks, getBook, addBook, updateBook, deleteBook,
    getRecords, getRecord, saveRecord,
    getChatHistory, addChatMessage, clearChatHistory,
    getStats, exportData, importData, clearAllData,
    initMockData,
  };
})();
