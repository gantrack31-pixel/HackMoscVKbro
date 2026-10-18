import type {
  CloudStatus,
  DiskStatus,
  DiskReceipt,
  CloudReceipt,
  Project,
} from "../types";
import { request } from "./client";

export const integrationsApi = {
  cloudStatus: () => request<CloudStatus>("/cloud/status"),
  diskStatus: () => request<DiskStatus>("/disk/status"),
  diskFiles: () => request<DiskReceipt[]>("/disk/files"),
  connectDisk: () =>
    request<{ url: string }>("/disk/connect", { method: "POST" }),
  saveDisk: (id: string) =>
    request<DiskReceipt>(`/projects/${id}/disk`, { method: "POST" }),
  cloudProjects: () => request<CloudReceipt[]>("/cloud/projects"),
  saveCloud: (id: string) =>
    request<CloudReceipt>(`/projects/${id}/cloud`, { method: "POST" }),
  restoreCloud: (id: string) =>
    request<Project>(`/cloud/projects/${id}/restore`, { method: "POST" }),
};
