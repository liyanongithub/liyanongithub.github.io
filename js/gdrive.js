/* ============================================================
   NORDIC DIGITAL LIBRARY — Google Drive Integration
   ============================================================ */

const GDrive = (() => {
  const FILES_API = 'https://www.googleapis.com/drive/v3/files';

  /* Auth is handled centrally by auth.js — use Auth.getToken() */
  function getToken() {
    return (typeof Auth !== 'undefined' ? Auth.getToken() : null);
  }

  function isAuthorized() { return !!getToken(); }

  /* No-ops kept for backward compat */
  function init()         { return Promise.resolve(); }
  function requestToken() { return Promise.resolve(getToken()); }
  function signOut()      { if (typeof Auth !== 'undefined') Auth.logout(); }

  /* ── List Files in Folder ────────────────────────────── */
  async function listFiles(folderId) {
    const accessToken = getToken();
    if (!accessToken) throw new Error('Not authorized');

    const bookMimeTypes = [
      'application/pdf',
      'application/epub+zip',
      'application/vnd.google-apps.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];

    const q = folderId
      ? `'${folderId}' in parents and trashed=false`
      : `trashed=false and (${bookMimeTypes.map(t => `mimeType='${t}'`).join(' or ')})`;

    const params = new URLSearchParams({
      q,
      fields: 'files(id,name,mimeType,thumbnailLink,createdTime,size,description,imageMediaMetadata)',
      pageSize: '200',
      orderBy: 'name',
    });

    const resp = await fetch(`${FILES_API}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!resp.ok) {
      if (resp.status === 401) { Storage.clearAuth(); }
      throw new Error(`Drive API error: ${resp.status}`);
    }

    const data = await resp.json();
    return data.files || [];
  }

  /* ── Map Drive File → Book Object ────────────────────── */
  function fileToBook(file) {
    const title = cleanTitle(file.name);
    const coverUrl = file.thumbnailLink
      ? file.thumbnailLink.replace('=s220', '=s400')
      : '';

    return {
      id:           file.id,
      title,
      author:       '',
      category:     guessCategoryFromName(file.name),
      tags:         [],
      coverUrl,
      description:  file.description || '',
      publishDate:  '',
      publisher:    '',
      pageCount:    null,
      driveFileId:  file.id,
      driveViewUrl: `https://drive.google.com/file/d/${file.id}/view`,
      driveMimeType: file.mimeType,
      addedDate:    (file.createdTime || new Date().toISOString()).split('T')[0],
      coverColor:   '',
    };
  }

  function cleanTitle(filename) {
    // Remove extension and common suffixes
    return filename
      .replace(/\.[^.]+$/, '')           // remove extension
      .replace(/[-_]/g, ' ')             // dashes/underscores → spaces
      .replace(/\s+/g, ' ')
      .trim();
  }

  function guessCategoryFromName(name) {
    const lower = name.toLowerCase();
    if (/novel|fiction|story|小說|故事/.test(lower)) return '文學';
    if (/design|art|photo|設計|藝術/.test(lower))    return '設計';
    if (/tech|code|program|科技/.test(lower))         return '技術';
    if (/history|歷史/.test(lower))                   return '歷史';
    if (/sci|science|科學/.test(lower))               return '科學';
    if (/travel|旅行/.test(lower))                    return '旅行';
    if (/cook|food|料理/.test(lower))                 return '料理';
    return '';
  }

  /* ── Read Google Sheets → array of book metadata ────── */
  async function readSheet(sheetId) {
    const token = getToken();
    if (!token || !sheetId) return [];

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/A:K`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Sheets API ${resp.status}: ${errText.slice(0, 120)}`);
    }

    const data = await resp.json();
    const rows = data.values || [];
    if (rows.length < 2) return [];

    // Auto-detect column positions from header row
    const HEADER_MAP = {
      title:       ['書名', 'title', 'name'],
      author:      ['作者', 'author'],
      publishDate: ['出版日', '出版年', '年份', 'year'],
      category:    ['分類', '類別', 'category'],
      language:    ['語言', 'language'],
      pageCount:   ['頁數', '頁', 'pages'],
      description: ['總結', '描述', '簡介', 'description', 'summary'],
      coverUrl:    ['封面連結', '封面', 'cover', 'coverurl'],
      drivePath:   ['path', '路徑', 'drive', 'link', '連結'],
    };

    const headers = rows[0].map(h => (h || '').trim().toLowerCase());
    const idx = {};
    for (const [field, names] of Object.entries(HEADER_MAP)) {
      idx[field] = names.reduce((found, n) => {
        if (found >= 0) return found;
        const i = headers.findIndex(h => h === n.toLowerCase() || h.includes(n.toLowerCase()));
        return i >= 0 ? i : found;
      }, -1);
    }

    const results = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const get = (field) => idx[field] >= 0 ? (row[idx[field]] || '').trim() : '';

      // Extract Drive file ID from Path column URL
      const path = get('drivePath');
      if (!path) continue;
      const match = path.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (!match) continue;

      results.push({
        driveFileId:  match[1],
        title:        get('title'),
        author:       get('author'),
        publishDate:  get('publishDate'),
        category:     get('category'),
        language:     get('language'),
        pageCount:    parseInt(get('pageCount')) || null,
        description:  get('description'),
        coverUrl:     get('coverUrl'),
      });
    }
    return results;
  }

  /* ── Sync Books ──────────────────────────────────────── */
  async function syncBooks(folderId, sheetId, onProgress) {
    // Support legacy 2-arg call: syncBooks(folderId, onProgress)
    if (typeof sheetId === 'function') { onProgress = sheetId; sheetId = ''; }

    if (sheetId) {
      // ── Sheet-first mode: spreadsheet IS the book list ──
      onProgress?.(0, 0, '正在讀取試算表…');
      const sheetBooks = await readSheet(sheetId);
      if (sheetBooks.length === 0) throw new Error('試算表無資料，請確認 Sheet ID 和 Path 欄位');

      const added = [], updated = [];

      for (let i = 0; i < sheetBooks.length; i++) {
        const meta = sheetBooks[i];
        onProgress?.(i + 1, sheetBooks.length, meta.title || meta.driveFileId);

        const bookData = {
          id:           meta.driveFileId,
          title:        meta.title        || '',
          author:       meta.author       || '',
          category:     meta.category     || '',
          language:     meta.language     || '',
          pageCount:    meta.pageCount    || null,
          description:  meta.description  || '',
          coverUrl:     meta.coverUrl     || '',
          publishDate:  meta.publishDate  || '',
          tags:         [],
          publisher:    '',
          coverColor:   '',
          driveFileId:  meta.driveFileId,
          driveViewUrl: `https://drive.google.com/file/d/${meta.driveFileId}/view`,
          driveMimeType: '',
          addedDate:    new Date().toISOString().split('T')[0],
        };

        const existing = Storage.getBook(meta.driveFileId);
        if (existing) {
          Storage.updateBook(meta.driveFileId, {
            title:        meta.title        || existing.title,
            author:       meta.author       || existing.author,
            category:     meta.category     || existing.category,
            language:     meta.language     || existing.language,
            pageCount:    meta.pageCount    || existing.pageCount,
            description:  meta.description  || existing.description,
            coverUrl:     existing.coverUrl || meta.coverUrl || '',
            publishDate:  meta.publishDate  || existing.publishDate,
            driveViewUrl: bookData.driveViewUrl,
          });
          updated.push(meta.title || meta.driveFileId);
        } else {
          Storage.addBook(bookData);
          added.push(meta.title || meta.driveFileId);
        }
      }

      Storage.setSetting('lastSyncDate', new Date().toISOString());
      return { added, updated, total: sheetBooks.length };

    } else {
      // ── Drive-only mode: search for files in folder ───
      const files = await listFiles(folderId);
      const added = [], updated = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        onProgress?.(i + 1, files.length, file.name);
        const bookData = fileToBook(file);
        const existing = Storage.getBook(file.id);
        if (existing) {
          Storage.updateBook(file.id, {
            driveViewUrl:  bookData.driveViewUrl,
            driveMimeType: bookData.driveMimeType,
            coverUrl:      existing.coverUrl || bookData.coverUrl,
          });
          updated.push(file.name);
        } else {
          Storage.addBook(bookData);
          added.push(file.name);
        }
      }

      Storage.setSetting('lastSyncDate', new Date().toISOString());
      return { added, updated, total: files.length };
    }
  }

  /* ── Pick Folder ─────────────────────────────────────── */
  function openFolderPicker(apiKey) {
    return new Promise((resolve, reject) => {
      const accessToken = getToken();
      if (!accessToken) { reject('Not authorized'); return; }

      // Load Google Picker API
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        gapi.load('picker', () => {
          const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
            .setSelectFolderEnabled(true);

          const picker = new google.picker.PickerBuilder()
            .addView(view)
            .setOAuthToken(accessToken)
            .setDeveloperKey(apiKey || '')
            .setCallback((data) => {
              if (data.action === google.picker.Action.PICKED) {
                const folder = data.docs[0];
                resolve({ id: folder.id, name: folder.name });
              } else if (data.action === google.picker.Action.CANCEL) {
                reject('cancelled');
              }
            })
            .build();
          picker.setVisible(true);
        });
      };
      document.head.appendChild(script);
    });
  }

  return {
    init, requestToken, isAuthorized, signOut, readSheet,
    listFiles, syncBooks, fileToBook, openFolderPicker,
  };
})();
