import type { User } from "../types";

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 48 56" aria-hidden="true">
      <g
        transform="rotate(-8 24 24)"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <text x="7" y="38" fill="currentColor" stroke="none" fontFamily="Manrope, Arial, sans-serif" fontSize="42" fontWeight="800">D</text>
        <path d="M12 46h24" strokeWidth="3" />
      </g>
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`deckly-wordmark ${compact ? "compact" : ""}`}>
      {compact && <BrandMark />}
      <span>{compact ? "eckly" : "Deckly"}</span>
      <i>.</i>
      <small>Ai</small>
    </span>
  );
}

export function Avatar({
  user,
  large = false,
}: {
  user: User;
  large?: boolean;
}) {
  return (
    <span
      className={`account-avatar ${large ? "large" : ""}`}
      style={{ background: user.avatar_color || "#0077FF" }}
      aria-hidden="true"
    >
      {(user.first_name.charAt(0) + user.last_name.charAt(0)).toLocaleUpperCase(
        "ru-RU",
      )}
    </span>
  );
}
