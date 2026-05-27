import { X, FileText, BarChart3, Search, Hash } from 'lucide-react';

export const CitationDrawer = ({ citation, onClose }) => {
  if (!citation) return null;

  const percentScore = Math.round(citation.relevance_score * 100);

  return (
    <div className="citation-drawer-overlay" onClick={onClose}>
      <div className="citation-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} className="text-accent" style={{ color: 'var(--accent-color)' }} />
            <span className="drawer-title">Source Citation [{citation.index}]</span>
          </div>
          <button className="close-drawer-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="drawer-content">
          <div className="drawer-meta-section">
            <div className="drawer-meta-row">
              <span className="drawer-meta-label">
                <FileText size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> File Source
              </span>
              <span className="drawer-meta-val" style={{ color: 'var(--accent-color)' }}>
                {citation.source}
              </span>
            </div>

            <div className="drawer-meta-row">
              <span className="drawer-meta-label">
                <BarChart3 size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Relevance Score
              </span>
              <span className="score-badge">
                {percentScore}% Match
              </span>
            </div>

            <div className="drawer-meta-row">
              <span className="drawer-meta-label">
                <Search size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Retrieval Strategy
              </span>
              <span className="drawer-meta-val" style={{ textTransform: 'capitalize' }}>
                {citation.retrieval_method || 'Semantic Search'}
              </span>
            </div>

            <div className="drawer-meta-row">
              <span className="drawer-meta-label">
                <Hash size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Segment Index
              </span>
              <span className="drawer-meta-val">
                Chunk {citation.chunk_index + 1}
              </span>
            </div>
          </div>

          {/* Raw Chunk Content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              Raw Text Context
            </h4>
            <div className="chunk-text-box">
              {citation.text}
            </div>
          </div>

          {/* Keywords */}
          {citation.keywords && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                Extracted Tags
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {citation.keywords.split(',').map((kw, i) => (
                  <span 
                    key={i} 
                    style={{ 
                      fontSize: '0.75rem', 
                      backgroundColor: 'var(--bg-tertiary)', 
                      padding: '4px 8px', 
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    #{kw.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CitationDrawer;
