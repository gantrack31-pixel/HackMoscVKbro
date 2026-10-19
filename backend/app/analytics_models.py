"""Canonical, bounded analytical content shared by preview and editable exports."""
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

ChartType = Literal['table', 'line', 'bar', 'histogram', 'pie', 'scatter', 'grouped', 'stacked', 'kpi']
Aggregation = Literal['none', 'sum', 'mean', 'last', 'count']


class AnalyticalSeries(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    name: str = Field(max_length=200)
    values: list[float | None] = Field(default_factory=list, max_length=500)
    unit: str = Field(default='', max_length=40)


class AnalyticalKPI(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    label: str = Field(max_length=200)
    value: float
    unit: str = Field(default='', max_length=40)
    aggregation: str = Field(default='', max_length=80)
    period: str = Field(default='', max_length=200)
    display: str = Field(default='', max_length=200)


class CalculationRecord(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    id: str = Field(default='', max_length=80)
    operation: str = Field(default='', max_length=80)
    fields: list[str] = Field(default_factory=list, max_length=24)
    result: float | None = None
    unit: str = Field(default='', max_length=40)
    baseline: float | None = None
    comparison: float | None = None
    rows_used: int = Field(default=0, ge=0)
    rows_excluded: int = Field(default=0, ge=0)
    description: str = Field(default='', max_length=1000)


class AnalyticalVisual(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    chart_type: ChartType
    labels: list[str] = Field(default_factory=list, max_length=500)
    series: list[AnalyticalSeries] = Field(default_factory=list, max_length=6)
    x_values: list[float | None] = Field(default_factory=list, max_length=500)
    columns: list[str] = Field(default_factory=list, max_length=8)
    rows: list[list[str]] = Field(default_factory=list, max_length=25)
    kpis: list[AnalyticalKPI] = Field(default_factory=list, max_length=6)
    x_label: str = Field(default='', max_length=200)
    y_label: str = Field(default='', max_length=200)
    source: str = Field(default='', max_length=500)
    question: str = Field(default='', max_length=1000)
    takeaway: str = Field(default='', max_length=1000)
    why: str = Field(default='', max_length=1500)
    calculations: list[CalculationRecord] = Field(default_factory=list, max_length=100)
    warnings: list[str] = Field(default_factory=list, max_length=100)
    dataset_id: str = Field(default='', max_length=80)
    dataset_fingerprint: str = Field(default='', max_length=64)
    selection_fingerprint: str = Field(default='', max_length=64)
    source_fingerprint: str = Field(default='', max_length=64)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode='after')
    def compatible_shape(self):
        if self.chart_type == 'table':
            if not self.columns or not self.rows or any(len(row) != len(self.columns) for row in self.rows):
                raise ValueError('Аналитическая таблица должна быть прямоугольной и непустой.')
        elif self.chart_type == 'kpi':
            if not self.kpis:
                raise ValueError('Добавьте проверенные показатели.')
        else:
            if not self.labels or not self.series or any(len(s.values) != len(self.labels) for s in self.series):
                raise ValueError('Подписи и ряды аналитической диаграммы должны совпадать.')
            if self.chart_type == 'scatter' and len(self.x_values) != len(self.labels):
                raise ValueError('Диаграмме рассеяния нужны парные значения X и Y.')
            if self.chart_type == 'pie' and (len(self.series) != 1 or any(v is None or v < 0 for v in self.series[0].values) or sum(self.series[0].values) <= 0):
                raise ValueError('Круговая диаграмма требует неотрицательных долей с положительной суммой.')
            if self.chart_type in {'grouped', 'stacked'} and (len(self.series) < 2 or len({s.unit for s in self.series}) > 1):
                raise ValueError('Группы и накопление требуют минимум двух рядов с общей единицей.')
        return self


class AnalysisSelection(BaseModel):
    model_config = ConfigDict(extra='forbid')
    table_id: str = Field(default='t1', max_length=80)
    chart_type: ChartType = 'table'
    dimension: str | None = Field(default=None, max_length=200)
    measures: list[str] = Field(default_factory=list, max_length=6)
    x_measure: str | None = Field(default=None, max_length=200)
    aggregation: Aggregation = 'none'
    intent: str = Field(default='', max_length=1000)
    # Explicit role corrections are persisted and reprofiled before planning.
    roles: dict[str, Literal['identifier', 'numeric', 'category', 'date', 'text']] = Field(default_factory=dict, max_length=24)
    semantics: dict[str, Literal['additive', 'rate', 'balance', 'unknown']] = Field(default_factory=dict, max_length=24)
    time_group: Literal['none', 'month', 'year'] = 'none'
    top_n: int | None = Field(default=None, ge=2, le=20)
    include_reference: bool = False
    rows_per_slide: int = Field(default=12, ge=4, le=20)
    max_slides: int = Field(default=30, ge=1, le=120)
    missing_policy: Literal['exclude'] = 'exclude'


class AnalyzeTextRequest(BaseModel):
    name: str = Field(default='Таблица из текста.md', max_length=200)
    text: str = Field(min_length=1, max_length=2000000)
    context: str = Field(default='', max_length=50000)
    intent: str = Field(default='', max_length=1000)


class AnalysisPlanRequest(BaseModel):
    selection: AnalysisSelection | None = None
    template_id: str | None = Field(default=None, max_length=100)
    preview_index: int = Field(default=0, ge=0, le=119)
    brand_style_id: str | None = Field(default=None, max_length=100)
    brand_prefer_template: bool = False
