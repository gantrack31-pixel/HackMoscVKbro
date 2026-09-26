import { useEffect, useState } from "react";
import {
  Cloud,
  CircleCheck as CloudCheck,
  Download,
  ArrowLeft,
  Check,
  Layers,
  Maximize2,
} from "lucide-react";
import { api } from "../api";
import { SlidePreview } from "../components/SlidePreview";
import { PresentationViewer } from "../components/PresentationViewer";
import { ExportPanel } from "../components/ExportPanel";
import { CloudLibrary } from "../components/CloudLibrary";
import type { CloudReceipt, CloudStatus, Project } from "../types";

export function Finish({
  project,
  onOpen,
}: {
  project: Project;
  onOpen: (p: Project) => void;
}) {
  const [method, setMethod] = useState<"cloud" | "download">("cloud");
  const [presenting, setPresenting] = useState(false);
  const [status, setStatus] = useState<CloudStatus | null>(null),
    [receipt, setReceipt] = useState<CloudReceipt | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [checking, setChecking] = useState(true);
  const [index, setIndex] = useState(0),
    [attempt, setAttempt] = useState(0),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setChecking(true);
    setError("");
    api
      .cloudStatus()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((e) => {
        if (active) {
          setStatus(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  async function save() {
    setBusy(true);
    setError("");
    setReceipt(null);
    try {
      const result = await api.saveCloud(project.id);
      setReceipt(result);
      setRefresh((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="heading between">
        <div>
          <span className="label">Финальный шаг</span>
          <h1>Ваша история готова к выходу</h1>
          <p>Сохраните её там, где вам удобно продолжить.</p>
        </div>
        <a className="btn" href="#editor">
          <ArrowLeft size={18} />В редактор
        </a>
      </div>
      <ol className="finish-path" aria-label="Этапы подготовки">
        {["Материалы", "Оформление", "Редактирование", "Сохранение"].map(
          (step, i) => (
            <li key={step} className={i === 3 ? "active" : ""}>
              {i < 3 ? <Check size={16} /> : <Cloud size={16} />}
              {step}
            </li>
          ),
        )}
      </ol>
      <div className="finish-grid">
        <section className="finish-preview panel">
          <div className="between">
            <h2>{project.title}</h2>
            <button
              type="button"
              className="btn sm"
              onClick={() => setPresenting(true)}
            >
              <Maximize2 size={16} /> Смотреть
            </button>
          </div>
          <SlidePreview
            scene={project.variants[project.variant][index]}
            label={`Слайд ${index + 1}: ${project.content.slides[index].title}`}
          />
          <div className="finish-filmstrip">
            {project.content.slides.map((slide, i) => (
              <button
                key={i}
                className={i === index ? "active" : ""}
                aria-label={`Предпросмотр слайда ${i + 1}`}
                aria-pressed={index === i}
                onClick={() => setIndex(i)}
              >
                <SlidePreview
                  scene={project.variants[project.variant][i]}
                  label={slide.title}
                />
                <span>{i + 1}</span>
              </button>
            ))}
          </div>
          <div className="between small muted">
            <span>
              {project.template.name} · Слайд {index + 1} из{" "}
              {project.content.slides.length}
            </span>
            <a className="btn sm" href="#audit">
              Проверить слайды
            </a>
          </div>
        </section>
        <section className="finish-save panel">
          <h2>Как сохранить?</h2>
          <div
            className="save-methods"
            role="group"
            aria-label="Способ сохранения"
          >
            <button
              className={method === "cloud" ? "selected" : ""}
              aria-pressed={method === "cloud"}
              onClick={() => setMethod("cloud")}
            >
              <Cloud size={24} />
              <strong>В облако</strong>
              <small>Вернуться с любого устройства</small>
            </button>
            <button
              className={method === "download" ? "selected" : ""}
              aria-pressed={method === "download"}
              onClick={() => setMethod("download")}
            >
              <Download size={24} />
              <strong>На устройство</strong>
              <small>PPTX, PDF или HTML</small>
            </button>
          </div>
          {method === "download" ? (
            <ExportPanel project={project} embedded onClose={() => {}} />
          ) : (
            <div className="cloud-save-content">
              <div className="cloud-illustration">
                <CloudCheck size={48} />
                <Layers size={28} />
              </div>
              <h3>Презентация и её оформление — вместе</h3>
              <p className="small muted">
                Содержание, выбранная композиция и библиотека шаблонов с
                исходными PPTX сохранятся в вашем аккаунте.
              </p>
              <ul className="save-benefits">
                <li>
                  <Check size={16} />
                  Редактируемая копия слайдов
                </li>
                <li>
                  <Check size={16} />
                  Исходные файлы шаблонов
                </li>
                <li>
                  <Check size={16} />
                  Восстановление через «Мои презентации»
                </li>
              </ul>
              {checking ? (
                <p className="small muted" role="status">
                  Проверяем подключение к облаку…
                </p>
              ) : !status?.ready && !error ? (
                <div className="cloud-unavailable">
                  <strong>Облако ещё не подключено</strong>
                  <p>
                    Владелец сервера должен настроить хранилище. Сейчас
                    презентация доступна на этом сервере и для скачивания.
                  </p>
                </div>
              ) : null}
              {error && (
                <p className="error-banner" role="alert">
                  {error}
                </p>
              )}
              <button
                className="btn primary cloud-save-button"
                disabled={!status?.ready || busy || checking}
                onClick={save}
              >
                <Cloud size={20} />
                {busy
                  ? "Сохраняем в облако…"
                  : receipt
                    ? "Обновить облачную копию"
                    : "Сохранить в облако"}
              </button>
              {!status?.ready && !checking && (
                <button
                  className="btn sm"
                  onClick={() => setAttempt((v) => v + 1)}
                >
                  Проверить подключение снова
                </button>
              )}
              {receipt && (
                <div className="save-feedback" role="status">
                  <CloudCheck size={24} />
                  <div>
                    <strong>Сохранено в облаке</strong>
                    <p>
                      Версия {receipt.revision} ·{" "}
                      {new Date(receipt.saved_at).toLocaleString("ru-RU")}
                      <br />
                      Шаблонов сохранено: {receipt.templates_saved}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
      <CloudLibrary onOpen={onOpen} refresh={refresh} />
      {presenting && (
        <PresentationViewer
          scenes={project.variants[project.variant]}
          title={project.title}
          initialIndex={index}
          onClose={() => setPresenting(false)}
        />
      )}
    </>
  );
}
