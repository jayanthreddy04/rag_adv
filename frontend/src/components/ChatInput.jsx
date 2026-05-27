import { useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';

export const ChatInput = ({ 
  input, 
  setInput, 
  onSubmit, 
  isStreaming, 
  onStop,
  disabled
}) => {
  const textareaRef = useRef(null);

  // Auto-grow textarea height
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleKeyDown = (e) => {
    // Submit on Enter, unless Shift is pressed (for newlines)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && input.trim()) {
        onSubmit();
      }
    }
  };

  return (
    <div className="input-panel">
      <div className="input-box-wrapper">
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          rows={1}
          placeholder={disabled ? "Database is indexing, please wait..." : "Ask a question about the indexed documents..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        
        <div className="chat-actions">
          {isStreaming ? (
            <button 
              className="cancel-btn" 
              onClick={onStop}
              title="Stop generating"
            >
              <Square size={16} fill="white" />
            </button>
          ) : (
            <button 
              className="send-btn" 
              onClick={onSubmit}
              disabled={disabled || !input.trim()}
              title="Send question"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="input-footer">
        Antigravity RAG operates strictly using local document indices. Out-of-bounds queries will be grounded to local contexts.
      </div>
    </div>
  );
};

export default ChatInput;
