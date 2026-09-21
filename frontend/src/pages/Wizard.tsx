import { useState, useRef, useEffect } from "react";
import { api } from "../api";
import { ThinkingSkeleton } from "../components/ThinkingSkeleton";
import { Icon } from "../components/Icon";
import { TemplateCover } from "../components/TemplateCard";
import { SlidePreview } from "../components/SlidePreview";
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
    [busy, setBusy] = useState(false),
    [stage, setStage] = useState("queued"),
    [result, setResult] = useState<Project | null>(null),
    [variant, setVariant] = useState<Variant>("a");
  const active = useRef(true);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function outline() {
    if (!prompt.trim()) {
      onError("Добавьте описание или материал.");
      return;
    }
    setBusy(true);
    try {
      const response = await api.outline({
        template_id: template.id,
        prompt,
        count,
        audience,
        mode,
      });
      if (active.current) {
        setContent(response.content);
        setStep(2);
      }
    } catch (e) {
      onError((e as Error).message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function generate() {
    if (!content) return;
    setBusy(true);
    setStep(3);
    try {
      const { job_id } = await api.generate(template.id, content, prompt);
      const started = Date.now();
      while (active.current) {
        const job = await api.job(job_id);
        setStage(job.stage);
        if (job.state === "failed")
          throw new Error(job.error || "Не удалось создать презентацию");
        if (job.state === "complete" && job.project_id) {
          setResult(await api.project(job.project_id));
          setStep(4);
          break;
        }
        if (Date.now() - started > 300000)
          throw new Error(
            "Обработка ещё идёт. Проверьте раздел «Мои презентации» через некоторое время.",
          );
        await new Promise((resolve) => setTimeout(resolve, 650));
      }
    } catch (e) {
      onError((e as Error).message);
      setStep(2);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  function edit(index: number, key: "title" | "body", value: string) {
    if (!content) return;
    setContent({
      ...content,
      slides: content.slides.map((s, i) =>
        i === index ? { ...s, [key]: value } : s,
      ),
    });
  }
  function move(index: number, delta: number) {
    if (!content) return;
    const slides = [...content.slides];
    [slides[index], slides[index + delta]] = [
      slides[index + delta],
      slides[index],
    ];
    setContent({ ...content, slides });
  }
  async function open() {
    if (!result) return;
    setBusy(true);
    try {
      onOpen(await api.update(result.id, result.content, variant));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="heading">
        <h1>От идеи — к презентации</h1>
        <p>Ваш текст, ваш шаблон, ваша история.</p>
      </div>
      <ol className="stepper">
        {["Материалы", "Структура", "Создание", "Оформление"].map((name, i) => (
          <li
            key={name}
            className={step === i + 1 ? "active" : step > i + 1 ? "done" : ""}
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
            <span className="label">01 / Исходные материалы</span>
            <h2>О чём ваша презентация?</h2>
            <div className="segmented" role="tablist" aria-label="Способ ввода">
              {(["description", "text"] as const).map((value) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={mode === value}
                  className={mode === value ? "active" : ""}
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
              />
              <span className="field-helper">
                Для привязки тезисов к источнику добавьте факты и исходные
                формулировки.
              </span>
            </label>
            <div className="row wrap">
              <button
                className="btn sm"
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
                  accept=".txt,.md"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.size > 200000) {
                        onError("Выберите текстовый файл до 200 КБ");
                        return;
                      }
                      const text = await f.text();
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
            <div className="form-grid">
              <label className="field">
                Количество слайдов
                <select
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                >
                  {[5, 8, 10, 12, 15, 20].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Для кого
                <select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                >
                  {[
                    "Команда и коллеги",
                    "Клиенты и партнёры",
                    "Инвесторы",
                    "Студенты",
                  ].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-footer">
              <span className="tiny muted">Сначала проверим структуру</span>
              <button className="btn primary" disabled={busy} onClick={outline}>
                {busy ? "Готовим структуру…" : "Создать структуру"}
                <Icon name="arrow" />
              </button>
            </div>
          </section>
          <aside className="stack">
            <section className="panel template-selection">
              <span className="label">Шаблон презентации</span>
              <TemplateCover template={template} />
              <label className="field">
                Выбранный шаблон
                <select
                  value={template.id}
                  onChange={(e) => {
                    const t = templates.find((t) => t.id === e.target.value);
                    if (t) onSelect(t);
                  }}
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
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
              {content.slides.map((s, i) => (
                <article className="outline-item" key={i}>
                  <span className="outline-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="outline-fields">
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
                      className="btn ghost sm"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      aria-label={`Слайд ${i + 1} выше`}
                    >
                      ↑
                    </button>
                    <button
                      className="btn ghost sm"
                      disabled={i === content.slides.length - 1}
                      onClick={() => move(i, 1)}
                      aria-label={`Слайд ${i + 1} ниже`}
                    >
                      ↓
                    </button>
                    <button
                      className="btn ghost sm"
                      disabled={content.slides.length <= 1}
                      onClick={() =>
                        setContent({
                          ...content,
                          slides: content.slides.filter((_, n) => n !== i),
                        })
                      }
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
              onClick={() =>
                setContent({
                  ...content,
                  slides: [...content.slides, blankSlide()],
                })
              }
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
          </aside>
        </div>
      )}
      {step === 3 && (
        <section className="generation panel">
          <ThinkingSkeleton label="Собираем слайды и проверяем оформление" />
          <div className="generation-orb">
            <Icon name="spark" />
          </div>
          <h2>У вашей идеи появляется форма</h2>
          <p className="small muted">
            Создаём три редактируемых PPTX и выполняем проверки.
          </p>
          <ol className="generation-stages">
            {(["queued", "layout", "export", "audit"] as const).map((s, i) => (
              <li key={s} className={s === stage ? "active" : ""}>
                <span>{i + 1}</span>
                <strong>
                  {
                    {
                      queued: "Задание принято",
                      layout: "Размещаем содержание",
                      export: "Создаём три варианта",
                      audit: "Проверяем слайды",
                    }[s]
                  }
                </strong>
                {s === stage && <i className="spinner" />}
              </li>
            ))}
          </ol>
          <p className="tiny muted">
            Презентация сохранится в разделе «Мои презентации».
          </p>
        </section>
      )}
      {step === 4 && result && (
        <>
          <h2>Одна история. Три способа рассказать.</h2>
          <p className="muted small" style={{ margin: "8px 0 24px" }}>
            Содержание общее, меняется композиция. {template.name}.
          </p>
          <div className="variant-grid">
            {(["a", "b", "c"] as const).map((v) => (
              <article
                className={`variant-card ${variant === v ? "selected" : ""}`}
                key={v}
              >
                <div className="variant-cover">
                  <SlidePreview scene={result.variants[v][0]} />
                </div>
                <div className="variant-mini">
                  {result.variants[v].slice(1, 3).map((scene, i) => (
                    <SlidePreview key={i} scene={scene} />
                  ))}
                </div>
                <div className="variant-body">
                  <div className="between">
                    <h3>{variantNames[v]}</h3>
                    <span className="badge">{v.toUpperCase()}</span>
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
          <div className="form-footer">
            <span className="tiny muted">
              Графика мастеров и исходные шрифты сохраняются в PPTX.
            </span>
            <button className="btn primary" disabled={busy} onClick={open}>
              Открыть презентацию
              <Icon name="arrow" />
            </button>
          </div>
        </>
      )}
    </>
  );
}
