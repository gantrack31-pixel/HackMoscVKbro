import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { TemplateCover } from "../components/TemplateCover";
import { SpatialGallery } from "../components/spatial/SpatialGallery";
import type { CatalogActions } from "./catalogTypes";

export function Catalog(
  props: CatalogActions & { onlyFavorites?: boolean; initialSearch?: string },
) {
  const [search, setSearch] = useState(props.initialSearch || ""),
    [category, setCategory] = useState("Все шаблоны");
  useEffect(() => {
    setSearch(props.initialSearch || "");
    setCategory("Все шаблоны");
  }, [props.initialSearch]);
  const categories = useMemo(
    () => [
      "Все шаблоны",
      ...new Set(props.templates.map((t) => t.metadata.category)),
    ],
    [props.templates],
  );
  const query = search.trim().toLowerCase();
  const favoriteFilter = props.onlyFavorites ? props.favorites : null;
  const list = useMemo(
    () =>
      props.templates.filter(
        (t) =>
          (!favoriteFilter || favoriteFilter.includes(t.id)) &&
          (category === "Все шаблоны" || t.metadata.category === category) &&
          `${t.name} ${t.metadata.category} ${t.metadata.cover_title}`
            .toLowerCase()
            .includes(query),
      ),
    [props.templates, favoriteFilter, category, query],
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
      {list.length > 0 && <SpatialGallery {...props} templates={list} />}
      {!list.length && (
        <div className="empty">
          <Icon name="star" />
          <h2>Пока пусто</h2>
          <p>Попробуйте другую категорию или сохраните шаблон звёздочкой.</p>
          {props.onlyFavorites && props.favorites.length === 0 ? (
            <a className="btn primary" href="#templates">
              Выбрать шаблоны
            </a>
          ) : (
            <button
              className="btn"
              onClick={() => {
                setSearch("");
                setCategory("Все шаблоны");
              }}
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      )}
    </>
  );
}
