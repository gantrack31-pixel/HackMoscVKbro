import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./components/ThemeToggle";
// Keep the existing cascade stable when route chunks load in a different order.
import "./styles/modal-modern.css";
import "./styles/presentation-viewer.css";
import "./styles/navigation-modern.css";
import "./styles/wizard-modern.css";
import "./styles/slide-fields.css";
import "./styles/presentation-assistant.css";
import "./styles/requirements.css";
import "./styles/editor-polish.css";
import "./styles/profile-polish.css";
import "./styles/yandex-polish.css";
import "./styles/base.css";
import "./styles/workspace-foundations.css";
import "./styles/workspace-creation.css";
import "./styles/workspace-pages.css";
import "./styles/workspace-responsive.css";
import "./styles/app.css";
import "./styles/auth.css";
import "./styles/polish.css";
import "./styles/refinements.css";
import "./styles/experience.css";
import "./styles/system.css";
import "./styles/entry.css";
import "./styles/finishing.css";
import "./styles/nav-motion.css";
import "./styles/spatial.css";
import "./styles/interface-motion.css";
import "./styles/home-actions.css";
import "./styles/catalog-motion.css";
import "./styles/library-empty-state.css";
import "./styles/copy-polish.css";
import "./styles/support-modern.css";
import "./styles/requirements-page.css";
import "./styles/editor-studio.css";
import "./styles/audit-studio.css";
import "./styles/analysis-studio.css";
import "./styles/mascot.css";
import "./styles/slide-layout.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
