import React, { useState, useRef, useEffect } from 'react';
import { API_BASE } from '../config';
import { Send, Bot, User, Sparkles, BookOpen, ChevronDown, ChevronUp, MessageSquarePlus } from 'lucide-react';

export default function ChatWindow({ chatId, onChatCreated }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedSource, setExpandedSource] = useState(null); // Track index of expanded citation
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load chat history when chatId changes
  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      return;
    }

    const fetchHistory = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/chats/${chatId}/messages`, {
          headers: {
            'Authorization': 'Bearer ' + localStorage.getItem("token")
          }
        });
        if (res.ok) {
          const data = await res.json();
          // Ensure messages is an array and structure appropriately
          setMessages(data || []);
        } else {
          console.error('Failed to retrieve chat messages.');
        }
      } catch (err) {
        console.error('Error fetching chat history:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [chatId]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;

    const queryText = input.trim();
    setInput('');

    await handleSendQuery(queryText);
  };

  const handleSendQuery = async (queryText) => {
    // Immediately append the user message to local state
    const newUserMessage = { sender: 'user', text: queryText };
    setMessages(prev => [...prev, newUserMessage]);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + localStorage.getItem("token")
        },
        body: JSON.stringify({
          query: queryText,
          chatId: chatId || undefined // Send active chatId if available
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Error processing query request');
      }

      // Append backend generated response
      setMessages(prev => [...prev, {
        sender: 'bot',
        text: data.answer,
        sources: data.sources || []
      }]);

      // If a new chat session was created by the backend (i.e. chatId was not set),
      // notify parent to update session listing and auto-select new session.
      if (data.chatId && data.chatId !== chatId) {
        if (onChatCreated) {
          onChatCreated(data.chatId);
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        sender: 'bot',
        text: `⚠️ Error: Could not retrieve answer. ${err.message}`
      }]);
    } finally {
      setLoading(false);
    }
  };

  const starterQuestions = [
    "What is the policy for remote work setup expenses?",
    "What are the rules for password complexity?",
    "Can I book a Premium Economy flight for my trip?",
    "How does the daily meal allowance (per diem) work?"
  ];

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#252525] rounded-2xl border border-slate-200 dark:border-[#333333] overflow-hidden backdrop-blur-md transition-colors duration-300">
      
      {/* Header */}
      <div className="px-6 py-4 bg-slate-50 dark:bg-[#2d2d2d] border-b border-slate-200 dark:border-[#333333] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-500 dark:text-brand-400" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {chatId ? `Active Session: ${chatId}` : 'New RAG Session'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          <span className="text-xs text-emerald-400 font-medium">RAG Search Active</span>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
          // Welcome Screen
          <div className="h-full flex flex-col items-center justify-center text-center p-4 max-w-lg mx-auto my-auto">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center mb-6 shadow-xl shadow-brand-500/20">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 font-sans">OmniSearch Intelligent Assistant</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 mb-8 leading-relaxed font-sans">
              Ask me anything about company HR policies, IT security regulations, or business expenses. I search our internal database to provide accurate, cited answers.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
              {starterQuestions.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendQuery(q)}
                  className="p-3 text-xs text-left text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/5 hover:border-brand-400 dark:hover:border-brand-500/30 rounded-xl transition-all duration-300 glass-hover cursor-pointer font-sans"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isUser = msg.sender === 'user';
            return (
              <div key={msg.id || index} className={`flex gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {/* Bot Icon */}
                {!isUser && (
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center flex-shrink-0 shadow-md">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                )}

                {/* Message Box */}
                <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-4 ${
                  isUser 
                    ? 'bg-gradient-to-br from-brand-600 to-indigo-600 text-white shadow-lg shadow-brand-600/15 rounded-tr-none' 
                    : 'glass-card text-slate-800 dark:text-slate-200 rounded-tl-none'
                }`}>
                  {/* Message Content */}
                  <div className="text-sm leading-relaxed whitespace-pre-wrap font-sans prose prose-invert max-w-none">
                    {msg.text}
                  </div>

                  {/* RAG Citation Sources */}
                  {!isUser && msg.sources && msg.sources.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-white/5">
                      <div className="flex items-center gap-1.5 mb-2">
                        <BookOpen className="w-3.5 h-3.5 text-brand-400" />
                        <span className="text-xs font-semibold text-slate-300">Sources Referenced:</span>
                      </div>
                      
                      <div className="space-y-2">
                        {msg.sources.map((src, srcIdx) => {
                          const isExpanded = expandedSource === `${index}-${srcIdx}`;
                          return (
                            <div key={srcIdx} className="bg-white/5 rounded-lg border border-white/5 overflow-hidden">
                              <button
                                onClick={() => setExpandedSource(isExpanded ? null : `${index}-${srcIdx}`)}
                                className="w-full px-3 py-2 flex items-center justify-between text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
                              >
                                <span className="font-medium truncate max-w-[80%]">📄 {src.docTitle || src.doc_title}</span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 font-mono text-[10px]">
                                    {((src.similarity || 0) * 100).toFixed(0)}% Match
                                  </span>
                                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </div>
                              </button>
                              
                              {isExpanded && (
                                <div className="px-3 pb-3 pt-1 text-xs text-slate-400 leading-relaxed border-t border-white/5 bg-slate-950/20 italic">
                                  "{src.text}"
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* User Icon */}
                {isUser && (
                  <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0 shadow-md">
                    <User className="w-4 h-4 text-brand-300" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Loading Indicator */}
        {loading && (
          <div className="flex gap-4 justify-start">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center flex-shrink-0 shadow-md">
              <Bot className="w-4 h-4 text-white" />
            </div>
            
            <div className="glass-card text-slate-800 dark:text-slate-200 rounded-2xl rounded-tl-none px-5 py-4 flex flex-col gap-2">
              <span className="text-xs text-slate-400 font-mono flex items-center gap-2">
                AI is searching documents...
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="w-2.5 h-2.5 rounded-full bg-brand-500 dot-bounce animate-pulse" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2.5 h-2.5 rounded-full bg-brand-400 dot-bounce animate-pulse" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2.5 h-2.5 rounded-full bg-brand-300 dot-bounce animate-pulse" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Tray */}
      <form onSubmit={handleSubmit} className="p-4 bg-slate-50 dark:bg-[#2d2d2d] border-t border-slate-200 dark:border-[#333333]">
        <div className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="Type your question about company policies..."
            className="w-full glass-input rounded-xl py-3.5 pl-4 pr-12 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none font-sans"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="absolute right-2 p-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50 disabled:hover:bg-brand-600 transition-all duration-300 cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
