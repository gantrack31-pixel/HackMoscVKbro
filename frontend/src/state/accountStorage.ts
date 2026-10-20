export const accountKey = (account: string, name: string) =>
  `deckly:${encodeURIComponent(account)}:${name}`;

// A duplicated browser tab copies sessionStorage. Recovery ownership must be
// created by this document, not inherited from that copied session.
const documentId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let revision = 0;
const ownedCopies = new Map<string, {key: string; shared: boolean}>();
const isDraft = (name: string) => name.startsWith("wizard-") || name.startsWith("editor-draft:") || name.startsWith("audit-draft:");
const maxRecoveryCopies = 8;
type RecoveryCopy = {version: 1; savedAt: number; value: unknown};

function draftIdentity(value: unknown): string {
  // Wizard timestamps change on reload even when the working content does not.
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const {savedAt: _savedAt, ...content} = value as Record<string, unknown>;
    return JSON.stringify(content);
  }
  return JSON.stringify(value);
}
function recoveryCopies(key: string): {key: string; copy: RecoveryCopy}[] {
  const found: {key: string; copy: RecoveryCopy}[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const candidate = localStorage.key(i);
    if (!candidate?.startsWith(`${key}:recovery:`)) continue;
    try {
      const copy = JSON.parse(localStorage.getItem(candidate) || "null") as RecoveryCopy | null;
      if (copy?.version === 1 && typeof copy.savedAt === "number" && copy.value != null) found.push({key: candidate, copy});
    } catch { /* An incomplete record cannot replace a valid working draft. */ }
  }
  return found.sort((a,b) => b.copy.savedAt - a.copy.savedAt);
}

// Draft snapshots serialize the whole document, embedded images included, and
// rescan every recovery copy. Typing coalesces into one write per pause; any
// read or explicit write of the same key settles the pending one first.
type DeferredWrite = {timer: ReturnType<typeof setTimeout>; since: number; run: () => void};
const deferred = new Map<string, DeferredWrite>();
const deferDelay = 400, deferMaxWait = 2000;
function settleDeferred(key: string, run: boolean) {
  const item = deferred.get(key);
  if (!item) return;
  deferred.delete(key);
  clearTimeout(item.timer);
  if (run) item.run();
}
export function flushDeferredWrites() {
  for (const key of [...deferred.keys()]) settleDeferred(key, true);
}
if (typeof addEventListener === "function" && typeof document !== "undefined") {
  addEventListener("pagehide", flushDeferredWrites);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushDeferredWrites();
  });
}

export function writeAccountDeferred(account: string, name: string, value: unknown, onResult?: (saved: boolean) => void) {
  const key = accountKey(account, name);
  const since = deferred.get(key)?.since ?? Date.now();
  settleDeferred(key, false);
  const wait = Math.max(0, Math.min(deferDelay, since + deferMaxWait - Date.now()));
  deferred.set(key, {
    since,
    run: () => {
      const saved = writeAccount(account, name, value);
      onResult?.(saved);
    },
    timer: setTimeout(() => settleDeferred(key, true), wait),
  });
}

export function readAccount<T>(account: string, name: string): T | null {
  const key = accountKey(account, name);
  settleDeferred(key, true);
  try {
    if (!isDraft(name)) return JSON.parse(localStorage.getItem(key) || "null");
    // Each tab owns its working draft. The literal null is a deliberate clear,
    // so reopening the editor does not resurrect another tab's older draft.
    try {
      const working = sessionStorage.getItem(key);
      if (working !== null) return JSON.parse(working);
    } catch { /* Durable recovery is still possible when session storage fails. */ }
    const legacy = localStorage.getItem(key);
    const value = legacy ? JSON.parse(legacy) : recoveryCopies(key)[0]?.copy.value ?? null;
    if (value !== null) {
      try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Caller shows a save warning on the next write. */ }
      if (legacy && writeAccount(account, name, value)) localStorage.removeItem(key);
    }
    return value as T | null;
  } catch { return null; }
}

export function writeAccount(account: string, name: string, value: unknown): boolean {
  try {
    const key = accountKey(account, name);
    settleDeferred(key, false);
    if (!isDraft(name)) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
      return true;
    }
    let workingSaved = false;
    try { sessionStorage.setItem(key, JSON.stringify(value)); workingSaved = true; } catch { /* Keep attempting the durable copy. */ }
    const previous = ownedCopies.get(key);
    if (value === null) {
      if (!workingSaved) return false;
      if (previous && !previous.shared) localStorage.removeItem(previous.key);
      ownedCopies.delete(key);
      return true;
    }
    const copies = recoveryCopies(key);
    const identity = draftIdentity(value);
    const identical = copies.filter(item => draftIdentity(item.copy.value) === identity);
    // Keep other tabs' distinct unsaved drafts. Identical content may share a
    // durable recovery snapshot; repeated refreshes must not consume the bound.
    if (copies.filter(item => !(item.key === previous?.key && !previous.shared) && !identical.includes(item)).length >= maxRecoveryCopies) return false;
    // Immutable revision keys ensure another tab cannot replace a snapshot
    // between our comparison and removal of an identical older copy.
    const own = `${key}:recovery:${documentId}:${++revision}`;
    localStorage.setItem(own, JSON.stringify({version: 1, savedAt: Date.now(), value} satisfies RecoveryCopy));
    ownedCopies.set(key, {key: own, shared: identical.some(item => item.key !== previous?.key) || Boolean(previous?.shared && identical.some(item => item.key === previous.key))});
    if (previous && !previous.shared) localStorage.removeItem(previous.key);
    for (const item of identical) localStorage.removeItem(item.key);
    return true;
  } catch { return false; }
}
