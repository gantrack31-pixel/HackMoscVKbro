import { useEffect, useState } from "react";
import { api } from "../api";
import type { Health, Template, WorkflowRecipe } from "../types";
import { TemplateCover } from "../components/TemplateCard";
import { Icon } from "../components/Icon";
import "../styles/requirements.css";

const requirements = [
  ["01","Шаблон превращается в правила","Загрузите любой PPTX. Из него извлекаются палитра, шрифты, размеры текста, пропорции, макеты, плейсхолдеры и визуальные элементы. Имена или ID трёх демонстрационных шаблонов для анализа не используются.","#templates"],
  ["02","Материалы из нескольких файлов","Пакет до 8 файлов: TXT, MD, CSV, DOCX, PDF. Кодировки и переносы нормализуются, каждый источник подписывается. До 5 МБ на файл, 15 МБ на пакет и 50 000 символов. Для сканов нужен текст: OCR не выполняется.","#create"],
  ["03","История до оформления","Модель составляет последовательность слайдов по вашему брифу, назначению и аудитории. Структуру можно изменить и утвердить до вёрстки. По умолчанию 10 слайдов, выбор до 20.","#create"],
  ["04","Визуализация, которую можно редактировать","Полосы, столбцы, линейные графики, таблицы, пиктограммы, процессы, циклы и иерархии. Схемы в стиле SmartArt экспортируются отдельными фигурами и соединителями, а не встроенным объектом PowerPoint SmartArt.","#create"],
  ["05","Три варианта одной истории","Содержание и шаблон общие. Меняются макет, плотность и акценты: классический, акцентный и минималистичный. Выбор композиции доступен после генерации и в редакторе.","#create"],
  ["06","Версии и воспроизводимость","В паспорте каждой новой генерации сохраняются версия пайплайна, хеши промптов и компонентов, снимок текста промптов, отпечаток шаблона, модель и длительность. Правки содержания поддерживают возврат версии.","#projects"],
  ["07","Аудит внутри процесса","До публикации трёх вариантов проверяются границы, переполнение, пересечения, контраст, плотность, служебный текст, данные визуализаций и цитаты. Замечания привязаны к объектам. Вы выбираете исправления; смысловую проверку можно отдельно запросить у LLM.","#projects"],
  ["08","Редактируемый экспорт","PPTX содержит отдельные текстовые блоки, нативные таблицы и диаграммы, фигуры, соединители и изображения. Также доступны HTML и PDF. Графика мастеров и исходные шрифты могут отличаться в PDF/HTML — просмотрите результат.","#projects"],
];
export function Requirements({health,templates}:{health:Health|null;templates:Template[]}) {
  const [recipe,setRecipe]=useState<WorkflowRecipe|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{let active=true;api.workflow().then(r=>{if(active)setRecipe(r);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
  const examples=["tech","workspace","education"].map(id=>templates.find(t=>t.id===id)).filter((t):t is Template=>!!t);
  return <div className="requirements-page">
    <header className="heading"><span className="eyebrow">ОТ МАТЕРИАЛА ДО ГОТОВОЙ ИСТОРИИ</span>
      <h1>Как устроен Deckly</h1><p>Возможности, этапы и честные границы результата. Здесь можно проверить путь презентации целиком.</p>
      <a href="#create" className="btn primary">Создать презентацию <Icon name="arrow"/></a>
    </header>
    <div className="requirements-metrics">
      <div><strong>10–15</strong><span>целевой объём слайдов</span></div>
      <div><strong>3</strong><span>варианта одной истории</span></div>
      <div><strong>≤ 5 мин</strong><span>бюджет генерации</span></div>
      <div><strong>{health?.mode==="live"?"AI подключён":"Демо"}</strong><span>{health?.mode==="live"?"структура и композиции":"модель не используется"}</span></div>
    </div>
    <p className="muted">Полная сборка и пересборка ограничены 5 минутами, включая очередь. Структура и отдельные AI-правки не имеют лимита выполнения: их можно остановить кнопкой «Стоп». Сетевые таймауты защищают от зависшего соединения. PPTX создаётся при скачивании.</p>
    <div className="requirements-grid">{requirements.map(([id,title,body,link])=><article className="panel" key={id}><span className="label">{id}</span><h2>{title}</h2><p>{body}</p><a href={link}>Открыть раздел <Icon name="arrow"/></a></article>)}</div>
    <section className="panel image-capability"><span className="label">ДОПОЛНИТЕЛЬНО · ПУНКТ СО ЗВЁЗДОЧКОЙ</span><h2>Изображение внутри слайда</h2>
      <p>Выбрана FLUX.1-schnell — text-to-image модель на 12 млрд параметров, до 4 шагов. Её изображение занимает один блок; остальной слайд остаётся редактируемым.</p>
      <strong>{health?.image_generation?"Адрес сервиса настроен; доступность проверяется при запросе":"GPU-сервис не подключён"}</strong>
      <p>В редакторе выберите «AI-иллюстрация» и введите описание. Для работы администратор запускает отдельный FLUX-сервис и задаёт IMAGE_BASE_URL. Без него сайт не имитирует генерацию.</p>
    </section>
    <section><div className="heading"><h2>Три разных исходных оформления</h2><p>Это примеры для демонстрации. Новые PPTX разбираются тем же анализатором.</p></div>
      <div className="requirement-examples">{examples.map(t=><article className="panel" key={t.id}><TemplateCover template={t}/><h3>{t.name}</h3><p>{t.metadata.source==="pptx"?"Импортированный PPTX":"Стартовая тема"} · {t.metadata.font} · {t.metadata.layouts.length} макетов</p></article>)}</div>
    </section>
    <section className="panel"><h2>Пайплайн и версии</h2>{error&&<p role="alert">{error}</p>}
      {recipe&&<><ol className="workflow-stages">{recipe.stages.map(s=><li key={s.id}><strong>{s.name}</strong><span>{s.type==="model"?"Модель":"Воспроизводимые правила"}</span></li>)}</ol>
        <p>Версия {recipe.version} · <code>{recipe.fingerprint.slice(0,16)}</code></p>
        <details><summary>Посмотреть промпты</summary>{recipe.snippets.map(s=><details key={s.id}><summary>{s.id} · {s.version}</summary><pre>{s.text}</pre></details>)}</details></>}
    </section>
    <section className="panel"><h2>Что проверяется и кто принимает решение</h2>
      <p><strong>По правилам:</strong> геометрия, вместимость текста, контраст, данные таблиц и графиков, наличие иллюстрации, точная цитата и заглушки. Одинаковые входные данные дают одинаковые замечания.</p>
      <p><strong>По контексту:</strong> смысловая связь с материалом, логика и возможные неподтверждённые утверждения. Это оценка модели, а не гарантия достоверности.</p>
      <p>Автоматические исправления применяются только к отмеченным доступным замечаниям. Содержание можно изменить вручную и проверить заново. При отсутствии чисел модель не должна выдумывать диаграмму.</p>
    </section>
  </div>;
}
