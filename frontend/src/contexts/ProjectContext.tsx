import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import type {
  ProjectInfo,
  DocumentOut,
  DocumentContent,
  CodeNode,
  CodingOut,
  MemoOut,
} from '../types';
import * as api from '../api';

interface State {
  project: ProjectInfo | null;
  documents: DocumentOut[];
  activeDocument: DocumentContent | null;
  activeDocumentId: string | null;
  codes: CodeNode[];
  codings: CodingOut[];
  memos: MemoOut[];
  currentPage: number;
  selectedCodeId: string | null;
  loading: boolean;
}

type Action =
  | { type: 'SET_PROJECT'; payload: ProjectInfo | null }
  | { type: 'SET_DOCUMENTS'; payload: DocumentOut[] }
  | { type: 'SET_ACTIVE_DOCUMENT'; payload: { doc: DocumentContent; id: string } }
  | { type: 'CLEAR_ACTIVE_DOCUMENT' }
  | { type: 'SET_CODES'; payload: CodeNode[] }
  | { type: 'SET_CODINGS'; payload: CodingOut[] }
  | { type: 'SET_MEMOS'; payload: MemoOut[] }
  | { type: 'SET_PAGE'; payload: number }
  | { type: 'SET_SELECTED_CODE'; payload: string | null }
  | { type: 'SET_LOADING'; payload: boolean };

const initialState: State = {
  project: null,
  documents: [],
  activeDocument: null,
  activeDocumentId: null,
  codes: [],
  codings: [],
  memos: [],
  currentPage: 1,
  selectedCodeId: null,
  loading: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_PROJECT':
      return { ...state, project: action.payload };
    case 'SET_DOCUMENTS':
      return { ...state, documents: action.payload };
    case 'SET_ACTIVE_DOCUMENT':
      return {
        ...state,
        activeDocument: action.payload.doc,
        activeDocumentId: action.payload.id,
        currentPage: 1,
      };
    case 'CLEAR_ACTIVE_DOCUMENT':
      return { ...state, activeDocument: null, activeDocumentId: null, codings: [] };
    case 'SET_CODES':
      return { ...state, codes: action.payload };
    case 'SET_CODINGS':
      return { ...state, codings: action.payload };
    case 'SET_MEMOS':
      return { ...state, memos: action.payload };
    case 'SET_PAGE':
      return { ...state, currentPage: action.payload };
    case 'SET_SELECTED_CODE':
      return { ...state, selectedCodeId: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    default:
      return state;
  }
}

interface ProjectContextValue {
  state: State;
  dispatch: React.Dispatch<Action>;
  refreshDocuments: () => Promise<void>;
  refreshCodes: () => Promise<void>;
  refreshMemos: () => Promise<void>;
  openDocument: (id: string) => Promise<void>;
  refreshCodings: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const refreshDocuments = useCallback(async () => {
    const docs = await api.listDocuments();
    dispatch({ type: 'SET_DOCUMENTS', payload: docs });
  }, []);

  const refreshCodes = useCallback(async () => {
    const codes = await api.listCodes();
    dispatch({ type: 'SET_CODES', payload: codes });
  }, []);

  const refreshMemos = useCallback(async () => {
    const memos = await api.listMemos();
    dispatch({ type: 'SET_MEMOS', payload: memos });
  }, []);

  const openDocument = useCallback(async (id: string) => {
    const doc = await api.getDocument(id);
    dispatch({ type: 'SET_ACTIVE_DOCUMENT', payload: { doc, id } });
    const codings = await api.getCodingsForDocument(id);
    dispatch({ type: 'SET_CODINGS', payload: codings });
  }, []);

  const refreshCodings = useCallback(async () => {
    if (state.activeDocumentId) {
      const codings = await api.getCodingsForDocument(state.activeDocumentId);
      dispatch({ type: 'SET_CODINGS', payload: codings });
    }
  }, [state.activeDocumentId]);

  return (
    <ProjectContext.Provider
      value={{
        state,
        dispatch,
        refreshDocuments,
        refreshCodes,
        refreshMemos,
        openDocument,
        refreshCodings,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}
