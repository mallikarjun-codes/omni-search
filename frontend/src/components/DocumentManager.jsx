import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, 
  Trash2, 
  Upload, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Database,
  Calendar,
  Sparkles
} from 'lucide-react';

export default function DocumentManager({ user }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const fileInputRef = useRef(null);

  // Fetch document metadata list
  const fetchDocuments = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('http://localhost:5000/api/documents', {
        headers: {
          'Authorization': 'Bearer ' + localStorage.getItem('token')
        }
      });
      if (!res.ok) {
        throw new Error('Failed to fetch documents from server.');
      }
      const data = await res.json();
      setDocuments(data || []);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error loading documents.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  // Format bytes to KB/MB
  const formatFileSize = (bytes) => {
    if (bytes === undefined || bytes === null) return '0 Bytes';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Localized date formatter
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Handle Drag & Drop Events
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      validateAndUpload(file);
    }
  };

  // Select file from file browser
  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndUpload(e.target.files[0]);
    }
  };

  // Validate PDF type and trigger upload
  const validateAndUpload = (file) => {
    setError('');
    setSuccess('');
    
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Unsupported file type. Please upload a valid PDF document.');
      return;
    }
    
    uploadPDF(file);
  };

  // Perform multi-part upload via XMLHttpRequest to get progress indicators
  const uploadPDF = (file) => {
    setUploading(true);
    setUploadProgress(0);
    setStatusMessage('Uploading PDF to Server...');

    const formData = new FormData();
    formData.append('file', file);
    // Derive a clean title from file name
    const title = file.name.replace(/\.[^/.]+$/, "");
    formData.append('title', title);
    formData.append('type', 'General Document');

    const token = localStorage.getItem('token');
    const xhr = new XMLHttpRequest();

    xhr.open('POST', 'http://localhost:5000/api/documents/upload');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    // Track upload progress
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
        if (percent === 100) {
          setStatusMessage('Parsing PDF & Indexing Chunks into Pinecone...');
        }
      }
    };

    // Track response completion
    xhr.onload = () => {
      setUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          setSuccess(res.message || 'PDF successfully processed, embedded and indexed!');
          fetchDocuments();
        } catch (e) {
          setError('Failed to parse server upload response.');
        }
      } else {
        try {
          const res = JSON.parse(xhr.responseText);
          setError(res.error || 'Server rejected PDF document upload.');
        } catch (e) {
          setError(`Upload failed with status code ${xhr.status}`);
        }
      }
    };

    // Track network failure
    xhr.onerror = () => {
      setUploading(false);
      setError('Network connection error occurred during upload.');
    };

    xhr.send(formData);
  };

  // Handle Document Deletion
  const handleDelete = async (id, title) => {
    if (!window.confirm(`Are you sure you want to permanently delete and de-index "${title}"?`)) {
      return;
    }

    setError('');
    setSuccess('');
    try {
      const res = await fetch(`http://localhost:5000/api/documents/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer ' + localStorage.getItem('token')
        }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete document.');
      }

      setSuccess(`"${title}" has been successfully removed from PostgreSQL and Pinecone.`);
      fetchDocuments();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error deleting document.');
    }
  };

  // Filter list matching search queries
  const filteredDocuments = documents.filter(doc => 
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (doc.fileName && doc.fileName.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (doc.type && doc.type.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="h-full flex flex-col bg-slate-900/40 border border-white/5 rounded-2xl p-6 overflow-hidden backdrop-blur-md">
      
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white font-sans flex items-center gap-2">
            <Database className="w-5 h-5 text-brand-400" />
            Document Manager
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Drag-and-drop secure PDF files to ingest context. Indexing breaks files into paragraphs, embeds them using Gemini, and uploads to Pinecone.
          </p>
        </div>

        {/* Quick Database Status Stats */}
        <div className="flex items-center gap-3 bg-white/5 border border-white/5 px-4 py-2 rounded-xl text-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-slate-300 font-mono">Pinecone Status: Online</span>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="mb-4 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2 flex-shrink-0">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 flex items-center gap-2 flex-shrink-0">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Drag & Drop File Target Card */}
      <div className="mb-6 flex-shrink-0">
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 ${
            uploading ? 'pointer-events-none opacity-80' : ''
          } ${
            dragActive 
              ? 'border-brand-500 bg-brand-500/10 scale-[1.01] shadow-lg shadow-brand-500/5' 
              : 'border-white/10 bg-slate-950/20 hover:border-brand-500/40 hover:bg-white/5'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading}
          />

          {uploading ? (
            <div className="space-y-4 w-full max-w-xs">
              <div className="flex justify-center">
                <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
              </div>
              <div className="text-sm font-semibold text-slate-200 animate-pulse text-center">
                {statusMessage}
              </div>
              
              {/* Progress Percentage Indicator */}
              <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-brand-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              <div className="text-[10px] text-slate-500 font-mono text-center">
                {uploadProgress}% Uploaded
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center mx-auto text-slate-400 group-hover:text-brand-400 transition-colors">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <span className="font-semibold text-slate-200 text-sm">
                  Drag and drop your PDF here, or <span className="text-brand-400 underline">browse files</span>
                </span>
                <p className="text-xs text-slate-500 mt-1">Accepts PDF files up to 10MB</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grid Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6 flex-shrink-0">
        <div className="p-4 rounded-xl bg-white/5 border border-white/5">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Total Documents</span>
          <span className="text-lg font-bold text-brand-300 block mt-0.5">{documents.length} Files</span>
        </div>
        <div className="p-4 rounded-xl bg-white/5 border border-white/5">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Personal Uploads</span>
          <span className="text-lg font-bold text-violet-300 block mt-0.5">
            {documents.filter(d => d.userId === user?.id).length} Files
          </span>
        </div>
        <div className="p-4 rounded-xl bg-white/5 border border-white/5">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Total Embedded Chunks</span>
          <span className="text-sm font-semibold text-slate-200 block mt-1.5">Auto-computed on ingest</span>
        </div>
      </div>

      {/* Data Table Search & Control Bar */}
      <div className="mb-4 flex-shrink-0 flex items-center">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter documents by title or type..."
          className="w-full max-w-sm glass-input rounded-xl py-2 px-4 text-xs text-slate-100 placeholder-slate-600 focus:outline-none"
        />
      </div>

      {/* Documents Data Table */}
      <div className="flex-1 overflow-auto border border-white/5 rounded-2xl bg-slate-950/20">
        {loading && documents.length === 0 ? (
          <div className="h-full flex items-center justify-center p-8">
            <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 min-h-[220px]">
            <FileText className="w-10 h-10 text-slate-600 mb-2" />
            <h4 className="text-slate-300 font-semibold text-sm">No indexed knowledge found</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Try search queries with different terms, or drag & drop a PDF document to begin.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-white/5 bg-white/5 text-[10px] font-mono tracking-wider text-slate-400 uppercase select-none">
                <th className="px-6 py-3.5 font-semibold">Document Title</th>
                <th className="px-6 py-3.5 font-semibold">File Size</th>
                <th className="px-6 py-3.5 font-semibold">Upload Date</th>
                <th className="px-6 py-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs text-slate-300">
              {filteredDocuments.map((doc) => {
                const isUserDoc = doc.userId === user?.id;
                return (
                  <tr 
                    key={doc.id}
                    className="hover:bg-white/5 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-brand-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-200 block truncate max-w-xs md:max-w-md">
                            {doc.title}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono tracking-wider uppercase">
                            {doc.type || 'General Document'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-[11px] text-slate-400">
                      {formatFileSize(doc.fileSize)}
                    </td>
                    <td className="px-6 py-4 font-mono text-[11px] text-slate-400">
                      {formatDate(doc.date)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isUserDoc ? (
                        <button
                          onClick={() => handleDelete(doc.id, doc.title)}
                          title="Delete document and remove vectors"
                          className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-white/5 transition-all cursor-pointer inline-flex items-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <span 
                          title="System-seeded default documents cannot be deleted"
                          className="px-2.5 py-1 rounded bg-white/5 text-[9px] font-semibold text-slate-500 border border-white/5 cursor-not-allowed uppercase font-mono tracking-wider"
                        >
                          System
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
