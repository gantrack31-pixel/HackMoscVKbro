import { useEffect, useState } from "react";
import { api } from "../api";
import { Icon } from "../components/Icon";
import { TemplateCard, TemplateCover } from "../components/TemplateCard";
import type { Template, Project, ProjectSummary } from "../types";
export interface CatalogActions {
  templates: Template[];
  favorites: string[];
  toggleFavorite: (id: string) => void;
  select: (t: Template) => void;
  preview: (t: Template) => void;
  upload: () => void;
}
export function Home(
  props: CatalogActions & {
    start: (mode: "description" | "text") => void;
    open: (p: Project) => void;
    onError: (m: string) => void;
  },
) {
  const [tab, setTab] = useState("Обзор");
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
    <>
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
        role="tabpanel"
        aria-labelledby={`home-tab-${["Обзор", "Быстрый старт", "Вдохновение"].indexOf(tab)}`}
      >
        {tab === "Обзор" && (
          <section className="hero">
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
            <div className="hero-visual">
              {props.templates[2] && (
                <div className="floating back">
                  <TemplateCover template={props.templates[2]} />
                </div>
              )}
              {props.templates[0] && (
                <div className="floating front">
                  <TemplateCover
                    template={props.templates[0]}
                    title="Идеи обретают свою форму."
                  />
                </div>
              )}
              <div className="float-label">
                <Icon name="check" />
                Один стиль. На каждом слайде.
              </div>
            </div>
          </section>
        )}
        {tab !== "Вдохновение" && quick}
        {tab === "Обзор" && recent.length > 0 && (
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
        {tab === "Быстрый старт" ? (
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
                {tab === "Вдохновение"
                  ? "Подборки под вашу задачу"
                  : "Ваш стиль начинается здесь"}
              </h2>
              <a className="btn sm ghost" href="#templates">
                Все шаблоны
                <Icon name="arrow" />
              </a>
            </div>
            <div className="cards">
              {(tab === "Вдохновение"
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
    </>
  );
}
export function Catalog(
  props: CatalogActions & { onlyFavorites?: boolean; initialSearch?: string },
) {
  const [search, setSearch] = useState(props.initialSearch || ""),
    [category, setCategory] = useState("Все шаблоны");
  useEffect(() => {
    setSearch(props.initialSearch || "");
    setCategory("Все шаблоны");
  }, [props.initialSearch]);
  const categories = [
    "Все шаблоны",
    ...new Set(props.templates.map((t) => t.metadata.category)),
  ];
  const list = props.templates.filter(
    (t) =>
      (!props.onlyFavorites || props.favorites.includes(t.id)) &&
      (category === "Все шаблоны" || t.metadata.category === category) &&
      `${t.name} ${t.metadata.category} ${t.metadata.cover_title}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <>
      <div className="heading between">
        <div>
          <h1>
            {props.onlyFavorites
              ? "Ваши любимые шаблоны"
              : "Найдите свой стиль"}
          </h1>
          <p>Фирменные шаблоны и авторские подборки под вашу задачу.</p>
        </div>
        <button className="btn" onClick={props.upload}>
          <Icon name="upload" />
          Загрузить шаблон
        </button>
      </div>
      {!props.onlyFavorites && (
        <div className="collection-banner">
          <div>
            <span className="eyebrow">КОЛЛЕКЦИЯ DECKLY</span>
            <h2>
              Оформление с характером.
              <br />
              Для каждой вашей истории.
            </h2>
            <p>
              {props.templates.length} шаблонов · Три варианта оформления ·
              Редактируемые слайды
            </p>
          </div>
          <div className="collection-samples" aria-hidden="true">
            {props.templates
              .filter((t) =>
                ["strategy", "editorial", "product"].includes(t.id),
              )
              .map((t) => (
                <TemplateCover template={t} key={t.id} />
              ))}
          </div>
        </div>
      )}
      <div className="catalog-toolbar">
        <label className="search-box">
          <Icon name="search" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Название, тема или стиль"
            aria-label="Поиск шаблонов"
          />
        </label>
        <span className="small muted">Найдено: {list.length}</span>
      </div>
      <div className="filters">
        {categories.map((c) => (
          <button
            key={c}
            className={`filter ${c === category ? "active" : ""}`}
            onClick={() => setCategory(c)}
            aria-pressed={c === category}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="catalog-note">
        <Icon name="file" />
        Карточки показывают пример подачи. У загруженных PPTX считываются
        собственные пропорции, палитра, шрифты и макеты.
      </div>
      <div className="cards">
        {list.map((t) => (
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
      {!list.length && (
        <div className="empty">
          <Icon name="star" />
          <h2>Пока пусто</h2>
          <p>Попробуйте другую категорию или сохраните шаблон звёздочкой.</p>
          <button
            className="btn"
            onClick={() => {
              setSearch("");
              setCategory("Все шаблоны");
            }}
          >
            Сбросить фильтры
          </button>
        </div>
      )}
    </>
  );
}
