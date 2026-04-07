import { useState, useEffect } from 'react';
import { useProject } from '../contexts/ProjectContext';
import * as api from '../api';
import type { ProjectInfo } from '../types';

export function WelcomeScreen() {
  const { dispatch } = useProject();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const refreshProjects = () => {
    api.listProjects().then(setProjects).catch(() => {});
  };

  useEffect(() => {
    refreshProjects();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    const proj = await api.createProject(name.trim(), description.trim() || undefined);
    dispatch({ type: 'SET_PROJECT', payload: proj });
  };

  const handleOpen = async (filePath: string) => {
    const proj = await api.openProject(filePath);
    dispatch({ type: 'SET_PROJECT', payload: proj });
  };

  const handleDelete = async (e: React.MouseEvent, proj: ProjectInfo) => {
    e.stopPropagation();
    if (!confirm(`Eliminar proyecto "${proj.name}"? Se borrara el archivo .qualia y sus ficheros.`)) return;
    await api.deleteProject(proj.id);
    refreshProjects();
  };

  return (
    <div className="welcome-screen">
      <h1>QualiaQDA</h1>
      <p>Herramienta de analisis cualitativo de datos con IA integrada</p>

      <div className="welcome-actions">
        <button className="primary" onClick={() => setShowCreate(true)}>
          Nuevo proyecto
        </button>
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Nuevo proyecto</h2>
            <div className="form-group">
              <label>Nombre</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Mi proyecto de investigacion"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Descripcion (opcional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descripcion del proyecto..."
              />
            </div>
            <div className="form-actions">
              <button className="ghost" onClick={() => setShowCreate(false)}>
                Cancelar
              </button>
              <button className="primary" onClick={handleCreate}>
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {projects.length > 0 && (
        <div style={{ marginTop: 20, width: 400 }}>
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginBottom: 8,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Proyectos recientes
          </div>
          {projects.map((p) => (
            <div
              key={p.id}
              className="doc-item"
              onClick={() => handleOpen(p.file_path)}
              style={{ marginBottom: 4 }}
            >
              <span style={{ flex: 1 }}>{p.name}</span>
              <span className="doc-type">{new Date(p.created_at).toLocaleDateString()}</span>
              <button
                className="ghost small"
                onClick={(e) => handleDelete(e, p)}
                title="Eliminar proyecto"
                style={{ opacity: 0.4, fontSize: 10, marginLeft: 4 }}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
