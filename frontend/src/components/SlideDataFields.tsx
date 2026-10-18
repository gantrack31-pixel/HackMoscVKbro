import type { Slide } from "../types";

export function SlideDataFields({
  slide,
  onChange,
  values,
  invalid,
  onNumberChange,
  onValuesChange,
}: {
  slide: Slide;
  onChange: (patch: Partial<Slide>) => void;
  values: string[];
  invalid: boolean;
  onNumberChange: (index: number, value: string) => void;
  onValuesChange: (values: string[]) => void;
}) {
  return (
    <>
      {slide.kind === "chart" && slide.chart && (
        <div className="visual-data-editor">
          <span className="label">Данные диаграммы</span>
          {slide.chart.labels.map((label, i) => (
            <div className="chart-data-row" key={i}>
              <input
                aria-label={`Категория ${i + 1}`}
                maxLength={120}
                value={label}
                onChange={(e) =>
                  onChange({
                    chart: {
                      ...slide.chart!,
                      labels: slide.chart!.labels.map((v, n) =>
                        n === i ? e.target.value : v,
                      ),
                    },
                  })
                }
              />
              <input
                aria-label={`Значение ${i + 1}`}
                inputMode="decimal"
                value={values[i] ?? String(slide.chart!.values[i])}
                onChange={(e) => onNumberChange(i, e.target.value)}
              />
              <button
                type="button"
                className="btn sm"
                aria-label={`Удалить категорию ${i + 1}`}
                disabled={slide.chart!.labels.length <= 1 || invalid}
                onClick={() => {
                  onValuesChange(values.filter((_, n) => n !== i));
                  onChange({
                    chart: {
                      ...slide.chart!,
                      labels: slide.chart!.labels.filter((_, n) => n !== i),
                      values: slide.chart!.values.filter((_, n) => n !== i),
                    },
                  });
                }}
              >
                ×
              </button>
            </div>
          ))}
          {invalid && (
            <p className="field-error" role="alert">
              Заполните все значения числами.
            </p>
          )}
          <button
            type="button"
            className="btn sm"
            disabled={slide.chart.labels.length >= 6 || invalid}
            onClick={() => {
              onValuesChange([...values, "0"]);
              onChange({
                chart: {
                  ...slide.chart!,
                  labels: [...slide.chart!.labels, "Новая категория"],
                  values: [...slide.chart!.values, 0],
                },
              });
            }}
          >
            Добавить категорию
          </button>
          <label className="field">
            Единица измерения
            <input
              maxLength={30}
              placeholder="Например, % или млн ₽"
              value={slide.chart.unit}
              onChange={(e) =>
                onChange({ chart: { ...slide.chart!, unit: e.target.value } })
              }
            />
          </label>
        </div>
      )}
      {slide.kind === "table" && (
        <div className="visual-data-editor">
          <span className="label">Таблица · первая строка — заголовки</span>
          <div className="table-data-scroll">
            <table className="table-data">
              <tbody>
                {slide.table.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci}>
                        <input
                          aria-label={`Строка ${ri + 1}, столбец ${ci + 1}`}
                          maxLength={500}
                          value={cell}
                          onChange={(e) =>
                            onChange({
                              table: slide.table.map((r, rn) =>
                                rn === ri
                                  ? r.map((v, cn) =>
                                      cn === ci ? e.target.value : v,
                                    )
                                  : r,
                              ),
                            })
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        aria-label={`Удалить строку ${ri + 1}`}
                        disabled={slide.table.length <= 1}
                        onClick={() =>
                          onChange({
                            table: slide.table.filter((_, n) => n !== ri),
                          })
                        }
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row wrap">
            <button
              type="button"
              className="btn sm"
              disabled={slide.table.length >= 9}
              onClick={() =>
                onChange({
                  table: [...slide.table, slide.table[0].map(() => "")],
                })
              }
            >
              + Строка
            </button>
            <button
              type="button"
              className="btn sm"
              disabled={slide.table[0]?.length >= 6}
              onClick={() =>
                onChange({ table: slide.table.map((r) => [...r, ""]) })
              }
            >
              + Столбец
            </button>
            <button
              type="button"
              className="btn sm"
              disabled={slide.table[0]?.length <= 1}
              onClick={() =>
                onChange({ table: slide.table.map((r) => r.slice(0, -1)) })
              }
            >
              − Столбец
            </button>
          </div>
        </div>
      )}
    </>
  );
}
