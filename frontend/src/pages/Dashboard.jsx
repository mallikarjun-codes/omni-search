import React, { useState, useEffect } from 'react';
import ChatWindow from '../components/ChatWindow';
import { Database, Plus, FileText, Calendar, Info, X, Sparkles, CheckCircle2 } from 'lucide-react';

export default function Dashboard() {
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [docLoading, setDocLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // New document form state
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('HR Policy');
  const [newContent, setNewContent] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Fetch document metadata list
  const fetchDocuments = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/chat/documents', {
        headers: {
          'Authorization': 'Bearer ' + localStorage.getItem("token")
        }
      });
      const data = await res.json();
      if (res.ok) {
        setDocuments(data);
      }
    } catch (err) {
      console.error('Error loading documents:', err);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  // Handle Query Submission
  const handleSendMessage = async (queryText) => {
    // 1. Add employee message to state
    const newUserMessage = { sender: 'user', text: queryText };
    setMessages(prev => [...prev, newUserMessage]);
    setChatLoading(true);

    try {
      const res = await fetch('http://localhost:5000/api/chat/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + localStorage.getItem("token")
        },
        body: JSON.stringify({
          query: queryText
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Error processing request');
      }

      // 2. Add assistant message to state
      setMessages(prev => [...prev, {
        sender: 'bot',
        text: data.answer,
        sources: data.sources || []
      }]);

    } catch (err) {
      setMessages(prev => [...prev, {
        sender: 'bot',
        text: `⚠️ Error: Could not retrieve answer. ${err.message}`
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Handle new Document Upload/Indexing
  const handleAddDocument = async (e) => {
    e.preventDefault();
    setUploadError('');
    setUploadSuccess(false);
    setDocLoading(true);

    if (!newTitle.trim() || !newContent.trim()) {
      setUploadError('Title and content are required.');
      setDocLoading(false);
      return;
    }

    try {
      const res = await fetch('http://localhost:5000/api/chat/document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + localStorage.getItem("token")
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          type: newType,
          content: newContent.trim()
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Indexing failed');
      }

      setUploadSuccess(true);
      setNewTitle('');
      setNewContent('');
      
      // Refresh documents
      await fetchDocuments();

      // Close modal after a short delay
      setTimeout(() => {
        setIsModalOpen(false);
        setUploadSuccess(false);
      }, 1500);

    } catch (err) {
      setUploadError(err.message);
    } finally {
      setDocLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 h-[85vh]">
      
      {/* LEFT COLUMN: RAG Database Manager (lg:col-span-4) */}
      <div className="lg:col-span-4 flex flex-col h-full bg-slate-900/40 border border-white/5 rounded-2xl p-4 sm:p-5 overflow-hidden backdrop-blur-md">
        
        {/* Header & Upload Button */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-brand-400" />
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Company Knowledge</h2>
          </div>
          
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-brand-500/10 hover:shadow-brand-500/20 transition-all duration-300 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Document
          </button>
        </div>

        {/* Database Quick Stats */}
        <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-slate-400 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-brand-400" />
            <span>Status: <strong className="text-slate-200">Online</strong></span>
          </div>
          <span>Indexed: <strong className="text-brand-300">{documents.length} Docs</strong></span>
        </div>

        {/* Document Index List */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3">
          {documents.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/5 rounded-xl text-slate-500">
              <Database className="w-8 h-8 text-slate-600 mb-2" />
              <p className="text-xs">No documents uploaded yet.</p>
            </div>
          ) : (
            documents.map((doc) => (
              <div 
                key={doc.id} 
                className="p-3.5 rounded-xl bg-white/5 border border-white/5 hover:border-brand-500/30 transition-all duration-300 glass-hover"
              >
                <div className="flex items-start gap-2.5">
                  <FileText className="w-4 h-4 text-brand-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-slate-200 truncate">{doc.title}</h4>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400 font-mono">
                      <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] uppercase tracking-wide text-brand-300">
                        {doc.type}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        {new Date(doc.date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Chat Session (lg:col-span-8) */}
      <div className="lg:col-span-8 h-full">
        <ChatWindow 
          messages={messages} 
          onSendMessage={handleSendMessage} 
          loading={chatLoading} 
        />
      </div>

      {/* DOCUMENT INDEX MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md transition-opacity">
          
          <div className="w-full max-w-lg glass-card rounded-2xl overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-white/5 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-400" />
                <h3 className="font-bold text-slate-200 text-sm tracking-wide uppercase">Index New Knowledge</h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleAddDocument} className="p-6 space-y-4">
              
              {/* Feedback messages */}
              {uploadError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                  ⚠️ {uploadError}
                </div>
              )}

              {uploadSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Knowledge added and indexed successfully!
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Document Title</label>
                <input
                  type="text"
                  required
                  disabled={docLoading || uploadSuccess}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. HR-04: Remote Expense Guidelines"
                  className="w-full glass-input rounded-xl py-2.5 px-4 text-xs text-slate-100 placeholder-slate-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Document Type</label>
                <select
                  disabled={docLoading || uploadSuccess}
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="w-full glass-input rounded-xl py-2.5 px-4 text-xs text-slate-100 focus:outline-none bg-slate-900 cursor-pointer"
                >
                  <option value="HR Policy">HR Policy</option>
                  <option value="IT Security">IT Security</option>
                  <option value="Operations">Operations</option>
                  <option value="General Document">General Document</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Document Content</label>
                <textarea
                  rows="6"
                  required
                  disabled={docLoading || uploadSuccess}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Paste or write document policies here. Include clear instructions so RAG can search it correctly..."
                  className="w-full glass-input rounded-xl py-2.5 px-4 text-xs text-slate-100 placeholder-slate-600 focus:outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                
                <button
                  type="submit"
                  disabled={docLoading || uploadSuccess}
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-md transition-all duration-300 cursor-pointer"
                >
                  {docLoading ? 'Analyzing & Embedding...' : 'Index Document'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}
    </div>
  );
}
