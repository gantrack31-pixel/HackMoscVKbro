import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "./Icon";

type Theme = "light" | "dark";
const ThemeContext = createContext({
  theme: "light" as Theme,
  toggle: () => {},
});
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("deckly-theme");
    } catch {
      /* Хранилище может быть отключено. */
    }
    const initial = saved === "dark" || saved === "light" ? saved : "light";
    return initial;
  });
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === "deckly-theme" || event.key === null)
        setTheme(event.newValue === "dark" ? "dark" : "light");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("deckly-theme", next);
    } catch {
      /* Тема работает и без сохранения. */
    }
    setTheme(next);
  }
  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function ThemeToggle() {
  const { theme, toggle } = useContext(ThemeContext);
  const [revision, setRevision] = useState(0);
  return (
    <button
      type="button"
      className="theme-toggle"
      data-nav="theme"
      data-target-theme={theme === "light" ? "dark" : "light"}
      onClick={() => {
        setRevision((value) => value + 1);
        toggle();
      }}
      aria-label={
        theme === "light" ? "Включить тёмную тему" : "Включить светлую тему"
      }
      title={theme === "light" ? "Тёмная тема" : "Светлая тема"}
    >
      <Icon
        name={theme === "light" ? "ui-dark-theme" : "ui-light-theme"}
        size={20}
        key={revision}
        className={revision ? "nav-motion" : ""}
      />
    </button>
  );
}
