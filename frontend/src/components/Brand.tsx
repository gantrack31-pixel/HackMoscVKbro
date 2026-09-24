import type { User } from "../types";

export function WordmarkTitle({ entry = false }: { entry?: boolean }) {
  return <span className={entry ? "entry-word-title" : "brand-title"}>
    <span className={entry ? "auth-letter-d" : "brand-initial"}>D</span><span className={entry ? "entry-word-tail" : "brand-tail"}>eckly</span>
  </span>;
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={`deckly-wordmark ${compact ? "compact" : ""}`}>
    <WordmarkTitle />
    <span className="brand-suffix"><i>.</i><small>Ai</small></span>
  </span>;
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
