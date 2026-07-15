import React from 'react';
import { User, Shield, LogOut, Upload, MessageSquare } from 'lucide-react';

export default function ProfileView({ user, onLogout }) {
  const role = user?.role || 'employee';
  const isAdmin = role === 'admin';

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6 h-full overflow-y-auto">

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-900/40 via-indigo-950/40 to-slate-900/40 border border-white/5 p-6 sm:p-8 backdrop-blur-md">
        <div className="absolute top-[-20%] right-[-10%] w-[40%] h-[150%] bg-brand-500/10 rounded-full blur-[80px] pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-center gap-5 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-xl shadow-brand-500/20 flex-shrink-0">
            <User className="w-8 h-8 text-white" />
          </div>
          <div className="text-center sm:text-left">
            <span className={`text-[10px] font-mono tracking-widest uppercase px-2.5 py-1 rounded-full border ${
              isAdmin
                ? 'text-amber-300 bg-amber-500/10 border-amber-500/20'
                : 'text-brand-400 bg-brand-500/10 border-brand-500/20'
            }`}>
              {isAdmin ? 'Administrator' : 'Employee'}
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-100 mt-2.5">
              {user?.name || 'Account'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              {user?.email || ''}
            </p>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-white/5">
          <Shield className="w-5 h-5 text-brand-400" />
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Account</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3 bg-white/5 rounded-xl border border-white/5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-medium">Name</span>
            <span className="text-xs font-medium text-slate-300 block mt-1">{user?.name || 'N/A'}</span>
          </div>
          <div className="p-3 bg-white/5 rounded-xl border border-white/5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-medium">Email</span>
            <span className="text-xs font-mono text-slate-300 block mt-1 break-all">{user?.email || 'N/A'}</span>
          </div>
        </div>

        <div className="p-4 bg-white/5 rounded-xl border border-white/5 flex items-start gap-3">
          {isAdmin ? (
            <Upload className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          ) : (
            <MessageSquare className="w-5 h-5 text-brand-400 flex-shrink-0 mt-0.5" />
          )}
          <div>
            <span className="text-xs font-semibold text-slate-200 block">
              {isAdmin ? 'Admin access' : 'Employee access'}
            </span>
            <p className="text-xs text-slate-400 mt-0.5">
              {isAdmin
                ? 'You can upload and manage documents in the shared knowledge base, and ask questions across all uploaded content.'
                : 'You can ask questions across all documents uploaded by an admin. Document upload is restricted to admin accounts.'}
            </p>
          </div>
        </div>

        <div className="pt-4 flex flex-col sm:flex-row gap-4 items-center justify-between border-t border-white/5">
          <span className="text-xs text-slate-400">Need to sign in with a different account?</span>
          <button
            onClick={onLogout}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white rounded-xl border border-red-500/20 hover:border-transparent transition-all duration-300 font-semibold text-xs cursor-pointer shadow-md hover:shadow-red-900/20"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
