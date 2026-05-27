import { useState, useEffect, useRef, useCallback } from 'react';

const isLocalBrowser = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE = import.meta.env.VITE_API_BASE_URL || (isLocalBrowser ? 'http://localhost:5005/api' : '/api');

export const useChat = () => {
  const [sessions, setSessions] = useState(() => {
    const saved = localStorage.getItem('rag_sessions');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [activeSessionId, setActiveSessionId] = useState(() => {
    return localStorage.getItem('rag_active_session_id') || null;
  });

  const [isStreaming, setIsStreaming] = useState(false);
  const [ingestionStatus, setIngestionStatus] = useState({
    state: 'idle',
    totalFiles: 0,
    processedFiles: 0,
    totalChunks: 0,
    currentFile: null,
    error: null
  });
  
  const [indexedDocs, setIndexedDocs] = useState([]);
  
  const abortControllerRef = useRef(null);

  // Sync sessions to localStorage
  useEffect(() => {
    localStorage.setItem('rag_sessions', JSON.stringify(sessions));
  }, [sessions]);

  // Sync activeSessionId to localStorage
  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem('rag_active_session_id', activeSessionId);
    } else {
      localStorage.removeItem('rag_active_session_id');
    }
  }, [activeSessionId]);

  const fetchIndexedDocuments = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/documents`);
      if (res.ok) {
        const data = await res.json();
        setIndexedDocs(data.documents || []);
      }
    } catch (err) {
      console.error('Error fetching indexed documents:', err);
    }
  }, []);

  const fetchIngestionStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/documents/status`);
      if (res.ok) {
        const data = await res.json();
        setIngestionStatus(data);
        // If state just finished or failed, reload documents
        if (data.state === 'completed' || data.state === 'failed') {
          fetchIndexedDocuments();
        }
      }
    } catch (err) {
      console.error('Error fetching ingestion status:', err);
    }
  }, [fetchIndexedDocuments]);

  // Initial ingestion check
  useEffect(() => {
    fetchIngestionStatus();
    fetchIndexedDocuments();
    
    // Poll ingestion status every 5 seconds if background processing is active
    const interval = setInterval(() => {
      fetchIngestionStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchIngestionStatus, fetchIndexedDocuments]);

  const triggerIngestion = async () => {
    try {
      const res = await fetch(`${API_BASE}/documents/ingest`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setIngestionStatus(data.status);
      }
    } catch (err) {
      console.error('Error triggering ingestion:', err);
    }
  };

  const clearCache = async () => {
    try {
      const res = await fetch(`${API_BASE}/cache/clear`, { method: 'POST' });
      if (res.ok) {
        alert('Global cache cleared successfully!');
      }
    } catch (err) {
      console.error('Error clearing cache:', err);
    }
  };

  const createSession = (title = 'New Conversation') => {
    const newSession = {
      id: `session_${Date.now()}`,
      title,
      messages: [],
      createdAt: new Date().toISOString()
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    return newSession.id;
  };

  const deleteSession = (sessionId) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      const remaining = sessions.filter(s => s.id !== sessionId);
      setActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  const activeSession = sessions.find(s => s.id === activeSessionId);

  const sendMessage = async (text, options = {}) => {
    if (!text.trim()) return;

    let currentSessionId = activeSessionId;
    if (!currentSessionId) {
      currentSessionId = createSession(text.substring(0, 30) + '...');
    }

    const userMessage = {
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString()
    };

    // Update session title if this is the first message
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        const updatedMessages = [...s.messages, userMessage];
        const updatedTitle = s.messages.length === 0 ? (text.substring(0, 40) + (text.length > 40 ? '...' : '')) : s.title;
        return {
          ...s,
          title: updatedTitle,
          messages: updatedMessages
        };
      }
      return s;
    }));

    // Setup bot message placeholder
    const botMessageId = `msg_bot_${Date.now()}`;
    const botMessagePlaceholder = {
      id: botMessageId,
      role: 'assistant',
      content: '',
      rewrittenQuery: '',
      sources: [],
      error: null,
      createdAt: new Date().toISOString()
    };

    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        return {
          ...s,
          messages: [...s.messages, botMessagePlaceholder]
        };
      }
      return s;
    }));

    setIsStreaming(true);
    abortControllerRef.current = new AbortController();

    // Prepare message history formatted for API
    const sessionToUse = sessions.find(s => s.id === currentSessionId) || { messages: [] };
    // Map current history (excluding the new user message and bot placeholder)
    const historyPayload = sessionToUse.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role: m.role,
        content: m.content
      }));

    const chatPayload = {
      query: text,
      history: historyPayload,
      useLlmReranker: !!options.useLlmReranker
    };

    if (options.filter) {
      chatPayload.filter = options.filter;
    }

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatPayload),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Split by SSE double-newline boundary
        const blocks = buffer.split('\n\n');
        // Save the last block (which may be incomplete) back to buffer
        buffer = blocks.pop();

        for (const block of blocks) {
          const lines = block.split('\n');
          let eventType = null;
          let eventData = null;

          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.substring(6).trim();
            } else if (line.startsWith('data:')) {
              eventData = line.substring(5).trim();
            }
          }

          if (eventType && eventData) {
            try {
              const parsedData = JSON.parse(eventData);
              
              setSessions(prev => prev.map(s => {
                if (s.id === currentSessionId) {
                  return {
                    ...s,
                    messages: s.messages.map(m => {
                      if (m.id === botMessageId) {
                        if (eventType === 'query_optimized') {
                          return { ...m, rewrittenQuery: parsedData.rewrittenQuery };
                        } else if (eventType === 'sources_retrieved') {
                          return { ...m, sources: parsedData };
                        } else if (eventType === 'content') {
                          return { ...m, content: m.content + parsedData.token };
                        } else if (eventType === 'error') {
                          return { ...m, error: parsedData.error };
                        }
                      }
                      return m;
                    })
                  };
                }
                return s;
              }));
            } catch (err) {
              console.error('Failed to parse SSE payload:', err);
            }
          }
        }
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Stream generation aborted by user.');
      } else {
        console.error('Stream transmission error:', err);
        setSessions(prev => prev.map(s => {
          if (s.id === currentSessionId) {
            return {
              ...s,
              messages: s.messages.map(m => {
                if (m.id === botMessageId) {
                  return { ...m, error: err.message || 'Network stream disconnected.' };
                }
                return m;
              })
            };
          }
          return s;
        }));
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  return {
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
  };
};

export default useChat;
