export interface ProjectInfo {
  id: string;
  name: string;
  description: string | null;
  file_path: string;
  created_at: string;
}

export interface DocumentOut {
  id: string;
  name: string;
  doc_type: string;
  page_count: number | null;
  content_length: number | null;
  created_at: string;
}

export interface DocumentContent {
  id: string;
  name: string;
  doc_type: string;
  content: string | null;
  page_count: number | null;
  total_length: number | null;
}

export interface CodeNode {
  id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  color: string;
  sort_order: number;
  children: CodeNode[];
}

export interface CodingOut {
  id: string;
  excerpt_id: string;
  document_id: string;
  document_name?: string | null;
  code_id: string;
  code_name: string;
  code_color: string;
  start_pos: number;
  end_pos: number;
  page_number: number | null;
  text: string | null;
  created_by: string;
  created_at: string;
}

export interface EntityLinkData {
  target_type: 'document' | 'excerpt' | 'code' | 'coding' | 'memo';
  target_id: string;
}

export interface CodeGroupOut {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  code_ids: string[];
}

export interface MemoOut {
  id: string;
  title: string | null;
  content: string;
  memo_type: string;
  links: EntityLinkData[];
  created_at: string;
  updated_at: string;
}

export interface AiSuggestionOut {
  id: string;
  excerpt_id: string;
  excerpt_text: string;
  document_name: string | null;
  code_id: string | null;
  code_name: string | null;
  suggested_code_name: string | null;
  confidence: number | null;
  model_name: string;
  rationale: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  reviewed_at: string | null;
  created_at: string;
}

export interface AiSuggestionsStats {
  pending: number;
  accepted: number;
  rejected: number;
  total: number;
}

export interface LlmProviderOut {
  id: string;
  label: string;
  transport: string;
  available: boolean;
  detail: string | null;
}

export interface LlmProvidersResponse {
  default_provider: string;
  providers: LlmProviderOut[];
}

export interface ThemeOut {
  theme_name: string;
  description: string;
  related_codes: string[];
  evidence_summary: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionOut {
  document_id: string;
  text: string;
  segments: TranscriptSegment[];
  language: string;
  duration: number;
}

export interface WhisperStatus {
  available: boolean;
  message: string;
}

// Search (KWIC)
export interface KwicResult {
  document_id: string;
  document_name: string;
  match_text: string;
  context_before: string;
  context_after: string;
  start_pos: number;
  end_pos: number;
}

export interface SearchResponse {
  query: string;
  total: number;
  results: KwicResult[];
}

// Code Relationships
export interface RelationshipOut {
  id: string;
  project_id: string;
  source_code_id: string;
  target_code_id: string;
  source_code_name: string;
  target_code_name: string;
  source_code_color: string;
  target_code_color: string;
  rel_type: string;
  rel_label_display: string;
  label: string | null;
  created_at: string;
}

// Tags
export interface TagOut {
  id: string;
  name: string;
  color: string | null;
  tag_type: string;
}

export interface EntityTagOut {
  tag_id: string;
  tag_name: string;
  tag_color: string | null;
  entity_type: string;
  entity_id: string;
}

// Case Attributes
export interface CaseAttributeOut {
  id: string;
  document_id: string;
  document_name: string;
  attr_name: string;
  attr_value: string | null;
  attr_type: string;
}

// Snapshots
export interface SnapshotOut {
  id: string;
  project_id: string;
  label: string;
  description: string | null;
  created_at: string;
  n_codes: number;
  n_codings: number;
  n_memos: number;
}

// Embeddings
export interface EmbedStatus {
  ollama_available: boolean;
  model: string;
  embedded_documents: number;
  total_segments: number;
}

export interface SimilarSegment {
  id: string;
  document_id: string;
  document_name: string;
  chunk_text: string;
  start_pos: number | null;
  end_pos: number | null;
  score: number;
}

export interface ReportRequest {
  document_ids: string[];
  code_ids: string[];
  include_memos: boolean;
  include_relationships: boolean;
  include_case_attributes: boolean;
  co_occurrence_level: 'excerpt' | 'document';
  max_co_occurrences: number;
  max_relationship_evidence: number;
}

export interface ReportPreview {
  title: string;
  generated_at: string;
  summary: {
    documents: number;
    codes: number;
    codings: number;
    memos: number;
    relationships: number;
    co_occurrences: number;
  };
  markdown: string;
  csv_files: string[];
}
