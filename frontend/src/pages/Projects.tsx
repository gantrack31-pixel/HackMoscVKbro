import { useEffect, useState } from "react";
import { api } from "../api";
import { CloudLibrary } from "../components/CloudLibrary";
import { Icon } from "../components/Icon";
import { TemplateCover } from "../components/TemplateCover";
import type { Project, ProjectSummary, Template } from "../types";

export function Projects({
  templates,
  onOpen,
  onError,
}: {
  templates: Template[];
  onOpen: (p: Project) => void;
  onError: (m: string) => void;
}) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]),
    [loading, setLoading] = useState(true),
    [remove, setRemove] = useState<string | null>(null);
  useEffect(() => {
    api
      .projects()
      .then(setProjects)
      .catch((e) => onError(e.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <>
      <div className="heading between">
        <div>
          <h1>Мои презентации</h1>
          <p>Ваши истории продолжаются здесь.</p>
        </div>
        <a className="btn primary" href="#create">
          <Icon name="plus" />
          Создать презентацию
        </a>
      </div>
      <div className="cards">
        {projects.map((p) => {
          const template = templates.find((t) => t.id === p.template_id);
          return (
            <article className="template" key={p.id}>
              <button
                className="template-cover"
                onClick={() =>
                  api
                    .project(p.id)
                    .then(onOpen)
                    .catch((e) => onError(e.message))
                }
              >
                {template && (
                  <TemplateCover template={template} title={p.title} />
                )}
              </button>
              <div className="template-body">
                <h3>{p.title}</h3>
                <p>
                  {p.content.slides.length} слайдов ·{" "}
                  {new Date(p.updated_at).toLocaleDateString("ru-RU")}
                </p>
                <div className="template-footer">
                  <button
                    className="btn sm"
                    onClick={() =>
                      api
                        .project(p.id)
                        .then(onOpen)
                        .catch((e) => onError(e.message))
                    }
                  >
                    Открыть
                    <Icon name="arrow" />
                  </button>
                  {remove === p.id ? (
                    <div className="row">
                      <button
                        className="btn sm"
                        onClick={async () => {
                          try {
                            await api.remove(p.id);
                            setProjects(projects.filter((x) => x.id !== p.id));
                          } catch (e) {
                            onError((e as Error).message);
                          }
                        }}
                      >
                        Удалить?
                      </button>
                      <button
                        className="btn ghost sm"
                        aria-label="Отмена удаления"
                        onClick={() => setRemove(null)}
                      >
                        <Icon name="close" />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn ghost sm"
                      aria-label={`Удалить ${p.title}`}
                      onClick={() => setRemove(p.id)}
                    >
                      <Icon name="trash" />
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {loading ? (
        <p>Загружаем презентации…</p>
      ) : (
        !projects.length && (
          <section className="empty panel">
            <Icon name="folder" />
            <h2>Первая история впереди</h2>
            <p>Выберите шаблон и создайте презентацию по своему материалу.</p>
            <a className="btn primary" href="#templates">
              Выбрать шаблон
            </a>
          </section>
        )
      )}
      <CloudLibrary onOpen={onOpen} />
    </>
  );
}
