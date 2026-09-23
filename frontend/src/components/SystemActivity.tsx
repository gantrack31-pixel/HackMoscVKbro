/** Декоративная схема: не имитирует выполнение реального запроса. */
export function SystemActivity() {
  return <div className="system-activity" aria-hidden="true">
    <svg viewBox="0 0 600 700" fill="none" preserveAspectRatio="xMidYMid slice">
      <rect x="64" y="72" width="472" height="556" rx="40" />
      <rect x="88" y="96" width="424" height="508" rx="28" />
      <path d="M64 224H184L232 272H368L416 224H536M64 476H184L232 428H368L416 476H536M300 72V272M300 428V628" />
      <rect className="system-core" x="232" y="272" width="136" height="156" rx="24" />
      <path className="system-signal" d="M64 224H184L232 272H368L416 224H536M300 72V272M64 476H184L232 428H368L416 476H536" />
      {[224, 350, 476].map((y) => <g key={y}><circle cx="64" cy={y} r="4" /><circle cx="536" cy={y} r="4" /></g>)}
      <path d="M268 320H332M268 344H316M268 368H332M268 392H300" />
    </svg>
  </div>;
}
