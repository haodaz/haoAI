'use client';

import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { Lock, User, ArrowRight, Shield, UserPlus } from 'lucide-react';
import { usePathname } from 'next/navigation';
import type { SessionUser } from '@/lib/roles';

// ── Auth Context ────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: SessionUser | null;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue>({ user: null, logout: () => {} });

export function useAuth() {
  return useContext(AuthContext);
}

// ── Videos for login background ─────────────────────────────────────────────

const VIDEOS = [
  '/videos/bep01.mp4',
  '/videos/bep02.mp4',
  '/videos/video1.mp4',
  '/videos/video2.mp4',
  '/videos/video3.mp4',
];

// ── AuthGuard Component ─────────────────────────────────────────────────────

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicPath = pathname?.startsWith('/chat/') || pathname?.startsWith('/sites/');

  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(!isPublicPath); // Skip checking for public paths
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Video carousel
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Check existing session on mount
  useEffect(() => {
    if (isPublicPath) return;
    
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, [isPublicPath]);

  // Video carousel
  useEffect(() => {
    if (!user && !checking && videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  }, [currentVideoIndex, user, checking]);

  const handleVideoEnd = () => {
    setCurrentVideoIndex((prev) => (prev + 1) % VIDEOS.length);
  };

  // ── Login ─────────────────────────────────────────────────────────────────

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        setIsLoading(false);
        return;
      }

      setUser(data.user);
    } catch {
      setError('Network error, please try again later');
      setIsLoading(false);
    }
  };

  // ── Register ──────────────────────────────────────────────────────────────

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, displayName: displayName || undefined }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Registration failed');
        setIsLoading(false);
        return;
      }

      setUser(data.user);
    } catch {
      setError('Network error, please try again later');
      setIsLoading(false);
    }
  };

  // ── Logout ────────────────────────────────────────────────────────────────

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setUsername('');
    setPassword('');
    setDisplayName('');
    setError('');
    setMode('login');
  };

  // ── Hydration check ───────────────────────────────────────────────────────

  if (checking) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
          <span className="text-emerald-400/60 text-sm font-medium tracking-wider">INITIALIZING...</span>
        </div>
      </div>
    );
  }

  // ── Authenticated or Public ───────────────────────────────────────────────

  if (user || isPublicPath) {
    return (
      <AuthContext.Provider value={{ user, logout: handleLogout }}>
        {children}
      </AuthContext.Provider>
    );
  }

  // ── Login / Register screen ───────────────────────────────────────────────

  const isLogin = mode === 'login';
  const onSubmit = isLogin ? handleLogin : handleRegister;

  return (
    <div className="h-screen w-screen flex items-center justify-center relative overflow-hidden bg-gray-100">
      {/* Background video carousel */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        onEnded={handleVideoEnd}
        className="absolute top-0 left-0 w-full h-full object-cover z-0 scale-[1.35] transition-opacity duration-1000"
      >
        <source src={VIDEOS[currentVideoIndex]} type="video/mp4" />
      </video>

      {/* Light frosted overlay */}
      <div className="absolute top-0 left-0 w-full h-full bg-white/40 backdrop-blur-[3px] z-[1]" />

      {/* Card */}
      <div className="relative z-10 w-[400px] max-w-full mx-4">
        {/* Form card */}
        <form
          onSubmit={onSubmit}
          className="bg-white rounded-[2rem] px-8 pt-16 pb-12 shadow-2xl shadow-black/5"
        >
          {/* Logo inside card */}
          <div className="flex justify-center mb-12">
            <img src="/bep_logo.png" alt="BEP Logo" className="h-[90px] object-contain" />
          </div>

          {/* Mode tabs */}
          <div className="flex mb-8 border-b border-gray-100">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 ${
                isLogin ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); }}
              className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 ${
                !isLogin ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              Sign Up
            </button>
          </div>

          <div className="space-y-5">
            {/* Username */}
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                USERNAME
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(''); }}
                  placeholder="Enter username"
                  autoComplete="username"
                  className="w-full pl-12 pr-4 py-3.5 bg-gray-50/50 border border-gray-200 rounded-xl text-gray-800 text-[15px] font-medium placeholder-gray-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Display Name (register only) */}
            {!isLogin && (
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                  DISPLAY NAME <span className="text-gray-300">(Optional)</span>
                </label>
                <div className="relative">
                  <UserPlus className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your display name"
                    className="w-full pl-12 pr-4 py-3.5 bg-gray-50/50 border border-gray-200 rounded-xl text-gray-800 text-[15px] font-medium placeholder-gray-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 focus:bg-white transition-all"
                  />
                </div>
              </div>
            )}

            {/* Password */}
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                PASSWORD
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="Enter password"
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  className="w-full pl-12 pr-4 py-3.5 bg-gray-50/50 border border-gray-200 rounded-xl text-gray-800 text-[15px] font-medium placeholder-gray-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 focus:bg-white transition-all"
                />
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-5 flex items-center text-red-600 text-sm font-medium bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
              <Shield className="w-4 h-4 mr-2 shrink-0" />
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading || !username || !password}
            className="mt-8 w-full flex items-center justify-center py-4 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-white text-[15px] font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                {isLogin ? 'LOG IN' : 'SIGN UP'}
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-gray-400/80 text-xs font-medium mt-8 tracking-wider">
          powered by <span className="font-bold text-gray-500">Hao</span><span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-500">AI</span>
        </p>
      </div>
    </div>
  );
}
