import { useEffect, useState } from "react";
import { api } from "../api";
import { SlidePreview } from "./SlidePreview";
import type { AssistantProposal, DeckContent, Project, Scene } from "../types";

/** Preview is isolated from the editable draft and never saves a project. */
export function ProposalPreview({project, content, proposal, onReady}: {
  project: Project; content: DeckContent; proposal: AssistantProposal; onReady: (ready: boolean) => void;
}) {
  const [scenes, setScenes] = useState<{before: Scene[]; after: Scene[]} | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(0);
  const changed = [...new Set(proposal.changes.map(c => c.slide).filter(i => i >= 0))];
  const index = changed.includes(selected) ? selected : changed[0] ?? 0;
  useEffect(() => {
    const controller = new AbortController();
    setScenes(null); setError(""); onReady(false);
    Promise.all([
      api.preview(project.id, content, project.variant, controller.signal),
      api.preview(project.id, proposal.content, project.variant, controller.signal),
    ]).then(([before, after]) => {
      if (!controller.signal.aborted) { setScenes({before: before.scenes, after: after.scenes}); onReady(true); }
    }).catch(e => { if (!controller.signal.aborted) setError((e as Error).message); });
    return () => controller.abort();
  }, [project.id, project.variant, content, proposal, onReady]);
  return <section className="assistant-visual-review" aria-label="Сравнение предложения AI">
    {changed.length > 1 && <label className="field">Сравнить слайд
      <select value={index} onChange={e => setSelected(Number(e.target.value))}>
        {changed.map(i => <option key={i} value={i}>{i + 1}. {proposal.content.slides[i].title}</option>)}
      </select>
    </label>}
    {error ? <p className="error-banner" role="alert">Не удалось построить сравнение: {error}</p>
      : !scenes ? <p role="status">Строим предпросмотр предложения…</p>
      : <div className="assistant-visual-pair">
        <div><strong>Текущий черновик</strong><SlidePreview scene={scenes.before[index]} /></div>
        <div><strong>После принятия</strong><SlidePreview scene={scenes.after[index]} /></div>
      </div>}
    <p className="tiny muted">Это отдельный предпросмотр. Черновик изменится только после принятия.</p>
  </section>;
}
