# Local browser performance and accessibility review — 19 October 2026

Target: updated copy A. This review used the existing frontend server at
`http://127.0.0.1:8183` and the current backend through an isolated ASGI/stdin
bridge. No extra listening server was started and no user account or production
database was used. GSAP and Three.js remain in place.

## Method and limits

Headless Chromium ran locally with no CPU/network throttling. Other integration
checks ran concurrently, so these numbers describe this run rather than a
production benchmark. The browser reported ANGLE/Vulkan **SwiftShader**, a
software rendering backend; hardware-accelerated browser performance was not
measured. The initial editor fixture contained 20 ordinary slides.
The first document load had a fresh browser context; the backend was already
initialized. Route readiness means its main panel was visible plus two animation
frames. It does not mean all decorative animations had completed.

The baseline sweep covered Home, Templates, Create and Editor at 320, 390, 768
and 1440 CSS pixels in dark mode, plus 390/1440 in light mode. A 720 × 500 CSS
viewport checked the reflow equivalent of a 1440 × 1000 desktop at 200% zoom.
Native browser zoom itself was not automated. This is not a screen-reader audit
or a WCAG conformance certification.

## Measured responsiveness

| Measurement | Observed result |
| --- | --- |
| Cold frontend Home ready | 1,536 ms |
| Document DOMContentLoaded / load | 58 / 59 ms; application readiness is the separate value above |
| First lazy Create / Editor visit | 412 / 399 ms |
| Warm Home navigation, mixed viewport sweep | 16 samples; median 633 ms, range 42–696 ms |
| Warm Templates navigation | 13 samples; median 48 ms, range 35–673 ms |
| Warm Create navigation | 16 samples; median 46 ms, range 33–412 ms |
| Warm Editor navigation | 11 samples; median 48 ms, range 41–399 ms |
| Search / material input to next animation frame | 62 events; median 8.6 ms, p95 15.3 ms, max 16.4 ms |
| Main-thread long tasks across the complete extended sweep | 17 tasks, 8,555 ms total, longest 606 ms |

The input observation is a local event-to-frame proxy, **not INP** and not a
painted-pixel measurement. Repeated Home scene creation was associated with the
slower route transitions and long tasks. The review therefore does not claim
that all navigation is fast or that 3D initialization has been optimized. No
unbounded memory-leak conclusion can be drawn from this short run.

## Motion and basic interaction

- Four repeated Home → Create cycles released every detached WebGL context;
  detached canvases stopped drawing after navigation. The active context count
  after leaving Home was zero in each observed cycle.
- With reduced motion enabled, Home rendered its static presentation fallback
  and no presentation WebGL canvas.
- With WebGL explicitly unavailable, the final build showed the static slides,
  retained its actions and raised no uncaught page error.
- `/` focused the template search; no visible shortcut chip was reintroduced.
- Escape closed the mobile navigation and returned focus to its toggle.
- No uncaught JavaScript page error occurred in the baseline sweep.

## Concrete changes from the review

At 320 pixels, Home's middle tab label overlapped adjacent labels and a long
hero word was clipped. Mobile tab labels now wrap, and the narrow hero adjusts
its inner padding and type size. A lower “Все презентации” link also caused
12 pixels of page overflow; its section heading now wraps at that width.

At the same width, Editor's Check/Finish text exceeded its two button widths
and the last design option was clipped. The two actions now stack and design
choices wrap at widths up to 380 pixels. Larger layouts retain their existing
arrangement.

UI contrast received small tone corrections within the existing palette:

| UI text pair | Before | After, once theme transitions settle |
| --- | --- | --- |
| White primary/selected text on blue | 4.13:1 | 4.85:1 |
| Light-theme inactive tab text on a soft panel | 4.34:1 | 4.95:1 |
| Dark-theme inactive tab text | Already readable | 7.67:1 |

Two wizard labels with hard-coded light-theme grey now use the dark-theme
muted token. Template artwork and presentation source colors were not changed.
The source template's small white “VK Tech” label on its original blue still
measures about 4.13:1; this is a template-artwork observation, not a claim that
all presentation content satisfies a contrast standard. The automated sweep
also excludes text over gradients/images, disabled controls and text while
opacity animations are active. It cannot determine all visual contrast cases.

## Evidence and final follow-up

Baseline script, raw observations and screenshots:
`C:/Temp/deckly-implementation-qa-20261019/performance-accessibility-review.mjs`
and `C:/Temp/deckly-implementation-qa-20261019/performance-accessibility/`.

Focused final follow-up script and captures:
`C:/Temp/deckly-implementation-qa-20261019/performance-accessibility-followup.mjs`
and `C:/Temp/deckly-implementation-qa-20261019/performance-accessibility/final/`.

The focused follow-up passed against built assets `index-CZkXY0oA.js` and
`index-CpSLG9Hc.css`. Ten route/viewport/theme cases were captured after the CSS
fixes, including Home and Editor at 320 pixels and the 720-pixel zoom-equivalent
reflow. No checked final page exceeded the viewport width. Home tab/headline
text and Editor action/style text fitted their containers. The opaque action/tab
contrast checks passed, and the final run had no uncaught page errors. The final
editor screenshot used a separate two-slide fixture; the performance numbers
above retain the original 20-slide fixture and are not silently replaced.

The final WebGL-unavailable screenshot is `final/home-no-webgl.png`; normal 3D
is visible in `final/home-light-1440.png`. The final report JSON records the
asset names, individual widths, renderer, checks and screenshots. These are
focused CSS/fallback checks, not a rerun of all application workflows or the
root agent's separate two-account/assistant/export acceptance.
