# Матрица тестов

Режимы: **Live** — реальная модель `qwen38-27b-fp8`; **Mock** — поддельный провайдер (обработка ошибок, не качество модели); **Det** — детерминированный код без LLM; **Demo** — встроенный demo-режим (E2E).
Время — фактические секунды. Артефакты — пути относительно `qa-results/artifacts/`.

## 1. Матрица функций

| Функция | Статус | Подтверждение |
|---|---|---|
| Регистрация, вход, сессии, CSRF, ограничение частоты | Реализована, подтверждена | E2E critical-flows; S-missing-csrf; 429 переживает перезапуск |
| Каталог, поиск, избранное | Реализована, подтверждена | E2E critical-flows, spatial-experience |
| Структура через LLM | Реализована; частично для 15–20 слайдов | Live A1–D1; BUG-01, BUG-05 |
| Выбор типа слайда моделью | Реализована частично | Live: иконки и схемы да, графики редко, фото никогда (BUG-04, BUG-08) |
| Три варианта A/B/C | Реализована, подтверждена | Live, параллельные DesignPlan; RG-1..4 |
| Таблицы | Реализована, подтверждена | Synthetic T1–T9 |
| Диаграммы LLM-контракта (bar/column/line) | Реализована, подтверждена | Synthetic G1–G9, значения 1:1 |
| Аналитический модуль (bar/stacked/pie/kpi/scatter/histogram/table) | Реализована, подтверждена | analytics/types |
| Аналитика grouped (несколько серий) | **Не работает** | BUG-02 |
| Схемы (9 типов) | Реализована; есть дефекты геометрии | Synthetic D-*; BUG-03, BUG-10 |
| Иконки встроенные | Реализована, подтверждена | I1-icons, Live |
| Изображения шаблона | Движок — подтверждена; модель — не использует | IMG-pack-*; BUG-04 |
| Генерация изображений FLUX | **Недоступна** (не подключена) | `/api/health` image_generation=false |
| Импорт материалов (11 форматов) | Реализована, подтверждена | materials/results.json |
| Брендбук (JSON/PDF) | Работает в Linux/Docker; **не работает на macOS** | BUG-06 |
| Аудит и автоисправление | Аудит подтверждён; автоисправление — только в pytest | Live audit-*.json |
| Редактор: правка, сохранение, конфликт, отмена/повтор | Реализована, подтверждена | editor/results.json |
| AI-ассистент: предложения, принятие, отклонение | Реализована, подтверждена | editor/assistant-rerun |
| Пересборка оформления с пожеланием | Реализована, подтверждена | RG-1..4 |
| Экспорт PPTX/PDF/HTML | Реализована, подтверждена | все сценарии; PowerPoint-рендер |
| Отмена, повтор, восстановление после сбоев | Реализована, подтверждена | errors/results.json, E2E cancellation |
| Изоляция пользователей | Реализована, подтверждена | SEC-foreign-project |
| Яндекс ID, Яндекс.Диск, SMTP | **Недоступна** (не настроены) | E2E disk проверяет только недоступность |

## 2. Автоматические наборы

| ID | Уровень | Функция | Режим | Статус | Время | Ошибки | Артефакты |
|---|---|---|---|---|---|---|---|
| AUTO-01 | — | Backend pytest | Det/Mock | FAIL | 59 | 14 из 587 (8 — BUG-06, 6 — BUG-12) | auto/backend-pytest.txt |
| AUTO-02 | — | Backend pytest с подставленной моделью | Det/Mock | FAIL | 59 | 12 (8 — BUG-06, 4 — BUG-12) | auto/backend-pytest-with-model.txt |
| AUTO-03 | — | Frontend unit | Det | PASS | <1 | 0/76 | auto/frontend-unit.txt |
| AUTO-04 | — | TypeScript `tsc --noEmit` | Det | PASS | — | 0 | auto/tsc.txt |
| AUTO-05 | — | Production build | Det | PASS | 1,3 | 0 | auto/build.txt |
| AUTO-06 | — | Playwright E2E, 19 файлов | Demo | FAIL | ≈520 | 9 failed / 51 passed / 2 skipped | auto/e2e/summary.txt |
| AUTO-07 | — | `scripts/validate_generation.py --live` | Live | NOT_RUN | — | Покрыт сценариями A1–D1 тем же live-путём | — |

## 3. Живые сценарии

| ID | Уровень | Функция | Режим | Статус | Время | Слайды (запрошено/получено) | Ошибки | Качество /10 | Артефакты |
|---|---|---|---|---|---|---|---|---|---|
| A1 | Простой | Кошки, «Приют для животных» | Live | PASS | 109 | 5/5 | Фото не использованы; аудит overflow 1–4 | 6,5 | live/A1, visual/A1 |
| A2 | Простой | Солнечная система, VK Education | Live | PASS | 86 | 7/7 | Без изображений; overflow (B) 4 | 7,1 | live/A2, visual/A2 |
| B1 | Средний | ИИ, VK Tech | Live | PASS | 82 | 10/10 | Overflow видим (B: 11); иерархия вместо слоёв | 7,5 | live/B1, visual/B1 |
| B2-try1 | Средний | Экология, «Экология города» | Live | FAIL | 61 | 12/— | Структура: числа 2, 3 (BUG-05) | — | live/B2-try1 |
| B2 | Средний | то же, повтор | Live | PASS | 93 | 12/12 | Контраст в варианте B (4 предупреждения) | 7,7 | live/B2, visual/B2 |
| C1-try1 | Сложный | Аналитика по CSV, «Квартал в цифрах» | Live | FAIL | 104 | 15/— | Обрыв 51 с ×2 (BUG-01) | — | live/C1-try1 |
| C1 | Сложный | то же, повтор | Live | PASS | 157 | 15/15 | 0 графиков, повторы (BUG-08); числа точны | 6,2 | live/C1, visual/C1 |
| C2 | Сложный | Архитектура веб-сервиса, VK WorkSpace | Live | PASS | 97 | 18/18 | 61% текстовых слайдов | 6,8 | live/C2, visual/C2 |
| D1-try1 | Стресс | Устойчивое развитие + CSV, 20 слайдов | Live | FAIL | 104 | 20/— | Обрыв 51 с (BUG-01) | — | live/D1-try1 |
| D1-try2 | Стресс | то же | Live | FAIL | 66 | 20/— | Обрыв (BUG-01) | — | live/D1-try2 |
| D1 | Стресс | то же | Live | FAIL | 104 | 20/— | Обрыв (BUG-01) | — | live/D1 |
| PERF-01 | Средний | 3 параллельные сборки по 8 слайдов | Live | PASS | 33/62/33 | 8/8 ×3 | Третья ждёт слот (2 слота); все ≤300 с | — | performance/concurrency.json |
| PROV-01 | — | Обрыв без потока против потока | Live | PASS (воспроизведено) | 51 / 169 | — | Подтверждает BUG-01 | — | logs/provider-timeout-experiment.txt |

## 4. Визуальные элементы (Det)

| ID | Проверка | Статус | Примечание |
|---|---|---|---|
| T1–T7 | Таблицы: 3×3, длинные названия, отрицательные, пустые ячейки, 7×5, 9×6, длинная ячейка | PASS | Ячейки в PPTX совпадают побайтно |
| T8–T9 | Таблицы 12×8 и 10×12 сверх лимита схемы | PASS | Отклонено валидацией: максимум 9 строк |
| G1–G9 | bar/column/line; отрицательные, нули, дроби, проценты, даты, длинные подписи, 6 категорий | PASS | Значения и подписи в `chart.xml` 1:1; G8 — аудит `chart_labels` |
| D-* | process, vertical, cycle, hierarchy, matrix, pyramid, honeycomb, comparison, kpi | PASS | Фигуры и соединители; геометрия — см. BUG-03, BUG-10 |
| D-7-items-over | 7 пунктов в схеме | PASS | Аудит `density` и `visual_capacity` |
| I1 | Встроенные иконки | PASS | |
| IMG-pack-86a… / IMG-pack-c4b… | Фото шаблона на слайде | PASS | 2 и 30 пригодных изображений |
| AN-company/bar, stacked, pie, kpi, scatter, histogram, table | Аналитический модуль, генерация и экспорт | PASS | Значения 1:1 (scatter — значения в xVal/yVal) |
| AN-grouped | Многосерийная аналитика | FAIL | BUG-02 |
| AN-edge-numbers | Отрицательные, нули, дроби, пропуски, даты | PASS | Пропуски не заменяются нулями |
| AN-bad-csv / AN-ragged-csv | Повреждённый CSV | PASS | Понятные 422 |

## 5. Шаблоны (Det)

| ID | Статус | Примечание |
|---|---|---|
| 42 встроенных шаблона (VK Tech, WorkSpace, Education, 15 тем, 24 из набора) | PASS ×42 | Аудит без ошибок, экспорт без проблем OOXML |
| custom-16x9 / custom-4x3 / custom-3x4 / custom-dark | PASS ×4 | Пропорции 1,778 / 1,333 / 0,75; тёмный фон адаптирован |
| Рендер PowerPoint (11 шаблонов) | PASS | Без восстановления; замечания BUG-17, BUG-18 |
| A/B/C: факты и порядок неизменны | PASS | RG-1..4, live A1–C2 |

## 6. Материалы (Det, стенд Mock)

| ID | Статус | Примечание |
|---|---|---|
| MAT-txt, md, csv, docx (с таблицей), pdf (кириллица), pptx | PASS | Текст извлечён полностью |
| MAT-png, jpg, svg, palette.json, ttf | PASS | Распознаны как image / icon / palette / font |
| MAT-combined-packet (DOCX + CSV + 2 фото + PPTX) | PASS | Все 5 файлов в пакете |
| MAT-unsupported-exe / oversize / 9-files / broken-pdf / broken-docx / TPL-broken-pptx | PASS | 422/413 с понятными сообщениями |
| MAT-delete-then-use | PASS | Удалённый материал → 404 при следующей генерации |
| Брендбук на macOS | FAIL | BUG-06 |
| Брендбук в Docker (Linux) | PASS | Одноразовый контейнер |

## 7. Ошибки и границы (Mock)

| ID | Статус | Ответ |
|---|---|---|
| E-429, E-500, E-502, E-503 | PASS | 502 с понятным текстом (формулировка — BUG-14) |
| E-timeout (зависание) | PASS | 502 «не завершила ответ в пределах лимита» через 20 с (тестовый лимит) |
| E-garbage-twice, E-empty, E-partial-json | PASS | 502 «Не удалось собрать структуру» |
| E-truncated | PASS | 502 «обрезан лимитом вывода» |
| E-drop-twice | PASS | 502 «Не удалось подключиться к LLM» |
| E-garbage-then-ok, E-drop-then-ok | PASS | Автоповтор спасает |
| V-empty-prompt, V-too-long (50 001), V-count-2, V-count-21 | PASS | 422 |
| V-one-word, V-max-length (50 000), V-emoji-mixed, V-long-word | PASS | 200 |
| V-unknown-template | PASS | 404 |
| J-design-500 | PASS | Задание failed, проект не создан |
| J-retry-after-failure | PASS | Повтор успешен; повторный повтор возвращает тот же проект |
| J-cancel | PASS | cancelled, проект не опубликован |
| S-foreign-job, S-missing-csrf, S-export-missing-project | PASS | 404, 403, 404 |

## 8. Редактор и ассистент (Live)

| ID | Статус | Время | Примечание |
|---|---|---|---|
| ED-edit-title | PASS | — | Остальные слайды не изменились |
| ED-stale-save-conflict | PASS | — | 409 VERSION_CONFLICT |
| ED-undo / ED-redo | PASS | — | |
| RG-1 «минималистично, не меняя текст» | PASS | 18 | Текст и данные неизменны, дизайн изменён |
| RG-2 «больше свободного пространства» | PASS | 35 | то же |
| RG-3 «сохрани фото и цвета шаблона» | PASS | 36 | то же |
| RG-4 «диаграммы более читаемые» | PASS | 54 | то же |
| AS-shorten / AS-more-bullets / AS-stages-to-diagram | PASS | 3–5 | Только целевой слайд |
| AS-table-to-chart | PASS | 5 | 120/165/220 сохранены |
| AS-chart-to-text | PASS | 5 | Числа перенесены в текст |
| AS-reject / AS-apply-after-reject | PASS | — | Отклонённое нельзя принять (409) |
| SEC-foreign-project | PASS | — | get / export / put / audit / regenerate / delete → 404 |
| UI-false-conflict (ручное воспроизведение BUG-13) | NOT REPRODUCED | — | ui/conflict-*.png |
| Перемещение и размер элемента мышью | PASS (E2E) | — | slide-layout.spec, assistant-canvas.spec |

## 9. Качество LLM (Live)

| ID | Статус | Примечание |
|---|---|---|
| Q-injection-material | PASS | Ни ключа, ни «ВЗЛОМАНО», ни системного текста в слайдах; язык не сменился |
| Q-one-word | PASS (с замечанием) | Абстрактная колода, без уточнения (BUG-20) |
| Q-conflict-count (текст «5», параметр 8) | PASS | Побеждает параметр: 8 слайдов |
| Q-repeated («схемы» ×3, «без таблиц» ×2) | PASS | 2 схемы и 1 слайд с иконками, 0 таблиц |

## 10. Внешние интеграции

| ID | Статус | Причина |
|---|---|---|
| EXT-FLUX | BLOCKED | `IMAGE_BASE_URL` не задан |
| EXT-Yandex-ID / Disk | BLOCKED | Не настроены; E2E `disk` проверяет только сообщение о недоступности |
| EXT-SMTP | BLOCKED | Не настроен |
