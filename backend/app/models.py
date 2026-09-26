"""Общий контракт: LLM, API и интерфейс работают с одной структурой слайдов."""
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator

Variant = Literal['a', 'b', 'c']

class SlideDesign(BaseModel):
    """Validated design choices; the model cannot inject text or arbitrary geometry."""
    model_config = ConfigDict(extra='forbid')
    composition: Literal['split', 'editorial', 'grid']
    density: Literal['compact', 'balanced', 'airy'] = 'balanced'
    layout_shift: Literal[0, 1, 2] = 0

class ChartData(BaseModel):
    model_config = ConfigDict(extra='forbid',allow_inf_nan=False)
    labels: list[str] = Field(min_length=1, max_length=6)
    values: list[float] = Field(min_length=1, max_length=6)
    unit: str = Field(default='', max_length=30)
    @model_validator(mode='after')
    def same_length(self):
        if len(self.labels) != len(self.values):
            raise ValueError('Подписи и значения диаграммы должны совпадать по количеству')
        return self

class Slide(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(min_length=1, max_length=180)
    body: str = Field(default='', max_length=2400)
    kind: Literal['title', 'text', 'chart', 'table', 'steps'] = 'text'
    bullets: list[str] = Field(default_factory=list, max_length=10)
    chart: ChartData | None = None
    table: list[list[str]] = Field(default_factory=list, max_length=9)
    source_quote: str = Field(default='', max_length=1500)
    notes: str = Field(default='', max_length=3000)
    layout: Variant | None = None
    design: SlideDesign | None = None
    fixed: list[str] = Field(default_factory=list)
    @model_validator(mode='after')
    def required_visual_data(self):
        if self.kind=='chart' and self.chart is None:raise ValueError('Добавьте данные диаграммы')
        if self.kind=='table' and not self.table:raise ValueError('Добавьте данные таблицы')
        return self
    @field_validator('title')
    @classmethod
    def non_empty_title(cls, value):
        value = value.strip()
        if not value: raise ValueError('Нужен заголовок')
        return value
    @field_validator('table')
    @classmethod
    def table_shape(cls, value):
        if value and (not value[0] or len(value[0]) > 6 or any(len(row) != len(value[0]) for row in value)):
            raise ValueError('Таблица должна быть прямоугольной, до шести колонок')
        return value

class DeckContent(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    slides: list[Slide] = Field(min_length=1, max_length=30)

class OutlineRequest(BaseModel):
    template_id: str
    prompt: str = Field(min_length=1, max_length=50000)
    count: int = Field(default=10, ge=3, le=20)
    audience: str = Field(default='Команда и коллеги', max_length=100)
    mode: Literal['description', 'text'] = 'description'
    @field_validator('prompt')
    @classmethod
    def nonempty(cls, value):
        if not value.strip(): raise ValueError('Добавьте описание или текст')
        return value

class GenerateRequest(BaseModel):
    template_id: str
    content: DeckContent
    source_text: str = Field(default='', max_length=50000)

class RegenerateRequest(BaseModel):
    instruction: str = Field(default='', max_length=1000)

class SlideDesignChoice(BaseModel):
    model_config = ConfigDict(extra='forbid')
    slide: int = Field(ge=0, le=29)
    design: SlideDesign

class DesignPlan(BaseModel):
    model_config = ConfigDict(extra='forbid')
    slides: list[SlideDesignChoice] = Field(min_length=1, max_length=30)

class ProjectUpdate(BaseModel):
    content: DeckContent
    variant: Variant = 'a'

class FixRequest(BaseModel):
    issue_ids: list[str] = Field(min_length=1, max_length=200)
    variant: Variant = 'a'

class Issue(BaseModel):
    id: str
    slide: int
    code: str
    title: str
    detail: str
    category: Literal['layout', 'template', 'content', 'source']
    severity: Literal['error', 'warning', 'info']
    fixable: bool = False
    deterministic: bool = True
    object_id: str = 'body'
