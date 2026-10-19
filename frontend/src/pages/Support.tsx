import { useId, useState, type FormEvent } from "react";
import { api } from "../api";
import { Icon, type IconName } from "../components/Icon";

const supportQuestions = [
  {
    title: "Как подключить модель?",
    category: "Создание с AI",
    icon: "info-help-model",
    answer:
      "Подключение модели настраивает владелец сервера. Когда модель подключена, добавьте свою идею или материалы — Deckly поможет собрать структуру презентации. Если создание недоступно, напишите в поддержку: поможем проверить подключение.",
    link: "#create",
    action: "Создать презентацию",
  },
  {
    title: "Как добавить свой шаблон?",
    category: "Шаблоны и стиль",
    icon: "info-help-template",
    answer:
      "В разделе «Шаблоны» нажмите «Загрузить шаблон» и выберите файл PPTX до 50 МБ. Deckly прочитает палитру, шрифты, пропорции и макеты. После загрузки шаблон появится в вашей библиотеке.",
    link: "#templates",
    action: "К шаблонам",
  },
  {
    title: "Можно ли редактировать результат?",
    category: "Редактирование",
    icon: "info-help-editing",
    answer:
      "Да. Меняйте заголовки, текст и порядок слайдов в редакторе, а затем сохраните изменения. В скачанном PPTX текст, таблицы и диаграммы остаются отдельными объектами — работу можно продолжить в PowerPoint.",
    link: "#projects",
    action: "Мои презентации",
  },
  {
    title: "Как выбрать график для своих данных?",
    category: "Данные и диаграммы",
    icon: "info-feature-visuals",
    answer:
      "На первом шаге создания откройте «От данных — к выводу», укажите вопрос и загрузите таблицу. Проверьте роли колонок, пропуски и рекомендуемые виды графиков. Кнопка «Проверить и подготовить слайды» покажет расчёты, вывод и будущий слайд. При изменении выбора подготовьте план заново.",
    link: "#create",
    action: "Добавить данные",
  },
  {
    title: "Как применить брендбук?",
    category: "Шаблоны и стиль",
    icon: "info-feature-style",
    answer:
      "Добавьте текстовый PDF, JSON с дизайн-токенами или ZIP с логотипом и образцом слайда на первом шаге создания. Для Figma используйте экспорт токенов или JSON документа из Figma API: бинарный .fig не поддерживается. Deckly покажет применённые значения, конфликты и замену шрифтов. По умолчанию брендбук важнее шаблона — это можно изменить.",
    link: "#create",
    action: "Настроить стиль",
  },
  {
    title: "Почему PDF и PPTX могут отличаться?",
    category: "Экспорт",
    icon: "info-help-export",
    answer:
      "Некоторые шрифты и детали оформления могут различаться в PPTX, PDF и HTML. Перед показом проверьте презентацию в нужном формате.",
    link: "#demo",
    action: "Как устроен экспорт",
  },
] satisfies {
  title: string;
  category: string;
  icon: IconName;
  answer: string;
  link: string;
  action: string;
}[];

export function Support() {
  const [expanded, setExpanded] = useState<number | null>(0);
  const [contactEmail, setContactEmail] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactStatus, setContactStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [contactError, setContactError] = useState("");
  const accordionId = useId();

  async function submitSupportMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (contactStatus === "sending") return;

    setContactStatus("sending");
    setContactError("");
    try {
      await api.supportMessage(contactEmail, contactMessage);
      setContactStatus("sent");
      setContactEmail("");
      setContactMessage("");
    } catch (error) {
      setContactStatus("error");
      setContactError(
        (error as Error).message || "Не удалось отправить сообщение.",
      );
    }
  }

  return (
    <section className="support-page">
      <header className="heading support-heading">
        <div className="support-heading-copy">
          <h1>Мы рядом, если нужна помощь</h1>
          <p>Найдите ответ или напишите нам — поможем разобраться.</p>
        </div>
        <div className="support-emblem" aria-hidden="true">
          <span className="support-emblem-ring" />
          <span className="support-emblem-tile">
            <Icon name="info-support" />
          </span>
          <span className="support-emblem-spark">
            <Icon name="info-support-conversation" />
          </span>
        </div>
      </header>
      <div className="support-layout">
        <aside className="support-aside">
          <a className="support-guide" href="#demo">
            <span className="support-guide-icon">
              <Icon name="info-support-guide" />
            </span>
            <span>
              <strong>Первый раз в Deckly?</strong>
              <small>Пройдём путь вместе, шаг за шагом</small>
            </span>
          </a>
          <section className="support-personal">
            <span className="support-contact-icon">
              <Icon name="info-support-contact" />
            </span>
            <h2>Давайте разберёмся вместе.</h2>
            <p>Опишите ситуацию — ответим на указанную почту.</p>
            <form
              className="support-contact-form"
              onSubmit={submitSupportMessage}
              aria-busy={contactStatus === "sending"}
            >
              <label className="support-contact-field">
                <span>Электронная почта для ответа</span>
                <span className="support-input-wrap">
                  <Icon name="info-support-email" />
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    maxLength={254}
                    required
                    placeholder="name@example.ru"
                    value={contactEmail}
                    onChange={(event) => {
                      setContactEmail(event.target.value);
                      if (contactStatus === "error" || contactStatus === "sent")
                        setContactStatus("idle");
                    }}
                    disabled={contactStatus === "sending"}
                  />
                </span>
              </label>
              <label className="support-contact-field">
                <span id={`${accordionId}-message-label`}>Ваш вопрос</span>
                <textarea
                  name="message"
                  minLength={10}
                  maxLength={4000}
                  rows={4}
                  required
                  placeholder="Что не получилось и на каком шаге?"
                  aria-labelledby={`${accordionId}-message-label`}
                  aria-describedby={`${accordionId}-message-hint`}
                  value={contactMessage}
                  onChange={(event) => {
                    setContactMessage(event.target.value);
                    if (contactStatus === "error" || contactStatus === "sent")
                      setContactStatus("idle");
                  }}
                  disabled={contactStatus === "sending"}
                />
                <span
                  className="support-field-meta"
                  id={`${accordionId}-message-hint`}
                >
                  <span>От 10 до 4 000 символов</span>
                  {contactMessage.length > 0 && (
                    <span>
                      {contactMessage.length.toLocaleString("ru-RU")} / 4 000
                    </span>
                  )}
                </span>
              </label>
              {contactStatus === "error" && (
                <p className="support-contact-feedback is-error" role="alert">
                  <Icon name="info-support-error" />
                  <span>{contactError}</span>
                </p>
              )}
              {contactStatus === "sent" && (
                <p
                  className="support-contact-feedback is-success"
                  role="status"
                >
                  <Icon name="info-support-sent" />
                  <span>Сообщение отправлено. Ответим на указанную почту.</span>
                </p>
              )}
              <button
                className="btn primary"
                type="submit"
                disabled={contactStatus === "sending"}
              >
                {contactStatus === "sending"
                  ? "Отправляем…"
                  : "Отправить сообщение"}
                {contactStatus === "sending" ? (
                  <i className="spinner" aria-hidden="true" />
                ) : (
                  <Icon name="info-support-send" />
                )}
              </button>
            </form>
          </section>
        </aside>
        <section
          className="support-answers"
          aria-labelledby={`${accordionId}-title`}
        >
          <div className="support-section-heading">
            <h2 id={`${accordionId}-title`}>Частые вопросы</h2>
          </div>
          <div className="support-faq-list">
            {supportQuestions.map((question, index) => {
              const open = expanded === index;
              const questionId = `${accordionId}-question-${index}`;
              const answerId = `${accordionId}-answer-${index}`;
              return (
                <article
                  className={`support-faq-item${open ? " is-open" : ""}`}
                  key={question.title}
                >
                  <h3>
                    <button
                      id={questionId}
                      aria-expanded={open}
                      aria-controls={answerId}
                      onClick={() => setExpanded(open ? null : index)}
                    >
                      <span
                        className="support-question-icon"
                        aria-hidden="true"
                      >
                        <Icon name={question.icon} />
                      </span>
                      <span className="support-question-text">
                        <small>{question.category}</small>
                        <strong>{question.title}</strong>
                      </span>
                      <span className="support-question-toggle support-question-toggle--text">
                        {open ? "Скрыть" : "Ответ"}
                      </span>
                    </button>
                  </h3>
                  <div
                    id={answerId}
                    className="support-faq-answer"
                    role="region"
                    aria-labelledby={questionId}
                    aria-hidden={!open}
                    inert={!open}
                  >
                    <div>
                      <div className="support-answer-content">
                        <p>{question.answer}</p>
                        <a href={question.link}>{question.action}</a>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <a className="support-requirements-link" href="#requirements">
            <span className="support-resource-icon">
              <Icon name="info-support-reference" />
            </span>
            <span className="support-resource-copy">
              <strong>Возможности Deckly</strong>
              <small>Форматы, инструменты и ограничения</small>
            </span>
          </a>
        </section>
      </div>
    </section>
  );
}
