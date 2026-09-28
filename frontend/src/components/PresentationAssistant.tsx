import { useRef, useState } from "react";
import { api } from "../api";
import { Icon } from "./Icon";
import type { AssistantResult, DeckContent, Health, Project } from "../types";
import "../styles/presentation-assistant.css";

export function PresentationAssistant({ project, content, index, health, disabled, busy, onBusy, onResult, audit = false }: {
  project: Project; content: DeckContent; index: number; health: Health | null;
  disabled: boolean; busy: boolean; audit?: boolean;
  onBusy: (busy: boolean) => void; onResult: (result: AssistantResult) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [scope, setScope] = useState(audit ? "all" : "slide");
  const [material, setMaterial] = useState("");
  const [report, setReport] = useState<AssistantResult | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const lock = useRef(false);
  const available = health?.mode === "live" && health.llm_configured;
  async function run(action: "edit" | "repair") {
    if (lock.current || disabled || busy || !available) return;
    lock.current = true;
    setWorking(true); onBusy(true); setError(""); setReport(null);
    try {
      const result = await api.assistant(project.id, {
        content, variant: project.variant, base_updated_at: project.updated_at,
        instruction: instruction.trim(), action, slide: scope === "all" ? null : index, material,
      });
      setReport(result); onResult(result);
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setWorking(false); onBusy(false); }
  }
  return <section className="presentation-assistant panel" aria-label="AI-помощник" aria-busy={working}>
    <div className="assistant-heading">
      <h2><Icon name="spark" />{audit ? "Исправить презентацию с AI" : "Редактировать с AI"}</h2>
      <span className="tiny muted">Учитывает ваши правки и шаблон · можно отменить</span></div>
    {!available && <p className="tiny muted">Для AI-редактирования подключите модель. Ручное редактирование доступно.</p>}
    <fieldset disabled={busy || disabled || !available}>
      <div className="assistant-composer">
      <label className="field assistant-scope">Область изменений
        <select value={scope} onChange={e => setScope(e.target.value)}><option value="slide">Текущий слайд</option><option value="all">Вся презентация</option></select>
      </label>
      <label className="field assistant-prompt">Что изменить с помощью AI?
        <textarea rows={1} maxLength={3000} value={instruction} onChange={e => setInstruction(e.target.value)}
          placeholder="Сократи текст, сохрани цифры или сделай схему…" />
      </label>
      <button type="button" className="btn primary assistant-submit" disabled={!instruction.trim()} onClick={() => void run("edit")}><Icon name="spark" />Применить запрос AI</button>
      </div>
      <div className="assistant-tools">
      <div className="assistant-suggestions">
        {["Сократи текст и убери повторы. Сохрани факты и перенеси детали в заметки.", "Перепиши проще и понятнее, сохрани смысл.", "Преврати содержание в наглядную схему, если это уместно."].map((text, i) =>
          <button type="button" className="btn sm" key={text} onClick={() => setInstruction(text)}>{["Убрать лишнее", "Улучшить текст", "Сделать схему"][i]}</button>)}
      </div>
      <button type="button" className="btn sm assistant-repair" onClick={() => void run("repair")}><Icon name="shield" />Исправить автоматически с AI</button>
      </div>
      <details className="assistant-context"><summary>Добавить контекст или файл</summary>
        <label className="field">Дополнительный материал<textarea rows={3} maxLength={15000} value={material} onChange={e => setMaterial(e.target.value)} /></label>
        <label className="field">Документы для AI<input type="file" multiple accept=".txt,.md,.csv,.docx,.pdf,.pptx" onChange={async e => {
          const files = Array.from(e.target.files || []); e.target.value = "";
          if (!files.length || lock.current) return;
          lock.current = true; onBusy(true); setError("");
          try { const packet = await api.importMaterials(files); const combined = [material, packet.text].filter(Boolean).join("\n\n");
            if (combined.length > 15000) throw new Error("Для одной правки добавьте до 15 000 символов материала.");
            setMaterial(combined);
          } catch (e) { setError((e as Error).message); }
          finally { lock.current = false; onBusy(false); }
        }} /></label>
      </details>
    </fieldset>
    {working && <p role="status">AI читает слайды, вносит правки и проверяет результат. Это может занять до трёх минут.</p>}
    {error && <p className="error-banner" role="alert">{error}</p>}
    {report && <div className="assistant-result" role="status"><strong>{report.project ? "Правки сохранены" : "Изменения не применены"}</strong><p>{report.summary}</p>
      {report.project && <p>Изменены слайды: {report.changed_slides.map(i => i + 1).join(", ")}. Вернуть исходный текст можно кнопкой «Отменить изменение».</p>}
      <details><summary>После проверки: {report.issues.length} замечаний</summary><ul>{report.issues.slice(0, 20).map(i => <li key={i.id}>Слайд {i.slide + 1}: {i.title}</li>)}</ul></details>
    </div>}
  </section>;
}
