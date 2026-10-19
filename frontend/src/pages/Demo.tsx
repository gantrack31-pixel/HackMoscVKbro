import { PresentationSpace } from "../components/spatial/PresentationSpace";
import { useState } from "react";
import { Icon } from "../components/Icon";
import { TemplateCover } from "../components/TemplateCover";
import type { Template } from "../types";

const stages = [
  [
    "Шаблон",
    "Стиль уже задан",
    "Выберите готовый шаблон или загрузите PPTX со своими цветами, шрифтами и макетами.",
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
    "Скачайте PPTX для редактирования, PDF для показа или HTML для просмотра в браузере.",
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
  const [replay, setReplay] = useState(0);
  return (
    <>
      <div className="heading">
        <h1>От идеи до последнего слайда</h1>
        <p>Шесть шагов — одна понятная история.</p>
      </div>
      <section
        className="assembly-showcase"
        aria-label="Визуальная демонстрация сборки презентации"
      >
        <div className="assembly-copy">
          <span className="demo-preview-label">
            <Icon name="demo-assembly" /> Пример сборки
          </span>
          <h2>
            Каждая деталь
            <br />
            на своём месте.
          </h2>
          <p>Текст, изображения и данные собираются в единую историю.</p>
          <button
            className="btn sm"
            onClick={() => setReplay((value) => value + 1)}
          >
            <Icon name="demo-replay" />
            Повторить сборку
          </button>
        </div>
        <PresentationSpace
          templates={templates}
          mode="assembly"
          revision={replay}
        />
      </section>
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
            </button>
          ))}
        </nav>
        <section className="demo-content panel">
          <span className="label demo-step-label">Шаг {step + 1} из 6</span>
          <h2>{stages[step][1]}</h2>
          <p className="muted">{stages[step][2]}</p>
          <div className="demo-visual" key={step}>
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
                  <Icon name="demo-source-quote" />
                  Цитата найдена в материале
                </p>
                <p>
                  <Icon name="demo-contrast" />
                  Заголовку не хватает контраста
                </p>
                <p>
                  <Icon name="demo-user-control" />
                  Вы решаете, что исправить
                </p>
              </div>
            ) : (
              <div className="format-preview">
                {["PPTX", "PDF", "HTML"].map((x) => (
                  <div key={x}>
                    <Icon
                      name={
                        x === "PPTX"
                          ? "demo-format-pptx"
                          : x === "PDF"
                            ? "demo-format-pdf"
                            : "demo-format-html"
                      }
                    />
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
              Назад
            </button>
            {step < 5 ? (
              <button className="btn primary" onClick={() => setStep(step + 1)}>
                Следующий шаг
              </button>
            ) : (
              <button className="btn primary" onClick={start}>
                Попробовать пример
                <Icon name="demo-try-example" />
              </button>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
