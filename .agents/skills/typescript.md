# TypeScript: правила для этого проекта

## Компилятор

- `strict: true` (и всё, что он включает: `strictNullChecks`,
  `noImplicitAny`, `strictFunctionTypes` и т.д.) — не отключать точечно
  через `// @ts-ignore` или ослабление `tsconfig.json`.
- `noUncheckedIndexedAccess: true` — доступ по индексу (`arr[i]`,
  `record[key]`) типизирован как `T | undefined`, обрабатывать явно.

## Типы

- `any` запрещён. Если тип реально неизвестен на границе системы (ответ
  WebLLM, `postMessage` от service worker, `JSON.parse`) — использовать
  `unknown` и сужать через type guard/`zod`-подобную валидацию, а не
  прокидывать `any` дальше по коду.
- Предпочитать `interface` для описания форм объектов (пропсы компонентов,
  DTO сообщений между service worker и side panel, структура разобранного
  diff'а). `type` — для union/intersection/utility-типов.
- Явно типизировать все публичные функции и экспортируемые значения
  (параметры и возвращаемое значение) — не полагаться только на inference
  на границах модулей.
- Discriminated unions для сообщений между контекстами расширения, например:
  ```ts
  interface AnalyzeRequest { kind: "analyze"; diff: string }
  interface AnalyzeProgress { kind: "progress"; percent: number }
  interface AnalyzeResult { kind: "result"; findings: ReviewFinding[] }
  type WorkerMessage = AnalyzeRequest | AnalyzeProgress | AnalyzeResult;
  ```

## Структуры данных диффа/ревью

- Не использовать "магические" объекты с произвольными полями для описания
  распарсенного diff'а или ответа модели — заводить явные `interface`
  (`DiffFile`, `DiffHunk`, `ReviewFinding` и т.п.) в `src/lib/types.ts` (или
  рядом с модулем, который их производит) и переиспользовать.
- Ответ LLM парсится в `unknown`, затем валидируется в типизированную
  структуру до того, как попадёт в Svelte-компоненты — компоненты не должны
  знать о сыром формате ответа модели.

## Прочее

- Без `as` для обхода проверок типов, кроме сужения `unknown` после
  валидации. `as const` — можно и нужно, где это уместно.
- Именование: `PascalCase` для типов/интерфейсов/компонентов, `camelCase`
  для переменных/функций, без венгерской нотации (`IFoo`, `TBar`).
