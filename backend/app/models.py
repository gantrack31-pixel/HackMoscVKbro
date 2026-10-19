"""Общий контракт: LLM, API и интерфейс работают с одной структурой слайдов."""
from typing import Annotated, Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator
from .icon_catalog import IconName
from .assistant_contract import ConversationTurn, LockedField, FactCorrection
from .analytics_models import AnalyticalVisual

Variant = Literal['a', 'b', 'c']
DiagramType = Literal['process', 'vertical', 'cycle', 'hierarchy', 'matrix', 'pyramid', 'honeycomb', 'comparison', 'kpi']

class SmartArtNode(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    bullet: int = Field(ge=0, le=5)
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)
    group: int = Field(default=0, ge=0, le=5)
    @model_validator(mode='after')
    def contained(self):
        if self.x+self.w > 1.00001 or self.y+self.h > 1.00001:
            raise ValueError('Узел должен помещаться в область схемы 0..1')
        return self

class SmartArtEdge(BaseModel):
    model_config = ConfigDict(extra='forbid')
    source: int = Field(ge=0, le=5)
    target: int = Field(ge=0, le=5)
    direction: Literal['forward','both','none'] = 'forward'

class SmartArt(BaseModel):
    model_config = ConfigDict(extra='forbid')
    type: DiagramType = 'process'
    nodes: list[SmartArtNode] = Field(min_length=1, max_length=6)
    edges: list[SmartArtEdge] = Field(default_factory=list, max_length=12)
    @model_validator(mode='after')
    def valid_graph(self):
        if self.type=='matrix' and len(self.nodes)>4:
            raise ValueError('Матрица 2x2 вмещает максимум четыре узла')
        if len({n.bullet for n in self.nodes}) != len(self.nodes):
            raise ValueError('Тезис может использоваться в схеме только один раз')
        if any(e.source == e.target or max(e.source,e.target) >= len(self.nodes) for e in self.edges):
            raise ValueError('Связи должны указывать на разные существующие узлы')
        for i,a in enumerate(self.nodes):
            for b in self.nodes[i+1:]:
                if min(a.x+a.w,b.x+b.w)-max(a.x,b.x)>0.00001 and min(a.y+a.h,b.y+b.h)-max(a.y,b.y)>0.00001:
                    raise ValueError('Узлы схемы не должны перекрываться')
        return self

HexColor = Annotated[str, Field(pattern=r'^#[0-9a-fA-F]{6}$')]


class ObjectStyle(BaseModel):
    """Explicit canvas coordinates in scene pixels, shared by all exporters."""
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    x: float | None = Field(default=None, ge=0, le=10000)
    y: float | None = Field(default=None, ge=0, le=10000)
    w: float | None = Field(default=None, gt=0, le=10000)
    h: float | None = Field(default=None, gt=0, le=10000)
    color: HexColor | None = None
    fill: HexColor | None = None
    stroke: HexColor | None = None
    stroke_width: float | None = Field(default=None, ge=.1, le=40)
    font_size: float | None = Field(default=None, ge=8, le=160)
    bold: bool | None = None
    hidden: bool = False
    z_index: int | None = Field(default=None, ge=-1000, le=1000)


class SlideDesign(BaseModel):
    """Template choices plus explicit user-directed colors and object placement."""
    model_config = ConfigDict(extra='forbid')
    composition: Literal['split', 'editorial', 'grid'] = 'editorial'
    density: Literal['compact', 'balanced', 'airy'] = 'balanced'
    layout_shift: Literal[0, 1, 2] = 0
    smartart: SmartArt | None = None
    background_role: Literal['template','light','dark','accent'] = 'template'
    foreground_role: Literal['text','inverse'] = 'text'
    heading_role: Literal['heading','body'] = 'heading'
    body_role: Literal['body','heading'] = 'body'
    heading_scale: float = Field(default=1.0, ge=.5, le=2)
    body_scale: float = Field(default=1.0, ge=.5, le=2)
    heading_weight: Literal['normal','bold'] = 'bold'
    diagram_style: DiagramType | None = None
    background_color: HexColor | None = None
    text_color: HexColor | None = None
    heading_color: HexColor | None = None
    accent_color: HexColor | None = None
    objects: dict[str, ObjectStyle] = Field(default_factory=dict, max_length=100)



class ChartData(BaseModel):
    model_config = ConfigDict(extra='forbid',allow_inf_nan=False)
    labels: list[str] = Field(min_length=1, max_length=6)
    values: list[float] = Field(min_length=1, max_length=6)
    unit: str = Field(default='', max_length=30)
    chart_type: Literal['bar', 'column', 'line'] = 'bar'
    @model_validator(mode='after')
    def same_length(self):
        if len(self.labels) != len(self.values):
            raise ValueError('Подписи и значения диаграммы должны совпадать по количеству')
        return self


class CanvasElement(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    id: str = Field(pattern=r'^custom-[a-zA-Z0-9_-]{1,60}$')
    type: Literal['text', 'rect', 'ellipse', 'line', 'image', 'icon', 'chart', 'table']
    x: float = Field(ge=0, le=10000)
    y: float = Field(ge=0, le=10000)
    w: float = Field(ge=0, le=10000)
    h: float = Field(ge=0, le=10000)
    text: str = Field(default='', max_length=3000)
    color: HexColor = '#0F172A'
    fill: HexColor = '#0077FF'
    stroke: HexColor = '#0077FF'
    stroke_width: float = Field(default=2, ge=.1, le=40)
    font_size: float = Field(default=24, ge=8, le=160)
    bold: bool = False
    z_index: int = Field(default=100, ge=-1000, le=1000)
    reverse_line: bool = False
    chart: ChartData | None = None
    table: list[list[str]] = Field(default_factory=list, max_length=9)
    icon_name: IconName | None = None
    template_asset_id: str = Field(default='', max_length=32)
    resource_id: str = Field(default='', max_length=64)
    image_prompt: str = Field(default='', max_length=1000)

    @model_validator(mode='after')
    def complete_element(self):
        if (self.type != 'line' and (self.w == 0 or self.h == 0)) or (self.w == 0 and self.h == 0):
            raise ValueError('Объект должен иметь ненулевой размер.')
        if self.type == 'chart' and self.chart is None:
            raise ValueError('Добавьте данные диаграммы объекта.')
        if self.type == 'table' and (not self.table or not self.table[0] or len(self.table[0]) > 6
                                     or any(len(row) != len(self.table[0]) for row in self.table)):
            raise ValueError('Добавьте прямоугольную таблицу до 6 колонок.')
        if self.type == 'icon' and self.icon_name is None:
            raise ValueError('Выберите иконку из каталога.')
        if self.type == 'image' and not (self.template_asset_id or self.resource_id or self.image_prompt):
            raise ValueError('Для изображения нужен материал, asset шаблона или описание генерации.')
        return self

class Slide(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(min_length=1, max_length=180)
    body: str = Field(default='', max_length=2400)
    kind: Literal['title', 'text', 'chart', 'table', 'steps', 'diagram', 'icons', 'image', 'analysis'] = 'text'
    bullets: list[str] = Field(default_factory=list, max_length=10)
    chart: ChartData | None = None
    analytics: AnalyticalVisual | None = None
    table: list[list[str]] = Field(default_factory=list, max_length=9)
    source_quote: str = Field(default='', max_length=1500)
    notes: str = Field(default='', max_length=3000)
    layout: Variant | None = None
    design: SlideDesign | None = None
    designs: dict[Variant, SlideDesign] = Field(default_factory=dict)
    fixed: list[str] = Field(default_factory=list)
    diagram_type: DiagramType = 'process'
    icon_names: list[IconName | Literal['auto']] = Field(default_factory=list, max_length=6)
    image_prompt: str = Field(default='', max_length=1000)
    template_asset_id: str = Field(default='', max_length=32)
    resource_id: str = Field(default='', max_length=64)
    resource_icon_ids: list[str] = Field(default_factory=list, max_length=6)
    resource_icon_data: list[str] = Field(default_factory=list, max_length=6)
    image_data: str = Field(default='', max_length=1500000)
    elements: list[CanvasElement] = Field(default_factory=list, max_length=60)
    element_images: dict[str, str] = Field(default_factory=dict, max_length=60)
    @field_validator('element_images')
    @classmethod
    def safe_element_images(cls, values):
        if sum(map(len, values.values())) > 6_000_000:
            raise ValueError('Изображения объектов одного слайда: до 6 МБ.')
        return {key: cls.safe_image(value) for key, value in values.items()}

    @field_validator('elements')
    @classmethod
    def unique_elements(cls, values):
        if len({element.id for element in values}) != len(values):
            raise ValueError('ID объектов слайда должны быть уникальными.')
        if sum(len(element.text) + sum(len(cell) for row in element.table for cell in row) for element in values) > 24000:
            raise ValueError('Дополнительный текст одного слайда: до 24 000 символов.')
        return values
    @field_validator('image_data')
    @classmethod
    def safe_image(cls, value):
        if not value: return value
        import base64
        from io import BytesIO
        from PIL import Image
        prefix='data:image/png;base64,'
        if not value.startswith(prefix): raise ValueError('Только встроенный PNG')
        try:
            data=base64.b64decode(value[len(prefix):],validate=True)
            with Image.open(BytesIO(data),formats=['PNG']) as im:
                if max(im.size)>1024: raise ValueError('Размер изображения до 1024 px')
                im.verify()
        except Exception as exc: raise ValueError('Некорректное изображение') from exc
        return value
    @model_validator(mode='after')
    def required_visual_data(self):
        if self.kind=='chart' and self.chart is None:raise ValueError('Добавьте данные диаграммы')
        if self.kind=='table' and not self.table:raise ValueError('Добавьте данные таблицы')
        if self.kind=='analysis' and self.analytics is None:raise ValueError('Добавьте проверенные аналитические данные')
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

class EvidenceSource(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str = Field(min_length=1, max_length=64)
    text: str = Field(min_length=1, max_length=15000)


class DeckContent(BaseModel):
    evidence_sources: list[EvidenceSource] = Field(default_factory=list, max_length=20)

    @field_validator('evidence_sources')
    @classmethod
    def bounded_evidence(cls, sources):
        if len({s.id for s in sources}) != len(sources) or sum(len(s.text) for s in sources) > 50000:
            raise ValueError('Дополнительные источники: уникальные ID и до 50 000 символов суммарно.')
        return sources

    brand_style_id: str | None = Field(default=None, max_length=80)
    brand_prefer_template: bool = False
    title: str = Field(min_length=1, max_length=180)
    slides: list[Slide] = Field(min_length=1, max_length=200)
    audience: str = Field(default='Команда и коллеги', max_length=100)
    resource_ids: list[str] = Field(default_factory=list, max_length=100)

class OutlineRequest(BaseModel):
    template_id: str
    prompt: str = Field(min_length=1, max_length=50000)
    count: int = Field(default=10, ge=3, le=20)
    audience: str = Field(default='Команда и коллеги', max_length=100)
    mode: Literal['description', 'text'] = 'description'
    purpose: Literal['project', 'product', 'feature', 'initiative'] = 'project'
    resource_ids: list[str] = Field(default_factory=list, max_length=100)
    @field_validator('prompt')
    @classmethod
    def nonempty(cls, value):
        if not value.strip(): raise ValueError('Добавьте описание или текст')
        return value

class GenerateRequest(BaseModel):
    template_id: str
    content: DeckContent
    source_text: str = Field(default='', max_length=50000)
    audience: str = Field(default='Команда и коллеги', max_length=100)

class RegenerateRequest(BaseModel):
    instruction: str = Field(default='', max_length=1000)

class SlideDesignChoice(BaseModel):
    model_config = ConfigDict(extra='forbid')
    slide: int = Field(ge=0, le=199)
    design: SlideDesign

class DesignPlan(BaseModel):
    model_config = ConfigDict(extra='forbid')
    slides: list[SlideDesignChoice] = Field(min_length=1, max_length=200)

class ThreeDesignPlans(BaseModel):
    model_config = ConfigDict(extra='forbid')
    a: DesignPlan
    b: DesignPlan
    c: DesignPlan

class ProjectUpdate(BaseModel):
    content: DeckContent
    variant: Variant = 'a'
    # Preview uses the same content schema; only mutating routes require a version.
    base_updated_at: str | None = Field(default=None, min_length=1, max_length=80)

class FixRequest(BaseModel):
    issue_ids: list[str] = Field(min_length=1, max_length=200)
    variant: Variant = 'a'
    base_updated_at: str | None = Field(default=None, min_length=1, max_length=80)

class AssistantRequest(BaseModel):
    content: DeckContent
    variant: Variant = 'a'
    base_updated_at: str = Field(min_length=1, max_length=80)
    instruction: str = Field(default='', max_length=3000)
    action: Literal['edit', 'repair'] = 'edit'
    allow_structure: bool = True
    preserve_facts: bool = True
    allow_fact_corrections: bool = False
    review_issues: list['Issue'] = Field(default_factory=list, max_length=30)
    slide: int | None = Field(default=None, ge=0, le=199)
    material: str = Field(default='', max_length=15000)
    pinned_brief: str = Field(default='', max_length=4000)
    conversation: list['ConversationTurn'] = Field(default_factory=list, max_length=10)
    locked_facts: list[str] = Field(default_factory=list, max_length=30)
    locked_fields: list['LockedField'] = Field(default_factory=list, max_length=60)

    @field_validator('locked_facts')
    @classmethod
    def bounded_locked_facts(cls, values):
        if any(not value.strip() or len(value) > 500 for value in values):
            raise ValueError('Закреплённый факт должен содержать от 1 до 500 символов.')
        return values

class SlidePatch(BaseModel):
    model_config = ConfigDict(extra='forbid')
    slide: int = Field(ge=0, le=199)
    title: str | None = Field(default=None, min_length=1, max_length=180)
    body: str | None = Field(default=None, max_length=2400)
    bullets: list[str] | None = Field(default=None, max_length=10)
    notes: str | None = Field(default=None, max_length=3000)
    source_quote: str | None = Field(default=None, max_length=1500)
    kind: Literal['title','text','chart','table','steps','diagram','icons','image','analysis'] | None = None
    chart: ChartData | None = None
    analytics: AnalyticalVisual | None = None
    table: list[list[str]] | None = None
    diagram_type: DiagramType | None = None
    icon_names: list[IconName | Literal['auto']] | None = Field(default=None, max_length=6)
    template_asset_id: str | None = Field(default=None, max_length=32)
    image_prompt: str | None = Field(default=None, max_length=1000)
    resource_id: str | None = Field(default=None, max_length=64)
    resource_icon_ids: list[str] | None = Field(default=None, max_length=6)
    design: SlideDesign | None = None
    elements: list[CanvasElement] | None = Field(default=None, max_length=60)

class AssistantPlan(BaseModel):
    model_config = ConfigDict(extra='forbid')
    summary: str = Field(min_length=1, max_length=1200)
    fact_corrections: list[FactCorrection] = Field(default_factory=list, max_length=20)
    changes: list[SlidePatch] = Field(default_factory=list, max_length=200)
    title: str | None = Field(default=None, min_length=1, max_length=180)
    audience: str | None = Field(default=None, max_length=100)
    # References are original indices; added slides follow the original deck.
    added_slides: list[SlidePatch] = Field(default_factory=list, max_length=50)
    slide_order: list[int] | None = Field(default=None, min_length=1, max_length=200)

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
    source_bindings: list[dict] = Field(default_factory=list)
    grounding: Literal['not_applicable', 'located', 'unverified', 'unavailable'] = 'not_applicable'


AssistantRequest.model_rebuild()
