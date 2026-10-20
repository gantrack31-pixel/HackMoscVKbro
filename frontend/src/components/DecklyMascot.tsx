import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

export type MascotAnimation =
  | "wave"
  | "walk"
  | "think"
  | "laptop"
  | "error"
  | "laugh"
  | "kiss"
  | "admire"
  | "wink"
  | "highfive"
  | "dance"
  | "celebrate"
  | "curious";

const greetings: Record<MascotAnimation, string> = {
  wave: "Привет! Создадим что-нибудь классное?",
  walk: "Иду за вдохновением. Вы со мной?",
  think: "М-м… как лучше рассказать эту историю?",
  laptop: "Так-так… здесь рождается новая история!",
  error: "Ой, споткнулся! Сейчас разберёмся.",
  laugh: "Ура, будем создавать презентации!",
  kiss: "Это вам! За отличный вкус.",
  admire: "Вау! Вот это красота!",
  wink: "Подмигнул. Значит, мы с вами заодно!",
  highfive: "Дайте пять! У нас отличная команда.",
  dance: "Маленький танец для большой идеи!",
  celebrate: "Та-дам! Ещё одна история готова!",
  curious: "Вы ко мне? Нажмите — кое-что покажу!",
};
const reactions = [
  { animation: "wink", text: greetings.wink },
  { animation: "highfive", text: greetings.highfive },
  { animation: "dance", text: greetings.dance },
  { animation: "celebrate", text: "Вот так я радуюсь вашим идеям!" },
  { animation: "laugh", text: "Хи-хи! Щекотно же!" },
  { animation: "kiss", text: "Ладно, вы мой любимый соавтор!" },
] satisfies { animation: MascotAnimation; text: string }[];

/** Artwork supplied by the Deckly owner; isolated SVG IDs and local styles. */
export function DecklyMascot({
  animation = "wave",
  size = 180,
  working = false,
  className = "",
  message,
  interactive = true,
  intro,
}: {
  animation?: MascotAnimation;
  size?: number;
  working?: boolean;
  className?: string;
  message?: string;
  interactive?: boolean;
  intro?: MascotAnimation;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [reacting, setReacting] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [introducing, setIntroducing] = useState(Boolean(intro));
  const reaction = reactions[(Math.max(1, clicks) - 1) % reactions.length];
  const curious =
    interactive &&
    !working &&
    !reacting &&
    !introducing &&
    !speaking &&
    animation !== "error" &&
    (hovered || focused);
  const pose = reacting
    ? reaction.animation
    : introducing && intro
      ? intro
      : curious
        ? "curious"
        : animation;
  const phrase = reacting
    ? reaction.text
    : curious
      ? greetings.curious
      : (message ?? greetings[animation]);
  useEffect(() => {
    if (!active || !introducing) return;
    const timer = window.setTimeout(() => setIntroducing(false), 2800);
    return () => clearTimeout(timer);
  }, [active, introducing]);
  useEffect(() => {
    if (!active) return;
    setSpeaking(true);
    const timer = window.setTimeout(() => setSpeaking(false), 4800);
    return () => clearTimeout(timer);
  }, [active, message, animation, clicks]);
  useEffect(() => {
    if (!reacting) return;
    const timer = window.setTimeout(() => setReacting(false), 3200);
    return () => clearTimeout(timer);
  }, [reacting, clicks]);
  useEffect(() => {
    let inView = false;
    const update = () => setActive(inView && !document.hidden);
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => {
            inView = entry.isIntersecting;
            update();
          });
    if (observer && root.current) observer.observe(root.current);
    else {
      inView = true;
      update();
    }
    document.addEventListener("visibilitychange", update);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return (
    <div
      ref={root}
      className={`deckly-mascot ${className}`}
      data-active={active}
      data-working={working && !reacting}
      data-intro-finished={
        Boolean(intro) && !introducing && !reacting && !curious
      }
      data-chatty={Boolean(message !== "")}
      data-interactive={interactive}
      data-speaking={Boolean(phrase) && (speaking || hovered || focused)}
      style={{ "--mascot-size": `${size}px` } as CSSProperties}
    >
      {message !== "" && (
        <span
          className="mascot-speech"
          id={`${id}-speech`}
          aria-hidden={!(speaking || hovered || focused)}
        >
          {phrase}
        </span>
      )}
      <button
        type="button"
        className="mascot-play"
        aria-label="Поиграть с маскотом Deckly"
        aria-describedby={message !== "" ? `${id}-speech` : undefined}
        disabled={!interactive}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onClick={() => {
          setIntroducing(false);
          setClicks((value) => value + 1);
          setReacting(true);
        }}
      >
        <svg
          key={`${pose}-${clicks}`}
          className={`deckly-mascot-svg state-${pose}`}
          viewBox="-16 -16 432 432"
          focusable="false"
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id={`${id}-bodyBlueGrad`}
              x1="15%"
              y1="5%"
              x2="85%"
              y2="95%"
            >
              <stop offset="0%" stopColor="#1485FF" />
              <stop offset="45%" stopColor="#0077FF" />
              <stop offset="100%" stopColor="#0062D6" />
            </linearGradient>
            <linearGradient
              id={`${id}-pinkAccentGrad`}
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#FFA6A6" />
              <stop offset="55%" stopColor="#ff9A9A" />
              <stop offset="100%" stopColor="#F28787" />
            </linearGradient>
            <linearGradient
              id={`${id}-heartKissGrad`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#FF758F" />
              <stop offset="50%" stopColor="#FF4D6D" />
              <stop offset="100%" stopColor="#C9184A" />
            </linearGradient>
            <linearGradient
              id={`${id}-lightDetailGrad`}
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#F1F5F9" />
              <stop offset="100%" stopColor="#DCE3EA" />
            </linearGradient>
            <filter
              id={`${id}-softDropShadow`}
              x="-15%"
              y="-15%"
              width="130%"
              height="135%"
            >
              <feDropShadow
                dx="0"
                dy="8"
                stdDeviation="6"
                floodColor="#061224"
                floodOpacity="0.28"
              />
            </filter>
            <filter
              id={`${id}-limbShadow`}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feDropShadow
                dx="0"
                dy="3"
                stdDeviation="2.5"
                floodColor="#00397A"
                floodOpacity="0.32"
              />
            </filter>
            <radialGradient
              id={`${id}-laptopGlowGrad`}
              cx="50%"
              cy="50%"
              r="50%"
            >
              <stop offset="0%" stopColor="#93C5FD" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#93C5FD" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse
            className="floor-shadow"
            cx="200"
            cy="362"
            rx="82"
            ry="13"
            fill="#090d14"
            opacity="0.35"
          />
          <g className="mascot-root-mover">
            <g className="legs-standing">
              <g
                className="leg-left"
                style={{ transformOrigin: "171px 298px" }}
              >
                <rect
                  x="156"
                  y="288"
                  width="30"
                  height="64"
                  rx="15"
                  fill={`url(#${id}-pinkAccentGrad)`}
                />
              </g>
              <g
                className="leg-right"
                style={{ transformOrigin: "229px 298px" }}
              >
                <rect
                  x="214"
                  y="288"
                  width="30"
                  height="64"
                  rx="15"
                  fill={`url(#${id}-pinkAccentGrad)`}
                />
              </g>
            </g>
            <g className="mascot-body-rig">
              <g
                id={`${id}-body-parallax-layer`}
                style={{ transform: "translate(1.3px, -1.8px)" }}
              >
                <rect
                  x="82"
                  y="76"
                  width="236"
                  height="232"
                  rx="68"
                  fill={`url(#${id}-bodyBlueGrad)`}
                  stroke="#268BFF"
                  strokeWidth="1.5"
                  filter={`url(#${id}-softDropShadow)`}
                />
                <g className="body-chart-bars">
                  <g transform="translate(256, 244) rotate(-6)">
                    <rect
                      x="-16"
                      y="-5"
                      width="8.5"
                      height="16"
                      rx="2.5"
                      fill={`url(#${id}-lightDetailGrad)`}
                    />
                    <rect
                      x="-2"
                      y="-17"
                      width="8.5"
                      height="28"
                      rx="2.5"
                      fill={`url(#${id}-lightDetailGrad)`}
                    />
                    <rect
                      x="12"
                      y="-11"
                      width="8.5"
                      height="22"
                      rx="2.5"
                      fill={`url(#${id}-lightDetailGrad)`}
                    />
                  </g>
                </g>
                <g className="face-screen-wrapper">
                  <g
                    id={`${id}-face-parallax-layer`}
                    style={{ transform: "translate(3.4px, -5.4px)" }}
                  >
                    <rect
                      x="138"
                      y="132"
                      width="124"
                      height="86"
                      rx="28"
                      fill={`url(#${id}-pinkAccentGrad)`}
                    />
                    <rect
                      x="225"
                      y="191"
                      width="24"
                      height="15.5"
                      rx="5"
                      fill={`url(#${id}-lightDetailGrad)`}
                    />
                    <g className="eyelid-blink">
                      <g className="eyes-happy">
                        <path
                          d="M 156 175 L 169 156 L 182 175"
                          fill="none"
                          stroke="#ECF2F8"
                          strokeWidth="7.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M 214 175 L 227 156 L 240 175"
                          fill="none"
                          stroke="#ECF2F8"
                          strokeWidth="7.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </g>
                      <g className="eyes-wink">
                        <path
                          d="M 156 175 L 169 156 L 182 175"
                          fill="none"
                          stroke="#ECF2F8"
                          strokeWidth="7.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          className="wink-eye"
                          d="M 215 169 Q 227 177 239 166"
                          fill="none"
                          stroke="#ECF2F8"
                          strokeWidth="7"
                          strokeLinecap="round"
                        />
                      </g>
                      <g className="eyes-think">
                        <ellipse
                          cx="170"
                          cy="168"
                          rx="6.5"
                          ry="8.5"
                          fill="#ECF2F8"
                        />
                        <ellipse
                          cx="226"
                          cy="168"
                          rx="6.5"
                          ry="8.5"
                          fill="#ECF2F8"
                        />
                        <path
                          d="M 215 151 Q 227 144 238 152"
                          fill="none"
                          stroke="#ECF2F8"
                          strokeWidth="5"
                          strokeLinecap="round"
                        />
                        <path
                          d="M 158 154 L 180 156"
                          fill="none"
                          stroke="#ECF2F8"
                          strokeWidth="5"
                          strokeLinecap="round"
                        />
                      </g>
                      <g className="eyes-error">
                        <path
                          d="M 154 158 Q 168 150 180 146"
                          fill="none"
                          stroke="#ECF2F8"
                          strokeWidth="5"
                          strokeLinecap="round"
                        />
                        <path
                          d="M 242 158 Q 228 150 216 146"
                          fill="none"
                          stroke="#ECF2F8"
                          strokeWidth="5"
                          strokeLinecap="round"
                        />
                        <path
                          d="M 157 167 Q 169 178 181 167"
                          fill="none"
                          stroke="#ECF2F8"
                          strokeWidth="6.5"
                          strokeLinecap="round"
                        />
                        <path
                          d="M 215 167 Q 227 178 239 167"
                          fill="none"
                          stroke="#ECF2F8"
                          strokeWidth="6.5"
                          strokeLinecap="round"
                        />
                      </g>
                      <g className="eyes-admire">
                        <g className="star-eye-left">
                          <path
                            d="M 170 147 Q 170 165 188 165 Q 170 165 170 183 Q 170 165 152 165 Q 170 165 170 147 Z"
                            fill="#FFFFFF"
                          />
                          <circle cx="182" cy="153" r="2.8" fill="#FFFFFF" />
                        </g>
                        <g className="star-eye-right">
                          <path
                            d="M 226 147 Q 226 165 244 165 Q 226 165 226 183 Q 226 165 208 165 Q 226 165 226 147 Z"
                            fill="#FFFFFF"
                          />
                          <circle cx="238" cy="153" r="2.8" fill="#FFFFFF" />
                        </g>
                      </g>
                    </g>
                    <g className="cheeks-blush" opacity="0.55">
                      <ellipse
                        cx="153"
                        cy="182"
                        rx="8.5"
                        ry="5"
                        fill="#FF4D6D"
                      />
                      <ellipse
                        cx="243"
                        cy="182"
                        rx="8.5"
                        ry="5"
                        fill="#FF4D6D"
                      />
                    </g>
                    <path
                      className="mouth-smile"
                      d="M 189 180 A 9 9 0 0 0 207 180"
                      fill="none"
                      stroke="#ECF2F8"
                      strokeWidth="6.5"
                      strokeLinecap="round"
                    />
                    <circle
                      className="mouth-think"
                      cx="201"
                      cy="186"
                      r="5.5"
                      fill="none"
                      stroke="#ECF2F8"
                      strokeWidth="5"
                    />
                    <path
                      className="mouth-error"
                      d="M 186 192 Q 198 179 210 192"
                      fill="none"
                      stroke="#ECF2F8"
                      strokeWidth="6.5"
                      strokeLinecap="round"
                    />
                    <g className="mouth-laugh">
                      <path
                        d="M 182 178 C 182 198, 214 198, 214 178 Z"
                        fill="#ECF2F8"
                        stroke="#ECF2F8"
                        strokeWidth="3"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M 189 188 Q 198 183 207 188 Q 198 195 189 188 Z"
                        fill="#FF6B8B"
                      />
                    </g>
                    <path
                      className="mouth-kiss"
                      d="M 195 178 C 202 178, 203 184, 197 185 C 203 186, 202 192, 195 192"
                      fill="none"
                      stroke="#ECF2F8"
                      strokeWidth="5.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      className="mouth-admire"
                      d="M 184 181 Q 191 191 198 183 Q 205 191 212 181"
                      fill="none"
                      stroke="#ECF2F8"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                </g>
              </g>
              <g className="legs-sitting">
                <ellipse
                  cx="136"
                  cy="312"
                  rx="22"
                  ry="15"
                  transform="rotate(-14 136 312)"
                  fill={`url(#${id}-pinkAccentGrad)`}
                  stroke="#0055B8"
                  strokeWidth="2"
                />
                <ellipse
                  cx="264"
                  cy="312"
                  rx="22"
                  ry="15"
                  transform="rotate(14 264 312)"
                  fill={`url(#${id}-pinkAccentGrad)`}
                  stroke="#0055B8"
                  strokeWidth="2"
                />
              </g>
              <g className="prop-think">
                <circle
                  className="bubble-1"
                  cx="296"
                  cy="104"
                  r="7.5"
                  fill="#ffffff"
                  stroke="#cbd5e1"
                  strokeWidth="2"
                />
                <circle
                  className="bubble-2"
                  cx="316"
                  cy="76"
                  r="12"
                  fill="#ffffff"
                  stroke="#cbd5e1"
                  strokeWidth="2"
                />
                <g className="bubble-3">
                  <path
                    d="M 304 58 C 288 58 282 42 292 30 C 290 14 308 4 326 12 C 338 0 364 4 370 20 C 386 24 388 46 374 54 C 368 64 350 64 340 58 C 328 64 312 62 304 58 Z"
                    fill="#ffffff"
                    stroke="#cbd5e1"
                    strokeWidth="2"
                    filter={`url(#${id}-softDropShadow)`}
                  />
                  <g className="idea-slide">
                    <rect
                      x="311"
                      y="18"
                      width="48"
                      height="32"
                      rx="6"
                      fill="#0077FF"
                    />
                    <rect
                      x="316"
                      y="23"
                      width="20"
                      height="3.5"
                      rx="1.5"
                      fill="#ffffff"
                      opacity="0.9"
                    />
                    <rect
                      x="317"
                      y="37"
                      width="6"
                      height="9"
                      rx="1.5"
                      fill="#ff9A9A"
                    />
                    <rect
                      x="326"
                      y="30"
                      width="6"
                      height="16"
                      rx="1.5"
                      fill="#ff9A9A"
                    />
                    <rect
                      x="335"
                      y="33"
                      width="6"
                      height="13"
                      rx="1.5"
                      fill="#ECF2F8"
                    />
                    <circle cx="349" cy="36" r="5.5" fill="#ff9A9A" />
                    <path
                      d="M 349 36 L 349 30.5 A 5.5 5.5 0 0 1 354.5 36 Z"
                      fill="#ffffff"
                    />
                  </g>
                </g>
              </g>
              <g
                className="arm-left"
                style={{ transformOrigin: "88px 202px" }}
                filter={`url(#${id}-limbShadow)`}
              >
                <rect
                  x="34"
                  y="187"
                  width="68"
                  height="30"
                  rx="15"
                  fill={`url(#${id}-pinkAccentGrad)`}
                />
              </g>
              <g
                className="arm-right"
                style={{ transformOrigin: "312px 192px" }}
                filter={`url(#${id}-limbShadow)`}
              >
                <rect
                  x="298"
                  y="177"
                  width="68"
                  height="30"
                  rx="15"
                  fill={`url(#${id}-pinkAccentGrad)`}
                />
              </g>
              <g className="prop-laptop">
                <ellipse
                  cx="200"
                  cy="232"
                  rx="80"
                  ry="55"
                  fill={`url(#${id}-laptopGlowGrad)`}
                  pointerEvents="none"
                />
                <g className="laptop-device">
                  <rect
                    x="138"
                    y="226"
                    width="124"
                    height="72"
                    rx="11"
                    fill="#e2e8f0"
                    stroke="#64748b"
                    strokeWidth="2"
                    filter={`url(#${id}-softDropShadow)`}
                  />
                  <rect
                    x="138"
                    y="294"
                    width="124"
                    height="8"
                    rx="4"
                    fill="#94a3b8"
                    stroke="#475569"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M 148 226 L 252 226"
                    stroke="#60a5fa"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  <rect
                    x="182"
                    y="244"
                    width="36"
                    height="36"
                    rx="10"
                    fill="#0077FF"
                  />
                  <text
                    x="200"
                    y="269"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontFamily="Inter, sans-serif"
                    fontWeight="800"
                    fontSize="22"
                  >
                    D
                  </text>
                </g>
              </g>
              <g className="prop-error-brackets">
                <path
                  d="M 296 66 Q 318 72 314 94"
                  fill="none"
                  stroke="#ff9A9A"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <path
                  d="M 306 56 Q 332 64 326 92"
                  fill="none"
                  stroke="#ECF2F8"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </g>
              <g className="prop-laugh">
                <path
                  d="M 82 64 L 68 50"
                  stroke="#ff9A9A"
                  strokeWidth="5.5"
                  strokeLinecap="round"
                />
                <path
                  d="M 98 52 L 92 34"
                  stroke="#ECF2F8"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <path
                  d="M 318 64 L 332 50"
                  stroke="#ff9A9A"
                  strokeWidth="5.5"
                  strokeLinecap="round"
                />
                <path
                  d="M 302 52 L 308 34"
                  stroke="#ECF2F8"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </g>
              <g className="prop-kiss">
                <g
                  className="kiss-heart-group"
                  filter={`url(#${id}-softDropShadow)`}
                >
                  <path
                    d="M 200 202 C 200 202, 168 180, 168 160 C 168 145, 184 138, 200 153 C 216 138, 232 145, 232 160 C 232 180, 200 202, 200 202 Z"
                    fill={`url(#${id}-heartKissGrad)`}
                    stroke="#FFE5EC"
                    strokeWidth="2.5"
                  />
                  <path
                    d="M 178 156 A 8 8 0 0 1 188 149"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="3"
                    strokeLinecap="round"
                    opacity="0.85"
                  />
                  <circle cx="154" cy="148" r="4" fill="#ff9A9A" />
                  <circle cx="246" cy="144" r="5" fill="#ff9A9A" />
                </g>
              </g>
              <g className="prop-admire">
                <g className="sparkle-1">
                  <path
                    d="M 72 80 Q 72 102 94 102 Q 72 102 72 124 Q 72 102 50 102 Q 72 102 72 80 Z"
                    fill="#ff9A9A"
                  />
                  <circle cx="72" cy="102" r="4" fill="#FFFFFF" />
                </g>
                <g className="sparkle-2">
                  <path
                    d="M 328 72 Q 328 94 350 94 Q 328 94 328 116 Q 328 94 306 94 Q 328 94 328 72 Z"
                    fill="#ECF2F8"
                  />
                  <circle cx="328" cy="94" r="4" fill="#ff9A9A" />
                </g>
                <g className="sparkle-3">
                  <path
                    d="M 338 138 Q 338 152 352 152 Q 338 152 338 166 Q 338 152 324 152 Q 338 152 338 138 Z"
                    fill="#ff9A9A"
                  />
                </g>
              </g>
            </g>
            <g className="prop-highfive" fill="none" strokeLinecap="round">
              <circle
                className="highfive-ring"
                cx="342"
                cy="134"
                r="24"
                stroke="#ff9A9A"
                strokeWidth="4"
              />
              <path
                className="highfive-rays"
                d="M 344 96 V 85 M 368 105 L 377 96 M 380 130 H 391"
                stroke="#0077FF"
                strokeWidth="5"
              />
            </g>
            <g className="prop-dance" fill="#ff9A9A">
              <g className="music-note music-note-left">
                <path
                  d="M 49 100 V 67 L 70 62 V 91"
                  fill="none"
                  stroke="#ff9A9A"
                  strokeWidth="5"
                  strokeLinejoin="round"
                />
                <ellipse
                  cx="43"
                  cy="100"
                  rx="8"
                  ry="6"
                  transform="rotate(-20 43 100)"
                />
                <ellipse
                  cx="64"
                  cy="91"
                  rx="8"
                  ry="6"
                  transform="rotate(-20 64 91)"
                />
              </g>
              <g className="music-note music-note-right">
                <path
                  d="M 348 88 V 57 Q 361 58 362 69"
                  fill="none"
                  stroke="#0077FF"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <ellipse
                  cx="342"
                  cy="88"
                  rx="8"
                  ry="6"
                  fill="#0077FF"
                  transform="rotate(-20 342 88)"
                />
              </g>
            </g>
            <g className="prop-celebrate">
              <g className="confetti confetti-a" fill="#ff9A9A">
                <rect
                  x="52"
                  y="80"
                  width="8"
                  height="18"
                  rx="3"
                  transform="rotate(-25 56 89)"
                />
                <circle cx="110" cy="35" r="5" />
                <rect
                  x="323"
                  y="48"
                  width="8"
                  height="16"
                  rx="3"
                  transform="rotate(28 327 56)"
                />
              </g>
              <g className="confetti confetti-b" fill="#0077FF">
                <circle cx="67" cy="49" r="5" />
                <rect
                  x="275"
                  y="28"
                  width="7"
                  height="15"
                  rx="3"
                  transform="rotate(-18 278 35)"
                />
                <rect
                  x="352"
                  y="95"
                  width="8"
                  height="18"
                  rx="3"
                  transform="rotate(35 356 104)"
                />
              </g>
              <g
                className="confetti confetti-c"
                fill="none"
                stroke="#ff9A9A"
                strokeWidth="4"
                strokeLinecap="round"
              >
                <path d="M 38 133 L 47 128 L 53 139 M 191 25 L 197 18 L 204 27 M 355 49 L 364 41 L 369 51" />
              </g>
            </g>
          </g>
        </svg>
      </button>
    </div>
  );
}
