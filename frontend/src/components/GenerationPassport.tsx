import type { Project } from "../types";
export function GenerationPassport({project}:{project:Project}) {
  const run=project.provenance;
  if (!run?.recipe) return <details className="generation-passport"><summary>Паспорт генерации</summary><p>Эта презентация создана до введения версий пайплайна. Новое оформление сохранит паспорт.</p></details>;
  return <details className="generation-passport">
    <summary>Паспорт генерации · {run.slides} слайдов · {run.duration_seconds.toLocaleString("ru-RU")} с</summary>
    <div className="passport-grid">
      <p><strong>{run.mode==="live"?"Генерация моделью":"Демонстрационный режим"}</strong><br/>{run.model}</p>
      <p>Шаблон<br/><strong>{run.template.name}</strong></p>
      <p>Версия пайплайна<br/><strong>{run.recipe.version}</strong></p>
      <p>Лимит 5 минут<br/><strong>{run.within_budget?"Соблюдён":"Превышен"}</strong></p>
    </div>
    <p className="muted">Паспорт фиксирует первоначальную генерацию. Проверка в редакторе показывает замечания для текущей версии.</p>
    <ul>{run.recipe.variants.map(v=><li key={v.id}>{v.title}: {v.layout}. Замечаний при сборке: {run.audit[v.id]?.issues??0}.</li>)}</ul>
    <details><summary>Версии промптов и этапов</summary>
      {run.recipe.snippets.map(s=><details key={s.id}><summary>{s.id} · {s.version}</summary><pre>{s.text}</pre></details>)}
      <code>{run.recipe.fingerprint}</code>
    </details>
    <a href="#requirements">Требования, ограничения и метод проверки</a>
  </details>;
}
