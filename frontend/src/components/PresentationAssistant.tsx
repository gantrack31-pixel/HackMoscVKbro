import { useEffect, useId, useRef, useState } from "react";
import { api } from "../api";
import { readAccount, writeAccount } from "../state/accountStorage";
import { Icon } from "./Icon";
import { useAiOperation, AiOperationStatus } from "./useAiOperation";
import type { AssistantResult, DeckContent, Health, Project } from "../types";

export function PresentationAssistant({
  accountId,
  project,
  content,
  index,
  health,
  disabled,
  busy,
  onBusy,
  onResult,
  audit = false,
}: {
  accountId: string;
  project: Project;
  content: DeckContent;
  index: number;
  health: Health | null;
  disabled: boolean;
  busy: boolean;
  audit?: boolean;
  onBusy: (busy: boolean) => void;
  onResult: (result: AssistantResult) => void;
}) {
  type Turn = {role: "user" | "assistant"; content: string};
  type Context = {brief: string; facts: string; turns: Turn[]; material: string};
  const [stored] = useState(() => readAccount<Context>(accountId, `assistant:${project.id}`));
  const [brief, setBrief] = useState(stored?.brief || "");
  const [facts, setFacts] = useState(stored?.facts || "");
  const [turns, setTurns] = useState<Turn[]>(stored?.turns || []);
  const [lockedFields, setLockedFields] = useState<string[]>([]);
  const [reviewDraft, setReviewDraft] = useState("");
  const [instruction, setInstruction] = useState("");
  const [scope, setScope] = useState(audit ? "all" : "slide");
  const [material, setMaterial] = useState(stored?.material || "");
  const [report, setReport] = useState<AssistantResult | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const lock = useRef(false);
  const contextPanel = useRef<HTMLDetailsElement>(null);
  const proposalPanel = useRef<HTMLDivElement>(null);
  const operation = useAiOperation();
  const available = health?.mode === "live" && health.llm_configured;
  const [expanded, setExpanded] = useState(Boolean(available));
  const panelId = useId();
  useEffect(() => {
    writeAccount(accountId, `assistant:${project.id}`, {brief, facts, turns, material});
  }, [accountId, project.id, brief, facts, turns, material]);
  const proposal = report?.proposal;
  useEffect(() => { if (proposal) proposalPanel.current?.scrollIntoView({block: "nearest", behavior: "auto"}); }, [proposal?.id]);
  const proposalCurrent = proposal?.base_updated_at === project.updated_at && reviewDraft === JSON.stringify(content);
  const displayChange = (value: unknown) => typeof value === "string" ? value.slice(0, 800) : JSON.stringify(value ?? "").slice(0, 800);
  async function resolveProposal(apply: boolean) {
    if (!proposal || lock.current || (apply && !proposalCurrent)) return;
    lock.current = true; setWorking(true); onBusy(true); setError("");
    try {
      if (apply) {
        const result = await api.applyProposal(project.id, proposal.id, content, project.variant, project.updated_at);
        setReport(result); onResult(result);
      } else {
        await api.rejectProposal(project.id, proposal.id);
        setReport(null);
      }
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setWorking(false); onBusy(false); }
  }

  async function run(action: "edit" | "repair") {
    if (lock.current || disabled || busy || !available) return;
    lock.current = true;
    setWorking(true);
    onBusy(true);
    setError("");
    setReport(null);
    try {
      const result = await operation.run((options) =>
        api.assistant(
          project.id,
          {
            content,
            variant: project.variant,
            base_updated_at: project.updated_at,
            instruction: instruction.trim(),
            action,
            slide: scope === "all" ? null : index,
            material,
            pinned_brief: brief,
            conversation: turns.slice(-10),
            locked_facts: facts.split("\n").map(f => f.trim()).filter(Boolean).map(f => f.slice(0, 500)).slice(0, 30),
            locked_fields: lockedFields.map(field => ({slide: index, field: field as "title" | "body" | "bullets" | "source_quote" | "chart" | "table" | "notes"})),
          },
          options,
        ),
      );
      if (result) {
        setReport(result);
        if (contextPanel.current) contextPanel.current.open = false;
        setReviewDraft(JSON.stringify(content));
        setTurns(previous => [...previous, {role: "user" as const, content: instruction.trim() || "Проверить и предложить исправления"}, {role: "assistant" as const, content: result.summary.slice(0, 3000)}].slice(-10));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setWorking(false);
      onBusy(false);
    }
  }
  return (
    <section
      className="presentation-assistant panel"
      aria-label="AI-помощник"
      aria-busy={working}
      data-available={Boolean(available)}
    >
      <div className="assistant-heading">
        <span className="assistant-heading-icon">
          <Icon name="editor-assistant" />
        </span>
        <div className="assistant-heading-copy">
          <h2>{audit ? "Исправить презентацию с AI" : "Редактировать с AI"}</h2>
          <p>
            {available
              ? "Опишите изменения — сначала покажем предложение"
              : "AI не подключён. Ручное редактирование доступно."}
          </p>
        </div>
        <button
          type="button"
          className="assistant-disclosure"
          aria-label={
            expanded ? "Свернуть AI-помощник" : "Развернуть AI-помощник"
          }
          aria-expanded={expanded}
          aria-controls={panelId}
          disabled={busy}
          onClick={() => setExpanded((value) => !value)}
        >
          <span>{expanded ? "Свернуть" : "Развернуть"}</span>
          <Icon name="viewer-next" />
        </button>
      </div>
      <div id={panelId} className="assistant-body" hidden={!expanded}>
        {!available && (
          <p className="tiny muted">
            Подключение модели настраивает владелец сервера. Пока можно
            редактировать текст и оформление вручную.
          </p>
        )}
        <fieldset disabled={busy || disabled || !available}>
          <div className="assistant-composer">
            <label className="field assistant-scope">
              Область изменений
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="slide">Текущий слайд</option>
                <option value="all">Вся презентация</option>
              </select>
            </label>
            <label className="field assistant-prompt">
              Что изменить с помощью AI?
              <textarea
                rows={1}
                maxLength={3000}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Сократи текст, сохрани цифры или сделай схему…"
              />
            </label>
            <button
              type="button"
              className="btn primary assistant-submit"
              disabled={!instruction.trim()}
              onClick={() => void run("edit")}
            >
              <Icon name="editor-apply" />
              Предложить изменения
            </button>
          </div>
          <div className="assistant-tools">
            <div className="assistant-suggestions">
              {[
                "Сократи текст и убери повторы. Сохрани факты и перенеси детали в заметки.",
                "Перепиши проще и понятнее, сохрани смысл.",
                "Преврати содержание в наглядную схему, если это уместно.",
              ].map((text, i) => (
                <button
                  type="button"
                  className="btn sm"
                  key={text}
                  onClick={() => setInstruction(text)}
                >
                  {["Убрать лишнее", "Улучшить текст", "Сделать схему"][i]}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn sm assistant-repair"
              onClick={() => void run("repair")}
            >
              <Icon name="editor-repair" />
              Предложить исправления
            </button>
          </div>
          <details ref={contextPanel} className="assistant-context">
            <summary>Задание, ограничения и материалы</summary>
            <label className="field">Закреплённое задание<textarea rows={3} maxLength={4000} value={brief} onChange={e => setBrief(e.target.value)} placeholder="Цель, аудитория, стиль и что обязательно сохранить" /></label>
            <label className="field">Факты, которые нельзя менять<textarea rows={2} maxLength={6000} value={facts} onChange={e => setFacts(e.target.value)} placeholder="По одному факту в строке" /></label>
            <div className="assistant-locks"><span>Сохранить на текущем слайде:</span>{([['title','Заголовок'],['body','Текст'],['source_quote','Цитату'],['chart','Диаграмму'],['table','Таблицу']] as const).map(([field,label]) => <label key={field}><input type="checkbox" checked={lockedFields.includes(field)} onChange={e => setLockedFields(previous => e.target.checked ? [...previous,field] : previous.filter(f => f !== field))} />{label}</label>)}</div>
            {turns.length > 0 && <details><summary>История обсуждения · сообщений: {turns.length}</summary><div className="assistant-conversation">{turns.map((turn,i) => <p key={i}><strong>{turn.role === 'user' ? 'Вы' : 'AI'}: </strong>{turn.content}</p>)}</div></details>}
            <label className="field">
              Дополнительный материал
              <textarea
                rows={3}
                maxLength={15000}
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
              />
            </label>
            <label className="field">
              Документы
              <input
                type="file"
                multiple
                accept=".txt,.md,.csv,.docx,.pdf,.pptx"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  e.target.value = "";
                  if (!files.length || lock.current) return;
                  lock.current = true;
                  onBusy(true);
                  setError("");
                  try {
                    const packet = await api.importMaterials(files);
                    const combined = [material, packet.text]
                      .filter(Boolean)
                      .join("\n\n");
                    if (combined.length > 15000)
                      throw new Error(
                        "Для одной правки добавьте до 15 000 символов материала.",
                      );
                    setMaterial(combined);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    lock.current = false;
                    onBusy(false);
                  }
                }}
              />
            </label>
          </details>
        </fieldset>
        <AiOperationStatus operation={operation} />
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        {report && (
          <div ref={proposalPanel} className="assistant-result" role="status">
            <strong>
              {report.project ? "Правки сохранены" : proposal ? "Предложение готово к просмотру" : "Изменения не применены"}
            </strong>
            <p>{report.summary}</p>
            {proposal && <div className="assistant-proposal">
              <div className="assistant-change-list">{proposal.changes.map((change,i) => <article key={i}><strong>Слайд {change.slide + 1} · {({title:'Заголовок',body:'Текст',bullets:'Тезисы',notes:'Заметки',source_quote:'Цитата',kind:'Вид слайда'} as Record<string,string>)[change.field] || change.field}</strong><div><del><small>Было</small>{displayChange(change.before)}</del><ins><small>Предлагаем</small>{displayChange(change.after)}</ins></div></article>)}</div>
              {!proposalCurrent && <p className="error-banner">Черновик изменился после запроса. Запросите новое предложение по актуальному содержанию.</p>}
              <div className="actions"><button className="btn primary" disabled={busy || !proposalCurrent} onClick={() => void resolveProposal(true)}>Принять изменения</button><button className="btn" disabled={busy} onClick={() => void resolveProposal(false)}>Отклонить</button></div>
            </div>}
            {report.project && (
              <p>
                Изменены слайды:{" "}
                {report.changed_slides.map((i) => i + 1).join(", ")}. Вернуть
                исходный текст можно кнопкой «Отменить изменение».
              </p>
            )}
            <details>
              <summary>
                После проверки: {report.issues.length} замечаний
              </summary>
              <ul>
                {report.issues.slice(0, 20).map((i) => (
                  <li key={i.id}>
                    Слайд {i.slide + 1}: {i.title}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </div>
    </section>
  );
}
