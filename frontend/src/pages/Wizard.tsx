import { useSurfaceMotion } from "../motion/animation";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { api } from "../api";
import {
  AiOperationStatus,
  useAiOperation,
} from "../components/useAiOperation";
import { ThinkingSkeleton } from "../components/ThinkingSkeleton";
import { Icon } from "../components/Icon";
import {
  blankSlide,
  type DeckContent,
  type Health,
  type Project,
  type Template,
  type Variant,
  type MaterialResource,
} from "../types";
import { MaterialsStep } from "./wizard/MaterialsStep";
import { OutlineStep } from "./wizard/OutlineStep";
import { GenerationProgress } from "./wizard/GenerationProgress";
import { GenerationResults } from "./wizard/GenerationResults";
import type {
  WizardOperation,
  FailedGenerationJob,
  PresentationPurpose,
} from "./wizard/types";
import {
  readPendingJob,
  writePendingJob,
} from "./wizard/pendingJob";
export { sampleMaterial } from "./wizard/content";
export { clearPendingGenerationJob } from "./wizard/pendingJob";

export function Wizard({
  template,
  templates,
  initialMode,
  health,
  onSelect,
  onOpen,
  onError,
  onRestart,
}: {
  template: Template;
  templates: Template[];
  initialMode: "description" | "text";
  health: Health | null;
  onSelect: (t: Template) => void;
  onOpen: (p: Project) => void;
  onError: (m: string) => void;
  onRestart: () => void;
}) {
  const ai = useAiOperation();
  const [step, setStep] = useState(1),
    [mode, setMode] = useState(initialMode),
    [prompt, setPrompt] = useState(""),
    [count, setCount] = useState(10),
    [audience, setAudience] = useState("Команда и коллеги");
  const [purpose, setPurpose] = useState<PresentationPurpose>("project");
  const [packetFiles, setPacketFiles] = useState<string[]>([]);
  const [resources, setResources] = useState<MaterialResource[]>([]);
  const [content, setContent] = useState<DeckContent | null>(null),
    [operation, setOperation] = useState<WizardOperation | null>(null),
    [stage, setStage] = useState("queued"),
    [result, setResult] = useState<Project | null>(null),
    [variant, setVariant] = useState<Variant>("a");
  const [instruction, setInstruction] = useState("");
  const [instructionError, setInstructionError] = useState("");
  const instructionRef = useRef<HTMLTextAreaElement>(null);
  const [failedJob, setFailedJob] = useState<FailedGenerationJob | null>(null);
  const [slideKeys, setSlideKeys] = useState<string[]>([]);
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
    const id = begin(pending.kind);
    if (id === null) return;
    if (pending.kind === "generate") setStep(3);
    else {
      setStep(4);
      if (pending.sourceProjectId)
        api
          .project(pending.sourceProjectId)
          .then(setResult)
          .catch(() => undefined);
    }
    void (async () => {
      try {
        if (pending.kind === "generate" && pending.content) {
          setContent(pending.content);
          setPrompt(pending.sourceText || "");
          setAudience(pending.audience || "Команда и коллеги");
          setSlideKeys(pending.content.slides.map(newSlideKey));
          const savedTemplate = templates.find(
            (item) => item.id === pending.templateId,
          );
          if (savedTemplate) onSelect(savedTemplate);
        }
        const recovered = await poll(pending.id, id);
        if (!recovered || !isCurrent(id)) return;
        setResult(recovered);
        setVariant(recovered.variant);
        setFailedJob(null);
        writePendingJob(null);
        setStep(4);
      } catch (e) {
        if (!isCurrent(id)) return;
        const failure = e as Error & { jobId?: string; retryable?: boolean };
        const jobId = failure.jobId || pending.id;
        writePendingJob(null);
        setFailedJob({
          id: jobId,
          message: failure.message,
          retryable: failure.retryable === true,
        });
        setStep(pending.kind === "regenerate" ? 4 : pending.content ? 2 : 3);
      } finally {
        finish(id);
      }
    })();
  }, []);
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
        const job = await api.job(jobId);
        if (!isCurrent(id)) return null;
        setStage(job.stage);
        if (job.state === "cancelled") {
          ai.settle("cancelled");
          const pending = readPendingJob();
          writePendingJob(null);
          setFailedJob(null);
          setStep(result || pending?.kind === "regenerate" ? 4 : 2);
          return null;
        }
        if (job.state === "failed")
          throw Object.assign(
            new Error(job.error || "Не удалось создать презентацию"),
            {
              jobId: job.id,
              retryable: job.can_retry,
            },
          );
        if (job.state === "complete" && job.project_id) {
          const project = await api.project(job.project_id);
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
    const material = example ?? prompt;
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
            count,
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
        setContent(response.content);
        setSlideKeys(response.content.slides.map(newSlideKey));
        setStep(2);
      }
    } catch (e) {
      if (isCurrent(id)) onError((e as Error).message);
    } finally {
      finish(id);
    }
  }
  async function generate() {
    if (!content) return;
    const id = begin("generate");
    if (id === null) return;
    setFailedJob(null);
    setStage("queued");
    setStep(3);
    writePendingJob(null);
    try {
      const { job_id } = await ai.startJob(() =>
        api.generate(template.id, content, prompt, audience),
      );
      if (!isCurrent(id)) return;
      writePendingJob({
        id: job_id,
        kind: "generate",
        content,
        sourceText: prompt,
        audience,
        templateId: template.id,
      });
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
        const failure = e as Error & { jobId?: string; retryable?: boolean };
        if (failure.jobId && failure.retryable) {
          writePendingJob({
            id: failure.jobId,
            kind: "generate",
            content,
            sourceText: prompt,
            audience,
            templateId: template.id,
          });
          setFailedJob({
            id: failure.jobId,
            message: failure.message,
            retryable: true,
          });
        } else {
          writePendingJob(null);
          onError(failure.message);
        }
        setStep(2);
      }
    } finally {
      finish(id);
    }
  }
  async function regenerate() {
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
      if (isCurrent(id)) {
        const failure = e as Error & { jobId?: string; retryable?: boolean };
        if (failure.jobId && failure.retryable) {
          writePendingJob({
            id: failure.jobId,
            kind: "regenerate",
            sourceProjectId: result.id,
          });
          setFailedJob({
            id: failure.jobId,
            message: failure.message,
            retryable: true,
          });
        } else {
          writePendingJob(null);
          onError(`${failure.message} Предыдущие варианты сохранены.`);
        }
      }
    } finally {
      finish(id);
    }
  }
  async function retryFailedJob(keepCurrentResult: boolean) {
    if (!failedJob) return;
    const id = begin("generate");
    if (id === null) return;
    setStage("queued");
    setStep(3);
    try {
      const { job_id } = await ai.startJob(() => api.retryJob(failedJob.id));
      if (!isCurrent(id)) return;
      writePendingJob({
        id: job_id,
        kind: keepCurrentResult ? "regenerate" : "generate",
        ...(keepCurrentResult && result ? { sourceProjectId: result.id } : {}),
      });
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
        const failure = e as Error & { jobId?: string; retryable?: boolean };
        if (failure.jobId && failure.retryable) {
          const kind = keepCurrentResult ? "regenerate" : "generate";
          writePendingJob({
            id: failure.jobId,
            kind,
            ...(keepCurrentResult && result
              ? { sourceProjectId: result.id }
              : {}),
          });
          setFailedJob({
            id: failure.jobId,
            message: failure.message,
            retryable: true,
          });
        } else {
          writePendingJob(null);
          onError(failure.message);
        }
        setStep(keepCurrentResult && result ? 4 : content ? 2 : 3);
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
      const project = await api.update(result.id, result.content, variant);
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
      const combined = [prompt.trim(), packet.text]
        .filter(Boolean)
        .join("\n\n");
      if (combined.length > 50000)
        throw new Error(
          "Вместе с введённым текстом пакет превышает 50 000 символов.",
        );
      setPrompt(combined);
      setMode(packet.text ? "text" : mode);
      setResources((previous) => [
        ...previous,
        ...packet.resources.filter(
          (resource) => !previous.some((item) => item.id === resource.id),
        ),
      ]);
      setPacketFiles((previous) => [
        ...previous,
        ...packet.documents.map(
          (d) =>
            `${d.name} · ${d.kind === "document" ? `${d.characters.toLocaleString("ru-RU")} символов` : d.kind}`,
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
        <p>Ваш текст, ваш шаблон, ваша история. Обычно 10–15 слайдов.</p>
        <a href="#requirements" className="workflow-link">
          Как устроены генерация и проверка
        </a>
      </div>
      <ol className="stepper" aria-label="Этапы создания презентации">
        {["Материалы", "Структура", "Создание", "Оформление"].map((name, i) => (
          <li
            key={name}
            className={step === i + 1 ? "active" : step > i + 1 ? "done" : ""}
            aria-current={step === i + 1 ? "step" : undefined}
          >
            <span>{step > i + 1 ? <Icon name="check" /> : i + 1}</span>
            {name}
          </li>
        ))}
      </ol>
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
        <MaterialsStep
          prompt={prompt}
          mode={mode}
          purpose={purpose}
          packetFiles={packetFiles}
          resources={resources}
          count={count}
          audience={audience}
          busy={busy}
          operation={operation}
          template={template}
          templates={templates}
          onPromptChange={setPrompt}
          onPurposeChange={setPurpose}
          onCountChange={setCount}
          onAudienceChange={setAudience}
          onRemoveResource={removeResource}
          onImport={importFiles}
          onOutline={outline}
          onSelect={onSelect}
        />
      )}
      {step === 2 && content && (
        <OutlineStep
          content={content}
          template={template}
          audience={audience}
          failedJob={failedJob}
          busy={busy}
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
      {step === 3 && (
        <GenerationProgress
          busy={busy}
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
          busy={busy}
          live={live}
          stage={stage}
          operation={operation}
          failedJob={failedJob}
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
