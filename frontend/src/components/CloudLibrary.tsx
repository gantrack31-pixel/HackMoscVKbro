import { useEffect, useState } from "react";
import { Cloud } from "lucide-react";
import { api } from "../api";
import type { DiskReceipt, Project } from "../types";

export function CloudLibrary({ refresh = 0 }: {
  onOpen: (project: Project) => void;
  refresh?: number;
}) {
  const [copies, setCopies] = useState<DiskReceipt[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    api.diskStatus().then(async (status) => {
      if (!active) return;
      setReady(status.ready);
      if (status.ready) {
        const rows = await api.diskFiles();
        if (active) setCopies(rows);
      } else setCopies([]);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [refresh, attempt]);
  if (!ready && !error) return null;
  return <section className="cloud-library panel">
    <div className="between"><h2><Cloud size={24} /> Яндекс.Диск</h2>
      <button className="btn sm" onClick={() => setAttempt(v => v + 1)}>Обновить</button></div>
    <p className="small muted">Последние 100 PPTX в папке приложения Deckly. История правок проекта хранится отдельно, на сервере.</p>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {ready && !copies.length && <p className="small muted">Сохраните первую презентацию на финальном шаге.</p>}
    {copies.map(copy => <div className="cloud-copy" key={copy.name}>
      <span><strong>{copy.name}</strong><small>{new Date(copy.saved_at).toLocaleString("ru-RU")}</small></span>
    </div>)}
    <a className="btn sm" href="https://disk.yandex.ru/client/disk" target="_blank" rel="noreferrer">Открыть Яндекс.Диск</a>
  </section>;
}
