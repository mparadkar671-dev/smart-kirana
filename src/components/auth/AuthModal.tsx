import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { validatePasswordStrength, authService } from '../../services/authService';
import { UserRole, RegisteredShop } from '../../types';
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
  Zap,
  Building2,
  ChevronDown,
  Clock,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AuthTab = 'signin' | 'signup' | 'forgot' | 'verify_pending';

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { signIn, signUp, resetPassword, resendConfirmationEmail, continueAsGuest } = useAuth();
  const [tab, setTab] = useState<AuthTab>('signin');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('OWNER');

  // Store Invite Code & Tenant Isolation (REQ: Iteration 1)
  const [inviteCode, setInviteCode] = useState('');
  const [verifiedStore, setVerifiedStore] = useState<{ id: string; shop_name: string; owner_name: string } | null>(null);
  const [inviteCodeError, setInviteCodeError] = useState<string | null>(null);
  const [isValidatingInvite, setIsValidatingInvite] = useState(false);

  const [selectedShopId, setSelectedShopId] = useState<string>('current_shop');

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const passwordValidation = validatePasswordStrength(password);
  const isEmailNotConfirmed = errorMsg?.toLowerCase().includes('email not confirmed');
  const isPendingApproval =
    errorMsg?.toLowerCase().includes('awaiting approval') ||
    errorMsg?.includes('ACCESS_PENDING_APPROVAL');

  const handleInviteCodeChange = async (rawCode: string) => {
    const upper = rawCode.toUpperCase().trim();
    setInviteCode(upper);
    setInviteCodeError(null);
    setVerifiedStore(null);

    if (upper.length >= 6) {
      setIsValidatingInvite(true);
      try {
        const res = await authService.validateStoreInviteCode(upper);
        if (res.valid && res.shop) {
          setVerifiedStore({
            id: res.shop.id,
            shop_name: res.shop.shop_name,
            owner_name: res.shop.owner_name,
          });
          setShopName(res.shop.shop_name);
          setSelectedShopId(res.shop.id);
          setInviteCodeError(null);
        } else {
          setInviteCodeError(res.message || 'Store invite code not found.');
        }
      } catch {
        setInviteCodeError('Could not verify invite code.');
      } finally {
        setIsValidatingInvite(false);
      }
    }
  };

  const handleRoleSelect = (selectedRole: UserRole) => {
    setRole(selectedRole);
    if (selectedRole === 'OWNER') {
      setVerifiedStore(null);
      setInviteCodeError(null);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setResendSuccess(false);
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

  const handleResendConfirmation = async () => {
    if (!email.trim()) {
      setErrorMsg('Please enter your email to resend confirmation link.');
      return;
    }
    setIsResending(true);
    try {
      await resendConfirmationEmail(email.trim());
      setResendSuccess(true);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not resend confirmation email.');
    } finally {
      setIsResending(false);
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

    const isJoining = role !== 'OWNER';

    if (isJoining && !inviteCode.trim()) {
      setErrorMsg('Please enter the 6-digit Store Invite Code provided by your store owner.');
      return;
    }

    if (!isJoining && !shopName.trim()) {
      setErrorMsg('Please enter your store name.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await signUp(email.trim(), password, {
        shopName: (isJoining && verifiedStore ? verifiedStore.shop_name : shopName).trim() || 'My Kirana Store',
        ownerName: ownerName.trim() || 'Store Member',
        phone: phone.trim() || '',
        role,
        shopId: verifiedStore?.id || selectedShopId || 'current_shop',
        inviteCode: isJoining ? inviteCode.trim() : undefined,
        isJoiningExisting: isJoining,
      });

      if (res.needEmailVerification) {
        setTab('verify_pending');
      } else if (isJoining) {
        setSuccessMsg(
          `Request submitted! Your request to join "${verifiedStore?.shop_name || shopName}" as ${role} has been submitted for store owner approval.`
        );
      } else {
        setSuccessMsg('Account registered successfully! Entering POS...');
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
      setSuccessMsg('Password reset link sent to your email.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send reset link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-200" />
            <div>
              <h3 className="font-bold text-base">Store Account &amp; Sync</h3>
              <p className="text-[11px] text-emerald-100">Smart Kirana Cloud Database</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        {tab !== 'verify_pending' && (
          <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-bold bg-slate-50 dark:bg-slate-800/50">
            <button
              onClick={() => {
                setTab('signin');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-3 border-b-2 text-center transition ${
                tab === 'signin'
                  ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 bg-white dark:bg-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setTab('signup');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-3 border-b-2 text-center transition ${
                tab === 'signup'
                  ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 bg-white dark:bg-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Register New Store
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Email not confirmed helper */}
          {isEmailNotConfirmed ? (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Email Confirmation Required</span>
              </div>
              <p className="leading-relaxed">
                Supabase requires confirming your email (<strong>{email}</strong>) before sign-in.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={isResending}
                  className="py-1.5 px-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition text-xs flex items-center justify-center gap-1.5"
                >
                  {isResending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                  <span>{isResending ? 'Sending...' : 'Resend Link'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    continueAsGuest();
                    onClose();
                  }}
                  className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition text-xs flex items-center justify-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Enter Counter Mode</span>
                </button>
              </div>
              {resendSuccess && (
                <div className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Verification link resent!</span>
                </div>
              )}
            </div>
          ) : isPendingApproval ? (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400">
                <Clock className="w-4 h-4 shrink-0 animate-pulse" />
                <span>Store Access Pending Approval</span>
              </div>
              <p className="leading-relaxed text-[11px]">
                Your account is registered, but your role (<strong>{role}</strong>) requires approval from the store owner in <strong>Settings &amp; Store → Store Staff</strong>.
              </p>
              <button
                type="button"
                onClick={(e) => handleSignIn(e)}
                className="py-1 px-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-xs flex items-center gap-1 transition"
              >
                <RefreshCw className="w-3 h-3" /> Check Approval Status
              </button>
            </div>
          ) : errorMsg ? (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          ) : null}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-start gap-2 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Tab 1: SIGN IN */}
          {tab === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="owner@kirana.com"
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setTab('forgot')}
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
                  >
                    Forgot?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md transition disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Verifying...
                  </>
                ) : (
                  <>
                    Sign In to Store <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Tab 2: SIGN UP */}
          {tab === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="shop@example.com"
                    className="w-full pl-9 pr-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Role Selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Store Role *
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'OWNER', label: '👑 Owner', desc: 'Full admin access' },
                    { id: 'MANAGER', label: '👔 Manager', desc: 'Supervisor' },
                    { id: 'ACCOUNTANT', label: '📊 Accountant', desc: 'Books & audits' },
                    { id: 'CASHIER', label: '⚡ Cashier', desc: 'Counter billing' },
                  ].map((r) => (
                    <button
                      type="button"
                      key={r.id}
                      onClick={() => handleRoleSelect(r.id as UserRole)}
                      className={`p-2 rounded-xl border text-left transition ${
                        role === r.id
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <div className="text-xs font-bold">{r.label}</div>
                      <div className="text-[10px] text-slate-400">{r.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Store Setup: Owner enters Store Name; Staff enters Store Invite Code */}
              {role === 'OWNER' ? (
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Store Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder="e.g. Laxi Vatsalaya Store"
                    className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                  />
                  <p className="text-[10px] text-slate-400">
                    A unique 6-digit Store Invite Code will be generated for your staff.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      Store Invite Code *
                    </label>
                    <span className="text-[10px] text-slate-400">Ask Store Owner</span>
                  </div>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                    <input
                      type="text"
                      required
                      value={inviteCode}
                      onChange={(e) => handleInviteCodeChange(e.target.value)}
                      placeholder="e.g. KRN-4829"
                      className="w-full pl-8 pr-7 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold tracking-wider uppercase outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    {isValidatingInvite && (
                      <RefreshCw className="w-3 h-3 text-blue-500 animate-spin absolute right-2.5 top-2" />
                    )}
                  </div>

                  {verifiedStore && (
                    <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[10px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span>
                        Verified: <strong>{verifiedStore.shop_name}</strong>
                      </span>
                    </div>
                  )}

                  {inviteCodeError && (
                    <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-[10px] text-rose-700 dark:text-rose-300 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                      <span>{inviteCodeError}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    WhatsApp No. *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="9876543210"
                    className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    Your Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Mayuresh paradkar"
                    className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Password *
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 chars, 1 uppercase, 1 symbol"
                  className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Confirm Password *
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !passwordValidation.isValid}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md transition disabled:opacity-50"
              >
                {isSubmitting ? 'Registering...' : `Create ${role} Account`}
              </button>
            </form>
          )}

          {/* Tab 3: FORGOT PASSWORD */}
          {tab === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Enter your email address to receive password reset instructions.
              </p>
              <div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@kirana.com"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition"
              >
                {isSubmitting ? 'Sending...' : 'Send Reset Link'}
              </button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setTab('signin')}
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  ← Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* Tab 4: VERIFY PENDING */}
          {tab === 'verify_pending' && (
            <div className="text-center py-4 space-y-3">
              <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-950/60 rounded-full flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400">
                <Mail className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Verify Your Email</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                A verification link was sent to <strong>{email}</strong>.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTab('signin')}
                  className="flex-1 py-1.5 px-3 bg-emerald-600 text-white rounded-xl text-xs font-bold"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    continueAsGuest();
                    onClose();
                  }}
                  className="flex-1 py-1.5 px-3 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs"
                >
                  Continue Offline
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
