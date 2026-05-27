import { Sparkles, Terminal, FileText, Copy } from 'lucide-react';

export const ChatMessage = ({ message, onCitationClick }) => {
  const isUser = message.role === 'user';

  // Copy to clipboard helper for code blocks
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Code copied to clipboard!');
  };

  // Custom parser to render basic markdown and inline clickable citation badges
  const renderMarkdown = (text, sources) => {
    if (!text) return null;

    // Split text by code blocks ```
    const segments = text.split(/```/);
    return segments.map((segment, index) => {
      const isCodeBlock = index % 2 === 1;

      if (isCodeBlock) {
        // Extract language and code content
        const lines = segment.split('\n');
        const language = lines[0].trim() || 'code';
        const codeText = lines.slice(1).join('\n').trim();

        return (
          <div key={index} className="code-block-container" style={{ margin: '14px 0', position: 'relative' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'var(--bg-primary)',
              padding: '6px 12px',
              borderTopLeftRadius: 'var(--border-radius-md)',
              borderTopRightRadius: 'var(--border-radius-md)',
              border: '1px solid var(--border-color)',
              borderBottom: 'none',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Terminal size={12} />
                <span>{language.toUpperCase()}</span>
              </div>
              <button 
                onClick={() => copyToClipboard(codeText)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px',
                  marginLeft: 'auto'
                }}
                title="Copy Code"
              >
                <Copy size={12} />
                <span>Copy</span>
              </button>
            </div>
            <pre style={{
              marginTop: 0,
              borderTopLeftRadius: 0,
              borderTopRightRadius: 0
            }}>
              <code>{codeText}</code>
            </pre>
          </div>
        );
      } else {
        // Parse inline items line-by-line (paragraphs, headers, bullet lists, bold, inline code, citations)
        const lines = segment.split('\n');
        return lines.map((line, lineIdx) => {
          let cleanLine = line.trim();
          
          if (!cleanLine) {
            return <div key={`${lineIdx}`} style={{ height: '8px' }} />;
          }

          // Headers
          if (cleanLine.startsWith('### ')) {
            return <h3 key={`${lineIdx}`}>{parseInline(cleanLine.substring(4), sources)}</h3>;
          }
          if (cleanLine.startsWith('## ')) {
            return <h2 key={`${lineIdx}`}>{parseInline(cleanLine.substring(3), sources)}</h2>;
          }
          if (cleanLine.startsWith('# ')) {
            return <h1 key={`${lineIdx}`}>{parseInline(cleanLine.substring(2), sources)}</h1>;
          }

          // Bullet List Items
          if (cleanLine.startsWith('- ') || cleanLine.startsWith('* ')) {
            return (
              <ul key={`${lineIdx}`}>
                <li>{parseInline(cleanLine.substring(2), sources)}</li>
              </ul>
            );
          }

          // Numbered List Items
          if (/^\d+\.\s/.test(cleanLine)) {
            const content = cleanLine.replace(/^\d+\.\s/, '');
            return (
              <ol key={`${lineIdx}`}>
                <li>{parseInline(content, sources)}</li>
              </ol>
            );
          }

          // Normal Paragraph
          return <p key={`${lineIdx}`}>{parseInline(line, sources)}</p>;
        });
      }
    });
  };

  // Helper to parse inline bolding, inline code, and citation brackets [1]
  const parseInline = (text, sources) => {
    // We split by bolding (**), inline code (`), and bracketed citations [index]
    // Tokenizer regex
    const regex = /(\*\*.*?\*\*|`.*?`|\[\d+\])/g;
    const parts = text.split(regex);

    return parts.map((part, index) => {
      // Bold
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      
      // Inline Code
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={index} style={{
          backgroundColor: 'var(--code-bg)',
          padding: '2px 6px',
          borderRadius: '4px',
          border: '1px solid var(--border-color)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.85rem'
        }}>{part.slice(1, -1)}</code>;
      }

      // Citations [1]
      const citationMatch = part.match(/^\[(\d+)\]$/);
      if (citationMatch) {
        const sourceIndex = parseInt(citationMatch[1], 10);
        const matchingSource = sources ? sources.find(s => s.index === sourceIndex) : null;
        
        return (
          <span 
            key={index} 
            className="citation-badge"
            onClick={() => matchingSource && onCitationClick(matchingSource)}
            title={matchingSource ? `Source: ${matchingSource.source}` : 'Source details'}
          >
            {sourceIndex}
          </span>
        );
      }

      // Normal Text
      return part;
    });
  };

  return (
    <div className={`message-wrapper ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-bubble">
        {/* Banner for rewritten search query */}
        {!isUser && message.rewrittenQuery && message.rewrittenQuery !== message.content && (
          <div className="query-refinement-banner">
            <Sparkles size={12} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
            <span>Search optimization: <i>"{message.rewrittenQuery}"</i></span>
          </div>
        )}

        {/* Content */}
        {isUser ? (
          <p style={{ whiteSpace: 'pre-wrap' }}>{message.content}</p>
        ) : (
          <div className="markdown-content">
            {renderMarkdown(message.content, message.sources)}
          </div>
        )}

        {/* Error State */}
        {!isUser && message.error && (
          <div style={{
            marginTop: '10px',
            padding: '10px 14px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderLeft: '3px solid #ef4444',
            borderRadius: '4px',
            fontSize: '0.85rem',
            color: '#ef4444'
          }}>
            ⚠️ {message.error}
          </div>
        )}

        {/* Source Citations summary */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="message-sources">
            <div className="sources-header">
              <FileText size={12} />
              <span>Reference Sources ({message.sources.length})</span>
            </div>
            <div className="sources-list">
              {message.sources.map(src => (
                <button
                  key={src.id}
                  className="source-pill"
                  onClick={() => onCitationClick(src)}
                >
                  <span style={{ 
                    fontFamily: 'var(--font-mono)', 
                    fontSize: '0.75rem', 
                    fontWeight: 700,
                    color: 'var(--accent-color)'
                  }}>
                    [{src.index}]
                  </span>
                  <span style={{ 
                    maxWidth: '120px', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap'
                  }}>
                    {src.source}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
