# Chrome Extension Manifest V3: правила для этого проекта

## Общее

- Только **Manifest V3**. Никаких `manifest_version: 2`, `background.page`,
  `background.scripts` (persistent background) — их не существует в MV3.
- Основной UI — **полноэкранный Dashboard** (`src/dashboard/index.html`),
  открывается в отдельной вкладке (`chrome.tabs.create`) по клику на иконку
  расширения (`chrome.action.onClicked`), не popup и не Side Panel: анализ
  diff'а — долгоживущая задача с прогрессом загрузки модели, popup закрывается
  при потере фокуса и убивает состояние, а Side Panel слишком тесен для
  двухколоночного макета с песочницами. Страница также зарегистрирована как
  `options_ui` (`open_in_tab: true`) — это единственный manifest-хук, которым
  crxjs подхватывает статичную html-страницу для полноценной сборки; сама
  открывающая логика не завязана на `chrome.runtime.openOptionsPage()`.

## Service Worker

- `background` — событийный `service_worker`, без постоянного состояния в
  памяти между вызовами (Chrome может выгрузить его в любой момент).
  Любое состояние, которое должно пережить перезапуск воркера, — в
  `chrome.storage.local`, не в module-level переменных.
- Не выполняй инференс WebLLM/WebGPU в service worker — там нет доступа к
  WebGPU. Вся ML-логика живёт в dashboard-вкладке / content-контексте с DOM.
- Service worker используется только для оркестрации: жизненный цикл
  расширения, `chrome.action.onClicked` → `chrome.tabs.create`, message
  passing. Никакого `chrome.sidePanel` — от него отказались в пользу
  полноэкранного Dashboard.

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
  (`storage`). Не добавлять `activeTab`, `scripting` и т.п. "про запас".
  `chrome.tabs.create` из service worker на URL самого расширения не требует
  permission `tabs`.
- Diff грузится через `<input type="file">` / File System Access API из
  самой dashboard-страницы — это не требует дополнительных Chrome-permissions.
- `host_permissions`/CSP `connect-src` для Ollama ограничены
  `http://localhost:11434/*` — локальный движок, не произвольный `<all_urls>`.

## Отладка

- Логи service worker — `chrome://extensions` → "Service worker" → "Inspect".
- Dashboard-вкладка — открывается как обычная страница, DevTools обычным
  способом (F12) или ПКМ → "Inspect".
