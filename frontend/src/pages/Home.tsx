import { useEffect, useState } from "react";
import { api } from "../api";
import { Icon } from "../components/Icon";
import { TemplateCard } from "../components/TemplateCard";
import type { Project, ProjectSummary } from "../types";
import type { CatalogActions } from "./catalogTypes";
import { PresentationSpace } from "../components/spatial/PresentationSpace";
import { useSurfaceMotion } from "../motion/animation";
export function Home(
  props: CatalogActions & {
    start: (mode: "description" | "text") => void;
    open: (p: Project) => void;
    onError: (m: string) => void;
  },
) {
  const motionScope = useSurfaceMotion([], ".hero-copy > *");
  const [tab, setTab] = useState("Обзор");
  const [shownTab, setShownTab] = useState(tab);
  useEffect(() => {
    if (shownTab === tab) return;
    const timer = setTimeout(
      () => setShownTab(tab),
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 140,
    );
    return () => clearTimeout(timer);
  }, [tab, shownTab]);
  const [recent, setRecent] = useState<ProjectSummary[]>([]),
    [opening, setOpening] = useState("");
  useEffect(() => {
    api
      .projects()
      .then((p) => setRecent(p.slice(0, 3)))
      .catch((e) => props.onError(e.message));
  }, []);
  async function openProject(id: string) {
    setOpening(id);
    try {
      props.open(await api.project(id));
    } catch (e) {
      props.onError((e as Error).message);
    } finally {
      setOpening("");
    }
  }
  const quick = (
    <div className="quick-grid">
      {(
        [
          [
            "description",
            "spark",
            "Создать по описанию",
            "Начните с одной идеи",
          ],
          [
            "text",
            "file",
            "Вставить готовый текст",
            "Соберите материал в историю",
          ],
          [
            "upload",
            "upload",
            "Загрузить свой шаблон",
            "Сохраните фирменный стиль",
          ],
        ] as const
      ).map(([id, icon, title, subtitle]) => (
        <button
          className="quick"
          key={id}
          onClick={() => (id === "upload" ? props.upload() : props.start(id))}
        >
          <span className="quick-icon">
            <Icon name={icon} />
          </span>
          <span>
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </span>
        </button>
      ))}
    </div>
  );
  return (
    <div className="spatial-home" ref={motionScope}>
      <div className="heading between">
        <div>
          <h1>
            Ваша следующая идея —<br />в отличной форме.
          </h1>
          <p>Цифровой дизайнер презентаций</p>
        </div>
        <button
          className="btn primary"
          onClick={() => props.start("description")}
        >
          <Icon name="plus" />
          Создать презентацию
        </button>
      </div>
      <div
        className="tabs home-tabs"
        role="tablist"
        aria-label="Разделы главной"
      >
        <span
          className="home-tab-indicator"
          aria-hidden="true"
          style={{
            transform: `translateX(${["Обзор", "Быстрый старт", "Вдохновение"].indexOf(tab) * 100}%)`,
          }}
        />
        {["Обзор", "Быстрый старт", "Вдохновение"].map((name, index) => (
          <button
            key={name}
            role="tab"
            aria-selected={name === tab}
            aria-controls="home-tab-content"
            id={`home-tab-${index}`}
            tabIndex={name === tab ? 0 : -1}
            className={tab === name ? "active" : ""}
            onClick={() => setTab(name)}
            onKeyDown={(e) => {
              const names = ["Обзор", "Быстрый старт", "Вдохновение"];
              const target =
                e.key === "ArrowRight"
                  ? (index + 1) % 3
                  : e.key === "ArrowLeft"
                    ? (index + 2) % 3
                    : e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? 2
                        : -1;
              if (target >= 0) {
                e.preventDefault();
                setTab(names[target]);
                document.getElementById(`home-tab-${target}`)?.focus();
              }
            }}
          >
            <Icon
              name={index === 0 ? "grid" : index === 1 ? "spark" : "palette"}
            />
            {name}
          </button>
        ))}
      </div>
      <div
        id="home-tab-content"
        key={shownTab}
        className={
          tab === shownTab ? "home-tab-panel" : "home-tab-panel is-exiting"
        }
        role="tabpanel"
        aria-labelledby={`home-tab-${["Обзор", "Быстрый старт", "Вдохновение"].indexOf(shownTab)}`}
        inert={tab !== shownTab}
      >
        {shownTab === "Обзор" && (
          <section className="spatial-story">
            <div className="hero spatial-hero">
              <div className="hero-copy">
                <span className="badge blue">
                  <Icon name="spark" />
                  От идеи — к готовой истории
                </span>
                <h2>
                  Содержание — ваше.
                  <br />
                  <span>Дизайн — Deckly.</span>
                </h2>
                <p>
                  Выберите фирменный шаблон, добавьте материал и найдите
                  оформление, которое ему подходит.
                </p>
                <div className="hero-actions">
                  <button
                    className="btn primary"
                    onClick={() => props.start("description")}
                  >
                    Начать работу
                    <Icon name="arrow" />
                  </button>
                  <a className="btn" href="#demo">
                    <Icon name="play" />
                    Как это работает
                  </a>
                </div>
              </div>
              <div className="hero-visual spatial-visual">
                <PresentationSpace templates={props.templates} />
              </div>
              <div className="space-story-footer">
                <span>
                  <Icon name="check" />
                  Один стиль. На каждом слайде.
                </span>
                <span className="space-scroll-hint">
                  Листайте — меняйте перспективу
                  <Icon name="arrow" />
                </span>
              </div>
              <div className="space-progress" aria-hidden="true">
                <i />
              </div>
            </div>
          </section>
        )}
        {shownTab !== "Вдохновение" && quick}
        {shownTab === "Обзор" && recent.length > 0 && (
          <section className="recent-section">
            <div className="section-head">
              <h2>Продолжите с того же места</h2>
              <a className="btn sm ghost" href="#projects">
                Все презентации
                <Icon name="arrow" />
              </a>
            </div>
            <div className="recent-grid">
              {recent.map((p) => (
                <button
                  key={p.id}
                  className="recent-card"
                  disabled={Boolean(opening)}
                  onClick={() => openProject(p.id)}
                >
                  <span className="recent-preview">
                    <Icon name="file" />
                    <i />
                    <i />
                  </span>
                  <span className="recent-copy">
                    <strong>{p.title}</strong>
                    <small>
                      {p.content.slides.length} слайдов ·{" "}
                      {new Date(p.updated_at).toLocaleDateString("ru-RU")}
                    </small>
                  </span>
                  {opening === p.id ? (
                    <i className="spinner" />
                  ) : (
                    <Icon name="arrow" />
                  )}
                </button>
              ))}
            </div>
          </section>
        )}
        {shownTab === "Быстрый старт" ? (
          <div className="panel stack">
            <h2>Начните с готового примера</h2>
            <p className="muted">
              Презентация Deckly.Ai показывает весь путь. После подключения LLM
              здесь же можно работать со своей темой.
            </p>
            <button className="btn primary" onClick={() => props.start("text")}>
              <Icon name="play" />
              Открыть пример
            </button>
          </div>
        ) : (
          <>
            <div className="section-head">
              <h2>
                {shownTab === "Вдохновение"
                  ? "Подборки под вашу задачу"
                  : "Ваш стиль начинается здесь"}
              </h2>
              <a className="btn sm ghost" href="#templates">
                Все шаблоны
                <Icon name="arrow" />
              </a>
            </div>
            <div className="cards">
              {(shownTab === "Вдохновение"
                ? props.templates.slice(3)
                : props.templates.slice(0, 3)
              ).map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  favorite={props.favorites.includes(t.id)}
                  onFavorite={() => props.toggleFavorite(t.id)}
                  onSelect={() => props.select(t)}
                  onPreview={() => props.preview(t)}
                />
              ))}
            </div>
          </>
        )}
        <div className="welcome-tip">
          <Icon name="link" />
          <span>
            <strong>Слайды с опорой на материалы.</strong> Проверяйте цитату
            рядом с тезисом — прямо в редакторе.
          </span>
        </div>
      </div>
    </div>
  );
}

export { Catalog } from "./Catalog";
export type { CatalogActions } from "./catalogTypes";
