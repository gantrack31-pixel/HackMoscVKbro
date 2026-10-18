import type { Route } from "../types";

export const routes: Route[] = [
  "requirements",
  "home",
  "templates",
  "favorites",
  "projects",
  "create",
  "editor",
  "audit",
  "demo",
  "support",
  "profile",
  "finish",
];
export function readRoute(): Route {
  const value = location.hash.slice(1).split("?")[0] as Route;
  return routes.includes(value) ? value : "home";
}
