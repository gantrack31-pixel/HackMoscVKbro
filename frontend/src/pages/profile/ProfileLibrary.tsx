import { Icon } from "../../components/Icon";

export function ProfileLibrary() {
  return (
    <section className="panel profile-library">
      <h2>Ваша библиотека</h2>
      <div>
        {(
          [
            [
              "projects",
              "account-library-projects",
              "Продолжить работу",
              "Ваши сохранённые презентации",
            ],
            [
              "favorites",
              "account-library-favorites",
              "Любимые стили",
              "Сохранённые вами шаблоны",
            ],
            [
              "templates",
              "account-library-templates",
              "Своя коллекция",
              "Добавьте PPTX с фирменным стилем",
            ],
          ] as const
        ).map(([id, icon, title, desc]) => (
          <a href={`#${id}`} key={id}>
            <Icon name={icon} />
            <h3>{title}</h3>
            <p>{desc}</p>
            <span>Открыть</span>
          </a>
        ))}
      </div>
    </section>
  );
}
