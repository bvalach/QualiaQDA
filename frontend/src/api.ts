import axios from 'axios';
import type {
  ProjectInfo,
  DocumentOut,
  DocumentContent,
  CodeNode,
  CodeGroupOut,
  CodingOut,
  MemoOut,
  EntityLinkData,
  AiSuggestionOut,
  AiSuggestionsStats,
  LlmProvidersResponse,
  ThemeOut,
  TranscriptionOut,
  TranscriptSegment,
  WhisperStatus,
  SearchResponse,
  RelationshipOut,
  TagOut,
  EntityTagOut,
  CaseAttributeOut,
  SnapshotOut,
  EmbedStatus,
  SimilarSegment,
  ReportRequest,
  ReportPreview,
} from './types';

const api = axios.create({ baseURL: '/api' });

// Projects
export const listProjects = () => api.get<ProjectInfo[]>('/projects/').then((r) => r.data);
export const createProject = (name: string, description?: string) =>
  api.post<ProjectInfo>('/projects/', { name, description }).then((r) => r.data);
export const openProject = (file_path: string) =>
  api.post<ProjectInfo>('/projects/open', { file_path }).then((r) => r.data);
export const deleteProject = (id: string) => api.delete(`/projects/${id}`);

// Documents
export const listDocuments = () => api.get<DocumentOut[]>('/documents/').then((r) => r.data);
export const uploadDocument = (file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post<DocumentOut>('/documents/upload', fd).then((r) => r.data);
};
export const getDocument = (id: string, page?: number) =>
  api
    .get<DocumentContent>(`/documents/${id}`, { params: page ? { page } : {} })
    .then((r) => r.data);
export const deleteDocument = (id: string) => api.delete(`/documents/${id}`);

// Codes
export const listCodes = () => api.get<CodeNode[]>('/codes/').then((r) => r.data);
export const listCodesFlat = () => api.get<CodeNode[]>('/codes/flat').then((r) => r.data);
export const createCode = (data: {
  name: string;
  parent_id?: string;
  color?: string;
  description?: string;
}) => api.post<CodeNode>('/codes/', data).then((r) => r.data);
export const updateCode = (
  id: string,
  data: { name?: string; parent_id?: string; color?: string; sort_order?: number }
) => api.put<CodeNode>(`/codes/${id}`, data).then((r) => r.data);
export const deleteCode = (id: string) => api.delete(`/codes/${id}`);

// Code Groups
export const listCodeGroups = () => api.get<CodeGroupOut[]>('/codes/groups').then((r) => r.data);
export const createCodeGroup = (data: { name: string; description?: string; color?: string }) =>
  api.post<CodeGroupOut>('/codes/groups', data).then((r) => r.data);
export const updateCodeGroup = (
  groupId: string,
  data: { name?: string; description?: string; color?: string }
) => api.put<CodeGroupOut>(`/codes/groups/${groupId}`, data).then((r) => r.data);
export const deleteCodeGroup = (groupId: string) => api.delete(`/codes/groups/${groupId}`);
export const addCodeToGroup = (groupId: string, codeId: string) =>
  api.post(`/codes/groups/${groupId}/codes/${codeId}`);
export const removeCodeFromGroup = (groupId: string, codeId: string) =>
  api.delete(`/codes/groups/${groupId}/codes/${codeId}`);

// Codings (API creates excerpts automatically)
export const getCodingsForDocument = (docId: string) =>
  api.get<CodingOut[]>(`/codings/document/${docId}`).then((r) => r.data);
export const createCoding = (data: {
  document_id: string;
  code_id: string;
  start_pos: number;
  end_pos: number;
  text?: string;
  page_number?: number;
}) => api.post<CodingOut>('/codings/', data).then((r) => r.data);
export const deleteCoding = (id: string) => api.delete(`/codings/${id}`);
export const getCodingsForCode = (codeId: string) =>
  api.get<CodingOut[]>(`/codings/code/${codeId}`).then((r) => r.data);

// Memos (with entity_links)
export const listMemos = (memo_type?: string) =>
  api.get<MemoOut[]>('/memos/', { params: memo_type ? { memo_type } : {} }).then((r) => r.data);
export const createMemo = (data: {
  title?: string;
  content: string;
  memo_type?: string;
  links?: EntityLinkData[];
}) => api.post<MemoOut>('/memos/', data).then((r) => r.data);
export const updateMemo = (
  id: string,
  data: { title?: string; content?: string; memo_type?: string }
) => api.put<MemoOut>(`/memos/${id}`, data).then((r) => r.data);
export const deleteMemo = (id: string) => api.delete(`/memos/${id}`);
export const addMemoLink = (memoId: string, link: EntityLinkData) =>
  api.post<MemoOut>(`/memos/${memoId}/links`, link).then((r) => r.data);
export const removeMemoLink = (memoId: string, link: EntityLinkData) =>
  api.delete(`/memos/${memoId}/links`, { data: link });

// Export
export const exportUrl = (type: 'codebook' | 'codings' | 'memos') => `/api/export/${type}`;
export const previewReport = (data: ReportRequest) =>
  api.post<ReportPreview>('/export/report/preview', data).then((r) => r.data);
export const downloadReportMarkdown = (data: ReportRequest) =>
  api.post('/export/report/markdown', data, { responseType: 'blob' }).then((r) => r.data as Blob);
export const downloadReportCsvBundle = (data: ReportRequest) =>
  api.post('/export/report/csv-bundle', data, { responseType: 'blob' }).then((r) => r.data as Blob);

// AI Assistance (Layer 3)
export const listAiProviders = () =>
  api.get<LlmProvidersResponse>('/ai/providers').then((r) => r.data);
export const suggestCodesForExcerpt = (excerptId: string, provider?: string) =>
  api
    .post<AiSuggestionOut[]>('/ai/suggest-codes', { excerpt_id: excerptId, provider: provider || null })
    .then((r) => r.data);
export const autoCodeDocument = (docId: string, provider?: string) =>
  api.post<AiSuggestionOut[]>(`/ai/auto-code/${docId}`, { provider: provider || null }).then((r) => r.data);
export const suggestThemes = (provider?: string) =>
  api.post<ThemeOut[]>('/ai/suggest-themes', { provider: provider || null }).then((r) => r.data);
export const listAiSuggestions = (status?: string) =>
  api
    .get<AiSuggestionOut[]>('/ai/suggestions', { params: status ? { status } : {} })
    .then((r) => r.data);
export const aiSuggestionsStats = () =>
  api.get<AiSuggestionsStats>('/ai/suggestions/stats').then((r) => r.data);
export const acceptSuggestion = (id: string) =>
  api.post<AiSuggestionOut>(`/ai/suggestions/${id}/accept`).then((r) => r.data);
export const rejectSuggestion = (id: string) =>
  api.post<AiSuggestionOut>(`/ai/suggestions/${id}/reject`).then((r) => r.data);

// Transcription (Whisper)
export const whisperStatus = () =>
  api.get<WhisperStatus>('/transcription/whisper-status').then((r) => r.data);
export const transcribeDocument = (docId: string, language?: string) =>
  api
    .post<TranscriptionOut>(`/transcription/${docId}`, {
      language: language || null,
      model_size: 'medium',
    })
    .then((r) => r.data);
export const getTranscriptSegments = (docId: string) =>
  api.get<TranscriptSegment[]>(`/transcription/${docId}/segments`).then((r) => r.data);
export const audioFileUrl = (docId: string) => `/api/documents/${docId}/image`;

// Search (KWIC)
export const searchText = (q: string, contextChars = 80, useRegex = false) =>
  api.get<SearchResponse>('/search/text', {
    params: { q, context_chars: contextChars, use_regex: useRegex },
  }).then((r) => r.data);

// Code Relationships
export const listRelationships = () =>
  api.get<RelationshipOut[]>('/relationships/').then((r) => r.data);
export const createRelationship = (data: {
  source_code_id: string;
  target_code_id: string;
  rel_type: string;
  label?: string;
}) => api.post<RelationshipOut>('/relationships/', data).then((r) => r.data);
export const deleteRelationship = (id: string) => api.delete(`/relationships/${id}`);
export const listRelTypes = () =>
  api.get<{ types: string[]; labels: Record<string, string> }>('/relationships/types').then((r) => r.data);

// Tags
export const listTags = () => api.get<TagOut[]>('/tags/').then((r) => r.data);
export const createTag = (data: { name: string; color?: string; tag_type?: string }) =>
  api.post<TagOut>('/tags/', data).then((r) => r.data);
export const updateTag = (id: string, data: { name?: string; color?: string; tag_type?: string }) =>
  api.put<TagOut>(`/tags/${id}`, data).then((r) => r.data);
export const deleteTag = (id: string) => api.delete(`/tags/${id}`);
export const attachTag = (tagId: string, entityType: string, entityId: string) =>
  api.post<EntityTagOut>(`/tags/${tagId}/entities`, { entity_type: entityType, entity_id: entityId }).then((r) => r.data);
export const detachTag = (tagId: string, entityType: string, entityId: string) =>
  api.delete(`/tags/${tagId}/entities`, { data: { entity_type: entityType, entity_id: entityId } });
export const getEntityTags = (entityType: string, entityId: string) =>
  api.get<TagOut[]>(`/tags/entity/${entityType}/${entityId}`).then((r) => r.data);

// Case Attributes
export const listCaseAttributes = (documentId?: string) =>
  api.get<CaseAttributeOut[]>('/case-attributes/', {
    params: documentId ? { document_id: documentId } : {},
  }).then((r) => r.data);
export const createCaseAttribute = (data: {
  document_id: string;
  attr_name: string;
  attr_value?: string;
  attr_type?: string;
}) => api.post<CaseAttributeOut>('/case-attributes/', data).then((r) => r.data);
export const updateCaseAttribute = (id: string, data: { attr_value?: string; attr_type?: string }) =>
  api.put<CaseAttributeOut>(`/case-attributes/${id}`, data).then((r) => r.data);
export const deleteCaseAttribute = (id: string) => api.delete(`/case-attributes/${id}`);
export const caseAttributesMatrix = () =>
  api.get('/case-attributes/matrix').then((r) => r.data);

// Snapshots
export const listSnapshots = () => api.get<SnapshotOut[]>('/snapshots/').then((r) => r.data);
export const createSnapshot = (data: { label: string; description?: string }) =>
  api.post<SnapshotOut>('/snapshots/', data).then((r) => r.data);
export const deleteSnapshot = (id: string) => api.delete(`/snapshots/${id}`);

// Embeddings
export const embeddingsStatus = () => api.get<EmbedStatus>('/embeddings/status').then((r) => r.data);
export const generateEmbeddings = (docId: string) =>
  api.post<{ document_id: string; document_name: string; segments_created: number }>(`/embeddings/generate/${docId}`).then((r) => r.data);
export const semanticSearch = (query: string, topK = 5) =>
  api.post<SimilarSegment[]>('/embeddings/search', { query, top_k: topK }).then((r) => r.data);
