import React, { useState } from 'react';
import { Bot, Mail, Lock, User, ArrowRight, ShieldCheck, HelpCircle } from 'lucide-react';

export default function Login({ onAuthSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const url = isRegister 
      ? 'http://localhost:5000/api/auth/register' 
      : 'http://localhost:5000/api/auth/login';
    
    const payload = isRegister 
      ? { name, email, password } 
      : { email, password };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Authentication failed');
      }

      // Success
      localStorage.setItem('rag_token', data.token);
      localStorage.setItem('rag_user', JSON.stringify(data.user));
      onAuthSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[90vh] flex items-center justify-center p-4 relative">
      
      {/* Decorative background glows */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-brand-600/10 rounded-full blur-3xl glow-indigo pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-violet-600/10 rounded-full blur-3xl glow-violet pointer-events-none" />

      {/* Main Card */}
      <div className="w-full max-w-md glass-card rounded-3xl p-8 relative z-10">
        
        {/* Brand logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-gradient-to-tr from-brand-600 to-violet-500 p-3 rounded-2xl shadow-xl shadow-brand-500/10 mb-4 flex items-center justify-center">
            <Bot className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white text-center">
            {isRegister ? 'Create Account' : 'Company Portal'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isRegister ? 'Register for Company RAG Bot' : 'Access internal documentation and guidelines'}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-medium text-red-400 text-center">
            ⚠️ {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Full Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full glass-input rounded-xl py-3 pl-11 pr-4 text-sm text-slate-100 placeholder-slate-600 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Corporate Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@ourcompany.com"
                className="w-full glass-input rounded-xl py-3 pl-11 pr-4 text-sm text-slate-100 placeholder-slate-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full glass-input rounded-xl py-3 pl-11 pr-4 text-sm text-slate-100 placeholder-slate-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white rounded-xl py-3 text-sm font-semibold shadow-lg shadow-brand-600/10 hover:shadow-brand-500/20 flex items-center justify-center gap-2 transition-all duration-300 cursor-pointer"
          >
            {loading ? 'Processing...' : (isRegister ? 'Sign Up' : 'Sign In')}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        {/* Toggle link */}
        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
            className="text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium cursor-pointer"
          >
            {isRegister 
              ? 'Already have an account? Sign In' 
              : "New employee? Request account access"
            }
          </button>
        </div>

        {/* Footer badges */}
        <div className="mt-8 pt-6 border-t border-white/5 flex justify-center gap-6 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-brand-400" />
            256-Bit Encrypted
          </span>
          <span className="flex items-center gap-1">
            <HelpCircle className="w-3 h-3 text-brand-400" />
            Support Desk
          </span>
        </div>

      </div>
    </div>
  );
}
