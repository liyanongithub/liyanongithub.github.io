/* ============================================================
   NORDIC DIGITAL LIBRARY — Google Drive Integration
   ============================================================ */

const GDrive = (() => {
  let accessToken = null;
  let tokenClient = null;

  const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
  const FILES_API = 'https://www.googleapis.com/drive/v3/files';

  /* ── Initialize GIS ──────────────────────────────────── */
  function init(clientId) {
    if (!clientId) return Promise.reject('Missing Google Client ID');
    if (!window.google?.accounts?.oauth2) {
      return Promise.reject('Google Identity Services not loaded');
    }

    return new Promise((resolve, reject) => {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (resp) => {
          if (resp.error) { reject(resp); return; }
          accessToken = resp.access_token;
          resolve(accessToken);
        },
        error_callback: reject,
      });
      resolve(null); // init successful, token not yet obtained
    });
  }

  /* ── Request Access Token ────────────────────────────── */
  function requestToken() {
    return new Promise((resolve, reject) => {
      if (!tokenClient) { reject('GDrive not initialized'); return; }
      tokenClient.callback = (resp) => {
        if (resp.error) { reject(resp); return; }
        accessToken = resp.access_token;
        resolve(accessToken);
      };
      tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  function isAuthorized() {
    return !!accessToken;
  }

  function signOut() {
    if (accessToken && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(accessToken);
    }
    accessToken = null;
  }

  /* ── List Files in Folder ────────────────────────────── */
  async function listFiles(folderId) {
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
      if (resp.status === 401) { accessToken = null; }
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

  /* ── Sync Books from Drive ───────────────────────────── */
  async function syncBooks(folderId, onProgress) {
    const files = await listFiles(folderId);
    const added = [];
    const updated = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      onProgress?.(i + 1, files.length, file.name);

      const bookData = fileToBook(file);
      const existing = Storage.getBook(file.id);

      if (existing) {
        // Only update Drive-specific fields, preserve user metadata
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

  /* ── Pick Folder ─────────────────────────────────────── */
  function openFolderPicker(apiKey) {
    return new Promise((resolve, reject) => {
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
    init, requestToken, isAuthorized, signOut,
    listFiles, syncBooks, fileToBook, openFolderPicker,
  };
})();
