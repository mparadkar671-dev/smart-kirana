import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { authService, SignUpShopData } from '../services/authService';
import { isSupabaseConfigured } from '../lib/supabase';
import { UserRole } from '../types';

export type AppModule = 'BILLING' | 'INVENTORY' | 'KHATA' | 'GALLA' | 'REPORTS' | 'SETTINGS' | 'DATA_WIPE';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: UserRole;
  isLoading: boolean;
  isAuthenticated: boolean;
  isOfflineGuest: boolean;
  continueAsGuest: () => void;
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string, shopData: SignUpShopData) => Promise<{ needEmailVerification: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendConfirmationEmail: (email: string) => Promise<boolean>;
  hasPermission: (module: AppModule) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<UserRole>('OWNER');
  const [isLoading, setIsLoading] = useState(true);
  const [isOfflineGuest, setIsOfflineGuest] = useState(() => {
    return localStorage.getItem('kirana_guest_mode') === 'true';
  });

  const refreshUserRole = async (u: User | null) => {
    if (!u) {
      setUserRole('OWNER');
      return;
    }
    try {
      const role = await authService.getUserRole(u.id, u.email);
      setUserRole(role);
    } catch {
      setUserRole('OWNER');
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    // Check existing active session
    authService.getSession().then((currSession) => {
      setSession(currSession);
      const currentUser = currSession?.user ?? null;
      setUser(currentUser);
      refreshUserRole(currentUser);
      setIsLoading(false);
    });

    // Listen to auth changes
    const unsubscribe = authService.onAuthStateChange((_event, newSession, newUser) => {
      setSession(newSession);
      setUser(newUser);
      refreshUserRole(newUser);
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
    await refreshUserRole(res.user);
    localStorage.removeItem('kirana_guest_mode');
    setIsOfflineGuest(false);
  };

  const signUp = async (email: string, pass: string, shopData: SignUpShopData) => {
    const res = await authService.signUp(email, pass, shopData);
    setUser(res.user);
    setSession(res.session);
    if (res.user) {
      await refreshUserRole(res.user);
    }
    const needEmailVerification = !res.session && Boolean(res.user);
    return { needEmailVerification };
  };

  const resendConfirmationEmail = async (email: string) => {
    return await authService.resendConfirmationEmail(email);
  };

  const signOut = async () => {
    await authService.signOut();
    setUser(null);
    setSession(null);
    setUserRole('OWNER');
    localStorage.removeItem('kirana_guest_mode');
    setIsOfflineGuest(false);
  };

  const resetPassword = async (email: string) => {
    await authService.resetPasswordForEmail(email);
  };

  /**
   * Enterprise Role-Based Access Control logic
   */
  const hasPermission = (module: AppModule): boolean => {
    // Guest or Owner has full administrative permissions
    if (isOfflineGuest || userRole === 'OWNER') return true;

    switch (userRole) {
      case 'MANAGER':
        // Manager can do everything except destructive factory data wiping
        return module !== 'DATA_WIPE';
      case 'ACCOUNTANT':
        // Accountant specializes in financial audits, khata ledgers, stock valuation & reports
        return ['REPORTS', 'KHATA', 'GALLA', 'INVENTORY'].includes(module);
      case 'CASHIER':
        // Cashier specializes in fast counter billing and khata receipt entry
        return ['BILLING', 'KHATA'].includes(module);
      default:
        return true;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        userRole,
        isLoading,
        isAuthenticated: Boolean(user),
        isOfflineGuest,
        continueAsGuest,
        signIn,
        signUp,
        signOut,
        resetPassword,
        resendConfirmationEmail,
        hasPermission,
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
