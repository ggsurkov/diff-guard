# diff-guard

Локальный AI-аудитор Git diff для фронтендеров с генеративным UI. Chrome
Extension (Manifest V3) с полноэкранным Dashboard (открывается в отдельной
вкладке): анализ `.diff`-файлов прямо на устройстве — через WebLLM/WebGPU в
браузере или через локальный Ollama-сервер (`localhost:11434`), без внешнего
бэкенда, код не покидает устройство.

**Стек:** Svelte 5 (Runes) · TypeScript · Vite · WebLLM · WebGPU · Ollama

## Запуск

```bash
npm install
npm run dev     # dev-сервер с HMR
npm run build   # production-сборка в dist/
```

Загрузите `dist/` как unpacked-расширение в `chrome://extensions`.
