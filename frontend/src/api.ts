import { authApi } from "./api/auth";
import { generationApi } from "./api/generation";
import { integrationsApi } from "./api/integrations";
import { projectsApi } from "./api/projects";
import { templatesApi } from "./api/templates";
import { supportApi } from "./api/support";

export type { AiOptions } from "./api/client";

export const api = {
  ...authApi,
  ...generationApi,
  ...integrationsApi,
  ...projectsApi,
  ...templatesApi,
  ...supportApi,
};
