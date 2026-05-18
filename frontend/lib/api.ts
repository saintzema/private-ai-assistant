import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from "axios";
import { getToken, getRefreshToken, setToken, setRefreshToken, clearTokens } from "./auth";
import type {
  User,
  Workspace,
  Membership,
  Document,
  Chat,
  Message,
  ApiKey,
  Subscription,
  UsageStats,
  AdminStats,
  PaginatedResponse,
  AuthTokens,
  LoginRequest,
  RegisterRequest,
  InviteMemberRequest,
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
  CreateChatRequest,
  SendMessageRequest,
  CreateApiKeyRequest,
  Role,
} from "@/types";

// ─── API Client setup ─────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export class ApiError extends Error {
  status: number;
  detail: string;
  errors?: Record<string, string[]>;

  constructor(message: string, status: number, detail?: string, errors?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail || message;
    this.errors = errors;
  }
}

let isRefreshing = false;
let failedQueue: Array<{ resolve: (value: unknown) => void; reject: (reason?: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor: inject auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle token refresh on 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        isRefreshing = false;
        clearTokens();
        if (typeof window !== "undefined") {
          window.location.href = "/auth/login";
        }
        return Promise.reject(error);
      }

      try {
        const response = await axios.post<AuthTokens>(`${BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });
        const { access_token, refresh_token: newRefreshToken } = response.data;
        setToken(access_token);
        setRefreshToken(newRefreshToken);
        processQueue(null, access_token);
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearTokens();
        if (typeof window !== "undefined") {
          window.location.href = "/auth/login";
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Transform error to ApiError
    if (error.response) {
      const data = error.response.data as Record<string, unknown>;
      throw new ApiError(
        (data?.detail as string) || error.message,
        error.response.status,
        data?.detail as string,
        data?.errors as Record<string, string[]>
      );
    }

    throw new ApiError(error.message || "Network error", 0);
  }
);

// ─── Auth API ─────────────────────────────────────────────────────────────────

export const authApi = {
  login: async (data: LoginRequest): Promise<AuthTokens> => {
    // Backend expects JSON: { email, password }
    const response = await apiClient.post<AuthTokens>("/auth/login", {
      email: data.email,
      password: data.password,
    });
    return response.data;
  },

  register: async (data: RegisterRequest): Promise<User> => {
    const response = await apiClient.post<User>("/auth/register", data);
    return response.data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post("/auth/logout");
    clearTokens();
  },

  refreshToken: async (refreshToken: string): Promise<AuthTokens> => {
    const response = await apiClient.post<AuthTokens>("/auth/refresh", {
      refresh_token: refreshToken,
    });
    return response.data;
  },

  verifyEmail: async (token: string): Promise<void> => {
    await apiClient.post("/auth/verify-email", { token });
  },

  forgotPassword: async (email: string): Promise<void> => {
    await apiClient.post("/auth/forgot-password", { email });
  },

  resetPassword: async (token: string, password: string): Promise<void> => {
    await apiClient.post("/auth/reset-password", { token, password });
  },
};

// ─── Users API ────────────────────────────────────────────────────────────────

export const usersApi = {
  getMe: async (): Promise<User> => {
    const response = await apiClient.get<User>("/users/me");
    return response.data;
  },

  updateProfile: async (data: Partial<Pick<User, "full_name" | "avatar_url">>): Promise<User> => {
    const response = await apiClient.patch<User>("/users/me", data);
    return response.data;
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    await apiClient.post("/users/me/change-password", {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },

  getApiKeys: async (): Promise<ApiKey[]> => {
    const response = await apiClient.get<ApiKey[]>("/users/me/api-keys");
    return response.data;
  },

  createApiKey: async (data: CreateApiKeyRequest): Promise<ApiKey> => {
    const response = await apiClient.post<ApiKey>("/users/me/api-keys", data);
    return response.data;
  },

  deleteApiKey: async (keyId: string): Promise<void> => {
    await apiClient.delete(`/users/me/api-keys/${keyId}`);
  },

  deleteAccount: async (): Promise<void> => {
    await apiClient.delete("/users/me");
  },
};

// ─── Workspaces API ───────────────────────────────────────────────────────────

export const workspacesApi = {
  list: async (): Promise<Workspace[]> => {
    const response = await apiClient.get<Workspace[]>("/workspaces");
    return response.data;
  },

  create: async (data: CreateWorkspaceRequest): Promise<Workspace> => {
    const response = await apiClient.post<Workspace>("/workspaces", data);
    return response.data;
  },

  get: async (workspaceId: string): Promise<Workspace> => {
    const response = await apiClient.get<Workspace>(`/workspaces/${workspaceId}`);
    return response.data;
  },

  update: async (workspaceId: string, data: UpdateWorkspaceRequest): Promise<Workspace> => {
    const response = await apiClient.patch<Workspace>(`/workspaces/${workspaceId}`, data);
    return response.data;
  },

  delete: async (workspaceId: string): Promise<void> => {
    await apiClient.delete(`/workspaces/${workspaceId}`);
  },

  getMembers: async (workspaceId: string): Promise<Membership[]> => {
    const response = await apiClient.get<Membership[]>(`/workspaces/${workspaceId}/members`);
    return response.data;
  },

  inviteMember: async (workspaceId: string, data: InviteMemberRequest): Promise<Membership> => {
    const response = await apiClient.post<Membership>(`/workspaces/${workspaceId}/members/invite`, data);
    return response.data;
  },

  updateRole: async (workspaceId: string, memberId: string, role: Role): Promise<Membership> => {
    const response = await apiClient.patch<Membership>(`/workspaces/${workspaceId}/members/${memberId}`, { role });
    return response.data;
  },

  removeMember: async (workspaceId: string, memberId: string): Promise<void> => {
    await apiClient.delete(`/workspaces/${workspaceId}/members/${memberId}`);
  },

  getStats: async (workspaceId: string): Promise<UsageStats> => {
    const response = await apiClient.get<UsageStats>(`/workspaces/${workspaceId}/stats`);
    return response.data;
  },

  getApiKeys: async (workspaceId: string): Promise<ApiKey[]> => {
    const response = await apiClient.get<ApiKey[]>(`/workspaces/${workspaceId}/api-keys`);
    return response.data;
  },

  createApiKey: async (workspaceId: string, data: CreateApiKeyRequest): Promise<ApiKey> => {
    const response = await apiClient.post<ApiKey>(`/workspaces/${workspaceId}/api-keys`, data);
    return response.data;
  },

  deleteApiKey: async (workspaceId: string, keyId: string): Promise<void> => {
    await apiClient.delete(`/workspaces/${workspaceId}/api-keys/${keyId}`);
  },
};

// ─── Documents API ────────────────────────────────────────────────────────────

export const documentsApi = {
  list: async (
    workspaceId: string,
    params?: { page?: number; page_size?: number; search?: string; status?: string }
  ): Promise<PaginatedResponse<Document>> => {
    const response = await apiClient.get<PaginatedResponse<Document>>(
      `/workspaces/${workspaceId}/documents`,
      { params }
    );
    return response.data;
  },

  upload: async (
    workspaceId: string,
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<Document> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await apiClient.post<Document>(
      `/workspaces/${workspaceId}/documents/upload`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => {
          if (event.total) {
            onProgress?.(Math.round((event.loaded / event.total) * 100));
          }
        },
      }
    );
    return response.data;
  },

  get: async (workspaceId: string, documentId: string): Promise<Document> => {
    const response = await apiClient.get<Document>(`/workspaces/${workspaceId}/documents/${documentId}`);
    return response.data;
  },

  delete: async (workspaceId: string, documentId: string): Promise<void> => {
    await apiClient.delete(`/workspaces/${workspaceId}/documents/${documentId}`);
  },

  reprocess: async (workspaceId: string, documentId: string): Promise<Document> => {
    const response = await apiClient.post<Document>(
      `/workspaces/${workspaceId}/documents/${documentId}/reprocess`
    );
    return response.data;
  },
};

// ─── Chats API ────────────────────────────────────────────────────────────────

export const chatsApi = {
  list: async (workspaceId: string): Promise<Chat[]> => {
    const response = await apiClient.get<Chat[]>(`/workspaces/${workspaceId}/chats`);
    return response.data;
  },

  create: async (data: CreateChatRequest): Promise<Chat> => {
    const response = await apiClient.post<Chat>(`/workspaces/${data.workspace_id}/chats`, data);
    return response.data;
  },

  get: async (workspaceId: string, chatId: string): Promise<Chat> => {
    const response = await apiClient.get<Chat>(`/workspaces/${workspaceId}/chats/${chatId}`);
    return response.data;
  },

  delete: async (workspaceId: string, chatId: string): Promise<void> => {
    await apiClient.delete(`/workspaces/${workspaceId}/chats/${chatId}`);
  },

  getMessages: async (workspaceId: string, chatId: string): Promise<Message[]> => {
    const response = await apiClient.get<Message[]>(
      `/workspaces/${workspaceId}/chats/${chatId}/messages`
    );
    return response.data;
  },

  sendMessage: async (
    workspaceId: string,
    chatId: string,
    data: SendMessageRequest
  ): Promise<Message> => {
    // Backend expects { message, stream, top_k_docs } — SSE endpoint returns streaming
    const response = await apiClient.post<Message>(
      `/workspaces/${workspaceId}/chats/${chatId}/messages`,
      { message: data.content, stream: data.stream ?? true }
    );
    return response.data;
  },

  // SSE streaming — use fetch directly (axios doesn't support SSE well)
  streamMessage: (
    workspaceId: string,
    chatId: string,
    message: string,
    onToken: (token: string) => void,
    onSources: (sources: unknown[]) => void,
    onDone: (messageId?: string) => void,
    onError: (err: string) => void
  ): (() => void) => {
    const token = getToken();
    const controller = new AbortController();

    fetch(`${BASE_URL}/workspaces/${workspaceId}/chats/${chatId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ message, stream: true }),
      signal: controller.signal,
    }).then(async (res) => {
      if (!res.ok || !res.body) {
        onError("Failed to connect to AI service");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "token") onToken(data.content ?? "");
              else if (data.type === "sources") onSources(data.sources ?? []);
              else if (data.type === "done") onDone(data.message_id);
              else if (data.type === "error") onError(data.detail ?? "Unknown error");
            } catch { /* skip malformed lines */ }
          }
        }
      }
    }).catch((err: Error) => {
      if (err.name !== "AbortError") onError(err.message);
    });

    return () => controller.abort();
  },

  // Returns an EventSource-compatible URL for SSE streaming
  getStreamUrl: (workspaceId: string, chatId: string): string => {
    const token = getToken();
    return `${BASE_URL}/workspaces/${workspaceId}/chats/${chatId}/stream?token=${token}`;
  },
};

// ─── Subscriptions API ────────────────────────────────────────────────────────

export const subscriptionsApi = {
  get: async (workspaceId: string): Promise<Subscription> => {
    const response = await apiClient.get<Subscription>(`/workspaces/${workspaceId}/subscription`);
    return response.data;
  },

  getUsage: async (workspaceId: string): Promise<UsageStats> => {
    const response = await apiClient.get<UsageStats>(`/workspaces/${workspaceId}/subscription/usage`);
    return response.data;
  },

  checkEntitlement: async (workspaceId: string, feature: string): Promise<boolean> => {
    const response = await apiClient.get<{ entitled: boolean }>(
      `/workspaces/${workspaceId}/subscription/entitlement/${feature}`
    );
    return response.data.entitled;
  },

  createCheckoutSession: async (workspaceId: string, plan: string): Promise<{ url: string }> => {
    const response = await apiClient.post<{ url: string }>(
      `/workspaces/${workspaceId}/subscription/checkout`,
      { plan }
    );
    return response.data;
  },
};

// ─── Admin API ────────────────────────────────────────────────────────────────

export const adminApi = {
  getStats: async (): Promise<AdminStats> => {
    const response = await apiClient.get<AdminStats>("/admin/stats");
    return response.data;
  },

  getUsers: async (params?: {
    page?: number;
    page_size?: number;
    search?: string;
  }): Promise<PaginatedResponse<User>> => {
    const response = await apiClient.get<PaginatedResponse<User>>("/admin/users", { params });
    return response.data;
  },

  getWorkspaces: async (params?: {
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<Workspace>> => {
    const response = await apiClient.get<PaginatedResponse<Workspace>>("/admin/workspaces", { params });
    return response.data;
  },

  deactivateUser: async (userId: string): Promise<User> => {
    const response = await apiClient.patch<User>(`/admin/users/${userId}/deactivate`);
    return response.data;
  },

  activateUser: async (userId: string): Promise<User> => {
    const response = await apiClient.patch<User>(`/admin/users/${userId}/activate`);
    return response.data;
  },
};

// ─── Marketplace API ──────────────────────────────────────────────────────────

export const marketplaceApi = {
  resolveToken: async (token: string): Promise<{ customer_id: string; product_code: string; email?: string }> => {
    const response = await apiClient.post("/marketplace/resolve", { token });
    return response.data as { customer_id: string; product_code: string; email?: string };
  },
};
