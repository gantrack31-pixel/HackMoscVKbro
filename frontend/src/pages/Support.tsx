import { useId, useState, type FormEvent } from "react";
import { api } from "../api";
import { Icon } from "../components/Icon";

const supportQuestions = [
  {
    title: "Как подключить модель?",
    category: "Создание с AI",
    answer:
      "Подключение модели настраивает владелец сервера. Когда модель подключена, добавьте свою идею или материалы — Deckly поможет собрать структуру презентации. Если создание недоступно, напишите в поддержку: поможем проверить подключение.",
    link: "#create",
    action: "Создать презентацию",
  },
  {
    title: "Как добавить свой шаблон?",
    category: "Шаблоны и стиль",
    answer:
      "В разделе «Шаблоны» нажмите «Загрузить шаблон» и выберите файл PPTX до 50 МБ. Deckly прочитает палитру, шрифты, пропорции и макеты. После загрузки шаблон появится в вашей библиотеке.",
    link: "#templates",
    action: "К шаблонам",
  },
  {
    title: "Можно ли редактировать результат?",
    category: "Редактирование",
    answer:
      "Да. Меняйте заголовки, текст и порядок слайдов в редакторе, а затем сохраните изменения. В скачанном PPTX текст, таблицы и диаграммы остаются отдельными объектами — работу можно продолжить в PowerPoint.",
    link: "#projects",
    action: "Мои презентации",
  },
  {
    title: "Почему PDF и PPTX могут отличаться?",
    category: "Экспорт",
    answer:
      "PPTX сохраняет графику и ресурсы мастеров исходного шаблона. PDF и HTML используют общую схему размещения со шрифтом Manrope, поэтому некоторые детали оформления могут отличаться. Перед показом проверьте нужный формат в предпросмотре.",
    link: "#demo",
    action: "Как устроен экспорт",
  },
];

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
        <span className="support-eyebrow">
          <Icon name="help" /> Помощь в нужный момент
        </span>
        <h1>Мы рядом, если нужна помощь</h1>
        <p>От первого шаблона до готовой презентации.</p>
      </header>
      <div className="support-layout">
        <aside className="support-aside">
          <a className="support-guide" href="#demo">
            <span className="support-guide-icon">
              <Icon name="play" />
            </span>
            <span>
              <strong>Первый раз в Deckly?</strong>
              <small>Пройдём путь вместе, шаг за шагом</small>
            </span>
            <Icon name="arrow" />
          </a>
          <section className="support-personal">
            <span className="support-contact-icon">
              <Icon name="mail" />
            </span>
            <h2>Давайте разберёмся вместе.</h2>
            <p>
              Не нашли ответ? Оставьте почту для ответа и опишите вопрос — так
              нам будет проще помочь.
            </p>
            <form
              className="support-contact-form"
              onSubmit={submitSupportMessage}
            >
              <label className="support-contact-field">
                <span>Электронная почта для ответа</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  value={contactEmail}
                  onChange={(event) => {
                    setContactEmail(event.target.value);
                    if (contactStatus === "error" || contactStatus === "sent")
                      setContactStatus("idle");
                  }}
                  disabled={contactStatus === "sending"}
                />
              </label>
              <label className="support-contact-field">
                <span>Ваш вопрос</span>
                <textarea
                  name="message"
                  minLength={10}
                  maxLength={4000}
                  rows={4}
                  required
                  value={contactMessage}
                  onChange={(event) => {
                    setContactMessage(event.target.value);
                    if (contactStatus === "error" || contactStatus === "sent")
                      setContactStatus("idle");
                  }}
                  disabled={contactStatus === "sending"}
                />
              </label>
              {contactStatus === "error" && (
                <p className="support-contact-feedback is-error" role="alert">
                  {contactError}
                </p>
              )}
              {contactStatus === "sent" && (
                <p
                  className="support-contact-feedback is-success"
                  role="status"
                >
                  Сообщение отправлено. Ответим на указанную почту.
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
                {contactStatus !== "sending" && <Icon name="send" />}
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
            <span>Коротко о главном</span>
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
                      <span className="support-question-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="support-question-text">
                        <small>{question.category}</small>
                        <strong>{question.title}</strong>
                      </span>
                      <span className="support-question-toggle">
                        <Icon name="plus" />
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
                        <a href={question.link}>
                          {question.action}
                          <Icon name="arrow" />
                        </a>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
      <a
        className="btn support-requirements-link"
        href="#requirements"
        style={{ marginTop: 32 }}
      >
        <span>Возможности, требования и пайплайн</span>
        <Icon name="arrow" />
      </a>
    </section>
  );
}
