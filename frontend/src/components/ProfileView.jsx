import React, { useMemo } from 'react';
import { User, Mail, Shield, Key, LogOut, Clock, Activity, FileCode, CheckCircle } from 'lucide-react';

export default function ProfileView({ user, onLogout }) {
  const token = localStorage.getItem('token');

  // Decode JWT on the fly
  const decodedToken = useMemo(() => {
    if (!token) return null;
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        window.atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.error('Failed to decode JWT token:', e);
      return null;
    }
  }, [token]);

  const tokenHeader = useMemo(() => {
    if (!token) return null;
    try {
      const base64Url = token.split('.')[0];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(window.atob(base64));
    } catch (e) {
      return null;
    }
  }, [token]);

  const iatDate = decodedToken?.iat ? new Date(decodedToken.iat * 1000).toLocaleString() : 'N/A';
  const expDate = decodedToken?.exp ? new Date(decodedToken.exp * 1000).toLocaleString() : 'N/A';

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6 h-full overflow-y-auto">
      
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-900/40 via-indigo-950/40 to-slate-900/40 border border-white/5 p-6 sm:p-8 backdrop-blur-md">
        <div className="absolute top-[-20%] right-[-10%] w-[40%] h-[150%] bg-brand-500/10 rounded-full blur-[80px] pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row items-center gap-5 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-xl shadow-brand-500/20 flex-shrink-0">
            <User className="w-8 h-8 text-white" />
          </div>
          <div className="text-center sm:text-left">
            <span className="text-[10px] font-mono tracking-widest text-brand-400 uppercase bg-brand-500/10 px-2.5 py-1 rounded-full border border-brand-500/20">
              Corporate Account
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-100 mt-2.5">
              {user?.name || decodedToken?.name || 'Authorized Member'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              {user?.email || decodedToken?.email || 'member@omnisearch.corp'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Profile Card & Details */}
        <div className="md:col-span-2 space-y-6">
          <div className="glass-card rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-white/5">
              <Shield className="w-5 h-5 text-brand-400" />
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Account Information</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-medium">User Identifier</span>
                <span className="text-xs font-mono text-slate-300 select-all block mt-1">
                  {user?.id || decodedToken?.id || 'N/A'}
                </span>
              </div>
              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-medium">Security Clearance</span>
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 mt-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Active Employee
                </span>
              </div>
              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-medium">Authentication Type</span>
                <span className="text-xs font-mono text-slate-300 block mt-1">JWT Bearer Token</span>
              </div>
              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-medium">Session Status</span>
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5 mt-1">
                  <Activity className="w-3.5 h-3.5 text-brand-400 animate-pulse" />
                  Connected / Verified
                </span>
              </div>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row gap-4 items-center justify-between border-t border-white/5">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Clock className="w-4 h-4 text-slate-500" />
                <span>Need to connect with different credentials?</span>
              </div>
              <button
                onClick={onLogout}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white rounded-xl border border-red-500/20 hover:border-transparent transition-all duration-300 font-semibold text-xs cursor-pointer shadow-md hover:shadow-red-900/20"
              >
                <LogOut className="w-4 h-4" />
                Sign Out Account
              </button>
            </div>
          </div>

          {/* JWT Token Breakdown */}
          {decodedToken && (
            <div className="glass-card rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-white/5">
                <Key className="w-5 h-5 text-brand-400" />
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">JWT Session Metadata</h3>
              </div>

              <div className="space-y-3.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-medium">Token Issued At:</span>
                  <span className="font-mono text-slate-300 text-right">{iatDate}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-medium">Token Expiration:</span>
                  <span className="font-mono text-slate-300 text-right">{expDate}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-medium">Algorithm / Protocol:</span>
                  <span className="font-mono text-slate-300 text-right">{tokenHeader?.alg || 'HS256'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Technical Inspector Column */}
        <div className="md:col-span-1">
          <div className="glass-card rounded-2xl p-6 h-full flex flex-col space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-white/5 flex-shrink-0">
              <FileCode className="w-5 h-5 text-brand-400" />
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Token Inspector</h3>
            </div>

            <div className="flex-1 flex flex-col min-h-[250px] overflow-hidden">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mb-2">Decoded Claims Payload</span>
              <pre className="flex-1 w-full bg-slate-950/60 border border-white/5 rounded-xl p-3.5 text-[10px] font-mono text-brand-300 overflow-auto whitespace-pre-wrap select-all leading-relaxed font-sans">
                {JSON.stringify(decodedToken, null, 2)}
              </pre>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
