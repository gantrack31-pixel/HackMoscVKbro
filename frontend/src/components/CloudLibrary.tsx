import { useEffect, useState } from "react";
import { Cloud, RotateCcw } from "lucide-react";
import { api } from "../api";
import type { CloudReceipt, Project } from "../types";

export function CloudLibrary({
  onOpen,
  refresh = 0,
}: {
  onOpen: (project: Project) => void;
  refresh?: number;
}) {
  const [copies, setCopies] = useState<CloudReceipt[]>([]),
    [ready, setReady] = useState(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    api
      .cloudStatus()
      .then(async (status) => {
        if (!active) return;
        setReady(status.ready);
        if (status.ready) {
          const rows = await api.cloudProjects();
          if (active) setCopies(rows);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [refresh, attempt]);
  async function restore(id: string) {
    setBusy(id);
    setError("");
    try {
      onOpen(await api.restoreCloud(id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  if (!ready && !error) return null;
  return (
    <section className="cloud-library panel">
      <div className="between">
        <h2>
          <Cloud size={24} />
          Облачные копии
        </h2>
        <button
          className="btn sm"
          disabled={!!busy}
          onClick={() => setAttempt((v) => v + 1)}
        >
          Обновить
        </button>
      </div>
      <p className="small muted">
        Восстановление создаёт отдельную редактируемую копию вместе с её
        шаблоном.
      </p>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {ready && !copies.length && (
        <p className="small muted">
          Сохраните первую презентацию в облако на финальном шаге.
        </p>
      )}
      {copies.map((copy) => (
        <div className="cloud-copy" key={copy.project_id}>
          <span>
            <strong>{copy.title}</strong>
            <small>
              Версия {copy.revision} ·{" "}
              {new Date(copy.saved_at).toLocaleString("ru-RU")}
            </small>
          </span>
          <button
            className="btn sm"
            disabled={!!busy}
            onClick={() => restore(copy.project_id)}
          >
            <RotateCcw size={16} />
            {busy === copy.project_id
              ? "Восстанавливаем…"
              : "Восстановить копию"}
          </button>
        </div>
      ))}
    </section>
  );
}
