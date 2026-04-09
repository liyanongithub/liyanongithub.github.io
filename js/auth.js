/* ============================================================
   NORDIC DIGITAL LIBRARY — Auth (Google Sign-In + Drive OAuth2)
   ============================================================ */

const Auth = (() => {
  const SCOPES   = 'email profile https://www.googleapis.com/auth/drive.readonly';
  const USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo';
  const GIS_URL  = 'https://accounts.google.com/gsi/client';

  /* ── Token store ─────────────────────────────────────── */
  function isAuthenticated() {
    const a = Storage.getAuth();
    return !!(a && a.accessToken && Date.now() < a.expiresAt - 60_000);
  }

  /* Redirect to login if not authed; returns false to allow callers to halt */
  function requireAuth() {
    if (!isAuthenticated()) {
      const here = encodeURIComponent(location.pathname + location.search);
      location.href = 'login.html?redirect=' + here;
      return false;
    }
    return true;
  }

  function getToken() { return Storage.getAuth()?.accessToken || null; }
  function getUser()  { return Storage.getAuth()?.user || null; }

  /* Render Google profile pic (or initial) into a header avatar element */
  function renderAvatar(el) {
    if (!el) return;
    const user = getUser();
    if (!user) { el.textContent = '?'; return; }
    if (user.picture) {
      el.style.padding = '0';
      el.innerHTML = `<img src="${user.picture}" alt=""
        style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      el.textContent = user.name?.charAt(0)?.toUpperCase() || '?';
    }
  }

  /* ── Load Google Identity Services ──────────────────── */
  function loadGIS() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) { resolve(); return; }
      const s = document.createElement('script');
      s.src = GIS_URL;
      s.onload  = resolve;
      s.onerror = () => reject(new Error('無法載入 Google 服務'));
      document.head.appendChild(s);
    });
  }

  /* ── Login (opens Google consent popup) ─────────────── */
  async function login() {
    const clientId = Storage.getSetting('googleClientId');
    if (!clientId) throw new Error('NO_CLIENT_ID');
    await loadGIS();

    return new Promise((resolve, reject) => {
      const tc = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: async (resp) => {
          if (resp.error) { reject(new Error(resp.error)); return; }
          try {
            const r = await fetch(USERINFO, {
              headers: { Authorization: `Bearer ${resp.access_token}` }
            });
            const u = await r.json();
            const authData = {
              accessToken: resp.access_token,
              expiresAt:   Date.now() + (resp.expires_in * 1000),
              user: {
                name:    u.name    || u.email,
                email:   u.email,
                picture: u.picture || '',
              },
            };
            Storage.saveAuth(authData);
            resolve(authData);
          } catch (e) { reject(e); }
        },
        error_callback: reject,
      });
      tc.requestAccessToken({ prompt: 'consent' });
    });
  }

  /* ── Logout ──────────────────────────────────────────── */
  function logout() {
    const a = Storage.getAuth();
    if (a?.accessToken && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(a.accessToken, () => {});
    }
    Storage.clearAuth();
    location.href = 'login.html';
  }

  return { isAuthenticated, requireAuth, getToken, getUser, renderAvatar, login, logout, loadGIS };
})();
