import { Icon } from "../../components/Icon";

export function ProfileLibrary() {
  return (
    <section className="panel profile-library">
      <h2>От идеи до готовой презентации</h2>
      <p className="muted">
        Проекты, любимые стили и ваши фирменные шаблоны — в одном месте.
      </p>
      <div>
        {(
          [
            [
              "projects",
              "folder",
              "Продолжить работу",
              "Ваши сохранённые презентации",
            ],
            [
              "favorites",
              "star",
              "Любимые стили",
              "Шаблоны, отмеченные звёздочкой",
            ],
            [
              "templates",
              "upload",
              "Своя коллекция",
              "Добавьте PPTX с фирменным стилем",
            ],
          ] as const
        ).map(([id, icon, title, desc]) => (
          <a href={`#${id}`} key={id}>
            <Icon name={icon} />
            <h3>{title}</h3>
            <p>{desc}</p>
            <span>
              Открыть
              <Icon name="arrow" />
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
