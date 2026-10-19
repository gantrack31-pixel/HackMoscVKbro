import { useEffect, useState } from "react";
import { api } from "../api";
import type { Health, Template, WorkflowRecipe } from "../types";
import { TemplateCover } from "../components/TemplateCover";
import { Icon, type IconName } from "../components/Icon";
import {
  RequirementsDeckArtwork,
  RequirementsImageArtwork,
} from "../components/RequirementsArtwork";

const stageLabels: Record<string, string> = {
  normalize: "Подготовка материалов",
  outline: "Структура и содержание",
  design: "Три композиции",
  images: "Иллюстрации по желанию",
  layout: "Оформление слайдов",
  audit: "Проверка оформления",
  semantic: "Проверка смысла по запросу",
  export: "Сохранение в файл",
};
const stageIcons: Record<string, IconName> = {
  normalize: "info-stage-materials",
  outline: "info-stage-outline",
  design: "info-stage-compositions",
  images: "info-stage-images",
  layout: "info-stage-layout",
  audit: "info-stage-audit",
  semantic: "info-stage-semantic",
  export: "info-stage-export",
};
const features: {
  id: string;
  icon: IconName;
  title: string;
  body: string;
  note?: string;
  href: string;
  action: string;
}[] = [
  {
    id: "template",
    icon: "info-feature-style",
    title: "Ваш стиль — в каждом слайде",
    body: "Выберите PPTX и при необходимости добавьте брендбук: текстовый PDF, JSON с токенами или пакет с логотипом. Перед созданием проверьте итоговые цвета и шрифты.",
    note: "Правила брендбука имеют приоритет. В настройках можно оставить оформление шаблона.",
    href: "#templates",
    action: "Выбрать шаблон",
  },
  {
    id: "materials",
    icon: "info-feature-materials",
    title: "Все материалы вместе",
    body: "Добавьте текст отдельно от таблиц. CSV, TSV, XLSX, JSON и таблицы в тексте можно разобрать в блоке «От данных — к выводу» — с проверкой колонок и пропусков.",
    note: "Текст со сканов нужно добавить вручную — OCR недоступно.",
    href: "#create",
    action: "Добавить материалы",
  },
  {
    id: "outline",
    icon: "info-feature-outline",
    title: "Сначала — структура",
    body: "Уточните заголовки, тезисы и порядок до оформления. По умолчанию — 10 слайдов, можно выбрать до 20.",
    note: "Большую справочную таблицу можно вынести в приложение. Итоговая презентация — до 200 слайдов.",
    href: "#create",
    action: "Собрать структуру",
  },
  {
    id: "visuals",
    icon: "info-feature-visuals",
    title: "Наглядно и редактируемо",
    body: "Выберите один из девяти видов аналитики: от таблицы и линии до гистограммы, рассеяния и KPI. Расчёты связаны с исходными данными, диаграммы в PPTX редактируются.",
    note: "Схемы сохраняются как фигуры и соединители, а не объекты SmartArt.",
    href: "#create",
    action: "Создать презентацию",
  },
  {
    id: "variants",
    icon: "info-feature-variants",
    title: "Три взгляда на одну историю",
    body: "Классический, акцентный и минималистичный варианты. Текст и шаблон общие, меняются композиция и акценты.",
    note: "Вариант можно сменить и в редакторе.",
    href: "#create",
    action: "Попробовать варианты",
  },
  {
    id: "history",
    icon: "info-feature-history",
    title: "История ваших изменений",
    body: "Правки AI сначала появляются как предложение: сравните изменения, примите или отклоните их. Сохранённые изменения можно отменить; незавершённая работа восстанавливается из черновика.",
    href: "#projects",
    action: "Мои презентации",
  },
  {
    id: "audit",
    icon: "info-feature-audit",
    title: "Внимание к деталям",
    body: "Находите переполнение, слабый контраст и ошибки в данных. Вы сами выбираете, какие замечания исправить.",
    href: "#projects",
    action: "Открыть презентации",
  },
  {
    id: "export",
    icon: "info-feature-export",
    title: "Готово к следующему шагу",
    body: "PPTX — для редактирования в PowerPoint. PDF и HTML — для просмотра и показа.",
    note: "В PDF и HTML шрифты и графика шаблона могут отличаться. Проверьте готовый файл.",
    href: "#projects",
    action: "Перейти к презентациям",
  },
];

export function Requirements({
  health,
  templates,
}: {
  health: Health | null;
  templates: Template[];
}) {
  const [recipe, setRecipe] = useState<WorkflowRecipe | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api
      .workflow()
      .then((result) => {
        if (active) setRecipe(result);
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const examples = ["tech", "workspace", "education"]
    .map((id) => templates.find((template) => template.id === id))
    .filter((template): template is Template => !!template);
  const aiConfigured = health?.mode === "live" && health.llm_configured;
  const contextAudit = aiConfigured && health?.context_audit;
  const modeTitle = !health
    ? "Проверяем…"
    : health.mode === "demo"
      ? "Демо"
      : aiConfigured
        ? "AI настроен"
        : "AI не настроен";
  const modeDescription = !health
    ? "состояние подключения"
    : health.mode === "demo"
      ? "модель не используется"
      : aiConfigured
        ? "для структуры и оформления"
        : "требуется подключение модели";
  function scrollToSection(id: string) {
    const heading = document.getElementById(id);
    heading?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
    heading?.focus({ preventScroll: true });
  }

  return (
    <div className="requirements-page requirements-refined">
      <header className="req-hero">
        <div className="req-hero-main">
          <div className="req-hero-copy">
            <h1>
              Как устроен <span>Deckly</span>
            </h1>
            <p>
              Ваши материалы становятся презентацией. Вы выбираете стиль,
              уточняете содержание и управляете результатом.
            </p>
            <div className="req-hero-actions">
              <a href="#create" className="btn primary">
                Создать презентацию
              </a>
              <a href="#demo" className="req-demo-link">
                <Icon name="info-demo" /> Посмотреть пример
              </a>
            </div>
          </div>
          <RequirementsDeckArtwork />
        </div>
        <div className="requirements-metrics">
          <div>
            <Icon name="info-metric-slides" />
            <strong>10–15</strong>
            <span>рекомендуемый объём</span>
          </div>
          <div>
            <Icon name="info-metric-variants" />
            <strong>3 варианта</strong>
            <span>одного содержания</span>
          </div>
          <div>
            <Icon name="info-metric-time" />
            <strong>До 5 мин</strong>
            <span>лимит полной сборки</span>
          </div>
          <div className="req-mode-metric">
            <Icon name="info-metric-engine" />
            <strong>{modeTitle}</strong>
            <span>{modeDescription}</span>
          </div>
        </div>
      </header>

      <nav className="req-section-nav" aria-label="На этой странице">
        {[
          ["req-features", "Возможности"],
          ["req-examples", "Оформление"],
          ["req-workflow", "Этапы создания"],
          ["req-audit", "Проверка"],
        ].map(([id, title]) => (
          <button key={id} onClick={() => scrollToSection(id)}>
            {title}
          </button>
        ))}
      </nav>

      <section className="req-section" aria-labelledby="req-features">
        <div className="req-section-heading">
          <div>
            <h2 id="req-features" tabIndex={-1}>
              От материалов до готовых слайдов
            </h2>
            <p>Всё необходимое — в одном процессе.</p>
          </div>
          <span className="req-section-index" aria-hidden="true">
            01 / Возможности
          </span>
        </div>
        <div className="requirements-grid">
          {features.map((feature) => (
            <article
              className={`req-feature req-feature--${feature.id}`}
              key={feature.id}
            >
              <div className="req-feature-heading">
                <span className="req-feature-icon">
                  <Icon name={feature.icon} />
                </span>
                <h3>{feature.title}</h3>
              </div>
              <p>{feature.body}</p>
              {feature.id === "template" && (
                <div className="req-style-strip" aria-hidden="true">
                  <span className="req-style-palette">
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="req-style-type">Aa</span>
                  <span className="req-style-layout">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              )}
              {feature.id === "materials" && (
                <>
                  <div
                    className="req-file-types"
                    aria-label="Форматы материалов"
                  >
                    {["TXT", "MD", "CSV", "DOCX", "PDF"].map((format) => (
                      <span key={format}>{format}</span>
                    ))}
                  </div>
                  <div className="req-upload-limits">
                    <span>
                      <b>8</b> файлов
                    </span>
                    <span>
                      <b>5 МБ</b> на файл
                    </span>
                    <span>
                      <b>15 МБ</b> всего
                    </span>
                    <span>
                      <b>50 000</b> символов
                    </span>
                  </div>
                </>
              )}
              {feature.id === "variants" && (
                <div className="req-variant-preview" aria-hidden="true">
                  <span>
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              )}
              {feature.id === "export" && (
                <div className="req-file-types req-export-types">
                  <span>PPTX</span>
                  <span>PDF</span>
                  <span>HTML</span>
                </div>
              )}
              {feature.note && (
                <p className="req-feature-note">{feature.note}</p>
              )}
              <a href={feature.href} className="req-text-link">
                {feature.action}
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="req-image-section" aria-labelledby="req-image-title">
        <RequirementsImageArtwork />
        <div className="req-image-copy">
          <span className="req-feature-icon">
            <Icon name="info-illustrations" />
          </span>
          <h2 id="req-image-title">Иллюстрации по описанию</h2>
          <p>
            Выберите «AI-иллюстрация» в редакторе и опишите нужное изображение.
            Оно займёт один блок, а остальной слайд останется редактируемым.
          </p>
          <div className="req-service-status">
            <span>
              {!health
                ? "Проверяем подключение сервиса изображений…"
                : health.image_generation
                  ? "Сервис настроен. Доступность проверим при создании изображения."
                  : "Генерация изображений пока недоступна"}
            </span>
          </div>
          <details className="req-details">
            <summary>О генерации изображений</summary>
            <div>
              <p>
                Используется FLUX.1-schnell — модель text-to-image на 12 млрд
                параметров, до 4 шагов. Администратор запускает отдельный
                FLUX-сервис и задаёт IMAGE_BASE_URL. Без подключённого сервиса
                изображения не генерируются.
              </p>
            </div>
          </details>
        </div>
      </section>

      <section className="req-section" aria-labelledby="req-examples">
        <div className="req-section-heading">
          <div>
            <h2 id="req-examples" tabIndex={-1}>
              Разный стиль. Ваше содержание.
            </h2>
            <p>Начните с готового оформления или загрузите свой PPTX.</p>
          </div>
          <a href="#templates" className="req-text-link">
            Все шаблоны
          </a>
        </div>
        <div className="requirement-examples">
          {examples.map((template) => (
            <article className="req-example" key={template.id}>
              <div className="req-example-cover">
                <TemplateCover template={template} />
              </div>
              <div className="req-example-meta">
                <h3>{template.name}</h3>
                <p>
                  {template.metadata.font}
                  {template.metadata.layouts.length > 0 &&
                    ` · ${template.metadata.layouts.length} макетов`}
                </p>
                <span>
                  {template.metadata.source === "pptx" ? "PPTX" : "Тема Deckly"}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="req-workflow-section" aria-labelledby="req-workflow">
        <div className="req-section-heading">
          <div>
            <h2 id="req-workflow" tabIndex={-1}>
              Как рождается презентация
            </h2>
            <p>
              {health?.mode === "demo"
                ? "Схема полной сборки. В деморежиме модель не используется."
                : aiConfigured
                  ? "От подготовки материалов до сохранения результата."
                  : "Для этапов с AI требуется подключение модели."}
            </p>
          </div>
          <span className="req-section-index" aria-hidden="true">
            02 / Процесс
          </span>
        </div>
        {error && (
          <p className="req-load-error" role="alert">
            {error}
          </p>
        )}
        {!recipe && !error && (
          <p className="req-loading" role="status">
            Загружаем этапы…
          </p>
        )}
        {recipe && (
          <ol className="workflow-stages">
            {recipe.stages.map((stage, index) => (
              <li key={stage.id}>
                <div className="req-stage-top">
                  <span className="req-stage-icon">
                    {stageIcons[stage.id] && (
                      <Icon name={stageIcons[stage.id]} />
                    )}
                  </span>
                  <span className="req-stage-number" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <strong>{stageLabels[stage.id] || stage.name}</strong>
                <span
                  className={`req-stage-type${stage.type === "model" ? " is-ai" : ""}`}
                >
                  {stage.type === "model" ? "Этап с AI" : "Автоматически"}
                </span>
              </li>
            ))}
          </ol>
        )}
        <details className="req-details req-time-details">
          <summary>Сколько времени занимает создание?</summary>
          <div>
            <p>
              На полную сборку и повторное оформление отводится до 5 минут,
              включая очередь. Для структуры и отдельных AI-правок нет общего
              ограничения по времени: их можно остановить кнопкой «Стоп».
              Сетевые таймауты ограничивают ожидание соединения.
            </p>
          </div>
        </details>
        <details className="req-details">
          <summary>Технические сведения</summary>
          <div>
            <p>
              При новой генерации сохраняются версия пайплайна, хеши промптов и
              компонентов, тексты промптов, отпечаток шаблона, модель и
              длительность.
            </p>
            <p>
              PPTX разбирается по содержимому: палитра, шрифты, размеры текста,
              пропорции, макеты, плейсхолдеры и визуальные элементы. Анализ не
              зависит от имён или ID демонстрационных шаблонов.
            </p>
            <p>
              При импорте материалов нормализуются кодировки и переносы, каждый
              источник подписывается. PPTX создаётся при скачивании.
            </p>
            {recipe && (
              <>
                <p>
                  Версия {recipe.version} ·{" "}
                  <code>{recipe.fingerprint.slice(0, 16)}</code>
                </p>
                <details className="req-details">
                  <summary>Промпты и версии</summary>
                  <div>
                    {recipe.snippets.map((snippet) => (
                      <details className="req-details" key={snippet.id}>
                        <summary>
                          {snippet.id} · {snippet.version}
                        </summary>
                        <div>
                          <pre>{snippet.text}</pre>
                        </div>
                      </details>
                    ))}
                  </div>
                </details>
              </>
            )}
          </div>
        </details>
      </section>

      <section className="req-section" aria-labelledby="req-audit">
        <div className="req-section-heading">
          <div>
            <h2 id="req-audit" tabIndex={-1}>
              Проверка, которая помогает
            </h2>
            <p>Deckly находит замечания. Решение остаётся за вами.</p>
          </div>
          <span className="req-section-index" aria-hidden="true">
            03 / Качество
          </span>
        </div>
        <div className="req-audit-grid">
          <article className="req-audit-card">
            <span className="req-feature-icon">
              <Icon name="info-audit-design" />
            </span>
            <h3>Оформление и данные</h3>
            <p>
              Расположение элементов, вместимость текста, контраст, таблицы,
              графики, наличие иллюстраций, точность цитат и служебные заглушки.
            </p>
            <details className="req-details">
              <summary>Как работает проверка</summary>
              <div>
                <p>
                  Проверяются границы, переполнение, пересечения, контраст,
                  плотность, данные визуализаций и цитаты. Замечания привязаны к
                  объектам слайда. При одинаковых входных данных проверка по
                  правилам даёт одинаковые замечания.
                </p>
              </div>
            </details>
          </article>
          <article className="req-audit-card">
            <span className="req-feature-icon">
              <Icon name="info-audit-content" />
            </span>
            <h3>Смысл и связь с источниками</h3>
            <p>
              Логика, связь с материалами и возможные неподтверждённые
              утверждения. Оценка модели помогает проверить текст, но не
              гарантирует достоверность.
            </p>
            <span className="req-audit-status">
              {!health
                ? "Проверяем доступность"
                : contextAudit
                  ? "Доступно по запросу"
                  : "Требуется подключение смысловой проверки"}
            </span>
          </article>
        </div>
        <p className="req-audit-note">
          <span>
            Применяются только выбранные доступные исправления. Слайды можно
            изменить вручную и проверить снова. Для диаграмм нужны исходные
            числа — модель не должна их выдумывать.
          </span>
        </p>
      </section>

      <footer className="req-cta">
        <div>
          <h2>Попробуйте на своих материалах</h2>
          <p>Начните с идеи, текста или готового шаблона.</p>
        </div>
        <a href="#create" className="btn primary">
          Создать презентацию
        </a>
      </footer>
    </div>
  );
}
