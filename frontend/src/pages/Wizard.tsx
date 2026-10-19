import { useSurfaceMotion } from "../motion/animation";
import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  type CSSProperties,
} from "react";
import { api } from "../api";
import {
  AiOperationStatus,
  useAiOperation,
} from "../components/useAiOperation";
import { ThinkingSkeleton } from "../components/ThinkingSkeleton";
import { Icon, type IconName } from "../components/Icon";
import {
  blankSlide,
  type DeckContent,
  type Health,
  type Project,
  type Template,
  type Variant,
  type MaterialResource,
} from "../types";
import { BrandPanel } from "./wizard/BrandPanel";
import { AnalysisPanel } from "./wizard/AnalysisPanel";
import type { DatasetEntry } from "./wizard/analysisApi";
import { MaterialsStep } from "./wizard/MaterialsStep";
import { OutlineStep } from "./wizard/OutlineStep";
import { GenerationProgress } from "./wizard/GenerationProgress";
import { GenerationResults } from "./wizard/GenerationResults";
import type {
  WizardOperation,
  FailedGenerationJob,
  PresentationPurpose,
} from "./wizard/types";
import { readPendingJob as readJob, writePendingJob as writeJob, checkedJob, checkedProject, isTerminalJobFailure, type PendingJob, type JobPollingFailure } from "./wizard/pendingJob";
import { readWizardDraft, combinedMaterial, materialLengthError, type SourceBlock, type WizardDraft } from "./wizard/draft";
import { readAccount, writeAccount } from "../state/accountStorage";
export { sampleMaterial } from "./wizard/content";
export { clearPendingGenerationJob } from "./wizard/pendingJob";

const creationSteps: { name: string; icon: IconName }[] = [
  { name: "Материалы", icon: "flow-material-step" },
  { name: "Структура", icon: "flow-outline-step" },
  { name: "Создание", icon: "flow-create-step" },
  { name: "Оформление", icon: "flow-style-step" },
];

export function Wizard({
  accountId,
  template,
  templates,
  initialMode,
  health,
  onSelect,
  onOpen,
  onError,
  onRestart,
}: {
  accountId: string;
  template: Template;
  templates: Template[];
  initialMode: "description" | "text";
  health: Health | null;
  onSelect: (t: Template) => void;
  onOpen: (p: Project) => void;
  onError: (m: string) => void;
  onRestart: () => void;
}) {
  const [saved] = useState(() => readWizardDraft(accountId));
  const pendingJobRef = useRef<PendingJob | null>(readJob(accountId));
  const readPendingJob = () => pendingJobRef.current;
  const writePendingJob = (job: PendingJob | null) => { pendingJobRef.current = job; writeJob(accountId, job); };
  const [interruptedJob, setInterruptedJob] = useState<{ pending: PendingJob; message: string } | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [previousDraft, setPreviousDraft] = useState(() => readAccount<WizardDraft>(accountId, "wizard-previous"));
  const ai = useAiOperation();
  const [step, setStep] = useState(saved?.content ? Math.min(saved.step, 2) : 1),
    [mode, setMode] = useState(saved?.mode || initialMode),
    [prompt, setPrompt] = useState(saved?.prompt || ""),
    [count, setCount] = useState(saved?.count || 10),
    [audience, setAudience] = useState(saved?.audience || "Команда и коллеги");
  const [purpose, setPurpose] = useState<PresentationPurpose>(saved?.purpose || "project");
  const [brandId, setBrandId] = useState<string|null>(saved?.brandId || null);
  const [brandPreferTemplate, setBrandPreferTemplate] = useState(saved?.brandPreferTemplate || false);
  const [analytics, setAnalytics] = useState<DatasetEntry[]>(saved?.analytics || []);
  const [sourceBlocks, setSourceBlocks] = useState<SourceBlock[]>(saved?.sourceBlocks || []);
  const sourceText = combinedMaterial(prompt, sourceBlocks);
  const packetFiles = sourceBlocks.map(block => `${block.name} · ${block.characters.toLocaleString("ru-RU")} символов`);
  const [resources, setResources] = useState<MaterialResource[]>(saved?.resources || []);
  const [content, setContent] = useState<DeckContent | null>(saved?.content || null),
    [operation, setOperation] = useState<WizardOperation | null>(null),
    [stage, setStage] = useState("queued"),
    [result, setResult] = useState<Project | null>(null),
    [variant, setVariant] = useState<Variant>(saved?.variant || "a");
  const [instruction, setInstruction] = useState(saved?.instruction || "");
  const [instructionError, setInstructionError] = useState("");
  const instructionRef = useRef<HTMLTextAreaElement>(null);
  const [failedJob, setFailedJob] = useState<FailedGenerationJob | null>(null);
  const [slideKeys, setSlideKeys] = useState<string[]>(saved?.content?.slides.map((_, i) => `restored-slide-${i}`) || []);
  const [movedKey, setMovedKey] = useState<string | null>(null);
  const [reorderNotice, setReorderNotice] = useState("");
  const motionScope = useSurfaceMotion(
    [step, mode],
    ".wizard-grid, .outline-layout, .generation, .wizard-results",
  );
  const statusScope = useSurfaceMotion(
    [stage, operation, failedJob?.id, result?.id],
    ".generation-stages .active, .wizard-ready, .error-banner",
    true,
  );
  const busy = operation !== null;
  const active = useRef(true);
  const locked = useRef(false);
  const requestId = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPoll = useRef<(() => void) | null>(null);
  const nextSlideKey = useRef(0);
  const outlineNodes = useRef(new Map<string, HTMLElement>());
  const beforeMove = useRef(new Map<string, number>());
  const live = health?.mode === "live";
  const newSlideKey = () => `outline-slide-${++nextSlideKey.current}`;
  useEffect(() => {
    const draft: WizardDraft = { version: 1, savedAt: new Date().toISOString(), step, mode, prompt, count,
      audience, purpose, resources, sourceBlocks, analytics, brandId, brandPreferTemplate, content, templateId: template.id,
      resultId: result?.id, variant, instruction };
    setStorageError(!writeAccount(accountId, "wizard-draft", draft));
  }, [accountId, step, mode, prompt, count, audience, purpose, resources, sourceBlocks, analytics, brandId, brandPreferTemplate, content, template.id, result?.id, variant, instruction]);
  useEffect(() => {
    if (saved?.resultId && saved.step === 4 && !readPendingJob()) {
      void api.project(saved.resultId).then(p => { if (active.current) { setResult(p); setStep(4); } })
        .catch(e => { if (active.current) onError(e.message); });
    }
  }, []);
  function restorePrevious() {
    if (!previousDraft) return;
    const d = previousDraft;
    setPrompt(d.prompt); setMode(d.mode); setCount(d.count); setAudience(d.audience);
    setBrandId(d.brandId || null); setBrandPreferTemplate(d.brandPreferTemplate || false); setPurpose(d.purpose); setAnalytics(d.analytics || []); setResources(d.resources); setSourceBlocks(d.sourceBlocks || []);
    setContent(d.content); setSlideKeys(d.content?.slides.map(newSlideKey) || []);
    setStep(d.content ? 2 : 1); setResult(null);
    const t = templates.find(item => item.id === d.templateId); if (t) onSelect(t);
    writeAccount(accountId, "wizard-previous", null); setPreviousDraft(null);
  }

  useLayoutEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      outlineNodes.current.forEach((node, key) => {
        const previous = beforeMove.current.get(key);
        if (previous === undefined) return;
        const delta = previous - node.getBoundingClientRect().top;
        if (Math.abs(delta) > 1)
          node.animate(
            [
              { transform: `translateY(${delta}px)` },
              { transform: "translateY(0)" },
            ],
            { duration: 380, easing: "cubic-bezier(.22,1,.36,1)" },
          );
      });
    }
    beforeMove.current.clear();
  }, [slideKeys]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      requestId.current += 1;
      if (pollTimer.current) clearTimeout(pollTimer.current);
      cancelPoll.current?.();
    };
  }, []);
  useEffect(() => {
    const pending = readPendingJob();
    if (!pending || !active.current) return;
    if (pending.kind === "generate" && pending.content) {
      setContent(pending.content);
      if (!saved) setPrompt(pending.sourceText || "");
      setAudience(pending.audience || "Команда и коллеги");
      setSlideKeys(pending.content.slides.map(newSlideKey));
      const savedTemplate = templates.find(item => item.id === pending.templateId);
      if (savedTemplate) onSelect(savedTemplate);
    }
    void resumePendingJob();
  }, []);
  function jobFailed(error: unknown, pending: PendingJob | null) {
    const failure = error as JobPollingFailure;
    if (!pending) { onError(failure.message); return; }
    if (isTerminalJobFailure(failure)) {
      writePendingJob(null);
      setInterruptedJob(null);
      setFailedJob({ id: pending.id, message: failure.message, retryable: failure.retryable === true });
      setStep(pending.kind === "regenerate" ? 4 : pending.content ? 2 : 3);
    } else {
      // The server may still be working. Preserve the exact request snapshot
      // and resume this job; never replace it with a second generation request.
      writePendingJob(pending);
      setFailedJob(null);
      setInterruptedJob({ pending, message: failure.message });
      setStep(pending.kind === "regenerate" ? 4 : 3);
    }
  }
  async function resumePendingJob() {
    const pending = readPendingJob();
    if (!pending) return;
    const id = begin(pending.kind);
    if (id === null) return;
    setInterruptedJob(null); setFailedJob(null); setStage("queued");
    setStep(pending.kind === "regenerate" ? 4 : 3);
    try {
      if (pending.sourceProjectId && !result) {
        try {
          const previous = await api.project(pending.sourceProjectId);
          if (isCurrent(id)) setResult(previous);
        } catch { /* The saved job can still be recovered independently. */ }
      }
      const recovered = await poll(pending.id, id);
      if (!recovered || !isCurrent(id)) return;
      setResult(recovered); setVariant(recovered.variant); setFailedJob(null);
      writePendingJob(null); setStep(4);
    } catch (error) {
      if (isCurrent(id)) jobFailed(error, pending);
    } finally { finish(id); }
  }
  function begin(next: NonNullable<typeof operation>) {
    if (locked.current || !active.current) return null;
    locked.current = true;
    setOperation(next);
    return ++requestId.current;
  }
  function isCurrent(id: number) {
    return active.current && requestId.current === id;
  }
  function finish(id: number) {
    if (!isCurrent(id)) return;
    locked.current = false;
    setOperation(null);
  }
  async function poll(jobId: string, id: number) {
    ai.track(jobId);
    try {
      while (isCurrent(id)) {
        let response;
        try { response = await api.job(jobId); }
        catch (error) {
          if ((error as JobPollingFailure).status === 404)
            throw Object.assign(new Error("Задача больше не найдена. Сохранённую структуру можно запустить заново."), { jobId, terminal: true, retryable: false });
          throw error;
        }
        const job = checkedJob(response, jobId);
        if (!isCurrent(id)) return null;
        setStage(job.stage);
        if (job.state === "cancelled") {
          ai.settle("cancelled");
          const pending = readPendingJob();
          writePendingJob(null);
          setFailedJob(null);
          setStep(result || pending?.kind === "regenerate" ? 4 : pending?.content || content ? 2 : 1);
          return null;
        }
        if (job.state === "failed")
          throw Object.assign(
            new Error(job.error || "Не удалось создать презентацию"),
            {
              jobId: job.id,
              retryable: job.can_retry,
              terminal: true,
            },
          );
        if (job.state === "complete" && job.project_id) {
          const project = checkedProject(await api.project(job.project_id), job.project_id);
          ai.settle("complete");
          return isCurrent(id) ? project : null;
        }
        await new Promise<void>((resolve) => {
          cancelPoll.current = resolve;
          pollTimer.current = setTimeout(() => {
            pollTimer.current = null;
            cancelPoll.current = null;
            resolve();
          }, 700);
        });
      }
      return null;
    } catch (error) {
      ai.settle("failed");
      throw error;
    }
  }
  async function outline(example?: string) {
    if (readPendingJob()) { void resumePendingJob(); return; }
    setResult(null);
    setFailedJob(null);
    const analyticalSlides = example ? [] : analytics.flatMap(entry => entry.plan?.slides || []);
    if (!example && analytics.some(entry => !entry.plan)) { onError("Сначала проверьте план для каждого набора данных."); return; }
    if (!example && analyticalSlides.length && !sourceText.trim()) {
      setContent({ brand_style_id: brandId, brand_prefer_template: brandPreferTemplate, title: analytics[0].selection.intent || analytics[0].profile.name, audience, slides: analyticalSlides, resource_ids: resources.map(r => r.id) });
      setSlideKeys(analyticalSlides.map(newSlideKey)); setStep(2); return;
    }
    const material = example ?? sourceText;
    const lengthError = materialLengthError(material);
    if (lengthError) { onError(lengthError); return; }
    if (!material.trim()) {
      onError("Добавьте описание или материал.");
      return;
    }
    if (example) {
      setPrompt(example);
      setMode("description");
    }
    const id = begin("outline");
    if (id === null) return;
    try {
      const response = await ai.run((options) =>
        api.outline(
          {
            template_id: template.id,
            prompt: material,
            count: Math.max(3, count - analyticalSlides.length),
            audience,
            purpose,
            mode: example ? "description" : mode,
            resource_ids: resources.map((resource) => resource.id),
          },
          options,
        ),
      );
      if (response && isCurrent(id)) {
        setFailedJob(null);
        const slides = analyticalSlides.length ? [...response.content.slides.slice(0,-1), ...analyticalSlides, ...response.content.slides.slice(-1)] : response.content.slides;
        if (slides.length > 200) throw new Error("Общий объём превышает 200 слайдов. Сократите приложения.");
        setContent({...response.content, slides, brand_style_id: brandId, brand_prefer_template: brandPreferTemplate});
        setSlideKeys(slides.map(newSlideKey));
        setStep(2);
      }
    } catch (e) {
      if (isCurrent(id)) onError((e as Error).message);
    } finally {
      finish(id);
    }
  }
  async function generate() {
    if (readPendingJob()) { void resumePendingJob(); return; }
    if (!content) return;
    const id = begin("generate");
    if (id === null) return;
    setFailedJob(null);
    setStage("queued");
    setStep(3);
    try {
      const { job_id } = await ai.startJob(() =>
        api.generate(template.id, content, sourceText, audience),
      );
      writePendingJob({
        id: job_id,
        kind: "generate",
        content,
        sourceText,
        audience,
        templateId: template.id,
      });
      if (!isCurrent(id)) return;
      const project = await poll(job_id, id);
      if (project && isCurrent(id)) {
        writePendingJob(null);
        setFailedJob(null);
        setResult(project);
        setVariant(project.variant);
        setStep(4);
      }
    } catch (e) {
      if (isCurrent(id)) {
        const pending = readPendingJob();
        jobFailed(e, pending);
        if (!pending) setStep(2);
      }
    } finally {
      finish(id);
    }
  }
  async function regenerate() {
    if (readPendingJob()) { void resumePendingJob(); return; }
    if (!result) return;
    if (!instruction.trim()) {
      setInstructionError("Опишите, что изменить в композиции.");
      instructionRef.current?.focus();
      return;
    }
    const id = begin("regenerate");
    if (id === null) return;
    setFailedJob(null);
    setStage("queued");
    try {
      const { job_id } = await ai.startJob(() =>
        api.regenerate(result.id, instruction.trim()),
      );
      writePendingJob({
        id: job_id,
        kind: "regenerate",
        sourceProjectId: result.id,
      });
      setFailedJob(null);
      if (!isCurrent(id)) return;
      const project = await poll(job_id, id);
      if (project && isCurrent(id)) {
        writePendingJob(null);
        setFailedJob(null);
        setResult(project);
      }
    } catch (e) {
      if (isCurrent(id)) jobFailed(e, readPendingJob());
    } finally {
      finish(id);
    }
  }
  async function retryFailedJob(keepCurrentResult: boolean) {
    if (readPendingJob()) { void resumePendingJob(); return; }
    if (!failedJob || !failedJob.retryable) return;
    const id = begin("generate");
    if (id === null) return;
    setStage("queued");
    setStep(3);
    try {
      const { job_id } = await ai.startJob(() => api.retryJob(failedJob.id));
      writePendingJob({
        id: job_id,
        kind: keepCurrentResult ? "regenerate" : "generate",
        ...(keepCurrentResult && result ? { sourceProjectId: result.id } : { content: content || undefined, sourceText, audience, templateId: template.id }),
      });
      if (!isCurrent(id)) return;
      const project = await poll(job_id, id);
      if (project && isCurrent(id)) {
        writePendingJob(null);
        setFailedJob(null);
        setResult(project);
        setVariant(project.variant);
        setStep(4);
      }
    } catch (e) {
      if (isCurrent(id)) {
        const pending = readPendingJob();
        jobFailed(e, pending);
        if (!pending) setStep(keepCurrentResult && result ? 4 : content ? 2 : 3);
      }
    } finally {
      finish(id);
    }
  }
  function edit(index: number, key: "title" | "body", value: string) {
    if (!content || busy) return;
    setContent({
      ...content,
      slides: content.slides.map((s, i) =>
        i === index ? { ...s, [key]: value } : s,
      ),
    });
  }
  function move(index: number, delta: number) {
    if (
      !content ||
      busy ||
      index + delta < 0 ||
      index + delta >= content.slides.length
    )
      return;
    outlineNodes.current.forEach((node, key) =>
      beforeMove.current.set(key, node.getBoundingClientRect().top),
    );
    const slides = [...content.slides];
    [slides[index], slides[index + delta]] = [
      slides[index + delta],
      slides[index],
    ];
    setContent({ ...content, slides });
    const keys = [...slideKeys];
    [keys[index], keys[index + delta]] = [keys[index + delta], keys[index]];
    setSlideKeys(keys);
    setMovedKey(keys[index + delta]);
    setReorderNotice(
      `Слайд «${slides[index + delta].title}» перемещён на место ${index + delta + 1}.`,
    );
  }
  async function open() {
    if (!result) return;
    const id = begin("open");
    if (id === null) return;
    writePendingJob(null);
    try {
      const project = await api.update(result.id, result.content, variant, result.updated_at);
      if (isCurrent(id)) onOpen(project);
    } catch (e) {
      if (isCurrent(id)) onError((e as Error).message);
    } finally {
      finish(id);
    }
  }
  async function importFiles(files: File[]) {
    if (locked.current) return;
    const id = begin("import");
    if (id === null) return;
    try {
      const packet = await api.importMaterials(files);
      if (!isCurrent(id)) return;
      const added = [...new Map(packet.documents.filter(d => d.kind === "document").map(d => [d.id, { id: d.id, name: d.name, text: d.text || "", characters: d.characters }] as const)).values()].filter(block => !sourceBlocks.some(item => item.id === block.id));
      const lengthError = materialLengthError(combinedMaterial(prompt, [...sourceBlocks, ...added]));
      if (lengthError) throw new Error(lengthError);
      setSourceBlocks(previous => [...previous, ...added.filter(block => !previous.some(item => item.id === block.id))]);
      setMode(packet.text ? "text" : mode);
      setResources((previous) => [
        ...previous,
        ...packet.resources.filter(
          (resource) => !previous.some((item) => item.id === resource.id),
        ),
      ]);
    } catch (error) {
      if (isCurrent(id)) onError((error as Error).message);
    } finally {
      finish(id);
    }
  }
  async function removeResource(id: string) {
    try {
      await api.deleteMaterial(id);
      setResources((previous) => previous.filter((item) => item.id !== id));
      setSourceBlocks(previous => previous.filter(item => item.id !== id));
      setContent(null); setSlideKeys([]);
    } catch (error) {
      onError((error as Error).message);
    }
  }
  return (
    <div
      ref={(node) => {
        motionScope.current = node;
        statusScope.current = node;
      }}
      className="wizard-modern wizard-flow motion-surface"
    >
      <div className="heading">
        <h1>От идеи — к презентации</h1>
        <p>Добавьте материалы и выберите оформление.</p>
        <a href="#requirements" className="workflow-link">
          Как это работает
        </a>
      </div>
      <ol
        className="stepper"
        aria-label="Этапы создания презентации"
        style={{ "--current-step": step - 1 } as CSSProperties}
      >
        {creationSteps.map(({ name, icon }, i) => (
          <li
            key={name}
            className={step === i + 1 ? "active" : step > i + 1 ? "done" : ""}
            aria-current={step === i + 1 ? "step" : undefined}
            aria-label={`Шаг ${i + 1}: ${name}${step > i + 1 ? ", завершён" : ""}`}
          >
            <span className="wizard-step-icon" aria-hidden="true">
              <Icon name={icon} />
              {step > i + 1 && <i className="wizard-step-check" />}
            </span>
            <div className="wizard-step-copy" aria-hidden="true">
              <small>{String(i + 1).padStart(2, "0")}</small>
              <strong>{name}</strong>
            </div>
          </li>
        ))}
      </ol>
      {storageError && <p className="error-banner" role="alert">Браузер не смог сохранить черновик. Не закрывайте вкладку до сохранения презентации.</p>}
      {previousDraft && !busy && <div className="demo-notice"><span>Предыдущий черновик сохранён.</span><button className="btn sm" onClick={restorePrevious}>Восстановить</button><button className="btn ghost sm" onClick={() => { setPreviousDraft(null); writeAccount(accountId, "wizard-previous", null); }}>Скрыть</button></div>}
      {interruptedJob && <div className="error-banner" role="alert">
        <div><strong>Проверка состояния прервана</strong><p>{interruptedJob.message}</p>
          <p className="small">Задача сохранена и может продолжать работу. Новое создание не запускается.</p></div>
        <button className="btn sm" disabled={busy} onClick={() => void resumePendingJob()}>Проверить состояние</button>
      </div>}
      {step === 4 && failedJob && !failedJob.retryable && <div className="error-banner" role="alert">{failedJob.message} Предыдущие варианты сохранены.</div>}
      <AiOperationStatus operation={ai} />
      {busy && step === 1 && (
        <ThinkingSkeleton
          label={
            health?.mode === "live"
              ? "AI продумывает структуру"
              : "Подготавливаем структуру материала"
          }
        />
      )}
      {step === 1 && (
        <>
        <MaterialsStep
          prompt={prompt}
          mode={mode}
          purpose={purpose}
          hasAdditionalMaterial={Boolean(sourceBlocks.length || analytics.length)}
          packetFiles={packetFiles}
          resources={resources}
          sourceBlocks={sourceBlocks}
          count={count}
          audience={audience}
          busy={busy || Boolean(interruptedJob)}
          operation={operation}
          template={template}
          templates={templates}
          onPromptChange={setPrompt}
          onError={onError}
          onPurposeChange={setPurpose}
          onCountChange={setCount}
          onAudienceChange={setAudience}
          onRemoveResource={removeResource}
          onImport={importFiles}
          onOutline={outline}
          onSelect={onSelect}
        />
        <BrandPanel value={brandId} preferTemplate={brandPreferTemplate} templateId={template.id} disabled={busy} onChange={(id,prefer) => { setBrandId(id); setBrandPreferTemplate(prefer); setContent(previous => previous ? {...previous,brand_style_id:id,brand_prefer_template:prefer} : null); }} />
        <AnalysisPanel brandId={brandId} preferTemplate={brandPreferTemplate} templateId={template.id} entries={analytics} context={sourceText} disabled={busy} onChange={entries => { setAnalytics(entries); setContent(null); setSlideKeys([]); }} />
        </>
      )}
      {step === 2 && content && (
        <OutlineStep
          content={content}
          template={template}
          audience={audience}
          failedJob={failedJob}
          busy={busy || Boolean(interruptedJob)}
          slideKeys={slideKeys}
          movedKey={movedKey}
          reorderNotice={reorderNotice}
          onGenerate={generate}
          onEdit={edit}
          onMove={move}
          onRemoveSlide={(index) => {
            setContent({
              ...content,
              slides: content.slides.filter((_, n) => n !== index),
            });
            setSlideKeys(slideKeys.filter((_, n) => n !== index));
          }}
          onAddSlide={() => {
            setContent({
              ...content,
              slides: [...content.slides, blankSlide()],
            });
            setSlideKeys([...slideKeys, newSlideKey()]);
          }}
          onBack={() => setStep(1)}
          onNode={(key, node) => {
            if (node) outlineNodes.current.set(key, node);
            else outlineNodes.current.delete(key);
          }}
          onMoveAnimationEnd={() => setMovedKey(null)}
        />
      )}
      {step === 3 && !interruptedJob && (
        <GenerationProgress
          busy={busy || Boolean(interruptedJob)}
          failedJob={failedJob}
          hasContent={Boolean(content)}
          live={live}
          stage={stage}
          onRestart={onRestart}
        />
      )}
      {step === 4 && result && (
        <GenerationResults
          result={result}
          variant={variant}
          busy={busy || Boolean(interruptedJob)}
          live={live}
          stage={stage}
          operation={operation}
          failedJob={failedJob?.retryable ? failedJob : null}
          instruction={instruction}
          instructionError={instructionError}
          instructionRef={instructionRef}
          onRetry={() => retryFailedJob(true)}
          onVariantChange={setVariant}
          onInstructionChange={(value) => {
            setInstruction(value);
            setInstructionError("");
          }}
          onRegenerate={regenerate}
          onOpen={open}
        />
      )}
    </div>
  );
}
