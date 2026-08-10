const path = require('path');
const fs = require('fs');
const express = require('express');
const Database = require('better-sqlite3');

const app = express();
const DB = new Database(path.join(__dirname, 'pet-hotel.db'));
DB.pragma('journal_mode = WAL');
DB.exec(`
CREATE TABLE IF NOT EXISTS requests(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  pet TEXT NOT NULL,
  dates TEXT DEFAULT '',
  msg TEXT DEFAULT '',
  created TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS comments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  rating INTEGER DEFAULT 5,
  created TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS meta(
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS likes(
  photo TEXT PRIMARY KEY,
  count INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS photo_captions(
  photo TEXT PRIMARY KEY,
  caption TEXT DEFAULT ''
);
`);
// Небольшой стартовый контент (можно удалить когда появятся настоящие)
const nReq = DB.prepare('SELECT COUNT(*) c FROM requests').get().c;
if (nReq === 0) {
  DB.prepare('INSERT INTO requests(name,phone,pet,dates,msg) VALUES(?,?,?,?,?)')
    .run('Анна', '+7 900 111-22-33', 'Кошка', '1–15 июля', 'Кошка 3 года, очень спокойная, любит спать на подоконнике.');
  DB.prepare('INSERT INTO requests(name,phone,pet,dates,msg) VALUES(?,?,?,?,?)')
    .run('Игорь', '+7 900 444-55-66', 'Собака', '20–30 августа', 'Такса, 5 лет, нужны две прогулки в день.');
}
// 10 стартовых отзывов. Добавляются один раз (флаг в meta), потом их можно спокойно удалять.
const seedComments = [
  ['Марина', 'Оставили кота на всё лето — привезли домой довольного и упитанного. Каждый день фото! Спасибо большое!', 5],
  ['Дмитрий', 'Собака гуляла два раза в день, кормили строго по графику. Теперь ездим в отпуск без нервов.', 5],
  ['Виктория', 'Оставила своего котика на передержке — Кристина встретила очень тепло, всё рассказала и регулярно присылала фото и видео. Котик вернулся бодрым, весёлым и ничуть не стрессованным. Очень благодарна за такую чуткую заботу! Однозначно рекомендую.', 5],
  ['Ольга', 'Кошку на две недели отдала со своей лежанкой и игрушками. Привезли домой спокойную и довольную, отчёт с фото присылали каждый день.', 5],
  ['Сергей', 'Шпиц у Кристины жил как в санатории: прогулки, игры, свой уютный уголок. Вернулся радостный. Спасибо за заботу!', 5],
  ['Екатерина', 'Мой кот — капризуля, никого к себе не подпускает. Но Кристина нашла к нему подход, и всё прошло отлично. Настоящий профессионал!', 5],
  ['Алексей', 'Пожилой пёс требовал особого ухода — кормление по часам, лекарства. Всё сделали как договорились, собака была спокойна. Огромное спасибо!', 5],
  ['Наталья', 'Двух кошек оставляли на новогодние праздники. Домой вернулись ухоженные и спокойные, а мы получили кучу милых фото. Рекомендую!', 5],
  ['Ирина', 'Попугая оставляла на время отпуска. Кормили строго по расписанию, клетку содержали в чистоте. Всё чётко и по договорённости.', 4],
  ['Павел', 'Кот и собака вместе — обычно сложно, но Кристина справилась отлично. Животные подружились, а мы спокойно уехали. Спасибо!', 5]
];
const comSeeded = DB.prepare("SELECT value FROM meta WHERE key = 'seed_comments_v1'").get();
if (!comSeeded) {
  const insCom = DB.prepare('INSERT INTO comments(name,text,rating) VALUES(?,?,?)');
  for (const [name, text, rating] of seedComments) {
    const exists = DB.prepare('SELECT 1 FROM comments WHERE text = ?').get(text);
    if (!exists) insCom.run(name, text, rating);
  }
  DB.prepare("INSERT INTO meta(key,value) VALUES('seed_comments_v1','1')").run();
}

app.use(express.static(__dirname));
// Лимит 15mb — чтобы модератор мог загружать большие фото с телефона
// (base64 +33% от размера файла; серверный лимит на файл = 10 МБ)
app.use(express.json({ limit: '15mb' }));

// ── Кабинет модератора: секретный пароль ──
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'MilyDom2026!';
const SESSIONS = new Set();

// Телефон в публичных заявках скрыт: остаются первые 3 и последние 2 цифры
function maskPhone(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  const digits = s.replace(/\D/g, '');
  if (digits.length < 6) return s;
  let out = '', di = 0;
  for (const ch of s) {
    if (/\d/.test(ch)) {
      di++;
      out += (di <= 3 || di > digits.length - 2) ? ch : '*';
    } else out += ch;
  }
  return out;
}
function isAdmin(req) {
  const t = req.get('x-admin-token');
  return !!(t && SESSIONS.has(t));
}
function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Требуется вход в кабинет модератора' });
  next();
}

app.post('/api/admin/login', (req, res) => {
  const p = String((req.body || {}).password || '');
  if (p !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Неверный пароль' });
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
  SESSIONS.add(token);
  res.json({ ok: true, token });
});
app.get('/api/admin/requests', requireAdmin, (req, res) => {
  res.json(DB.prepare('SELECT * FROM requests ORDER BY id DESC').all());
});
app.get('/api/admin/comments', requireAdmin, (req, res) => {
  res.json(DB.prepare('SELECT * FROM comments ORDER BY id DESC').all());
});
app.delete('/api/admin/requests/:id', requireAdmin, (req, res) => {
  DB.prepare('DELETE FROM requests WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});
app.delete('/api/admin/comments/:id', requireAdmin, (req, res) => {
  DB.prepare('DELETE FROM comments WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ── Галерея: фото хранятся в img/gallery ──
const GALLERY_DIR = path.join(__dirname, 'img', 'gallery');
fs.mkdirSync(GALLERY_DIR, { recursive: true });
const IMG_RE = /\.(jpe?g|png|webp|gif|avif)$/i;

// Стартовые лайки для первых фото (3–8), дальше считаются по кликам
const seedLikes = { 'photo-1.jpg': 5, 'photo-2.jpg': 3, 'photo-3.jpg': 6, 'photo-4.jpg': 4 };
// Стартовые подписи (модератор может изменить в кабинете)
const seedCaptions = {
  'photo-1.jpg': 'Мурзик отдыхает на своём лежаке',
  'photo-2.jpg': 'Прогулка с Барсиком на свежем воздухе',
  'photo-3.jpg': 'Игровой час — любимые игрушки',
  'photo-4.jpg': 'Сладкий сон после активного дня'
};

function safeFile(name) {
  return String(name || '').replace(/[^a-zA-Z0-9._-]/g, '').slice(-60);
}

// Настройки галереи: порядок показа и секунды на фото (хранятся в meta)
function getGalSettings(){
  let order = [];
  try { order = JSON.parse((DB.prepare("SELECT value FROM meta WHERE key='gal_order'").get() || {}).value || '[]'); } catch (e) { order = []; }
  if (!Array.isArray(order)) order = [];
  const ivRow = DB.prepare("SELECT value FROM meta WHERE key='gal_interval'").get();
  let interval = parseFloat(ivRow ? ivRow.value : 4.5) || 4.5;
  interval = Math.max(1, Math.min(60, interval));
  return { order, interval };
}

app.get('/api/gallery', (req, res) => {
  let files = [];
  try { files = fs.readdirSync(GALLERY_DIR).filter(f => IMG_RE.test(f)).sort(); } catch (e) {}
  const settings = getGalSettings();
  // Ручной порядок модератора: выбранные фото идут в заданном порядке, остальные — дальше по алфавиту
  const chosen = settings.order.filter(f => files.indexOf(f) !== -1);
  const ordered = chosen.concat(files.filter(f => chosen.indexOf(f) === -1));
  const ensure = DB.prepare('INSERT OR IGNORE INTO likes(photo,count) VALUES(?,?)');
  const get = DB.prepare('SELECT count FROM likes WHERE photo = ?');
  const ensureCap = DB.prepare('INSERT OR IGNORE INTO photo_captions(photo,caption) VALUES(?,?)');
  const getCap = DB.prepare('SELECT caption FROM photo_captions WHERE photo = ?');
  res.json({
    photos: ordered.map(f => {
      ensure.run(f, seedLikes[f] || 0);
      ensureCap.run(f, seedCaptions[f] || '');
      const row = get.get(f);
      const cap = getCap.get(f);
      return { file: f, url: '/img/gallery/' + f, likes: row ? row.count : (seedLikes[f] || 0), caption: cap ? cap.caption : '' };
    }),
    interval: settings.interval
  });
});

app.post('/api/gallery/like', (req, res) => {
  const f = safeFile((req.body || {}).file || '');
  if (!f || !fs.existsSync(path.join(GALLERY_DIR, f))) return res.status(400).json({ error: 'Нет такого фото' });
  DB.prepare('INSERT OR IGNORE INTO likes(photo,count) VALUES(?,0)').run(f);
  DB.prepare('UPDATE likes SET count = count + 1 WHERE photo = ?').run(f);
  const row = DB.prepare('SELECT count FROM likes WHERE photo = ?').get(f);
  res.json({ ok: true, likes: row ? row.count : 1 });
});

app.post('/api/gallery/unlike', (req, res) => {
  const f = safeFile((req.body || {}).file || '');
  if (!f || !fs.existsSync(path.join(GALLERY_DIR, f))) return res.status(400).json({ error: 'Нет такого фото' });
  DB.prepare('INSERT OR IGNORE INTO likes(photo,count) VALUES(?,0)').run(f);
  DB.prepare('UPDATE likes SET count = MAX(0, count - 1) WHERE photo = ?').run(f);
  const row = DB.prepare('SELECT count FROM likes WHERE photo = ?').get(f);
  res.json({ ok: true, likes: row ? row.count : 0 });
});

app.post('/api/admin/gallery/caption', requireAdmin, (req, res) => {
  const b = req.body || {};
  const f = safeFile(b.file || '');
  const caption = String(b.caption == null ? '' : b.caption).trim().slice(0, 200);
  if (!f || !fs.existsSync(path.join(GALLERY_DIR, f))) return res.status(400).json({ error: 'Нет такого фото' });
  DB.prepare('INSERT INTO photo_captions(photo,caption) VALUES(?,?) ON CONFLICT(photo) DO UPDATE SET caption = excluded.caption').run(f, caption);
  res.json({ ok: true, caption: caption });
});

app.post('/api/admin/gallery', requireAdmin, (req, res) => {
  const b = req.body || {};
  const data = String(b.data || '');
  const mime = String(b.mime || 'image/jpeg');
  if (!data) return res.status(400).json({ error: 'Нет данных фото' });
  const buf = Buffer.from(data, 'base64');
  if (!buf.length) return res.status(400).json({ error: 'Файл пустой' });
  if (buf.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'Файл больше 10 МБ' });
  const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : mime === 'image/gif' ? '.gif' : mime === 'image/avif' ? '.avif' : '.jpg';
  const base = safeFile(b.name).replace(/\.[^.]+$/, '') || 'photo';
  let fname = base + ext, i = 1;
  while (fs.existsSync(path.join(GALLERY_DIR, fname))) fname = base + '-' + (i++) + ext;
  fs.writeFileSync(path.join(GALLERY_DIR, fname), buf);
  res.json({ ok: true, file: fname });
});

app.delete('/api/admin/gallery/:file', requireAdmin, (req, res) => {
  const f = safeFile(req.params.file);
  const full = path.join(GALLERY_DIR, f);
  if (f && full.startsWith(GALLERY_DIR) && IMG_RE.test(f) && fs.existsSync(full)) {
    fs.unlinkSync(full);
  }
  res.json({ ok: true });
});

// ── Настройки показа галереи: порядок и секунды на фото ──
app.get('/api/admin/gallery/settings', requireAdmin, (req, res) => {
  res.json(getGalSettings());
});
app.post('/api/admin/gallery/settings', requireAdmin, (req, res) => {
  const b = req.body || {};
  // Если порядок не передан — сохраняем текущий (чтобы смена только интервала не сбрасывала порядок)
  let order = getGalSettings().order;
  if (Array.isArray(b.order)) {
    order = b.order.map(f => safeFile(f)).filter(f => !!f).filter((f, i, a) => a.indexOf(f) === i);
  }
  let interval = getGalSettings().interval;
  if (b.interval != null && String(b.interval).trim() !== '') {
    const v = parseFloat(b.interval);
    if (!isNaN(v)) interval = Math.max(1, Math.min(60, v));
  }
  DB.prepare("INSERT INTO meta(key,value) VALUES('gal_order',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(order));
  DB.prepare("INSERT INTO meta(key,value) VALUES('gal_interval',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(interval));
  res.json({ ok: true, order, interval });
});

app.get('/api/requests', (req, res) => {
  res.json(DB.prepare('SELECT * FROM requests ORDER BY id DESC').all().map(r => ({ ...r, phone: maskPhone(r.phone) })));
});
app.post('/api/requests', (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const phone = String(b.phone || '').trim();
  const pet = String(b.pet || '').trim();
  if (!name || !phone || !pet) return res.status(400).json({ error: 'Заполните имя, телефон и питомца' });
  const dates = String(b.dates || '').trim();
  const msg = String(b.msg || '').trim();
  const info = DB.prepare('INSERT INTO requests(name,phone,pet,dates,msg) VALUES(?,?,?,?,?)').run(name, phone, pet, dates, msg);
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.get('/api/comments', (req, res) => {
  res.json(DB.prepare('SELECT * FROM comments ORDER BY id DESC').all());
});
app.post('/api/comments', (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const text = String(b.text || '').trim();
  if (!name || !text) return res.status(400).json({ error: 'Заполните имя и текст отзыва' });
  const rating = Math.max(1, Math.min(5, parseInt(b.rating) || 5));
  const info = DB.prepare('INSERT INTO comments(name,text,rating) VALUES(?,?,?)').run(name, text, rating);
  res.json({ ok: true, id: info.lastInsertRowid });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log('🐾 Pet hotel server: http://localhost:' + PORT));
