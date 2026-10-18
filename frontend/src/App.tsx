import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "./api";
import { AuthScreen } from "./pages/AuthScreen";
import { EmailVerification, PasswordReset } from "./pages/AuthRecovery";
import { YandexAuth } from "./pages/YandexAuth";
import type { User } from "./types";

const Workspace = lazy(() =>
  import("./pages/Workspace").then((module) => ({ default: module.Workspace })),
);

function recoveryTokens() {
  const params = new URLSearchParams(location.hash.slice(1));
  return {
    passwordResetToken: params.get("reset-password"),
    verificationToken: params.get("verify-email"),
  };
}

function BootScreen() {
  return (
    <div className="boot-screen">
      Deckly<span>.Ai</span>
      <p>Готовим пространство для вашей истории…</p>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const [{ passwordResetToken, verificationToken }, setTokens] =
    useState(recoveryTokens);
  useEffect(() => {
    let active = true;
    api
      .me()
      .then((r) => {
        if (active) setUser(r.user);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    const expired = () => {
      active = false;
      setUser(null);
      setReady(true);
    };
    window.addEventListener("session-expired", expired);
    return () => {
      active = false;
      window.removeEventListener("session-expired", expired);
    };
  }, []);
  useEffect(() => {
    const hashHandler = () => {
      const next = recoveryTokens();
      setTokens((previous) =>
        previous.passwordResetToken === next.passwordResetToken &&
        previous.verificationToken === next.verificationToken
          ? previous
          : next,
      );
    };
    window.addEventListener("hashchange", hashHandler);
    return () => {
      window.removeEventListener("hashchange", hashHandler);
    };
  }, []);
  if (location.pathname.replace(/\/$/, "") === "/auth/yandex")
    return <YandexAuth />;
  if (verificationToken)
    return (
      <EmailVerification
        token={verificationToken}
        onComplete={() => {
          location.reload();
        }}
      />
    );
  if (passwordResetToken) return <PasswordReset token={passwordResetToken} />;
  if (!ready) return <BootScreen />;
  if (!user)
    return (
      <AuthScreen
        error={error}
        onUser={(u) => {
          setUser(u);
          location.hash = "home";
        }}
      />
    );
  return (
    <Suspense fallback={<BootScreen />}>
      <Workspace
        key={user.id}
        user={user}
        onUser={setUser}
        onLogout={async () => {
          await api.logout();
          localStorage.removeItem("deckly-active-project");
          setUser(null);
          location.hash = "home";
        }}
      />
    </Suspense>
  );
}
