import { useLayoutEffect, useRef } from "react";
import type { User } from "../types";

/** Ограничение линии измеряется до начала y, включая смену шрифта и ширины панели. */
export function WordmarkTitle({ entry = false }: { entry?: boolean }) {
  const title = useRef<HTMLSpanElement>(null);
  const descender = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = title.current;
    const y = descender.current;
    if (!element || !y) return;
    const measure = () => {
      const limit = y.getBoundingClientRect().left - element.getBoundingClientRect().left - 3;
      element.style.setProperty("--underline-limit", Math.max(0, limit) + "px");
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(y);
    let active = true;
    document.fonts.ready.then(() => { if (active) measure(); });
    measure();
    return () => { active = false; observer.disconnect(); };
  }, []);
  return <span ref={title} className={entry ? "entry-word-title" : "brand-title"}>
    <span className={entry ? "auth-letter-d" : "brand-initial"}>D</span><span className={entry ? "entry-word-tail" : "brand-tail"}>eckl<span ref={descender} className="wordmark-y">y</span></span>
    <span className="wordmark-underline" aria-hidden="true"><i /></span>
  </span>;
}

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="4 0 36 56" aria-hidden="true">
      <g
        transform="rotate(-8 24 24)"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <text x="5" y="40" fill="currentColor" stroke="none" fontFamily="Manrope, Arial, sans-serif" fontSize="44" fontWeight="800">D</text>
        <path d="M7 47h24" strokeWidth="2" />
      </g>
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`deckly-wordmark ${compact ? "compact" : ""}`}>
      <WordmarkTitle />
      <span className="brand-suffix"><i>.</i><small>Ai</small></span>
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
