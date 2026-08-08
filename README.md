# 🐾 Отель «Милый Дом» — передержка животных

Маленький сайт с сервером: главная, заявки на размещение (видны всем), живые отзывы (летящая лента).

## Запуск локально
```bash
npm install
npm start          # http://localhost:3002
```

## Выкладка на Render (render.com)
1. Залейте проект в GitHub-репозиторий (файлы: `server.cjs`, `index.html`, `zayavka.html`, `comments.html`, `style.css`, `img/`, `package.json`, `render.yaml`).
2. На Render: **New → Web Service** → подключите репозиторий.
3. Build: `npm install` · Start: `node server.cjs`
4. Готово! URL вида `https://pet-hotel.onrender.com`

> Данные (заявки и отзывы) хранятся в `pet-hotel.db` (SQLite). На бесплатном тарифе Render диск временный — при пересоздании сервиса данные сбросятся. Чтобы хранить постоянно — добавьте Persistent Disk и настройте путь к БД.
