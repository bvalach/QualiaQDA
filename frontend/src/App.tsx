import { useState, useEffect } from 'react';
import { ProjectProvider, useProject } from './contexts/ProjectContext';
import { WelcomeScreen } from './components/WelcomeScreen';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';

function AppContent() {
  const { state, refreshDocuments, refreshCodes, refreshMemos } = useProject();
  const [leftWidth, setLeftWidth] = useState(320);

  useEffect(() => {
    if (state.project) {
      refreshDocuments();
      refreshCodes();
      refreshMemos();
    }
  }, [state.project, refreshDocuments, refreshCodes, refreshMemos]);

  if (!state.project) {
    return <WelcomeScreen />;
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftWidth;
    const onMove = (ev: MouseEvent) => {
      const newWidth = Math.max(280, Math.min(500, startWidth + ev.clientX - startX));
      setLeftWidth(newWidth);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div className="app-layout">
      <div className="left-panel" style={{ width: leftWidth }}>
        <LeftPanel />
      </div>
      <div className="resizer" onMouseDown={handleMouseDown} />
      <div className="right-panel">
        <RightPanel />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ProjectProvider>
      <AppContent />
    </ProjectProvider>
  );
}
