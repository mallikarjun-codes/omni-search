import React from 'react';
import { Bot, LogOut, Shield, User } from 'lucide-react';

export default function Navbar({ user, onLogout }) {
  return (
    <header className="glass border-b border-white/5 sticky top-0 z-50 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        
        {/* Left: Branding & Logo */}
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-brand-600 to-violet-500 p-2 rounded-xl shadow-lg shadow-brand-500/10 flex items-center justify-center animate-pulse">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-brand-300 bg-clip-text text-transparent">
              Antigravity RAG
            </h1>
            <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">Company Brain v1.0</p>
          </div>
        </div>

        {/* Right: User profile / logout */}
        {user && (
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5">
              <div className="w-6 h-6 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-brand-300" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-200 leading-none">{user.name}</span>
                <span className="text-[9px] text-slate-400 font-mono mt-0.5">{user.email}</span>
              </div>
            </div>
            
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-300 hover:text-red-400 rounded-lg hover:bg-red-500/10 border border-white/5 hover:border-red-500/20 transition-all duration-300 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Sign Out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
