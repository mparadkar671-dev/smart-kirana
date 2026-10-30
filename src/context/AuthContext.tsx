import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { authService, SignUpShopData } from '../services/authService';
import { isSupabaseConfigured } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isOfflineGuest: boolean;
  continueAsGuest: () => void;
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string, shopData: SignUpShopData) => Promise<{ needEmailVerification: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOfflineGuest, setIsOfflineGuest] = useState(() => {
    return localStorage.getItem('kirana_guest_mode') === 'true';
  });

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    // Check existing active session
    authService.getSession().then((currSession) => {
      setSession(currSession);
      setUser(currSession?.user ?? null);
      setIsLoading(false);
    });

    // Listen to auth changes
    const unsubscribe = authService.onAuthStateChange((_event, newSession, newUser) => {
      setSession(newSession);
      setUser(newUser);
      setIsLoading(false);
      if (newUser) {
        localStorage.removeItem('kirana_guest_mode');
        setIsOfflineGuest(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const continueAsGuest = () => {
    localStorage.setItem('kirana_guest_mode', 'true');
    setIsOfflineGuest(true);
  };

  const signIn = async (email: string, pass: string) => {
    const res = await authService.signIn(email, pass);
    setUser(res.user);
    setSession(res.session);
    localStorage.removeItem('kirana_guest_mode');
    setIsOfflineGuest(false);
  };

  const signUp = async (email: string, pass: string, shopData: SignUpShopData) => {
    const res = await authService.signUp(email, pass, shopData);
    setUser(res.user);
    setSession(res.session);
    // If Supabase has email confirmations enabled, session will be null
    const needEmailVerification = !res.session && Boolean(res.user);
    return { needEmailVerification };
  };

  const signOut = async () => {
    await authService.signOut();
    setUser(null);
    setSession(null);
  };

  const resetPassword = async (email: string) => {
    await authService.resetPasswordForEmail(email);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isAuthenticated: Boolean(user),
        isOfflineGuest,
        continueAsGuest,
        signIn,
        signUp,
        signOut,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
