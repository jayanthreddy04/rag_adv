import { useEffect, useRef } from 'react';
import { Sparkles, Compass, Zap, Database } from 'lucide-react';
import ChatMessage from './ChatMessage';

export const ChatArea = ({
  activeSession,
  isStreaming,
  onCitationClick,
  onSendSuggestion
}) => {
  const scrollRef = useRef(null);

  // Auto-scroll to the bottom of the container on new message streams
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeSession?.messages?.length, isStreaming]);

  // Scroll during token streaming
  useEffect(() => {
    if (scrollRef.current && isStreaming) {
      scrollRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [activeSession?.messages, isStreaming]);

  const suggestions = [
    {
      title: "ChromaDB Concept",
      prompt: "What is ChromaDB and what similarity metrics does it support?",
      icon: <Database size={16} />
    },
    {
      title: "Advanced Retrieval",
      prompt: "Explain how Hybrid Search (Vector + BM25) and Reciprocal Rank Fusion (RRF) work.",
      icon: <Compass size={16} />
    },
    {
      title: "Inference Performance",
      prompt: "How does Groq's LPU architecture achieve ultra-fast LLM response times compared to GPUs?",
      icon: <Zap size={16} />
    }
  ];

  return (
    <div className="messages-scroller">
      {!activeSession || activeSession.messages.length === 0 ? (
        <div className="empty-state">
          <div className="empty-logo">
            <Sparkles size={32} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text-primary)' }}>
              Advanced RAG Chatbot
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              Ask technical questions grounded strictly on your pre-loaded backend documents.
            </p>
          </div>

          <div className="empty-suggestions">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                className="suggestion-card"
                onClick={() => onSendSuggestion(s.prompt)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontWeight: 600, color: 'var(--accent-color)' }}>
                  {s.icon}
                  <span>{s.title}</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  "{s.prompt}"
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        activeSession.messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            onCitationClick={onCitationClick}
          />
        ))
      )}

      {/* Typing indicator */}
      {isStreaming && activeSession?.messages[activeSession.messages.length - 1]?.content === '' && (
        <div className="message-wrapper assistant">
          <div className="message-bubble" style={{ padding: '12px 18px' }}>
            <div className="typing-indicator">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '6px', fontWeight: 500 }}>
                Searching documents & generating answer...
              </span>
            </div>
          </div>
        </div>
      )}

      <div ref={scrollRef} style={{ height: '1px' }} />
    </div>
  );
};

export default ChatArea;
