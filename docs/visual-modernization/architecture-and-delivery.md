# Deckly.Ai — пространственный интерфейс

Ветка: `feat/deckly-spatial-experience`.

## Аудит исходного frontend

Проект — React 19.1.1, TypeScript 5.9, Vite 7.3.6, Lucide React; маршрутизация собственная, по hash. До изменений в package.json не было Three.js и GSAP. Рабочая копия исходно чистая, `main`, commit `422c6ba`.

### Страницы и сценарии

- `App.tsx`: авторизация, загрузка templates/health/favorites, активный проект, загрузка PPTX, предпросмотр, глобальные сообщения, hash-маршруты. `Workspace` проверяет dirty при hashchange и перехватывает переходы по ссылкам; подтверждение ухода остаётся единственным механизмом принятия перехода. Этот файл не изменён.
- `Home.tsx`: обзор, быстрый старт, вдохновение, последние проекты; здесь же `Catalog` с поиском, категориями, избранным и загрузкой.
- `Wizard.tsx`: материалы → структура → реальная генерация → три варианта. Блокировка операций, polling, отмена, retry, восстановление job из sessionStorage, редактирование порядка и шаблонов остаются исходными.
- `Editor.tsx`: редактирование содержимого, стили, live preview, история undo/redo, сохранение, ассистент, изображения, просмотр, переходы к audit/export. `beforeunload` и onDirty сохранены.
- `InfoPages.tsx`: проекты и облачная библиотека, шестишаговая демонстрация, поддержка и форма обращения.
- `Audit`, `Finish`, `Profile`, `Requirements`: проверка слайдов, экспорт/сохранение, профиль, описание возможностей.
- `AuthScreen`, `YandexAuth`, verification/reset в `App`: вход, регистрация, подтверждение email, сброс пароля, OAuth.
- Общие компоненты: `Shell`, `Brand`, `ThemeToggle`, `TemplateCard/TemplateCover`, `Modal`, `SlidePreview`, `SlideFields`, `PresentationViewer`, `ExportPanel`, `CloudLibrary`, `HistoryControls`, `PresentationAssistant`, `GenerationPassport`, AI operation hooks/status, audit markers.

### Бренд и CSS

Сохранены Manrope (`/assets/Manrope.ttf`), логотип и система светлой/тёмной тем. Базовые фирменные цвета: синий `#0077ff`, navy `#0f172a`, coral `#ff3b30`, canvas `#f8fafc`. Токены поверхности/текста: `--app-bg`, `--surface`, `--surface-soft`, `--ink`, `--muted`, `--line`, `--accent-text`. Тёмные поверхности: `#0b1220`, `#131e31`, `#1d2b42`. Существующие градиенты Hero и шаблонов не заменены новой палитрой.

Стили каскадные: base/workspace/app → polish/refinements/experience/system/entry/finishing и стили отдельных рабочих страниц. Уже существовали CSS page-enter, home tab enter/leave, wizard-view-in, editor-slide-reveal, dialog arrive/leave, auth transitions, skeleton/loading и hover.

GSAP получает только явно выделенные поверхности. `spatial.css` отключает конкурирующие animation на Wizard, рабочем preview редактора и dialog. Hover transform карточек принадлежит GSAP; CSS сохраняет цвет, границу и тени. Анимации вкладок, auth-контейнера, backdrop, spinner и reorder остаются в CSS/WAAPI на других элементах. В редакторе не применяется перспектива и не анимируются координаты редактируемого содержимого.

### Референс

https://unitedcarriers.com/industries доступен через HTML-чтение. Конкретные движения камеры и pointer-механики референса не были подтверждены интерактивным осмотром. Реализация использует собственную постановку слайдов; дизайн и тематика референса не копировались.

## Реализация

### Новые модули

- `frontend/src/motion/animation.ts`: регистрация GSAP/useGSAP/ScrollTrigger, длительности/easing, scoped animation hook с реагированием на reduced motion и очисткой.
- `frontend/src/components/spatial/PresentationSpace.tsx`: lazy boundary, HTML fallback через настоящий TemplateCover, наблюдение видимости, reduced motion, error boundary.
- `frontend/src/components/spatial/SlideScene.tsx`: Three.js renderer, освещение, объёмные слайды, camera rig, damping, последовательное появление, scroll timeline, сборка и replay.
- `frontend/src/components/spatial/slideTexture.ts`: текстуры реальных preview_url; при отсутствии изображения — данные существующего шаблона. Демонстрационные элементы текста/изображения/диаграммы/иконок отделены от каталога.
- `frontend/src/components/spatial/SpatialGallery.tsx`: перспективная подборка с настоящими TemplateCover, переходами, swipe с учётом скорости жеста, выбором, избранным и предпросмотром. Полный каталог остаётся ниже.
- `frontend/src/styles/spatial.css`: композиция, адаптивность, глубина, fallback, явное владение анимируемыми свойствами.
- `frontend/e2e/spatial-experience.spec.ts`: сценарии Hero, очистки canvas, reduced motion, WebGL fallback, мобильного каталога, галереи и демонстрации.

### Обновлённые модули

Home — встроенная Hero-сцена, сохранённые заголовки/CTA/быстрые действия/проекты/вкладки. Catalog — пространственная подборка плюс исходная сетка. InfoPages — отдельная 3D-демонстрация, исходные шесть шагов сохранены. TemplateCard — мягкий наклон только на устройствах с точным указателем. Shell — появление содержимого после принятого изменения маршрута. Wizard — переходы этапов и реакция на реальные статусы. Editor — fade при смене слайда и состояния сохранения. Modal — GSAP открытие/закрытие с исходным dialog/focus/backdrop-поведением. AuthScreen — появление элементов форм. Finish — подтверждённые сообщения сохранения. main — подключение новых стилей. package.json/pnpm-lock — фиксированные версии зависимостей.

### Сцены и жизненный цикл

Hero: три слайда на разных глубинах, освещённые торцы, последовательное появление и camera dolly. Указатель мягко меняет камеру и ориентацию с разной интенсивностью по глубине. ScrollTrigger ведёт камеру ближе, раздвигает передний/задний планы, меняет ракурс, переносит фокус на следующий слайд и перестраивает композицию. Нет перехвата wheel, блокировки CTA или искусственного smooth scroll. Desktop-сцена использует короткий sticky-участок; на мобильных и reduced motion дополнительная высота убрана.

Assembly: текст, изображение, диаграмма и акценты последовательно появляются, движутся к общей композиции, сменяются готовыми слайдами; камера отдаляется. Визуализация явно подписана как демонстрация, не показывает фиктивных процентов и не участвует в backend-generation.

Рендер работает по invalidation: во время intro/timeline и до затухания pointer damping. После стабилизации RAF останавливается. Вне viewport и при document.hidden рендер остановлен. DPR ограничен 1.65 desktop / 1.25 mobile; геометрии переиспользуются, постэффектов нет. Текстуры ограничены 1024px. ResizeObserver обновляет камеру/размер/DPR. При unmount очищаются observers/listeners/RAF, GSAP context/timelines/ScrollTrigger, геометрии, материалы, текстуры, renderer и WebGL context. Тяжёлый Three.js chunk загружается отдельно при видимости сцены; reduced motion обходится без его загрузки.

## Проверки и ограничения

Финальная проверка завершена:

| Проверка | Результат |
| --- | --- |
| TypeScript `tsc --noEmit` | Успешно |
| Production `pnpm build` | Успешно |
| Существующие frontend-тесты | 10 / 10 |
| Playwright shard 1 (повтор после исправления теста отмены) | 16 / 16 |
| Playwright shard 2 | 4 / 4 |
| Playwright shard 3 | 8 / 8 |
| Playwright shard 4 | 7 / 7 |
| Все уникальные Playwright-сценарии | **35 / 35** |
| JavaScript pageerror и console.error в новых рабочих сценах | Не обнаружены |
| WebGL idle / pointer / scroll / DPR | Проверено инструментированием drawElements |
| WebGL unavailable / prefers-reduced-motion | Статический fallback и CTA работают |
| Мобильный viewport 390px | Без горизонтального overflow; проверены Home, каталог, требования, Wizard |
| Несохранённые изменения, история, отмена, сохранение, audit, экспорт | Соответствующие существующие E2E прошли |
| `git diff --check` | Успешно |

Production bundle: основной JS 489.79 kB (159.03 kB gzip), отдельная ленивая 3D-сцена 483.24 kB (122.99 kB gzip). Это размер сборки, не результат замера скорости на физических устройствах.

Визуально просмотрены скриншоты светлого/тёмного Hero, мобильного Home, пространственного каталога и итоговой сборки. После просмотра исправлены размер/палитра слайдов, длина scroll-участка и мобильная типографика обложек.

E2E запускаются с временным Python virtualenv `/private/tmp/deckly-spatial-venv` и disposable backend из существующего `e2e/start_backend.py`; пользовательская база и `.env` не изменяются. Для окружения с существующим pnpm store использовался `npm_config_store_dir=/Users/vitalij/Library/pnpm/store/v11`.

Аппаратная производительность на реальных слабых GPU/iOS/Android не измерялась. Автоматизированная мобильная проверка выполняется в Chromium с узким viewport; это не заменяет замеры на устройствах. При ошибке загрузки удалённого preview в WebGL используется метаинформация шаблона; HTML-каталог сохраняет исходный механизм предпросмотра. Внешние production AI/OAuth/облачные сервисы не вызываются тестами — используются исходные demo/fixtures/mocks.

### Исправления, найденные проверками

- Подписи изображений в дополнительной галерее больше не дублируют alt основного каталога: доступное имя даёт кнопка предпросмотра, её внутреннее изображение декоративное.
- На узком экране размер текста в обложках теперь зависит от ширины самой обложки; исправлено обрезание заголовков, вызванное прежним фиксированным mobile font-size.
- Существующий E2E импорта ожидал устаревшее имя списка «Импортированные документы». Сбой воспроизведён на исходном `422c6ba` в `/private/tmp/deckly-spatial-baseline`; селектор заменён на актуальное «Импортированные материалы».
- В E2E отмены ожидание `.last()` могло принять оставшийся статус предыдущего AI-ассистента за подтверждение отмены текущего изображения. Mock затем преждевременно прерывал запрос. Проверка теперь ждёт дополнительного подтверждённого статуса текущей операции. Логика приложения не изменена.
- Общий прогон всех тестов на одной базе превышает существующий auth rate limit (15 попыток / 15 минут). Проверки выполняются последовательными shard-процессами с отдельной временной базой, без ослабления backend-защиты.

Команды воспроизведения (из `frontend`, Python должен содержать `backend/requirements.txt`):

```bash
pnpm build
pnpm test
for shard in 1 2 3 4; do
  DECKLY_TEST_PYTHON=/path/to/venv/bin/python pnpm test:e2e --shard="$shard/4"
done
```

HTML-отчёты, логи и скриншоты проверок в этой сессии сохранены в `/private/tmp/deckly-spatial-artifacts/final/`. Обычный Playwright output последнего прогона находится в `frontend/test-results/` и `frontend/playwright-report/` (оба каталога исключены из Git).
