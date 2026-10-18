import { PresentationSpace } from "../components/spatial/PresentationSpace";
import { useState } from "react";
import { Icon } from "../components/Icon";
import { TemplateCover } from "../components/TemplateCover";
import type { Template } from "../types";

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
          <span className="eyebrow">ИЗ МАТЕРИАЛОВ — В ЦЕЛОЕ</span>
          <h2>
            Каждая деталь
            <br />
            на своём месте.
          </h2>
          <p>Текст, изображения и данные собираются в единую историю.</p>
          <span className="assembly-disclaimer">
            Визуальная демонстрация · не статус генерации
          </span>
          <button
            className="btn sm"
            onClick={() => setReplay((value) => value + 1)}
          >
            <Icon name="play" />
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
              <Icon name="arrow" />
            </button>
          ))}
        </nav>
        <section className="demo-content panel">
          <span className="label">{step + 1} / 6 · Как это работает</span>
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
