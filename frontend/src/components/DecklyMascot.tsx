import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

export type MascotAnimation = "wave" | "walk" | "think" | "laptop" | "error";

/** Artwork supplied by the Deckly owner; isolated SVG IDs and local styles. */
export function DecklyMascot({
  animation = "wave",
  size = 180,
  working = false,
  className = "",
}: {
  animation?: MascotAnimation;
  size?: number;
  working?: boolean;
  className?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
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
      aria-hidden="true"
      data-active={active}
      data-working={working}
      style={{ "--mascot-size": `${size}px` } as CSSProperties}
    >
      <svg
        key={animation}
        className={`deckly-mascot-svg state-${animation}`}
        viewBox="-16 -16 432 432"
        focusable="false"
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
          <radialGradient id={`${id}-laptopGlowGrad`} cx="50%" cy="50%" r="50%">
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
            <g className="leg-left" style={{ transformOrigin: "171px 298px" }}>
              <rect
                x="156"
                y="288"
                width="30"
                height="64"
                rx="15"
                fill={`url(#${id}-pinkAccentGrad)`}
              />
            </g>
            <g className="leg-right" style={{ transformOrigin: "229px 298px" }}>
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
            <g id={`${id}-body-parallax-layer`}>
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
                <g id={`${id}-face-parallax-layer`}>
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
              style={{
                transformOrigin: "88px 202px",
              }}
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
              style={{
                transformOrigin: "312px 192px",
              }}
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
          </g>
        </g>
      </svg>
    </div>
  );
}
