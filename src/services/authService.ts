import { supabase } from '../lib/supabase';
import { User, Session } from '@supabase/supabase-js';

export interface PasswordValidationResult {
  isValid: boolean;
  score: number; // 0 to 100
  label: 'Too Weak' | 'Weak' | 'Medium' | 'Strong';
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumberOrSpecial: boolean;
  errors: string[];
}

/**
 * Standard enterprise password strength validator
 * Requirements: >= 8 characters, >= 1 uppercase, >= 1 lowercase, >= 1 digit/symbol
 */
export const validatePasswordStrength = (password: string): PasswordValidationResult => {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumberOrSpecial = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

  const errors: string[] = [];
  if (!hasMinLength) errors.push('Minimum 8 characters');
  if (!hasUppercase) errors.push('At least 1 uppercase letter (A-Z)');
  if (!hasLowercase) errors.push('At least 1 lowercase letter (a-z)');
  if (!hasNumberOrSpecial) errors.push('At least 1 number or special character');

  let passedRules = 0;
  if (hasMinLength) passedRules++;
  if (hasUppercase) passedRules++;
  if (hasLowercase) passedRules++;
  if (hasNumberOrSpecial) passedRules++;

  let score = 0;
  let label: PasswordValidationResult['label'] = 'Too Weak';

  if (passedRules === 1) {
    score = 25;
    label = 'Too Weak';
  } else if (passedRules === 2) {
    score = 50;
    label = 'Weak';
  } else if (passedRules === 3) {
    score = 75;
    label = 'Medium';
  } else if (passedRules === 4) {
    score = 100;
    label = 'Strong';
  }

  return {
    isValid: passedRules === 4,
    score,
    label,
    hasMinLength,
    hasUppercase,
    hasLowercase,
    hasNumberOrSpecial,
    errors,
  };
};

export interface SignUpShopData {
  shopName: string;
  ownerName: string;
  phone: string;
}

export const authService = {
  /**
   * Registers a new store owner with standard password verification & Supabase Auth
   */
  async signUp(email: string, password: string, shopData: SignUpShopData) {
    const validation = validatePasswordStrength(password);
    if (!validation.isValid) {
      throw new Error(`Password does not meet standard security rules: ${validation.errors.join(', ')}`);
    }

    if (!supabase) {
      throw new Error('Supabase client is not configured. Check your credentials in Settings.');
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          shop_name: shopData.shopName,
          owner_name: shopData.ownerName,
          phone: shopData.phone,
        },
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });

    if (error) {
      throw error;
    }

    return data;
  },

  /**
   * Signs in with email and password
   */
  async signIn(email: string, password: string) {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    return data;
  },

  /**
   * Sends password reset link to user's registered email
   */
  async resetPasswordForEmail(email: string) {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    });

    if (error) {
      throw error;
    }

    return data;
  },

  /**
   * Signs out user
   */
  async signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  },

  /**
   * Gets current session
   */
  async getSession(): Promise<Session | null> {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  /**
   * Subscribes to auth state changes
   */
  onAuthStateChange(callback: (event: string, session: Session | null, user: User | null) => void) {
    if (!supabase) return () => {};
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session, session?.user ?? null);
    });
    return () => {
      data.subscription.unsubscribe();
    };
  },
};

