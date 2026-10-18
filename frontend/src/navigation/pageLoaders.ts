import type { Route } from "../types";

const catalog = () =>
  import("../pages/Catalog").then((module) => ({ default: module.Catalog }));

// React.lazy and intent prefetch share these imports; importing never mounts a page.
export const pageLoaders = {
  home: () =>
    import("../pages/Home").then((module) => ({ default: module.Home })),
  templates: catalog,
  favorites: catalog,
  projects: () =>
    import("../pages/Projects").then((module) => ({
      default: module.Projects,
    })),
  create: () =>
    import("../pages/Wizard").then((module) => ({ default: module.Wizard })),
  editor: () =>
    import("../pages/Editor").then((module) => ({ default: module.Editor })),
  audit: () =>
    import("../pages/Audit").then((module) => ({ default: module.Audit })),
  finish: () =>
    import("../pages/Finish").then((module) => ({ default: module.Finish })),
  demo: () =>
    import("../pages/Demo").then((module) => ({ default: module.Demo })),
  support: () =>
    import("../pages/Support").then((module) => ({ default: module.Support })),
  profile: () =>
    import("../pages/Profile").then((module) => ({ default: module.Profile })),
  requirements: () =>
    import("../pages/Requirements").then((module) => ({
      default: module.Requirements,
    })),
};

export function prefetchPage(route: Route) {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (
    connection?.saveData ||
    ["slow-2g", "2g"].includes(connection?.effectiveType || "")
  )
    return;
  // A speculative failure must not affect the current page or show an error banner.
  void pageLoaders[route]().catch(() => {});
}
