import type { AuthResult, User } from "../types";
import { request, json, setCsrf } from "./client";

export const authApi = {
  updateProfile: (data: {
    first_name: string;
    last_name: string;
    avatar_color: string;
  }) => request<User>("/auth/profile", json("PUT", data)),
  profileStats: () =>
    request<{ projects: number; favorites: number; templates: number }>(
      "/auth/profile/stats",
    ),
  uploadAvatar: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<User>("/auth/avatar", { method: "POST", body });
  },
  removeAvatar: () => request<User>("/auth/avatar", { method: "DELETE" }),
  linkYandex: () =>
    request<{ url: string }>("/auth/yandex/link", { method: "POST" }),
  me: async () => {
    const result = await request<AuthResult>("/auth/me");
    setCsrf(result.csrf);
    return result;
  },
  login: async (email: string, password: string) => {
    const result = await request<AuthResult>(
      "/auth/login",
      json("POST", { email, password }),
    );
    setCsrf(result.csrf);
    return result;
  },
  register: async (data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
  }): Promise<
    | AuthResult
    | {
        verification_required: true;
        email: string;
        delivery_pending?: boolean;
        delivery_mode?: string;
      }
  > => {
    const result = await request<
      | AuthResult
      | {
          verification_required: true;
          email: string;
          delivery_pending?: boolean;
          delivery_mode?: string;
        }
    >("/auth/register", json("POST", data));
    if (!("verification_required" in result)) setCsrf(result.csrf);
    return result;
  },
  verifyEmail: (token: string) =>
    request<{ verified: boolean }>(
      "/auth/verify-email",
      json("POST", { token }),
    ),
  resendVerification: (email: string) =>
    request<{ ok: boolean; delivery_mode?: string }>(
      "/auth/verification/resend",
      json("POST", { email }),
    ),
  requestPasswordReset: (email: string) =>
    request<{ ok: boolean }>(
      "/auth/password-reset/request",
      json("POST", { email }),
    ),
  confirmPasswordReset: (token: string, password: string) =>
    request<{ reset: boolean }>(
      "/auth/password-reset/confirm",
      json("POST", { token, password }),
    ),
  logout: async () => {
    await request<void>("/auth/logout", { method: "POST" });
    setCsrf("");
  },
};
