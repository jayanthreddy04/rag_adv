import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  RefreshCw, 
  Sun, 
  Moon, 
  Database, 
  Layers, 
  FileText
} from 'lucide-react';

export const Sidebar = ({
  sessions,
  activeSessionId,
  isStreaming,
  ingestionStatus,
  indexedDocs,
  theme,
  toggleTheme,
  createSession,
  deleteSession,
  setActiveSessionId,
  triggerIngestion,
  clearCache
}) => {
  return (
    <aside className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="logo">
          <Database size={22} strokeWidth={2.5} />
          <span>Antigravity RAG</span>
        </div>
      </div>

      {/* New Chat Button */}
      <button 
        className="new-chat-btn" 
        onClick={() => createSession()}
        disabled={isStreaming}
      >
        <Plus size={18} />
        <span>New Conversation</span>
      </button>

      {/* Conversations List */}
      <div className="sessions-list">
        {sessions.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            No conversation history.
          </div>
        ) : (
          sessions.map(s => (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              className={`session-item ${s.id === activeSessionId ? 'active' : ''}`}
              onClick={() => setActiveSessionId(s.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveSessionId(s.id);
                }
              }}
            >
              <div className="session-info">
                <MessageSquare size={16} style={{ flexShrink: 0 }} />
                <span className="session-title">{s.title}</span>
              </div>
              <button
                className="delete-session-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('Delete this conversation?')) {
                    deleteSession(s.id);
                  }
                }}
                title="Delete Chat"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Ingestion Panel */}
      <div className="ingestion-panel">
        <div className="panel-header">
          <span>Backend Knowledge DB</span>
          <button 
            className={`ingest-trigger-btn ${ingestionStatus.state === 'processing' ? 'spin' : ''}`}
            onClick={triggerIngestion}
            disabled={ingestionStatus.state === 'processing'}
            title="Scan & Sync Documents"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="ingest-status-indicator">
          <span className={`status-dot ${ingestionStatus.state}`} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'capitalize' }}>
            Status: {ingestionStatus.state === 'processing' ? 'indexing...' : ingestionStatus.state}
          </span>
        </div>

        {ingestionStatus.state === 'processing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div className="progress-bar-container">
              <div 
                className="progress-bar-fill" 
                style={{ 
                  width: `${ingestionStatus.totalFiles > 0 ? (ingestionStatus.processedFiles / ingestionStatus.totalFiles) * 100 : 0}%` 
                }} 
              />
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Parsing: {ingestionStatus.currentFile || 'preparing...'}
            </div>
          </div>
        )}

        <div className="stats-grid">
          <div className="stat-card">
            <span className="sources-header" style={{ fontSize: '0.65rem', padding: 0 }}>
              <FileText size={10} /> FILES
            </span>
            <span className="stat-val">{indexedDocs.length}</span>
          </div>
          <div className="stat-card">
            <span className="sources-header" style={{ fontSize: '0.65rem', padding: 0 }}>
              <Layers size={10} /> CHUNKS
            </span>
            <span className="stat-val">
              {indexedDocs.reduce((acc, doc) => acc + (doc.chunks || 0), 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Footer & Settings */}
      <div className="sidebar-footer">
        <div className="theme-toggle-container">
          <button
            className={`theme-toggle-btn ${theme === 'light' ? 'active' : ''}`}
            onClick={() => theme !== 'light' && toggleTheme()}
            title="Light Mode"
          >
            <Sun size={14} />
          </button>
          <button
            className={`theme-toggle-btn ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => theme !== 'dark' && toggleTheme()}
            title="Dark Mode"
          >
            <Moon size={14} />
          </button>
        </div>

        <button 
          onClick={clearCache} 
          style={{ 
            fontSize: '0.75rem', 
            color: 'var(--text-secondary)', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '4px',
            padding: '6px 10px',
            borderRadius: 'var(--border-radius-sm)',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-primary)'
          }}
          title="Flush Query Cache"
        >
          <Trash2 size={12} />
          <span>Clear Cache</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
