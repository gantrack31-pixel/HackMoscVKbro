import { useEffect, useState } from "react";
import { api } from "../api";
import { CloudLibrary } from "../components/CloudLibrary";
import { Icon } from "../components/Icon";
import { TemplateCover } from "../components/TemplateCard";
import type { Project, ProjectSummary, Template } from "../types";

export function Projects({
  templates,
  onOpen,
  onError,
}: {
  templates: Template[];
  onOpen: (p: Project) => void;
  onError: (m: string) => void;
}) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]),
    [loading, setLoading] = useState(true),
    [remove, setRemove] = useState<string | null>(null);
  useEffect(() => {
    api
      .projects()
      .then(setProjects)
      .catch((e) => onError(e.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <>
      <div className="heading between">
        <div>
          <h1>Мои презентации</h1>
          <p>Ваши истории продолжаются здесь.</p>
        </div>
        <a className="btn primary" href="#create">
          <Icon name="plus" />
          Создать презентацию
        </a>
      </div>
      <div className="cards">
        {projects.map((p) => {
          const template = templates.find((t) => t.id === p.template_id);
          return (
            <article className="template" key={p.id}>
              <button
                className="template-cover"
                onClick={() =>
                  api
                    .project(p.id)
                    .then(onOpen)
                    .catch((e) => onError(e.message))
                }
              >
                {template && (
                  <TemplateCover template={template} title={p.title} />
                )}
              </button>
              <div className="template-body">
                <h3>{p.title}</h3>
                <p>
                  {p.content.slides.length} слайдов ·{" "}
                  {new Date(p.updated_at).toLocaleDateString("ru-RU")}
                </p>
                <div className="template-footer">
                  <button
                    className="btn sm"
                    onClick={() =>
                      api
                        .project(p.id)
                        .then(onOpen)
                        .catch((e) => onError(e.message))
                    }
                  >
                    Открыть
                    <Icon name="arrow" />
                  </button>
                  {remove === p.id ? (
                    <div className="row">
                      <button
                        className="btn sm"
                        onClick={async () => {
                          try {
                            await api.remove(p.id);
                            setProjects(projects.filter((x) => x.id !== p.id));
                          } catch (e) {
                            onError((e as Error).message);
                          }
                        }}
                      >
                        Удалить?
                      </button>
                      <button
                        className="btn ghost sm"
                        aria-label="Отмена удаления"
                        onClick={() => setRemove(null)}
                      >
                        <Icon name="close" />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn ghost sm"
                      aria-label={`Удалить ${p.title}`}
                      onClick={() => setRemove(p.id)}
                    >
                      <Icon name="trash" />
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {loading ? (
        <p>Загружаем презентации…</p>
      ) : (
        !projects.length && (
          <section className="empty panel">
            <Icon name="folder" />
            <h2>Первая история впереди</h2>
            <p>Выберите шаблон и создайте презентацию по своему материалу.</p>
            <a className="btn primary" href="#templates">
              Выбрать шаблон
            </a>
          </section>
        )
      )}
      <CloudLibrary onOpen={onOpen} />
    </>
  );
}

const stages = [
  [
    "Шаблон",
    "Стиль уже задан",
    "Загрузите PPTX или выберите VK Tech, VK WorkSpace, VK Education. Deckly извлечёт палитру, шрифты, пропорции и поля макетов.",
  ],
  [
    "Материалы",
    "От фактов — к истории",
    "Добавьте готовый текст или опишите идею. Проверьте структуру и факты перед оформлением.",
  ],
  [
    "Структура",
    "Сначала главная мысль",
    "Отредактируйте заголовки, тезисы и порядок слайдов до оформления.",
  ],
  [
    "Варианты",
    "Три композиции. Один смысл.",
    "Одинаковое содержание размещается в трёх вариантах одного шаблона. Выберите подходящий.",
  ],
  [
    "Проверка",
    "Замечайте детали заранее",
    "Найдите переполнение и проблемы контраста. Сопоставьте тезис с цитатой и примените выбранные исправления.",
  ],
  [
    "Экспорт",
    "Готово к следующему шагу",
    "Скачайте редактируемый PPTX, PDF или автономный HTML. Исходная графика мастеров сохраняется в PPTX.",
  ],
];
export function Demo({
  templates,
  start,
}: {
  templates: Template[];
  start: () => void;
}) {
  const [step, setStep] = useState(0);
  return (
    <>
      <div className="heading">
        <h1>От идеи до последнего слайда</h1>
        <p>Шесть шагов — одна понятная история.</p>
      </div>
      <div className="demo-layout">
        <nav className="demo-nav" aria-label="Этапы создания презентации">
          {stages.map(([name], i) => (
            <button
              key={name}
              className={i === step ? "active" : ""}
              onClick={() => setStep(i)}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              <strong>{name}</strong>
              <Icon name="arrow" />
            </button>
          ))}
        </nav>
        <section className="demo-content panel">
          <span className="label">{step + 1} / 6 · Как это работает</span>
          <h2>{stages[step][1]}</h2>
          <p className="muted">{stages[step][2]}</p>
          <div className="demo-visual">
            {step === 0 ? (
              <div className="demo-templates">
                {templates.slice(0, 3).map((t) => (
                  <div key={t.id}>
                    <TemplateCover template={t} />
                    <p className="small">{t.name}</p>
                  </div>
                ))}
              </div>
            ) : step === 1 ? (
              <div className="demo-prompt">
                <span className="badge blue">Готовый текст</span>
                <p>
                  Презентация проекта Deckly.Ai: проблема, решение, шаблоны,
                  проверка, результат.
                </p>
              </div>
            ) : step === 2 ? (
              <ol className="demo-outline">
                <li>Проблема и контекст</li>
                <li>Как работает решение</li>
                <li>Польза для команды</li>
                <li>Следующий шаг</li>
              </ol>
            ) : step === 3 ? (
              <div className="demo-templates">
                {templates[0] &&
                  ["Классический", "Акцентный", "Минималистичный"].map(
                    (name, i) => (
                      <div key={name}>
                        <TemplateCover template={templates[0]} title={name} />
                        <p className="small">Вариант {i + 1}</p>
                      </div>
                    ),
                  )}
              </div>
            ) : step === 4 ? (
              <div className="demo-checks">
                <p>
                  <Icon name="check" />
                  Цитата найдена в материале
                </p>
                <p>
                  <Icon name="alert" />
                  Заголовку не хватает контраста
                </p>
                <p>
                  <Icon name="shield" />
                  Вы решаете, что исправить
                </p>
              </div>
            ) : (
              <div className="format-preview">
                {["PPTX", "PDF", "HTML"].map((x) => (
                  <div key={x}>
                    <Icon name="file" />
                    <strong>{x}</strong>
                    <span>
                      {x === "PPTX" ? "Редактировать" : "Показывать и делиться"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="between">
            <button
              className="btn"
              disabled={!step}
              onClick={() => setStep(step - 1)}
            >
              <Icon name="back" />
              Назад
            </button>
            {step < 5 ? (
              <button className="btn primary" onClick={() => setStep(step + 1)}>
                Следующий шаг
                <Icon name="arrow" />
              </button>
            ) : (
              <button className="btn primary" onClick={start}>
                Попробовать пример
                <Icon name="spark" />
              </button>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
export function Support() {
  return (
    <>
      <div className="heading">
        <h1>Мы рядом, если нужна помощь</h1>
        <p>От первого шаблона до готовой презентации.</p>
      </div>
      <div className="support-grid">
        <section className="support-contact">
          <span className="label">Поддержка Deckly.Ai</span>
          <div className="telegram-orb">
            <Icon name="telegram" />
          </div>
          <h2>
            Давайте
            <br />
            разберёмся вместе.
          </h2>
          <p>
            Напишите нам о вопросе или пришлите пример. Пока поддержка работает
            через личный профиль.
          </p>
          <a
            className="btn"
            href="https://t.me/flixyyy"
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="telegram" />
            Написать @flixyyy
            <Icon name="external" />
          </a>
        </section>
        <section className="panel">
          <h2>Частые вопросы</h2>
          {[
            [
              "Как подключить модель?",
              "Подключение модели настраивает владелец сервера. После подключения вы сможете создавать содержание по своим материалам.",
            ],
            [
              "Как добавить свой шаблон?",
              "Откройте «Шаблоны» → «Загрузить шаблон». Поддерживается PPTX до 50 МБ. Палитра, шрифты, пропорции и макеты считываются на сервере.",
            ],
            [
              "Можно ли редактировать результат?",
              "Да. В редакторе меняется содержание; в PowerPoint текст, таблицы и диаграммы остаются отдельными объектами.",
            ],
            [
              "Почему PDF и PPTX могут отличаться?",
              "В PPTX сохраняются ресурсы мастеров исходного шаблона. PDF и HTML используют общую схему размещения с Manrope, без графики мастеров.",
            ],
          ].map(([q, a]) => (
            <details className="faq" key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
      </div>
    </>
  );
}
