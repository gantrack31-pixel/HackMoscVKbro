import type { FormEvent } from "react";
import { Icon } from "../../components/Icon";
import type { User } from "../../types";

const colors = [
  ["#0077FF", "Синий"],
  ["#7851BA", "Фиолетовый"],
  ["#29745F", "Зелёный"],
  ["#C05640", "Коралловый"],
  ["#0F172A", "Тёмный"],
  ["#B05A8B", "Розовый"],
];
export function PersonalDetails({
  user,
  first,
  last,
  color,
  busy,
  dirty,
  onFirstChange,
  onLastChange,
  onColorChange,
  onSave,
}: {
  user: User;
  first: string;
  last: string;
  color: string;
  busy: boolean;
  dirty: boolean;
  onFirstChange: (value: string) => void;
  onLastChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onSave: (event: FormEvent) => void;
}) {
  return (
    <div className="profile-columns">
      <form className="panel profile-form" onSubmit={onSave}>
        <h2>Личные данные</h2>
        <p className="muted small">
          Так вы будете отображаться в своём пространстве.
        </p>
        <fieldset disabled={busy}>
          <div className="profile-name-fields">
            <label>
              Имя
              <input
                required
                maxLength={60}
                autoComplete="given-name"
                value={first}
                onChange={(e) => {
                  onFirstChange(e.target.value);
                }}
              />
            </label>
            <label>
              Фамилия
              <input
                maxLength={60}
                autoComplete="family-name"
                value={last}
                onChange={(e) => {
                  onLastChange(e.target.value);
                }}
              />
            </label>
          </div>
          <label>
            Электронная почта
            <input type="email" value={user.email} readOnly />
            <small>Почта, с которой создан аккаунт.</small>
          </label>
          <div className="avatar-editor">
            <p className="field-helper">
              Нажмите на аватар сверху, чтобы загрузить фото: JPG, PNG или WebP
              до 5 МБ, до 4096 × 4096 px. Кадр обрезается по центру и
              сохраняется сразу.
            </p>
            <span>Цвет аватара</span>
            <div>
              {colors.map(([c, name]) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Цвет аватара: ${name}`}
                  aria-pressed={color === c}
                  className={color === c ? "selected" : ""}
                  style={{ background: c }}
                  onClick={() => {
                    onColorChange(c);
                  }}
                >
                  {color === c && <Icon name="check" />}
                </button>
              ))}
            </div>
          </div>
        </fieldset>
        <div className="profile-save">
          <span className={dirty ? "has-changes" : ""}>
            <Icon name={dirty ? "edit" : "check"} />
            {dirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}
          </span>
          <button
            className="btn primary"
            disabled={busy || !dirty || !first.trim()}
          >
            {busy ? <i className="spinner" /> : <Icon name="check" />}
            Сохранить изменения
          </button>
        </div>
      </form>
      <aside className="profile-side-card">
        <span className="profile-side-icon">
          <Icon name="spark" />
        </span>
        <h2>Ваша следующая история</h2>
        <p>
          Удачное оформление начинается с задачи. Выберите шаблон для своего
          проекта.
        </p>
        <a className="btn" href="#templates">
          К шаблонам
          <Icon name="arrow" />
        </a>
        <div className="profile-deck-preview" aria-hidden="true">
          <span className="profile-preview-back" />
          <div className="profile-preview-slide">
            <span className="profile-preview-label">ВАША ПРЕЗЕНТАЦИЯ</span>
            <strong>
              Идеям
              <br />
              нужна форма.
            </strong>
            <span className="profile-preview-rule" />
            <span className="profile-preview-bars">
              <i />
              <i />
              <i />
            </span>
            <span className="profile-preview-number">01</span>
          </div>
          <span className="profile-preview-caption">
            От первого слайда — к целой истории
          </span>
        </div>
      </aside>
    </div>
  );
}
