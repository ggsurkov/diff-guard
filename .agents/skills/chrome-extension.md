# Chrome Extension Manifest V3: правила для этого проекта

## Общее

- Только **Manifest V3**. Никаких `manifest_version: 2`, `background.page`,
  `background.scripts` (persistent background) — их не существует в MV3.
- Основной UI — **Side Panel** (`chrome.sidePanel`), не popup: анализ diff'а —
  долгоживущая задача с прогрессом загрузки модели, popup закрывается при
  потере фокуса и убивает состояние. Popup можно оставить только как лёгкую
  точку входа ("Open in side panel").

## Service Worker

- `background` — событийный `service_worker`, без постоянного состояния в
  памяти между вызовами (Chrome может выгрузить его в любой момент).
  Любое состояние, которое должно пережить перезапуск воркера, — в
  `chrome.storage.local`, не в module-level переменных.
- Не выполняй инференс WebLLM/WebGPU в service worker — там нет доступа к
  WebGPU. Вся ML-логика живёт в side panel / content-контексте с DOM.
- Service worker используется только для оркестрации: жизненный цикл
  расширения, `chrome.action`/`chrome.sidePanel` API, message passing.

## CSP и WebAssembly/WebGPU

- WebLLM грузит модели и WASM-рантайм — `content_security_policy.extension_pages`
  должен разрешать `wasm-unsafe-eval`:
  ```json
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  }
  ```
- Веса моделей и шейдеры WebGPU грузятся с CDN (Hugging Face / MLC) —
  разрешать через `connect-src` в CSP и через `host_permissions`, явно
  перечисляя домены, а не `<all_urls>`.
- CSS/SCSS-песочница для анимаций — обязательно `<iframe sandbox="allow-scripts">`
  без `allow-same-origin`, чтобы пользовательский/сгенерированный CSS не имел
  доступа к DOM расширения.

## Permissions

- Запрашивать только то, что реально используется на этой итерации
  (`sidePanel`, `storage`). Не добавлять `tabs`, `activeTab`, `scripting`
  и т.п. "про запас".
- Diff грузится через `<input type="file">` / File System Access API из
  самой страницы side panel — это не требует дополнительных Chrome-permissions.

## Отладка

- Логи service worker — `chrome://extensions` → "Service worker" → "Inspect".
- Side panel — открывается как обычная DevTools-панель через ПКМ → "Inspect".
