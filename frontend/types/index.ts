// ─── Enums ────────────────────────────────────────────────────────────────────

export enum Plan {
  Free = "free",
  Pro = "pro",
  Enterprise = "enterprise",
}

export enum Role {
  Owner = "owner",
  Admin = "admin",
  Member = "member",
  Viewer = "viewer",
}

export enum MessageRole {
  User = "user",
  Assistant = "assistant",
  System = "system",
}

export enum DocumentStatus {
  Pending = "pending",
  Processing = "processing",
  Ready = "ready",
  Failed = "failed",
}

export enum FileType {
  PDF = "pdf",
  DOCX = "docx",
  TXT = "txt",
  CSV = "csv",
  XLSX = "xlsx",
  MD = "md",
  PPTX = "pptx",
  HTML = "html",
}

// ─── Core Entities ─────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
  plan: Plan;
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  logo_url?: string;
  slug: string;
  plan: Plan;
  owner_id: string;
  member_count: number;
  document_count: number;
  chat_count: number;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: string;
  workspace_id: string;
  user_id: string;
  role: Role;
  user: User;
  workspace?: Workspace;
  invited_by?: string;
  joined_at: string;
}

export interface Document {
  id: string;
  workspace_id: string;
  name: string;
  file_type: FileType;
  file_size_bytes: number;
  status: DocumentStatus;
  chunk_count: number;
  error_message?: string;
  uploaded_by: string;
  uploader?: Pick<User, "id" | "full_name" | "avatar_url">;
  s3_key?: string;
  download_url?: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  metadata: Record<string, unknown>;
  embedding_model?: string;
  created_at: string;
}

export interface Source {
  document_id: string;
  document_name: string;
  chunk_id: string;
  content: string;
  relevance_score: number;
  page_number?: number;
}

export interface Message {
  id: string;
  chat_id: string;
  role: MessageRole;
  content: string;
  sources?: Source[];
  tokens_used?: number;
  model?: string;
  created_at: string;
}

export interface Chat {
  id: string;
  workspace_id: string;
  user_id: string;
  title: string;
  message_count: number;
  last_message_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  workspace_id?: string;
  name: string;
  key_prefix: string;
  key?: string; // Only returned on creation
  last_used_at?: string;
  created_by: string;
  created_at: string;
  expires_at?: string;
}

export interface Subscription {
  id: string;
  workspace_id: string;
  plan: Plan;
  status: "active" | "inactive" | "trialing" | "canceled" | "past_due";
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  aws_customer_id?: string;
  stripe_subscription_id?: string;
  created_at: string;
}

export interface UsageStats {
  workspace_id: string;
  period_start: string;
  period_end: string;
  documents_processed: number;
  documents_limit: number;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  api_calls: number;
  api_calls_limit: number;
  tokens_used: number;
  tokens_limit: number;
  members_count: number;
  members_limit: number;
}

// ─── Admin types ───────────────────────────────────────────────────────────────

export interface AdminStats {
  total_users: number;
  total_workspaces: number;
  total_documents: number;
  total_chats: number;
  total_tokens_used: number;
  active_users_30d: number;
  new_users_7d: number;
  revenue_mtd?: number;
}

// ─── API Response types ────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ApiErrorResponse {
  detail: string;
  status_code: number;
  errors?: Record<string, string[]>;
}

// ─── Auth types ────────────────────────────────────────────────────────────────

export interface TokenPayload {
  sub: string; // user id
  email: string;
  is_superuser: boolean;
  exp: number;
  iat: number;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
}

// ─── Form types ────────────────────────────────────────────────────────────────

export interface InviteMemberRequest {
  email: string;
  role: Role;
}

export interface CreateWorkspaceRequest {
  name: string;
  description?: string;
}

export interface UpdateWorkspaceRequest {
  name?: string;
  description?: string;
  logo_url?: string;
}

export interface CreateChatRequest {
  workspace_id: string;
  title?: string;
}

export interface SendMessageRequest {
  content: string;
  stream?: boolean;
}

export interface CreateApiKeyRequest {
  name: string;
  expires_at?: string;
}

// ─── UI State types ────────────────────────────────────────────────────────────

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  description?: string;
  duration?: number;
}

export interface UploadProgress {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "complete" | "error";
  error?: string;
  documentId?: string;
}

// ─── Marketplace types ────────────────────────────────────────────────────────

export interface MarketplaceResolution {
  customer_id: string;
  product_code: string;
  email?: string;
  plan?: Plan;
}

// ─── Activity / Feed types ────────────────────────────────────────────────────

export interface ActivityItem {
  id: string;
  type: "chat" | "document" | "member" | "workspace";
  title: string;
  description?: string;
  workspace_id?: string;
  workspace_name?: string;
  created_at: string;
  user?: Pick<User, "id" | "full_name" | "avatar_url">;
}
