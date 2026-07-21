# Сборка и запуск

## Команды

```bash
npm install        # установка зависимостей
npm run dev         # dev-сервер (@crxjs/vite-plugin) с HMR прямо в side panel
npm run build        # production-сборка в dist/
npm run check         # проверка типов (svelte-check)
```

`npm run dev` поднимает обычный Vite dev-сервер: `@crxjs/vite-plugin`
переписывает `manifest.json` так, чтобы страницы расширения подключались к
этому серверу и получали HMR (изменения в `.svelte`-файлах применяются в
открытой side panel без ручной перезагрузки). Расширение всё равно нужно
один раз загрузить как unpacked из `dist/` (см. ниже) — крутящийся `npm run
dev` пересобирает `dist/` на лету при каждом изменении.

## Загрузка нераспакованного расширения в Chrome

1. Выполнить `npm run build` (или запустить `npm run dev` и дождаться первой сборки).
2. Открыть `chrome://extensions`.
3. Включить переключатель **"Developer mode"** (правый верхний угол).
4. Нажать **"Load unpacked"** и выбрать папку `dist/` из корня проекта.
5. Расширение появится в списке с иконкой; клик по иконке на панели
   инструментов Chrome открывает Dashboard в новой вкладке
   (`chrome.tabs.create`).

## После изменений в коде

- Изменения в `.svelte`/`.ts` файлах при запущенном `npm run dev`:
  применяются через HMR прямо в открытой вкладке Dashboard, перезагрузка не
  нужна.
- Изменения в `manifest.json`, `permissions`, service worker или
  добавление/удаление статических файлов: crxjs сам инициирует полную
  перезагрузку расширения; если этого не произошло — вручную нажать
  "Reload" на карточке расширения в `chrome://extensions`.
- Ошибки service worker смотреть через "Inspect views: service worker" на
  карточке расширения; ошибки Dashboard — обычный DevTools (F12) во вкладке.

## Требования

- WebGPU: Chrome 113+ с включённым `chrome://flags/#enable-unsafe-webgpu`
  на некоторых системах (обычно не требуется в актуальных Chrome/Chromium на
  Windows/macOS с поддерживаемым GPU). Если `navigator.gpu` недоступен —
  приложение должно показать явное сообщение, а не падать молча.
