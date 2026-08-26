# Voxygen

## Как собрать и задеплоить на Cloudflare

1. Загрузите всю эту папку (с сохранением структуры `src/`) в новый репозиторий на GitHub — можно прямо через веб: create repository → Add file → Upload files → перетащить всю папку.
2. В Cloudflare: Create application → Pages/Workers → **Connect to Git** (не Direct upload — она не умеет собирать проекты).
3. Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`.
4. Deploy — получите `https://<имя>.pages.dev`, готовый для @BotFather.

## Локально (по желанию)
```
npm install
npm run dev      # локальный просмотр
npm run build    # сборка в папку dist
```
