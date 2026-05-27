import { useState } from 'react';
import useTheme from './hooks/useTheme';
import useChat from './hooks/useChat';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import ChatInput from './components/ChatInput';
import CitationDrawer from './components/CitationDrawer';
import { Filter, Sliders, Menu, X } from 'lucide-react';

function App() {
  const { theme, toggleTheme } = useTheme();
  
  const {
    sessions,
    activeSessionId,
    activeSession,
    isStreaming,
    ingestionStatus,
    indexedDocs,
    createSession,
    deleteSession,
    sendMessage,
    stopGeneration,
    triggerIngestion,
    clearCache,
    setActiveSessionId
  } = useChat();

  const [input, setInput] = useState('');
  const [useLlmReranker, setUseLlmReranker] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedCitation, setSelectedCitation] = useState(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const handleSubmit = () => {
    if (!input.trim()) return;
    
    const filter = selectedFilter !== 'all' ? { source: selectedFilter } : null;
    sendMessage(input, { useLlmReranker, filter });
    setInput('');
  };

  const handleSuggestionSelect = (promptText) => {
    setInput(promptText);
    // Send message after a tiny delay so the input state propagates
    setTimeout(() => {
      const filter = selectedFilter !== 'all' ? { source: selectedFilter } : null;
      sendMessage(promptText, { useLlmReranker, filter });
      setInput('');
    }, 50);
  };

  return (
    <div className="app-container" data-theme={theme}>
      {/* Sidebar - Desktop and Mobile wrapper */}
      <div className={`sidebar-wrapper ${mobileSidebarOpen ? 'open' : ''}`} style={{
        display: 'contents'
      }}>
        {/* We reuse the sidebar and apply a CSS toggle for mobile viewports */}
        <div className={`sidebar ${mobileSidebarOpen ? 'open' : ''}`}>
          <Sidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            isStreaming={isStreaming}
            ingestionStatus={ingestionStatus}
            indexedDocs={indexedDocs}
            theme={theme}
            toggleTheme={toggleTheme}
            createSession={createSession}
            deleteSession={deleteSession}
            setActiveSessionId={(id) => {
              setActiveSessionId(id);
              setMobileSidebarOpen(false);
            }}
            triggerIngestion={triggerIngestion}
            clearCache={clearCache}
          />
        </div>
      </div>

      {/* Main Chat Panel */}
      <main className="chat-container">
        {/* Header */}
        <header className="chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              className="mobile-menu-toggle"
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
              style={{
                display: 'none', // Overridden in media queries
                padding: '6px',
                borderRadius: 'var(--border-radius-sm)',
                backgroundColor: 'var(--bg-tertiary)'
              }}
            >
              {mobileSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span className="chat-header-title">
              {activeSession ? activeSession.title : 'New Chat Session'}
            </span>
          </div>

          <div className="chat-settings">
            {/* Source Document Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Filter size={14} className="text-secondary" style={{ color: 'var(--text-secondary)' }} />
              <select
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value)}
                style={{
                  fontSize: '0.8rem',
                  padding: '4px 8px',
                  borderRadius: 'var(--border-radius-sm)',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  outline: 'none',
                  color: 'var(--text-primary)'
                }}
              >
                <option value="all">All Documents</option>
                {indexedDocs.map(doc => (
                  <option key={doc.name} value={doc.name}>
                    {doc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* LLM Reranker Switcher */}
            <label className="setting-checkbox-label">
              <Sliders size={14} />
              <span>LLM Reranker</span>
              <input
                type="checkbox"
                checked={useLlmReranker}
                onChange={(e) => setUseLlmReranker(e.target.checked)}
                style={{
                  cursor: 'pointer',
                  accentColor: 'var(--accent-color)'
                }}
              />
            </label>
          </div>
        </header>

        {/* Messages scroller area */}
        <ChatArea
          activeSession={activeSession}
          isStreaming={isStreaming}
          onCitationClick={(citation) => setSelectedCitation(citation)}
          onSendSuggestion={handleSuggestionSelect}
        />

        {/* Input panel */}
        <ChatInput
          input={input}
          setInput={setInput}
          onSubmit={handleSubmit}
          isStreaming={isStreaming}
          onStop={stopGeneration}
          disabled={ingestionStatus.state === 'processing'}
        />
      </main>

      {/* Citation drawer overlay */}
      {selectedCitation && (
        <CitationDrawer
          citation={selectedCitation}
          onClose={() => setSelectedCitation(null)}
        />
      )}

      {/* Add mobile CSS rules dynamically */}
      <style>{`
        @media (max-width: 800px) {
          .mobile-menu-toggle {
            display: flex !important;
            align-items: center;
            justify-content: center;
          }
          .sidebar {
            position: fixed;
            left: 0;
            top: 0;
            bottom: 0;
            transform: translateX(-100%);
            transition: transform var(--transition-normal);
            box-shadow: var(--shadow-lg);
          }
          .sidebar.open {
            transform: translateX(0);
          }
          .chat-header {
            padding: 0 16px;
          }
          .chat-settings {
            gap: 8px;
          }
          .setting-checkbox-label span {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}

export default App;
