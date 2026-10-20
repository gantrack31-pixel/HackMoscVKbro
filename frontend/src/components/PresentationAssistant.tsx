import { useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { readAccount, writeAccount } from "../state/accountStorage";
import { Icon } from "./Icon";
import { ProposalPreview } from "./ProposalPreview";
import { useAiOperation, AiOperationStatus } from "./useAiOperation";
import type { AssistantResult, DeckContent, Health, Project, Issue } from "../types";

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
  reviewIssues = [],
}: {
  accountId: string;
  project: Project;
  content: DeckContent;
  index: number;
  health: Health | null;
  disabled: boolean;
  busy: boolean;
  audit?: boolean;
  reviewIssues?: Issue[];
  onBusy: (busy: boolean) => void;
  onResult: (result: AssistantResult) => void;
}) {
  type Turn = {role: "user" | "assistant"; content: string};
  type Context = {version?: number; brief: string; facts: string; turns: Turn[]; material: string};
  const [stored] = useState(() => readAccount<Context>(accountId, `assistant:${project.id}`));
  const [brief, setBrief] = useState(stored?.brief || "");
  const [facts, setFacts] = useState(stored?.facts || "");
  const [turns, setTurns] = useState<Turn[]>(stored?.version === 2 ? stored.turns : []);
  const [locks, setLocks] = useState<Record<number, string[]>>({});
  const lockedFields = locks[index] || [];
  const [allowCorrections, setAllowCorrections] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [pendingTurn, setPendingTurn] = useState<Turn[] | null>(null);
  const [now, setNow] = useState(Date.now());
  const [reviewDraft, setReviewDraft] = useState("");
  const [instruction, setInstruction] = useState("");
  const [scope, setScope] = useState(audit ? "all" : "slide");
  const [allowStructure, setAllowStructure] = useState(true);
  const [preserveFacts, setPreserveFacts] = useState(false);
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
    writeAccount(accountId, `assistant:${project.id}`, {version: 2, brief, facts, turns, material});
  }, [accountId, project.id, brief, facts, turns, material]);
  const proposal = report?.proposal;
  useEffect(() => { if (proposal) proposalPanel.current?.scrollIntoView({block: "nearest", behavior: "auto"}); }, [proposal?.id]);
  useEffect(() => {
    if (!proposal) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [proposal?.id]);
  const expired = Boolean(proposal && Date.parse(proposal.expires_at) <= now);
  // The countdown re-renders every second; serialize the deck (images included) only when it changes.
  const contentSignature = useMemo(() => (proposal ? JSON.stringify(content) : ""), [proposal, content]);
  const proposalCurrent = !expired && proposal?.base_updated_at === project.updated_at && reviewDraft === contentSignature;
  const displayChange = (value: unknown, field: string) => {
    if (["image_data", "resource_icon_data", "element_images"].includes(field)) return value ? "Встроенные изображения" : "Нет изображений";
    if (field === "evidence_sources" && Array.isArray(value)) return `Источников: ${value.length}`;
    return typeof value === "string" ? value : JSON.stringify(value ?? "", (key, item) =>
      ["image_data", "resource_icon_data", "element_images"].includes(key) ? "Встроенные изображения" : item, 2);
  };
  async function resolveProposal(apply: boolean) {
    if (!proposal || lock.current || (apply && (!proposalCurrent || !previewReady))) return;
    lock.current = true; setWorking(true); onBusy(true); setError("");
    try {
      if (apply) {
        const result = await api.applyProposal(project.id, proposal.id, content, project.variant, project.updated_at);
        setReport(result); onResult(result);
        if (result.slide_order) {
          const order = result.slide_order;
          setLocks(previous => Object.fromEntries(order.flatMap((original, index) => previous[original]?.length ? [[index, previous[original]]] : [])));
        }
        if (pendingTurn) setTurns(previous => [...previous, ...pendingTurn].slice(-10));
        setPendingTurn(null);
      } else {
        await api.rejectProposal(project.id, proposal.id);
        setReport(null); setPendingTurn(null);
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
    setReport(null); setPendingTurn(null); setPreviewReady(false);
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
            allow_structure: scope === "all" && allowStructure,
            preserve_facts: preserveFacts,
            slide: scope === "all" ? null : index,
            material,
            pinned_brief: brief,
            allow_fact_corrections: allowCorrections,
            review_issues: reviewIssues.slice(0, 30),
            conversation: turns.slice(-10),
            locked_facts: facts.split("\n").map(f => f.trim()).filter(Boolean).map(f => f.slice(0, 500)).slice(0, 30),
            locked_fields: Object.entries(locks).flatMap(([slide, fields]) => fields.map(field => ({slide: Number(slide), field: field as "title" | "body" | "bullets" | "source_quote" | "chart" | "table" | "notes"}))),
          },
          options,
        ),
      );
      if (result) {
        setReport(result);
        if (contextPanel.current) contextPanel.current.open = false;
        setReviewDraft(JSON.stringify(content));
        if (result.proposal) setPendingTurn([
          {role: "user", content: instruction.trim() || "Проверить и предложить исправления"},
          {role: "assistant", content: result.summary.slice(0, 3000)},
        ]);
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
                placeholder="Добавь диаграмму по 1, 2, 3, 4, 5, покрась фон в синий, перемести заголовок…"
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
            <p className="tiny muted">AI может добавлять объекты, менять любые цвета, размеры, расположение и слои. Все правки сначала появятся в предпросмотре.</p>
            <label><input type="checkbox" checked={preserveFacts} onChange={e => setPreserveFacts(e.target.checked)} /> Сохранять все исходные числа, даже при замене содержания</label>
            {scope === "all" && <label><input type="checkbox" checked={allowStructure} onChange={e => setAllowStructure(e.target.checked)} /> Разрешить добавление, удаление и перестановку слайдов по запросу</label>}
            <label className="field">Закреплённое задание<textarea rows={3} maxLength={4000} value={brief} onChange={e => setBrief(e.target.value)} placeholder="Цель, аудитория, стиль и что обязательно сохранить" /></label>
            <label className="field">Факты, которые нельзя менять<textarea rows={2} maxLength={6000} value={facts} onChange={e => setFacts(e.target.value)} placeholder="По одному факту в строке" /></label>
            <div className="assistant-locks"><span>Сохранить на текущем слайде:</span>{([['title','Заголовок'],['body','Текст'],['source_quote','Цитату'],['chart','Диаграмму'],['table','Таблицу']] as const).map(([field,label]) => <label key={field}><input type="checkbox" checked={lockedFields.includes(field)} onChange={e => setLocks(previous => ({...previous, [index]: e.target.checked ? [...(previous[index] || []), field] : (previous[index] || []).filter(f => f !== field)}))} />{label}</label>)}</div>
            {turns.length > 0 && <details><summary>История обсуждения · сообщений: {turns.length}</summary><div className="assistant-conversation">{turns.map((turn,i) => <p key={i}><strong>{turn.role === 'user' ? 'Вы' : 'AI'}: </strong>{turn.content}</p>)}</div></details>}
            <label><input type="checkbox" checked={allowCorrections} onChange={e => setAllowCorrections(e.target.checked)} /> Разрешить замену ошибочных фактов по источнику</label>
            <p className="tiny muted">Замены и подтверждающие цитаты будут показаны отдельно. Закреплённые поля и факты остаются неизменными.</p>
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
              <ProposalPreview project={project} content={content} proposal={proposal} onReady={setPreviewReady} />
              {report.fact_corrections?.map((fact, i) => <article key={i}><strong>Замена факта</strong><p><del>{fact.before}</del> → <ins>{fact.after}</ins></p><blockquote>{fact.evidence}</blockquote></article>)}
              <div className="assistant-change-list">{proposal.changes.map((change,i) => <article key={i}><strong>{change.slide < 0 ? "Презентация" : `Слайд ${change.slide + 1}`} · {({title:'Заголовок',audience:'Аудитория',slide:change.after ? 'Добавлен слайд' : 'Удалён слайд',body:'Текст',bullets:'Тезисы',notes:'Заметки',source_quote:'Цитата',kind:'Вид слайда'} as Record<string,string>)[change.field] || change.field}</strong><div><del><small>Было</small>{displayChange(change.before, change.field)}</del><ins><small>Предлагаем</small>{displayChange(change.after, change.field)}</ins></div></article>)}</div>
              {!proposalCurrent && <p className="error-banner">{expired ? "Срок предложения истёк. Запросите новое; черновик не изменён." : "Черновик изменился после запроса. Запросите новое предложение по актуальному содержанию."}</p>}
              <div className="actions"><button className="btn primary" disabled={busy || !proposalCurrent || !previewReady} onClick={() => void resolveProposal(true)}>Принять изменения</button><button className="btn" disabled={busy} onClick={() => void resolveProposal(false)}>Отклонить</button></div>
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
