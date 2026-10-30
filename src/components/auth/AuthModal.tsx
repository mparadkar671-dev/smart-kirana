import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { validatePasswordStrength } from '../../services/authService';
import {
  Lock,
  Mail,
  Store,
  User as UserIcon,
  Phone,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  X,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AuthTab = 'signin' | 'signup' | 'forgot' | 'verify_pending';

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { signIn, signUp, resetPassword, continueAsGuest } = useAuth();
  const [tab, setTab] = useState<AuthTab>('signin');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const passwordValidation = validatePasswordStrength(password);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmitting(true);
    try {
      await signIn(email.trim(), password);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid credentials. Please verify your email & password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!passwordValidation.isValid) {
      setErrorMsg(`Password requirements: ${passwordValidation.errors.join(', ')}`);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please re-enter.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await signUp(email.trim(), password, {
        shopName: shopName.trim() || 'My Kirana Store',
        ownerName: ownerName.trim() || 'Owner',
        phone: phone.trim() || '',
      });

      if (res.needEmailVerification) {
        setTab('verify_pending');
      } else {
        setSuccessMsg('Account registered successfully!');
        setTimeout(() => onClose(), 1000);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMsg('Please enter your registered email address.');
      return;
    }
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await resetPassword(email.trim());
      setSuccessMsg('Password reset link sent to your email. Check your inbox & spam folder.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send reset link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOfflineMode = () => {
    continueAsGuest();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden transition-colors">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-800 p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-xs border border-white/20">
              <ShieldCheck className="w-6 h-6 text-orange-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Smart Kirana Cloud</h2>
              <p className="text-xs text-blue-200">Supabase Standard Security &amp; Sync</p>
            </div>
          </div>

          {/* Tab selector */}
          {tab !== 'verify_pending' && (
            <div className="flex border-b border-white/15 mt-4 pt-1 gap-6 text-sm font-medium">
              <button
                type="button"
                onClick={() => {
                  setTab('signin');
                  setErrorMsg(null);
                }}
                className={`pb-2 border-b-2 transition ${
                  tab === 'signin' ? 'border-orange-400 text-orange-400 font-semibold' : 'border-transparent text-white/70 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('signup');
                  setErrorMsg(null);
                }}
                className={`pb-2 border-b-2 transition ${
                  tab === 'signup' ? 'border-orange-400 text-orange-400 font-semibold' : 'border-transparent text-white/70 hover:text-white'
                }`}
              >
                Register Store
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-6">
          {errorMsg && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 flex items-start gap-2.5 text-xs text-green-700 dark:text-green-300">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* TAB 1: SIGN IN */}
          {tab === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="shop@example.com"
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setTab('forgot')}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Signing In...
                  </>
                ) : (
                  <>
                    Sign In to Store <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* TAB 2: SIGN UP */}
          {tab === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="kirana@example.com"
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                    Store Name
                  </label>
                  <div className="relative">
                    <Store className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      required
                      value={shopName}
                      onChange={(e) => setShopName(e.target.value)}
                      placeholder="Ganesh Kirana"
                      className="w-full pl-8 pr-2 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                    Phone
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="9876543210"
                      className="w-full pl-8 pr-2 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Owner Name
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Ramesh Patel"
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Standard Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 chars, 1 uppercase, 1 symbol/number"
                    className="w-full pl-9 pr-10 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Password Strength Meter */}
                {password && (
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-500">Security Strength:</span>
                      <span
                        className={`font-semibold ${
                          passwordValidation.score === 100
                            ? 'text-green-600'
                            : passwordValidation.score >= 50
                            ? 'text-amber-600'
                            : 'text-red-600'
                        }`}
                      >
                        {passwordValidation.label}
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          passwordValidation.score === 100
                            ? 'bg-green-500 w-full'
                            : passwordValidation.score === 75
                            ? 'bg-blue-500 w-3/4'
                            : passwordValidation.score === 50
                            ? 'bg-amber-500 w-1/2'
                            : 'bg-red-500 w-1/4'
                        }`}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-400 pt-1">
                      <span className={passwordValidation.hasMinLength ? 'text-green-600 font-medium' : ''}>
                        {passwordValidation.hasMinLength ? '✓' : '•'} 8+ characters
                      </span>
                      <span className={passwordValidation.hasUppercase ? 'text-green-600 font-medium' : ''}>
                        {passwordValidation.hasUppercase ? '✓' : '•'} Uppercase letter
                      </span>
                      <span className={passwordValidation.hasLowercase ? 'text-green-600 font-medium' : ''}>
                        {passwordValidation.hasLowercase ? '✓' : '•'} Lowercase letter
                      </span>
                      <span className={passwordValidation.hasNumberOrSpecial ? 'text-green-600 font-medium' : ''}>
                        {passwordValidation.hasNumberOrSpecial ? '✓' : '•'} Number or symbol
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !passwordValidation.isValid}
                className="w-full py-2.5 px-4 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Creating Account...
                  </>
                ) : (
                  <>Create Verified Store Account</>
                )}
              </button>
            </form>
          )}

          {/* TAB 3: FORGOT PASSWORD */}
          {tab === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Enter your registered store email. We will send you an official password recovery link.
              </p>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="shop@example.com"
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-bold text-sm transition"
              >
                {isSubmitting ? 'Sending...' : 'Send Password Reset Link'}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setTab('signin')}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  ← Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* TAB 4: EMAIL VERIFICATION PENDING */}
          {tab === 'verify_pending' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-14 h-14 bg-blue-100 dark:bg-blue-950/60 rounded-full flex items-center justify-center mx-auto text-blue-600 dark:text-blue-400">
                <Mail className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Verify Your Email Address</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-xs mx-auto">
                  We have sent a secure verification email to <strong className="text-blue-600">{email}</strong>.
                  Please click the link in that email to confirm your account and activate cloud synchronization.
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg text-left text-xs space-y-1 border border-slate-200 dark:border-slate-700">
                <div className="font-semibold text-slate-700 dark:text-slate-300">Next Steps:</div>
                <div className="text-slate-500 dark:text-slate-400">• Check your inbox or spam folder</div>
                <div className="text-slate-500 dark:text-slate-400">• Click the confirmation link</div>
                <div className="text-slate-500 dark:text-slate-400">• Return here and Sign In</div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTab('signin')}
                  className="flex-1 py-2 px-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold transition"
                >
                  Go to Sign In
                </button>
                <button
                  type="button"
                  onClick={handleOfflineMode}
                  className="flex-1 py-2 px-3 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs font-medium transition"
                >
                  Continue Offline
                </button>
              </div>
            </div>
          )}

          {/* Offline Counter Mode Divider */}
          {tab !== 'verify_pending' && (
            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 text-center">
              <button
                type="button"
                onClick={handleOfflineMode}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white underline font-medium transition"
              >
                ⚡ Use Counter in Offline / Guest Mode (No Cloud Account)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

