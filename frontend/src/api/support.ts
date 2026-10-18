import { request, json } from "./client";

export const supportApi = {
  supportMessage: (email: string, message: string) =>
    request<{ sent: boolean }>(
      "/support/messages",
      json("POST", { email, message }),
    ),
};
