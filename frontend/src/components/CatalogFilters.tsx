/** Each pill owns its highlight, so selection never travels across other rows. */
export function CatalogFilters({
  categories,
  selected,
  onSelect,
}: {
  categories: string[];
  selected: string;
  onSelect: (category: string) => void;
}) {
  return (
    <div
      className="filters catalog-filters"
      role="group"
      aria-label="Категории шаблонов"
    >
      {categories.map((category) => (
        <button
          type="button"
          key={category}
          className={`filter ${category === selected ? "active" : ""}`}
          aria-pressed={category === selected}
          onClick={() => onSelect(category)}
        >
          <span className="catalog-filter-label">{category}</span>
        </button>
      ))}
    </div>
  );
}
