import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { validatePasswordStrength, authService } from '../../services/authService';
import { UserRole, RegisteredShop } from '../../types';
import {
  Store,
  Lock,
  Mail,
  User as UserIcon,
  Phone,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  Sun,
  Moon,
  Zap,
  BookOpen,
  BarChart3,
  Scale,
  Sparkles,
  Users,
  ChevronDown,
  Building2,
  PlusCircle,
  Clock,
} from 'lucide-react';

type Tab = 'signin' | 'signup' | 'forgot' | 'verify_pending';

export const AuthPage: React.FC = () => {
  const { signIn, signUp, resetPassword, resendConfirmationEmail, continueAsGuest } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [tab, setTab] = useState<Tab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('OWNER');

  // Shop selection modes: 'existing' (dropdown of registered stores) or 'new' (enter new store)
  const [shopMode, setShopMode] = useState<'existing' | 'new'>('new');
  const [availableShops, setAvailableShops] = useState<RegisteredShop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string>('');
  const [isLoadingShops, setIsLoadingShops] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const passwordValidation = validatePasswordStrength(password);

  const isEmailNotConfirmed = errorMsg?.toLowerCase().includes('email not confirmed');
  const isPendingApproval =
    errorMsg?.toLowerCase().includes('awaiting approval') ||
    errorMsg?.includes('ACCESS_PENDING_APPROVAL');

  useEffect(() => {
    loadShops();
  }, []);

  const loadShops = async () => {
    setIsLoadingShops(true);
    try {
      const list = await authService.getAvailableShops();
      setAvailableShops(list);
      if (list.length > 0 && !shopName) {
        setSelectedShopId(list[0].id);
        if (role !== 'OWNER') {
          setShopName(list[0].shop_name);
          if (list[0].phone) setPhone(list[0].phone);
        }
      }
    } catch (e) {
      console.warn('Failed loading shops:', e);
    } finally {
      setIsLoadingShops(false);
    }
  };

  const handleRoleSelect = (selectedRole: UserRole) => {
    setRole(selectedRole);
    if (selectedRole === 'OWNER') {
      // Owners can either create new or manage existing
    } else {
      // Staff members join an existing store
      setShopMode('existing');
      if (availableShops.length > 0) {
        const found = availableShops.find((s) => s.id === selectedShopId) || availableShops[0];
        setShopName(found.shop_name);
        setSelectedShopId(found.id);
      }
    }
  };

  const handleSelectExistingShop = (id: string) => {
    setSelectedShopId(id);
    const found = availableShops.find((s) => s.id === id);
    if (found) {
      setShopName(found.shop_name);
      if (found.phone && !phone) {
        setPhone(found.phone);
      }
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
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Invalid login credentials. Please check email and password.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!email.trim()) {
      setErrorMsg('Please enter your email address to resend the confirmation link.');
      return;
    }
    setIsResending(true);
    try {
      await resendConfirmationEmail(email.trim());
      setResendSuccess(true);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not resend email. Please try again.');
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

    if (!shopName.trim()) {
      setErrorMsg('Please choose or enter a store name.');
      return;
    }

    setIsSubmitting(true);
    try {
      const isJoining = shopMode === 'existing' || role !== 'OWNER';
      const res = await signUp(email.trim(), password, {
        shopName: shopName.trim() || 'My Kirana Store',
        ownerName: ownerName.trim() || 'Store Member',
        phone: phone.trim() || '',
        role,
        shopId: selectedShopId || 'current_shop',
        isJoiningExisting: isJoining,
      });

      if (res.needEmailVerification) {
        setTab('verify_pending');
      } else if (isJoining) {
        setSuccessMsg(
          `Registration submitted! Your request to join "${shopName}" as ${role} has been submitted for store owner approval. Once approved, you can sign in with full permissions.`
        );
      } else {
        setSuccessMsg('Store account registered successfully! Entering POS...');
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

  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Floating Navbar */}
      <nav className="w-full max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-600/20">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-extrabold text-base tracking-tight text-slate-900 dark:text-white leading-tight">
              Smart Kirana POS
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Inventory, Khata &amp; Vyapar System</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-emerald-500 transition shadow-xs"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>

          <button
            onClick={continueAsGuest}
            className="px-3.5 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold transition flex items-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5" /> Continue Offline
          </button>
        </div>
      </nav>

      {/* Main Container */}
      <div className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Column: Visual Highlights */}
        <div className="lg:col-span-6 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Zero-Cost, Offline-First Retail Management</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-slate-900 dark:text-white leading-tight">
            Complete Kirana Store &amp; Khata System
          </h2>

          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-lg leading-relaxed">
            Manage your daily counter billing, barcode scanning, fractional loose weights, customer udhari ledgers, and
            Vyapar-grade P&amp;L reports with zero latency.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs space-y-1">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                <Zap className="w-4 h-4" /> 1-Click Fast-Tap Billing
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                F2 Barcode search, 3-cart hold bill switcher, and instant F8 Cash &amp; UPI checkout.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs space-y-1">
              <div className="flex items-center gap-2 text-amber-500 font-bold text-xs">
                <Scale className="w-4 h-4" /> Loose Grain &amp; Weight Calc
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Customer asked for ₹20 sugar? Auto-calculates exact grams and line totals instantly.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs space-y-1">
              <div className="flex items-center gap-2 text-rose-500 font-bold text-xs">
                <BookOpen className="w-4 h-4" /> Smart Khatabook &amp; WhatsApp
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Risk-aging buckets (30+ days overdue), credit limits, and 1-click free WhatsApp payment links.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs space-y-1">
              <div className="flex items-center gap-2 text-sky-500 font-bold text-xs">
                <BarChart3 className="w-4 h-4" /> Vyapar-Style Reports
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Galla reconciliation, COGS margins, wholesaler low stock lists, and Excel exports.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Auth Card */}
        <div className="lg:col-span-6 flex justify-center">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Card Header with tabs */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-5 h-5 text-emerald-200" />
                <h3 className="font-bold text-lg">Store Access &amp; Cloud Sync</h3>
              </div>
              <p className="text-xs text-emerald-100 mb-4">
                Sign in to your store account or register a new store with role-based access.
              </p>

              {tab !== 'verify_pending' && (
                <div className="flex gap-4 text-xs font-bold border-b border-emerald-500/40">
                  <button
                    type="button"
                    onClick={() => {
                      setTab('signin');
                      setErrorMsg(null);
                      setSuccessMsg(null);
                    }}
                    className={`pb-2 border-b-2 transition ${
                      tab === 'signin'
                        ? 'border-amber-300 text-amber-300 font-bold'
                        : 'border-transparent text-white/70 hover:text-white'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTab('signup');
                      setErrorMsg(null);
                      setSuccessMsg(null);
                    }}
                    className={`pb-2 border-b-2 transition ${
                      tab === 'signup'
                        ? 'border-amber-300 text-amber-300 font-bold'
                        : 'border-transparent text-white/70 hover:text-white'
                    }`}
                  >
                    Register Store
                  </button>
                </div>
              )}
            </div>

            {/* Card Body */}
            <div className="p-6 space-y-4">
              {/* Special Email Not Confirmed Helper Box */}
              {isEmailNotConfirmed ? (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs space-y-2.5">
                  <div className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Email Confirmation Required</span>
                  </div>
                  <p className="leading-relaxed">
                    Supabase Auth requires clicking the confirmation link sent to <strong>{email}</strong> before password sign-in succeeds.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleResendConfirmation}
                      disabled={isResending}
                      className="py-2 px-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm active:scale-98 disabled:opacity-50"
                    >
                      {isResending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                      <span>{isResending ? 'Sending...' : 'Resend Confirmation Email'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={continueAsGuest}
                      className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm active:scale-98"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Enter Store (Counter Mode)</span>
                    </button>
                  </div>
                  {resendSuccess && (
                    <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5 mt-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Verification link resent! Check inbox and spam folders.</span>
                    </div>
                  )}
                </div>
              ) : isPendingApproval ? (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400">
                    <Clock className="w-4 h-4 shrink-0 animate-pulse" />
                    <span>Store Access Pending Owner Approval</span>
                  </div>
                  <p className="leading-relaxed text-[11px]">
                    Your login is verified, but your requested role (<strong>{role}</strong>) for this store requires approval from the store owner in <strong>Settings &amp; Store → Store Staff</strong>.
                  </p>
                  <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    Please contact your store owner to approve your access.
                  </p>
                  <button
                    type="button"
                    onClick={(e) => handleSignIn(e)}
                    className="mt-1 py-1.5 px-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-xs"
                  >
                    <RefreshCw className="w-3 h-3" /> Check Approval Status
                  </button>
                </div>
              ) : errorMsg ? (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              ) : null}

              {successMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-start gap-2.5 text-xs text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* 1. SIGN IN FORM */}
              {tab === 'signin' && (
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="owner@kirana.com"
                        className="w-full pl-9 pr-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
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
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-9 pr-10 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
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
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition active:scale-98 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Verifying Credentials...
                      </>
                    ) : (
                      <>
                        Sign In to Store <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* 2. SIGN UP FORM */}
              {tab === 'signup' && (
                <form onSubmit={handleSignUp} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                      Email Address *
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="shop@example.com"
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Role Selector */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                      Store Role *
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'OWNER', label: '👑 Store Owner', desc: 'Full admin access / Create shop' },
                        { id: 'MANAGER', label: '👔 Store Manager', desc: 'Counter & stock supervisor' },
                        { id: 'ACCOUNTANT', label: '📊 Accountant', desc: 'P&L, khata & tax audits' },
                        { id: 'CASHIER', label: '⚡ Cashier', desc: 'Fast counter billing' },
                      ].map((r) => (
                        <button
                          type="button"
                          key={r.id}
                          onClick={() => handleRoleSelect(r.id as UserRole)}
                          className={`p-2 rounded-xl border text-left transition ${
                            role === r.id
                              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                          }`}
                        >
                          <div className="text-xs font-bold">{r.label}</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">{r.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Store Mode Selector: Join Existing Store vs Create New Store */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Select Store *
                      </label>
                      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[10px] font-bold">
                        <button
                          type="button"
                          onClick={() => setShopMode('existing')}
                          className={`px-2 py-0.5 rounded-md transition ${
                            shopMode === 'existing'
                              ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                              : 'text-slate-500'
                          }`}
                        >
                          🏢 Existing Shop
                        </button>
                        <button
                          type="button"
                          onClick={() => setShopMode('new')}
                          className={`px-2 py-0.5 rounded-md transition ${
                            shopMode === 'new'
                              ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                              : 'text-slate-500'
                          }`}
                        >
                          ✨ New Shop
                        </button>
                      </div>
                    </div>

                    {shopMode === 'existing' ? (
                      <div className="space-y-1.5">
                        <div className="relative">
                          <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                          <select
                            value={selectedShopId}
                            onChange={(e) => handleSelectExistingShop(e.target.value)}
                            className="w-full pl-9 pr-8 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-semibold appearance-none cursor-pointer"
                          >
                            {availableShops.length === 0 ? (
                              <option value="">No registered shops found - Click New Shop</option>
                            ) : (
                              availableShops.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.shop_name} (Owner: {s.owner_name})
                                </option>
                              ))
                            )}
                          </select>
                          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                        </div>

                        {/* Owner Permission & Approval Note */}
                        {role !== 'OWNER' && (
                          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-[11px] text-blue-700 dark:text-blue-300 flex items-start gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                            <span>
                              <strong>Owner Permission:</strong> Access as {role} for this shop will be submitted to the store owner for one-click approval before full permissions activate.
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="relative">
                        <Store className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          required
                          value={shopName}
                          onChange={(e) => setShopName(e.target.value)}
                          placeholder="e.g. Laxi Vatsalaya store"
                          className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                        />
                      </div>
                    )}
                  </div>

                  {/* Phone & Full Name */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                        WhatsApp No. *
                      </label>
                      <div className="relative">
                        <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                        <input
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="9876543210"
                          className="w-full pl-8 pr-2 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                        Your Full Name *
                      </label>
                      <div className="relative">
                        <UserIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          required
                          value={ownerName}
                          onChange={(e) => setOwnerName(e.target.value)}
                          placeholder="Mayuresh paradkar"
                          className="w-full pl-8 pr-2 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                      Standard Security Password *
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min 8 chars, 1 uppercase, 1 symbol"
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

                    {/* Live Strength Checklist */}
                    {password && (
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-slate-500">Password Strength:</span>
                          <span
                            className={`font-bold ${
                              passwordValidation.score === 100
                                ? 'text-emerald-500'
                                : passwordValidation.score >= 50
                                ? 'text-amber-500'
                                : 'text-rose-500'
                            }`}
                          >
                            {passwordValidation.label}
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              passwordValidation.score === 100
                                ? 'bg-emerald-500 w-full'
                                : passwordValidation.score === 75
                                ? 'bg-blue-500 w-3/4'
                                : passwordValidation.score === 50
                                ? 'bg-amber-500 w-1/2'
                                : 'bg-rose-500 w-1/4'
                            }`}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-400 pt-1">
                          <span className={passwordValidation.hasMinLength ? 'text-emerald-500 font-semibold' : ''}>
                            {passwordValidation.hasMinLength ? '✓' : '•'} 8+ characters
                          </span>
                          <span className={passwordValidation.hasUppercase ? 'text-emerald-500 font-semibold' : ''}>
                            {passwordValidation.hasUppercase ? '✓' : '•'} Uppercase (A-Z)
                          </span>
                          <span className={passwordValidation.hasLowercase ? 'text-emerald-500 font-semibold' : ''}>
                            {passwordValidation.hasLowercase ? '✓' : '•'} Lowercase (a-z)
                          </span>
                          <span
                            className={passwordValidation.hasNumberOrSpecial ? 'text-emerald-500 font-semibold' : ''}
                          >
                            {passwordValidation.hasNumberOrSpecial ? '✓' : '•'} Number or symbol
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                      Confirm Password *
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !passwordValidation.isValid}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition active:scale-98 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Registering Store...
                      </>
                    ) : (
                      <>Create Verified {role} Account</>
                    )}
                  </button>
                </form>
              )}

              {/* 3. FORGOT PASSWORD */}
              {tab === 'forgot' && (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Enter your store email address to receive an automated password reset recovery link.
                  </p>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                      Registered Store Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="owner@kirana.com"
                        className="w-full pl-9 pr-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md transition"
                  >
                    {isSubmitting ? 'Sending...' : 'Send Recovery Link'}
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setTab('signin')}
                      className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
                    >
                      ← Back to Sign In
                    </button>
                  </div>
                </form>
              )}

              {/* 4. EMAIL VERIFICATION PENDING SCREEN */}
              {tab === 'verify_pending' && (
                <div className="text-center py-4 space-y-3">
                  <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/60 rounded-full flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900 dark:text-white">Verify Your Email</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-xs mx-auto">
                      A confirmation link was sent to <strong className="text-emerald-600">{email}</strong>. Please
                      click the link to verify your account and activate cloud synchronization.
                    </p>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setTab('signin')}
                      className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition"
                    >
                      Sign In Now
                    </button>
                    <button
                      type="button"
                      onClick={continueAsGuest}
                      className="flex-1 py-2 px-3 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-semibold transition"
                    >
                      Continue Offline
                    </button>
                  </div>
                </div>
              )}

              {/* Direct Offline / Counter Guest Mode Button */}
              {tab !== 'verify_pending' && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-center space-y-2">
                  <span className="text-[11px] text-slate-400 block">No internet or don't want a cloud account?</span>
                  <button
                    type="button"
                    onClick={continueAsGuest}
                    className="w-full py-2.5 px-4 rounded-xl border border-dashed border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition"
                  >
                    <Zap className="w-4 h-4 text-emerald-500" />
                    <span>⚡ Use Counter in Offline / Guest Mode (100% Free)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto px-4 py-3 text-center text-xs text-slate-400 border-t border-slate-200 dark:border-slate-800/80">
        Smart Kirana POS • Offline-First Progressive Web Application • Zero Data Loss Guarantee
      </footer>
    </div>
  );
};
