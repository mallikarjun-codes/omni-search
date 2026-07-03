import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

export default function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Theme State Controller ──────────────────────────────────────────────────
  // Reads persisted preference from localStorage; defaults to "dark" (charcoal).
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });

  // Apply / remove class on <html> whenever theme changes (class-based dark mode).
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };
  // ───────────────────────────────────────────────────────────────────────────

  // Load auth state on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (storedToken) {
      setToken(storedToken);
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (err) {
          // Corrupted storage
          localStorage.removeItem('user');
        }
      }
    } else {
      localStorage.removeItem('user');
    }
    setLoading(false);
  }, []);

  const handleAuthSuccess = (newToken, userData) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 dark:bg-[#252525] flex flex-col items-center justify-center text-slate-400">
        <div className="w-10 h-10 rounded-full border-2 border-brand-500 border-t-transparent animate-spin mb-4" />
        <span className="text-xs font-mono tracking-widest uppercase">Connecting to Brain...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 dark:bg-[#252525] light:bg-slate-50 flex flex-col transition-colors duration-300">
      {/* Dynamic Background Overlays — hidden in dark/charcoal mode */}
      <div className="fixed inset-0 pointer-events-none z-0 dark:hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-brand-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-600/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Navigation - only show if not logged in */}
        {!token && <Navbar user={user} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />}
        
        {/* Content */}
        <main className="flex-1 flex flex-col">
          {token ? (
            <Dashboard user={user} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />
          ) : (
            <Login onAuthSuccess={handleAuthSuccess} />
          )}
        </main>
      </div>
    </div>
  );
}
