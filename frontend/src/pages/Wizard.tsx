import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { api } from "../api";
import { ThinkingSkeleton } from "../components/ThinkingSkeleton";
import { Icon } from "../components/Icon";
import { TemplateCover } from "../components/TemplateCard";
import { SlidePreview } from "../components/SlidePreview";
import "../styles/wizard-modern.css";
import {
  blankSlide,
  variantNames,
  type DeckContent,
  type Health,
  type Project,
  type Template,
  type Variant,
} from "../types";
export const sampleMaterial = `Deckly.Ai
Цифровой дизайнер презентаций.

Проблема
Материалы уже есть. Время уходит на структуру, оформление и проверку.

Работа с шаблоном
Из PPTX извлекаются палитра, шрифты, размеры и поля макетов.

Структура
Заголовки и тезисы можно изменить до создания презентации.

Три варианта
Варианты используют одинаковое содержание и один выбранный шаблон.

Источники
Цитата помогает найти основание утверждения. Совпадение текста не заменяет смысловую проверку.

Аудит
Геометрия и плотность проверяются правилами. Смысл проверяет модель, когда она подключена.

Исправления
Изменения применяются к выбранным замечаниям. Предыдущую версию можно восстановить.

Экспорт
PPTX содержит текстовые блоки, таблицы и диаграммы. Также доступны PDF и HTML.

Следующий шаг
Загрузите незнакомый шаблон, добавьте материал и оцените результат.`;

const generationStages = [
  ["queued", "Задание принято", "Подготавливаем материал и выбранный шаблон"],
  ["design", "Продумываем оформление", "Выбираем композицию для вашей истории"],
  ["layout", "Размещаем содержание", "Собираем текст, акценты и графику"],
  ["export", "Создаём три варианта", "Сохраняем редактируемые слайды"],
  ["audit", "Проверяем слайды", "Проверяем расположение и читаемость"],
] as const;
const audiences = [
  "Команда и коллеги",
  "Клиенты и партнёры",
  "Инвесторы",
  "Студенты",
];

export function Wizard({
  template,
  templates,
  initialMode,
  health,
  onSelect,
  onOpen,
  onError,
}: {
  template: Template;
  templates: Template[];
  initialMode: "description" | "text";
  health: Health | null;
  onSelect: (t: Template) => void;
  onOpen: (p: Project) => void;
  onError: (m: string) => void;
}) {
  const [step, setStep] = useState(1),
    [mode, setMode] = useState(initialMode),
    [prompt, setPrompt] = useState(sampleMaterial),
    [count, setCount] = useState(10),
    [audience, setAudience] = useState("Команда и коллеги");
  const [content, setContent] = useState<DeckContent | null>(null),
    [operation, setOperation] = useState<
      "outline" | "generate" | "regenerate" | "open" | null
    >(null),
    [stage, setStage] = useState("queued"),
    [result, setResult] = useState<Project | null>(null),
    [variant, setVariant] = useState<Variant>("a");
  const [instruction, setInstruction] = useState("");
  const [slideKeys, setSlideKeys] = useState<string[]>([]);
  const [movedKey, setMovedKey] = useState<string | null>(null);
  const [reorderNotice, setReorderNotice] = useState("");
  const busy = operation !== null;
  const active = useRef(true);
  const locked = useRef(false);
  const requestId = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPoll = useRef<(() => void) | null>(null);
  const nextSlideKey = useRef(0);
  const outlineNodes = useRef(new Map<string, HTMLElement>());
  const beforeMove = useRef(new Map<string, number>());
  const live = health?.mode === "live";
  const newSlideKey = () => `outline-slide-${++nextSlideKey.current}`;
  useLayoutEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      outlineNodes.current.forEach((node, key) => {
        const previous = beforeMove.current.get(key);
        if (previous === undefined) return;
        const delta = previous - node.getBoundingClientRect().top;
        if (Math.abs(delta) > 1)
          node.animate(
            [
              { transform: `translateY(${delta}px)` },
              { transform: "translateY(0)" },
            ],
            { duration: 380, easing: "cubic-bezier(.22,1,.36,1)" },
          );
      });
    }
    beforeMove.current.clear();
  }, [slideKeys]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      requestId.current += 1;
      if (pollTimer.current) clearTimeout(pollTimer.current);
      cancelPoll.current?.();
    };
  }, []);
  function begin(next: NonNullable<typeof operation>) {
    if (locked.current || !active.current) return null;
    locked.current = true;
    setOperation(next);
    return ++requestId.current;
  }
  function isCurrent(id: number) {
    return active.current && requestId.current === id;
  }
  function finish(id: number) {
    if (!isCurrent(id)) return;
    locked.current = false;
    setOperation(null);
  }
  async function poll(jobId: string, id: number) {
    const started = Date.now();
    while (isCurrent(id)) {
      const job = await api.job(jobId);
      if (!isCurrent(id)) return null;
      setStage(job.stage);
      if (job.state === "failed")
        throw new Error(job.error || "Не удалось создать презентацию");
      if (job.state === "complete" && job.project_id) {
        const project = await api.project(job.project_id);
        return isCurrent(id) ? project : null;
      }
      if (Date.now() - started > 300000)
        throw new Error(
          "Обработка ещё идёт. Результат появится в разделе «Мои презентации».",
        );
      await new Promise<void>((resolve) => {
        cancelPoll.current = resolve;
        pollTimer.current = setTimeout(() => {
          pollTimer.current = null;
          cancelPoll.current = null;
          resolve();
        }, 700);
      });
    }
    return null;
  }
  async function outline() {
    if (!prompt.trim()) {
      onError("Добавьте описание или материал.");
      return;
    }
    const id = begin("outline");
    if (id === null) return;
    try {
      const response = await api.outline({
        template_id: template.id,
        prompt,
        count,
        audience,
        mode,
      });
      if (isCurrent(id)) {
        setContent(response.content);
        setSlideKeys(response.content.slides.map(newSlideKey));
        setStep(2);
      }
    } catch (e) {
      if (isCurrent(id)) onError((e as Error).message);
    } finally {
      finish(id);
    }
  }
  async function generate() {
    if (!content) return;
    const id = begin("generate");
    if (id === null) return;
    setStage("queued");
    setStep(3);
    try {
      const { job_id } = await api.generate(template.id, content, prompt);
      if (!isCurrent(id)) return;
      const project = await poll(job_id, id);
      if (project && isCurrent(id)) {
        setResult(project);
        setVariant(project.variant);
        setStep(4);
      }
    } catch (e) {
      if (isCurrent(id)) {
        onError((e as Error).message);
        setStep(2);
      }
    } finally {
      finish(id);
    }
  }
  async function regenerate() {
    if (!result) return;
    const id = begin("regenerate");
    if (id === null) return;
    setStage("queued");
    try {
      const { job_id } = await api.regenerate(result.id, instruction.trim());
      if (!isCurrent(id)) return;
      const project = await poll(job_id, id);
      if (project && isCurrent(id)) setResult(project);
    } catch (e) {
      if (isCurrent(id))
        onError(`${(e as Error).message} Предыдущие варианты сохранены.`);
    } finally {
      finish(id);
    }
  }
  function edit(index: number, key: "title" | "body", value: string) {
    if (!content || busy) return;
    setContent({
      ...content,
      slides: content.slides.map((s, i) =>
        i === index ? { ...s, [key]: value } : s,
      ),
    });
  }
  function move(index: number, delta: number) {
    if (
      !content ||
      busy ||
      index + delta < 0 ||
      index + delta >= content.slides.length
    )
      return;
    outlineNodes.current.forEach((node, key) =>
      beforeMove.current.set(key, node.getBoundingClientRect().top),
    );
    const slides = [...content.slides];
    [slides[index], slides[index + delta]] = [
      slides[index + delta],
      slides[index],
    ];
    setContent({ ...content, slides });
    const keys = [...slideKeys];
    [keys[index], keys[index + delta]] = [keys[index + delta], keys[index]];
    setSlideKeys(keys);
    setMovedKey(keys[index + delta]);
    setReorderNotice(
      `Слайд «${slides[index + delta].title}» перемещён на место ${index + delta + 1}.`,
    );
  }
  async function open() {
    if (!result) return;
    const id = begin("open");
    if (id === null) return;
    try {
      const project = await api.update(result.id, result.content, variant);
      if (isCurrent(id)) onOpen(project);
    } catch (e) {
      if (isCurrent(id)) onError((e as Error).message);
    } finally {
      finish(id);
    }
  }
  return (
    <div className="wizard-modern wizard-flow">
      <div className="heading">
        <h1>От идеи — к презентации</h1>
        <p>Ваш текст, ваш шаблон, ваша история.</p>
      </div>
      <ol className="stepper" aria-label="Этапы создания презентации">
        {["Материалы", "Структура", "Создание", "Оформление"].map((name, i) => (
          <li
            key={name}
            className={step === i + 1 ? "active" : step > i + 1 ? "done" : ""}
            aria-current={step === i + 1 ? "step" : undefined}
          >
            <span>{step > i + 1 ? <Icon name="check" /> : i + 1}</span>
            {name}
          </li>
        ))}
      </ol>
      {busy && step === 1 && (
        <ThinkingSkeleton
          label={
            health?.mode === "live"
              ? "AI продумывает структуру"
              : "Подготавливаем структуру материала"
          }
        />
      )}
      {step === 1 && (
        <div className="wizard-grid">
          <section className="panel">
            <div className="wizard-section-heading">
              <span className="wizard-heading-icon">
                <Icon name="file" />
              </span>
              <div>
                <span className="label">01 / Исходные материалы</span>
                <h2>О чём ваша презентация?</h2>
              </div>
            </div>
            <div className="segmented" role="tablist" aria-label="Способ ввода">
              {(["description", "text"] as const).map((value) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={mode === value}
                  className={mode === value ? "active" : ""}
                  disabled={busy}
                  onClick={() => setMode(value)}
                >
                  {value === "description" ? (
                    <Icon name="spark" />
                  ) : (
                    <Icon name="file" />
                  )}
                  {value === "description" ? "По описанию" : "Готовый текст"}
                </button>
              ))}
            </div>
            <label className="field">
              {mode === "description"
                ? "Опишите идею и добавьте материалы"
                : "Вставьте материал"}
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={8}
                maxLength={50000}
                disabled={busy}
                placeholder={
                  mode === "description"
                    ? "Расскажите об идее: какая цель, главные мысли и что важно для аудитории…"
                    : "Вставьте текст, заметки или готовый материал…"
                }
                aria-describedby="wizard-material-helper"
              />
              <span className="wizard-material-meta">
                <span className="field-helper" id="wizard-material-helper">
                  Для привязки тезисов к источнику добавьте факты и исходные
                  формулировки.
                </span>
                <span className="wizard-character-count">
                  {prompt.length.toLocaleString("ru-RU")} / 50 000
                </span>
              </span>
            </label>
            <div className="row wrap">
              <button
                className="btn sm"
                disabled={busy}
                onClick={() => setPrompt(sampleMaterial)}
              >
                <Icon name="spark" />
                Пример Deckly.Ai
              </button>
              <label className="btn sm file-label">
                <Icon name="upload" />
                Добавить TXT / MD
                <input
                  hidden
                  type="file"
                  disabled={busy}
                  accept=".txt,.md"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) {
                      if (f.size > 200000) {
                        onError("Выберите текстовый файл до 200 КБ");
                        return;
                      }
                      let text: string;
                      try {
                        text = await f.text();
                      } catch {
                        if (active.current)
                          onError(
                            "Не удалось прочитать файл. Попробуйте другой TXT или MD.",
                          );
                        return;
                      }
                      if (!active.current || locked.current) return;
                      if (text.length > 50000) {
                        onError(
                          "В файле больше 50 000 символов. Сократите материал, чтобы он поместился полностью.",
                        );
                        return;
                      }
                      setPrompt(text);
                      setMode("text");
                    }
                  }}
                />
              </label>
            </div>
            <div className="wizard-options">
              <fieldset className="wizard-choice-group" disabled={busy}>
                <legend>Количество слайдов</legend>
                <div className="wizard-count-options">
                  {[5, 8, 10, 12, 15, 20].map((n) => (
                    <label className="wizard-choice" key={n}>
                      <input
                        type="radio"
                        name="slide-count"
                        value={n}
                        checked={count === n}
                        onChange={() => setCount(n)}
                      />
                      <span>{n}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="wizard-choice-group" disabled={busy}>
                <legend>Кто будет смотреть</legend>
                <div className="wizard-audience-options">
                  {audiences.map((name) => (
                    <label className="wizard-choice" key={name}>
                      <input
                        type="radio"
                        name="audience"
                        value={name}
                        checked={audience === name}
                        onChange={() => setAudience(name)}
                      />
                      <span>
                        <Icon
                          name={
                            name === "Инвесторы"
                              ? "spark"
                              : name === "Студенты"
                                ? "file"
                                : "user"
                          }
                        />
                        {name}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="form-footer">
              <span className="tiny muted">Сначала проверим структуру</span>
              <button
                className="btn primary"
                disabled={busy || !prompt.trim()}
                onClick={outline}
              >
                {busy ? "Готовим структуру…" : "Создать структуру"}
                <Icon name="arrow" />
              </button>
            </div>
          </section>
          <aside className="stack">
            <section className="panel template-selection">
              <span className="label">Шаблон презентации</span>
              <TemplateCover template={template} />
              <details className="wizard-template-picker">
                <summary>
                  <span>
                    <small>Выбранный шаблон</small>
                    <strong>{template.name}</strong>
                  </span>
                  <span className="wizard-picker-action">
                    Изменить
                    <Icon name="down" />
                  </span>
                </summary>
                <fieldset disabled={busy}>
                  <legend className="wizard-sr-only">
                    Выберите шаблон презентации
                  </legend>
                  {templates.map((t) => (
                    <label className="wizard-template-option" key={t.id}>
                      <input
                        type="radio"
                        name="presentation-template"
                        checked={template.id === t.id}
                        onChange={() => onSelect(t)}
                      />
                      <span
                        className="wizard-template-swatch"
                        style={{ background: t.metadata.accent }}
                      />
                      <span>
                        <strong>{t.name}</strong>
                        <small>
                          {t.metadata.source === "pptx"
                            ? "Ваш PPTX"
                            : t.metadata.category}
                        </small>
                      </span>
                      {t.id === template.id && <Icon name="check" />}
                    </label>
                  ))}
                </fieldset>
              </details>
              <p className="small muted">
                {template.metadata.source === "pptx"
                  ? `${template.metadata.layouts.length} макетов · ${template.metadata.font} · исходный PPTX`
                  : "Авторская стартовая тема"}
              </p>
              <div className="swatches">
                {Object.values(template.metadata.colors)
                  .slice(0, 5)
                  .map((c, i) => (
                    <i key={i} style={{ background: c }} />
                  ))}
                <span>Палитра из шаблона</span>
              </div>
            </section>
            <section className="tip-card">
              <Icon name="link" />
              <div>
                <h3>Не теряйте связь с фактами</h3>
                <p>
                  В редакторе можно открыть цитату рядом с тезисом и проверить
                  её в исходном материале.
                </p>
              </div>
            </section>
          </aside>
        </div>
      )}
      {step === 2 && content && (
        <div className="outline-layout">
          <section>
            <div className="between" style={{ marginBottom: 20 }}>
              <div>
                <h2>Сначала — история</h2>
                <p className="small muted">
                  Уточните тезисы и порядок слайдов.
                </p>
              </div>
              <span className="badge">{content.slides.length} слайдов</span>
            </div>
            <div className="outline-list">
              <p className="wizard-sr-only" role="status">
                {reorderNotice}
              </p>
              {content.slides.map((s, i) => (
                <article
                  className={`outline-item${movedKey === slideKeys[i] ? " is-moved" : ""}`}
                  key={slideKeys[i]}
                  ref={(node) => {
                    if (node) outlineNodes.current.set(slideKeys[i], node);
                    else outlineNodes.current.delete(slideKeys[i]);
                  }}
                  onAnimationEnd={() => {
                    if (movedKey === slideKeys[i]) setMovedKey(null);
                  }}
                >
                  <span className="outline-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="outline-fields">
                    <span className="wizard-slide-kind">
                      {
                        {
                          title: "Титульный слайд",
                          text: "Основная мысль",
                          chart: "Данные и диаграмма",
                          table: "Таблица",
                          steps: "Последовательность",
                        }[s.kind]
                      }
                    </span>
                    <input
                      aria-label={`Заголовок слайда ${i + 1}`}
                      value={s.title}
                      maxLength={180}
                      onChange={(e) => edit(i, "title", e.target.value)}
                    />
                    <textarea
                      aria-label={`Текст слайда ${i + 1}`}
                      value={s.body}
                      rows={2}
                      maxLength={2400}
                      onChange={(e) => edit(i, "body", e.target.value)}
                    />
                    {s.source_quote && (
                      <span className="badge green">
                        <Icon name="link" />
                        Есть цитата
                      </span>
                    )}
                  </div>
                  <div className="outline-actions">
                    <button
                      className="btn ghost sm wizard-move-up"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      aria-label={`Слайд ${i + 1} выше`}
                    >
                      <Icon name="arrow" />
                    </button>
                    <button
                      className="btn ghost sm wizard-move-down"
                      disabled={i === content.slides.length - 1}
                      onClick={() => move(i, 1)}
                      aria-label={`Слайд ${i + 1} ниже`}
                    >
                      <Icon name="arrow" />
                    </button>
                    <button
                      className="btn ghost sm"
                      disabled={content.slides.length <= 1}
                      onClick={() => {
                        setContent({
                          ...content,
                          slides: content.slides.filter((_, n) => n !== i),
                        });
                        setSlideKeys(slideKeys.filter((_, n) => n !== i));
                      }}
                      aria-label={`Удалить слайд ${i + 1}`}
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <button
              className="add-slide"
              onClick={() => {
                setContent({
                  ...content,
                  slides: [...content.slides, blankSlide()],
                });
                setSlideKeys([...slideKeys, newSlideKey()]);
              }}
              disabled={content.slides.length >= 30}
            >
              <Icon name="plus" />
              Добавить слайд
            </button>
            <div className="form-footer sticky-footer">
              <button className="btn" onClick={() => setStep(1)}>
                <Icon name="back" />
                Материалы
              </button>
              <button
                className="btn primary"
                disabled={busy || content.slides.some((s) => !s.title.trim())}
                onClick={generate}
              >
                Создать презентацию
                <Icon name="spark" />
              </button>
            </div>
          </section>
          <aside className="panel outline-summary">
            <span className="label">Ваша презентация</span>
            <TemplateCover
              template={template}
              title={content.slides[0].title}
            />
            <h3>{template.name}</h3>
            <div className="spec-row">
              <span>Слайдов</span>
              <strong>{content.slides.length}</strong>
            </div>
            <div className="spec-row">
              <span>Для кого</span>
              <strong>{audience}</strong>
            </div>
            <p className="wizard-summary-note">
              <Icon name="edit" />
              Заголовки и порядок можно изменить сейчас. Оформление выберем на
              последнем шаге.
            </p>
          </aside>
        </div>
      )}
      {step === 3 && (
        <section className="generation panel" aria-busy="true">
          <ThinkingSkeleton
            label={
              live
                ? "AI собирает вашу презентацию"
                : "Собираем презентацию по шаблону"
            }
          />
          <h2>У вашей идеи появляется форма</h2>
          <p className="small muted">
            {live
              ? "Продумываем композицию, создаём три варианта и проверяем результат."
              : "Демонстрационный режим: три композиции по правилам, без AI-генерации."}
          </p>
          <p className="wizard-sr-only" role="status">
            {generationStages.find(([id]) => id === stage)?.[1] ||
              "Обрабатываем презентацию"}
          </p>
          <ol className="generation-stages" aria-label="Ход создания">
            {generationStages.map(([id, title, subtitle], i) => {
              const current = generationStages.findIndex(
                ([key]) => key === stage,
              );
              const completed = current > i;
              return (
                <li
                  key={id}
                  className={id === stage ? "active" : completed ? "done" : ""}
                  aria-current={id === stage ? "step" : undefined}
                >
                  <span>{completed ? <Icon name="check" /> : i + 1}</span>
                  <div>
                    <strong>{title}</strong>
                    <small>{subtitle}</small>
                  </div>
                  {id === stage && <i className="spinner" />}
                </li>
              );
            })}
          </ol>
          <p className="tiny muted">
            Презентация сохранится в разделе «Мои презентации».
          </p>
        </section>
      )}
      {step === 4 && result && (
        <section className="wizard-results">
          <div className="wizard-results-heading">
            <div>
              <span className="wizard-ready">
                <Icon name="check" />
                Презентация готова
              </span>
              <h2>Одна история. Три способа рассказать.</h2>
              <p className="muted small">
                Содержание общее, меняется композиция. {result.template.name}.
              </p>
            </div>
            <span className="badge">
              {result.content.slides.length} слайдов
            </span>
          </div>
          {operation === "regenerate" && (
            <div className="wizard-regeneration-status" role="status">
              <i className="spinner" />
              <div>
                <strong>
                  {live
                    ? "AI готовит новое оформление"
                    : "Готовим новые композиции"}
                </strong>
                <p>
                  {generationStages.find(([id]) => id === stage)?.[1] ||
                    "Обрабатываем презентацию"}
                  . Текущая версия сохранена.
                </p>
              </div>
            </div>
          )}
          <div className="variant-grid">
            {(["a", "b", "c"] as const).map((v) => (
              <article
                className={`variant-card ${variant === v ? "selected" : ""}`}
                key={v}
              >
                <button
                  className="variant-cover"
                  aria-label={`Выбрать ${variantNames[v].toLowerCase()} вариант`}
                  aria-pressed={variant === v}
                  disabled={busy}
                  onClick={() => setVariant(v)}
                >
                  <SlidePreview scene={result.variants[v][0]} />
                  <span className="wizard-variant-mark" aria-hidden="true">
                    {variant === v ? <Icon name="check" /> : v.toUpperCase()}
                  </span>
                </button>
                <div className="variant-mini">
                  {result.variants[v].slice(1, 3).map((scene, i) => (
                    <SlidePreview key={i} scene={scene} />
                  ))}
                </div>
                <div className="variant-body">
                  <div className="between">
                    <h3>{variantNames[v]}</h3>
                    <span className="badge">
                      {variant === v ? "Ваш выбор" : `${v.toUpperCase()} / 03`}
                    </span>
                  </div>
                  <p>
                    {
                      {
                        a: "Размещение на основе полей шаблона.",
                        b: "Цветовой акцент и компактная текстовая зона.",
                        c: "Больше воздуха и спокойная композиция.",
                      }[v]
                    }
                  </p>
                  <button
                    className={`btn ${v === variant ? "primary" : ""}`}
                    onClick={() => setVariant(v)}
                    disabled={busy}
                    aria-pressed={v === variant}
                  >
                    {v === variant ? (
                      <>
                        <Icon name="check" />
                        Выбран
                      </>
                    ) : (
                      "Выбрать вариант"
                    )}
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="wizard-regenerate panel">
            <div className="wizard-regenerate-copy">
              <span className="wizard-heading-icon">
                <Icon name="spark" />
              </span>
              <div>
                <h3>Попробуем другое оформление?</h3>
                <p>
                  {live
                    ? "AI создаст новую композицию в этом же шаблоне. Текст и текущая презентация сохранятся."
                    : "Демо: создадим другие композиции по правилам. AI не подключён; текущая презентация сохранится."}
                </p>
              </div>
            </div>
            <label className="field">
              <span>
                Пожелания к оформлению{" "}
                <small className="muted">· необязательно</small>
              </span>
              <textarea
                rows={2}
                maxLength={1000}
                value={instruction}
                disabled={busy}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Например: больше воздуха, крупнее заголовки, выразительнее акценты"
              />
            </label>
            <div className="wizard-regenerate-action">
              <span className="tiny muted">
                {live
                  ? "Новая версия появится в «Моих презентациях»."
                  : "В деморежиме свободные пожелания не применяются."}
              </span>
              <button className="btn" disabled={busy} onClick={regenerate}>
                {operation === "regenerate" ? (
                  <i className="spinner" />
                ) : (
                  <Icon name="spark" />
                )}
                {operation === "regenerate"
                  ? "Готовим варианты…"
                  : live
                    ? "Создать новое оформление"
                    : "Новые композиции"}
              </button>
            </div>
          </div>
          <div className="form-footer">
            <span className="tiny muted">
              Графика мастеров и исходные шрифты сохраняются в PPTX.
            </span>
            <button className="btn primary" disabled={busy} onClick={open}>
              {operation === "open" ? "Открываем…" : "Открыть презентацию"}
              <Icon name="arrow" />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
