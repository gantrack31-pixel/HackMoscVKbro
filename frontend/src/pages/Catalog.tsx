import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { TemplateCover } from "../components/TemplateCover";
import { SpatialGallery } from "../components/spatial/SpatialGallery";
import type { CatalogActions } from "./catalogTypes";
import { CatalogFilters } from "../components/CatalogFilters";
import { LibraryEmptyState } from "../components/LibraryEmptyState";
import { gsap, useGSAP } from "../motion/animation";

export function Catalog(
  props: CatalogActions & { onlyFavorites?: boolean; initialSearch?: string },
) {
  const [search, setSearch] = useState(props.initialSearch || ""),
    [category, setCategory] = useState("Все шаблоны");
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.key !== "/" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.isComposing ||
        (target instanceof HTMLElement &&
          target.closest(
            "input, textarea, select, [contenteditable='true'], dialog",
          )) ||
        document.querySelector("dialog[open]")
      )
        return;
      event.preventDefault();
      searchInput.current?.focus();
    };
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);
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
  const resultSignature = list.map((template) => template.id).join("|");
  const resultsScope = useRef<HTMLDivElement>(null);
  const previousCategory = useRef(category);
  useGSAP(
    () => {
      const changedCategory = previousCategory.current !== category;
      previousCategory.current = category;
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const results = resultsScope.current?.querySelector(".catalog-results");
        if (results)
          gsap.fromTo(
            results,
            { opacity: 0.45, y: changedCategory ? 6 : 0 },
            {
              opacity: 1,
              y: 0,
              duration: changedCategory ? 0.26 : 0.18,
              ease: "power2.out",
              clearProps: "opacity,transform",
              overwrite: true,
            },
          );
      });
      return () => media.revert();
    },
    {
      scope: resultsScope,
      dependencies: [category, resultSignature],
      revertOnUpdate: true,
    },
  );
  const hasFilters = Boolean(query || category !== "Все шаблоны");
  const emptyFavorites = Boolean(
    props.onlyFavorites && props.favorites.length === 0 && !hasFilters,
  );
  return (
    <div className="catalog-page" ref={resultsScope}>
      <div className="heading between">
        <div>
          <h1>
            {props.onlyFavorites
              ? "Ваши любимые шаблоны"
              : "Найдите свой стиль"}
          </h1>
          {!props.onlyFavorites && (
            <p>Фирменные шаблоны и авторские подборки под вашу задачу.</p>
          )}
        </div>
        <button className="btn" onClick={props.upload}>
          <Icon name="library-upload" />
          Загрузить шаблон
        </button>
      </div>
      {!props.onlyFavorites && (
        <div className="collection-banner catalog-collection">
          <div>
            <span className="eyebrow">КОЛЛЕКЦИЯ DECKLY</span>
            <h2>
              Оформление с характером.
              <br />
              Для каждой вашей истории.
            </h2>
            <p>
              Шаблоны: {props.templates.length} · Три варианта оформления ·
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
      <div className="catalog-toolbar catalog-controls">
        <div
          className={`search-box catalog-search${search ? " has-query" : ""}`}
          role="search"
          aria-label="Поиск по каталогу"
        >
          <span className="catalog-search-icon" aria-hidden="true">
            <Icon name="library-search" />
          </span>
          <input
            ref={searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Название, тема или стиль"
            aria-label="Поиск шаблонов"
            onKeyDown={(event) => {
              if (
                event.key === "Escape" &&
                !event.nativeEvent.isComposing &&
                search
              ) {
                event.stopPropagation();
                setSearch("");
              }
            }}
          />
          {search && (
            <button
              className="catalog-search-clear"
              aria-label="Очистить поиск"
              onClick={() => {
                setSearch("");
                searchInput.current?.focus();
              }}
            >
              <Icon name="library-clear-search" />
            </button>
          )}
        </div>
        <span
          className="catalog-result-count"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          Найдено <strong key={list.length}>{list.length}</strong>
        </span>
      </div>
      <CatalogFilters
        categories={categories}
        selected={category}
        onSelect={setCategory}
      />
      {!props.onlyFavorites && list.length > 0 && (
        <div className="catalog-note">
          Примеры оформления · загруженный PPTX сохраняет свой стиль и
          пропорции.
        </div>
      )}
      <div className="catalog-results">
        {list.length > 0 && (
          <SpatialGallery
            key={`${category}:${query}`}
            {...props}
            templates={list}
          />
        )}
        {!list.length && (
          <LibraryEmptyState
            kind={emptyFavorites ? "favorites" : "search"}
            title={
              emptyFavorites
                ? "Сохраните то, что вдохновляет"
                : "Пока нет совпадений"
            }
            description={
              emptyFavorites
                ? "Сохраняйте понравившиеся шаблоны — ваша личная коллекция появится здесь."
                : "Попробуйте другое название или категорию. Ваш стиль обязательно найдётся."
            }
          >
            {emptyFavorites ? (
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
          </LibraryEmptyState>
        )}
      </div>
    </div>
  );
}
