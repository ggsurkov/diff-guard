# diff-guard

Локальный AI-аудитор Git diff для фронтендеров с генеративным UI. Chrome
Extension (Manifest V3): анализ `.diff`-файлов прямо в браузере через WebLLM
на WebGPU — без сети и без бэкенда, код не покидает устройство.

**Стек:** Svelte 5 (Runes) · TypeScript · Vite · WebLLM · WebGPU

## Запуск

```bash
npm install
npm run dev     # dev-сервер с HMR
npm run build   # production-сборка в dist/
```

Загрузите `dist/` как unpacked-расширение в `chrome://extensions`.
