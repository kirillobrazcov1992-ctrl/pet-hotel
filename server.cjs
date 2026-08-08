const path = require('path');
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
`);
// Небольшой стартовый контент (можно удалить когда появятся настоящие)
const nReq = DB.prepare('SELECT COUNT(*) c FROM requests').get().c;
if (nReq === 0) {
  DB.prepare('INSERT INTO requests(name,phone,pet,dates,msg) VALUES(?,?,?,?,?)')
    .run('Анна', '+7 900 111-22-33', 'Кошка', '1–15 июля', 'Кошка 3 года, очень спокойная, любит спать на подоконнике.');
  DB.prepare('INSERT INTO requests(name,phone,pet,dates,msg) VALUES(?,?,?,?,?)')
    .run('Игорь', '+7 900 444-55-66', 'Собака', '20–30 августа', 'Такса, 5 лет, нужны две прогулки в день.');
}
const nCom = DB.prepare('SELECT COUNT(*) c FROM comments').get().c;
if (nCom === 0) {
  DB.prepare('INSERT INTO comments(name,text,rating) VALUES(?,?,?)').run('Марина', 'Оставили кота на всё лето — привезли домой довольного и упитанного. Каждый день фото! Спасибо большое!', 5);
  DB.prepare('INSERT INTO comments(name,text,rating) VALUES(?,?,?)').run('Дмитрий', 'Собака гуляла два раза в день, кормили строго по графику. Теперь ездим в отпуск без нервов.', 5);
}

app.use(express.static(__dirname));
app.use(express.json());

app.get('/api/requests', (req, res) => {
  res.json(DB.prepare('SELECT * FROM requests ORDER BY id DESC').all());
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
