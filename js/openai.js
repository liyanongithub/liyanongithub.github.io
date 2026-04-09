/* ============================================================
   NORDIC DIGITAL LIBRARY — OpenAI Chat Integration
   ============================================================ */

const OpenAI = (() => {
  const API_URL = 'https://api.openai.com/v1/chat/completions';

  /* ── Build System Prompt ─────────────────────────────── */
  function buildSystemPrompt() {
    const settings   = Storage.getSettings();
    const books      = Storage.getBooks();
    const records    = Storage.getRecords();
    const name       = settings.librarianName || '小書';
    const userName   = settings.userName || '讀者';

    // Summarize library (limit to 50 books to keep prompt short)
    const bookSummaries = books.slice(0, 50).map(book => {
      const rec = records[book.id] || {};
      const parts = [`《${book.title}》`];
      if (book.author)   parts.push(`作者：${book.author}`);
      if (book.category) parts.push(`分類：${book.category}`);
      if (rec.status)    parts.push(`狀態：${statusLabel(rec.status)}`);
      if (rec.rating)    parts.push(`評分：${rec.rating}星`);
      if (rec.notes)     parts.push(`心得摘要：${rec.notes.slice(0, 80)}`);
      return parts.join('，');
    }).join('\n');

    const completed = books.filter(b => records[b.id]?.status === 'completed');
    const reading   = books.filter(b => records[b.id]?.status === 'reading');

    return `你是${userName}的個人數位圖書館員，名字是「${name}」。你博學多聞、溫文儒雅，熱愛閱讀各種書籍，尤其擅長文學、藝術與設計。

## 用戶圖書館
${bookSummaries || '（尚無藏書）'}

## 閱讀統計
- 藏書總量：${books.length} 本
- 已讀完：${completed.length} 本
- 閱讀中：${reading.length} 本

## 你的職責
1. **推薦書籍**：根據用戶的口味、心情和需求，從館藏中推薦合適的書，也可推薦館藏外的好書
2. **討論書籍**：與用戶深入討論他們讀過的書，分享見解和感受
3. **找書助手**：幫助用戶在館藏中找到想看的書
4. **閱讀建議**：提供閱讀計畫、讀書方法等建議
5. **書籍知識**：回答關於書籍、作者、文學史等問題

## 回應風格
- 使用繁體中文
- 語氣親切、有文化素養，像一位老朋友
- 適時引用書中的名言或情節（要標明出處）
- 回應長度適中，不要過於冗長
- 可以用 **粗體** 強調書名或重要概念
- 若推薦書籍，說明為什麼推薦這本書`;
  }

  function statusLabel(status) {
    return { 'want-to-read':'想讀', 'reading':'閱讀中', 'completed':'已讀', 'dropped':'放棄' }[status] || status;
  }

  /* ── Chat Completion ─────────────────────────────────── */
  async function chat(messages, apiKey, model) {
    const key = apiKey || Storage.getSetting('openaiApiKey');
    if (!key) throw new Error('NO_API_KEY');

    const mdl = model || Storage.getSetting('openaiModel') || 'gpt-4o-mini';

    // Keep last 20 messages for context
    const recentMessages = messages.slice(-20);

    const payload = {
      model: mdl,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        ...recentMessages.map(m => ({ role: m.role, content: m.content })),
      ],
      max_tokens: 800,
      temperature: 0.75,
    };

    const resp = await fetch(API_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (resp.status === 401) throw new Error('INVALID_API_KEY');
      if (resp.status === 429) throw new Error('RATE_LIMIT');
      if (resp.status === 402) throw new Error('QUOTA_EXCEEDED');
      throw new Error(err.error?.message || `API Error ${resp.status}`);
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  }

  /* ── Quick Prompt Builders ───────────────────────────── */
  function promptRecommend() {
    return '請根據我目前的館藏和閱讀記錄，推薦 2-3 本我接下來可能會喜歡的書。';
  }

  function promptDiscussRecent() {
    const records = Storage.getRecords();
    const books   = Storage.getBooks();
    const recent  = books
      .filter(b => records[b.id]?.status === 'completed' && records[b.id]?.finishDate)
      .sort((a, b) => new Date(records[b.id].finishDate) - new Date(records[a.id].finishDate))
      .slice(0, 1)[0];

    if (!recent) return '我最近沒有讀完的書，你能推薦我從哪本開始嗎？';
    return `我最近讀完了《${recent.title}》，想和你聊聊這本書的感受。`;
  }

  function promptFindByMood(mood) {
    const moods = {
      relaxing:    '我現在心情放鬆，想找一本輕鬆愉快的書來閱讀。',
      educational: '我想學習新知識，有什麼值得一讀的非虛構書籍推薦嗎？',
      intense:     '我想沉浸在一個精彩的故事中，有什麼情節緊湊的書可以推薦？',
      short:       '我時間有限，能推薦一本比較短的書嗎？',
    };
    return moods[mood] || '你有什麼最近的好書推薦嗎？';
  }

  /* ── Error Messages ──────────────────────────────────── */
  function getErrorMessage(error) {
    const msg = error.message || '';
    if (msg === 'NO_API_KEY')     return '請先在設定頁面填入 OpenAI API Key，才能與我對話。';
    if (msg === 'INVALID_API_KEY') return '您的 API Key 似乎無效，請到設定頁面重新確認。';
    if (msg === 'RATE_LIMIT')     return '請求太頻繁了，請稍後再試。';
    if (msg === 'QUOTA_EXCEEDED') return '您的 OpenAI 配額已用完，請確認帳戶餘額。';
    return `抱歉，發生了一些問題：${msg}`;
  }

  return {
    chat, buildSystemPrompt,
    promptRecommend, promptDiscussRecent, promptFindByMood,
    getErrorMessage,
  };
})();
