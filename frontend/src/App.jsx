import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load auth state on mount
  useEffect(() => {
    const token = localStorage.getItem('rag_token');
    const storedUser = localStorage.getItem('rag_user');
    
    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (err) {
        // Corrupted storage
        localStorage.removeItem('rag_token');
        localStorage.removeItem('rag_user');
      }
    }
    setLoading(false);
  }, []);

  const handleAuthSuccess = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('rag_token');
    localStorage.removeItem('rag_user');
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <div className="w-10 h-10 rounded-full border-2 border-brand-500 border-t-transparent animate-spin mb-4" />
        <span className="text-xs font-mono tracking-widest uppercase">Connecting to Brain...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Dynamic Background Overlays */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-brand-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-600/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Navigation */}
        <Navbar user={user} onLogout={handleLogout} />
        
        {/* Content */}
        <main className="flex-1">
          {user ? (
            <Dashboard />
          ) : (
            <Login onAuthSuccess={handleAuthSuccess} />
          )}
        </main>
      </div>
    </div>
  );
}
