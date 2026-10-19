"""Owner-scoped analytical source records, using the existing database connection."""
import json
from uuid import uuid4
from .. import database as db
from .analytics_ingest import AnalysisError
from .analytics_profile import profile_dataset
from .analytics_plan import validate_selection, plan, visual_fingerprint


def initialize():
    with db.connection() as conn:
        conn.executescript('''
        CREATE TABLE IF NOT EXISTS analytical_datasets (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
            original BLOB NOT NULL, payload TEXT NOT NULL, selection TEXT,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS analytical_datasets_owner ON analytical_datasets(user_id,updated_at);
        ''')


def save(user_id, dataset, original):
    initialize()
    dataset = {**dataset, 'id': uuid4().hex}
    with db.connection() as conn:
        quota=conn.execute('SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(original)),0) AS bytes FROM analytical_datasets WHERE user_id=?',(user_id,)).fetchone()
        if quota['count']>=50 or quota['bytes']+len(original)>200*1024*1024:
            raise AnalysisError('Лимит сохранённых наборов: 50 файлов / 200 МБ. Удалите ненужный набор и повторите загрузку.')
        stamp=db.now()
        conn.execute('INSERT INTO analytical_datasets VALUES (?,?,?,?,?,?,?,?)',(dataset['id'],user_id,dataset['name'],original,json.dumps(dataset,ensure_ascii=False,allow_nan=False),None,stamp,stamp))
    return profile_dataset(dataset)


def get(user_id, dataset_id):
    initialize()
    with db.connection() as conn:
        row=conn.execute('SELECT payload,selection FROM analytical_datasets WHERE id=? AND user_id=?',(dataset_id,user_id)).fetchone()
    if row is None: raise KeyError(dataset_id)
    dataset=json.loads(row['payload'])
    dataset['selection']=json.loads(row['selection']) if row['selection'] else None
    return dataset


def list_owned(user_id):
    initialize()
    with db.connection() as conn:
        return [dict(row) for row in conn.execute('SELECT id,name,created_at,updated_at FROM analytical_datasets WHERE user_id=? ORDER BY updated_at DESC',(user_id,))]


def original(user_id,dataset_id):
    initialize()
    with db.connection() as conn:
        row=conn.execute('SELECT name,original FROM analytical_datasets WHERE id=? AND user_id=?',(dataset_id,user_id)).fetchone()
    if row is None: raise KeyError(dataset_id)
    return row['name'],bytes(row['original'])


def remove(user_id,dataset_id):
    initialize()
    with db.connection() as conn:
        deleted=conn.execute('DELETE FROM analytical_datasets WHERE id=? AND user_id=?',(dataset_id,user_id)).rowcount
    if not deleted: raise KeyError(dataset_id)


def select(user_id,dataset_id,selection):
    dataset=get(user_id,dataset_id)
    parsed=validate_selection(dataset,selection)
    value=parsed.model_dump()
    with db.connection() as conn:
        conn.execute('UPDATE analytical_datasets SET selection=?,updated_at=? WHERE id=? AND user_id=?',(json.dumps(value,ensure_ascii=False),db.now(),dataset_id,user_id))
    return value


def plan_owned(user_id,dataset_id,selection=None):
    dataset=get(user_id,dataset_id)
    choice=selection or dataset.get('selection')
    if not choice: raise AnalysisError('Сначала выберите подходящее представление данных.')
    return plan(dataset,choice)


def generation_slides(user_id,dataset_ids):
    """Called by the existing generation job; no second synchronous generation path."""
    if not 1<=len(dataset_ids)<=8 or len(set(dataset_ids))!=len(dataset_ids):
        raise AnalysisError('Выберите от 1 до 8 разных наборов данных.')
    plans=[plan_owned(user_id,dataset_id) for dataset_id in dataset_ids]
    slides=[slide for item in plans for slide in item['slides']]
    if len(slides)>200: raise AnalysisError('Общий план превышает 200 слайдов. Сократите справочные приложения.')
    return {'slides':slides,'plans':plans,'slide_count':len(slides)}


def validate_requested_analytics(user_id,slides):
    """Reject fabricated/stale/client-modified evidence before entering generation.

    Slide order and composition may change. Evidence, source identifiers, selected
    calculation and the verified headline must match the owner's persisted choice.
    """
    approved={}
    for slide in slides:
        slide=slide.model_dump() if hasattr(slide,'model_dump') else slide
        visual=slide.get('analytics')
        if not visual:
            if slide.get('kind')=='analysis': raise AnalysisError('У аналитического слайда отсутствуют проверенные данные.')
            continue
        if slide.get('kind')!='analysis': raise AnalysisError('Аналитические данные должны оставаться аналитическим слайдом.')
        dataset_id=visual.get('dataset_id')
        if not dataset_id: raise AnalysisError('У аналитического слайда отсутствует исходный набор данных.')
        if dataset_id not in approved:
            current=plan_owned(user_id,dataset_id)
            approved[dataset_id]={visual_fingerprint(s['analytics']):s for s in current['slides']}
        original=approved[dataset_id].get(visual_fingerprint(visual))
        if original is None: raise AnalysisError('Аналитические данные изменены или выбор устарел. Обновите план по исходному набору перед созданием.')
        if slide.get('title')!=original['title']:
            raise AnalysisError('Вывод аналитического слайда изменён. Сохраните проверенный заголовок или пересчитайте анализ.')
    return True
