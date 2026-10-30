import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { validatePasswordStrength } from '../../services/authService';
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
} from 'lucide-react';

type Tab = 'signin' | 'signup' | 'forgot' | 'verify_pending';

export const AuthPage: React.FC = () => {
  const { signIn, signUp, resetPassword, continueAsGuest } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [tab, setTab] = useState<Tab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const passwordValidation = validatePasswordStrength(password);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
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
                Galla reconciliation, COGS margins, wholesaler low-stock lists, and Excel exports.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Authentication Card */}
        <div className="lg:col-span-6 max-w-md w-full mx-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl overflow-hidden transition-colors">
            {/* Header / Tabs */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-emerald-600 via-teal-700 to-emerald-700 text-white">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="p-2 bg-white/10 rounded-xl backdrop-blur-xs border border-white/20">
                  <ShieldCheck className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Store Access &amp; Cloud Sync</h3>
                  <p className="text-xs text-emerald-100">Sign in to your store account or create a new one</p>
                </div>
              </div>

              {tab !== 'verify_pending' && (
                <div className="flex gap-4 mt-4 text-sm font-semibold border-b border-white/20">
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
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

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

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                        Store Name *
                      </label>
                      <div className="relative">
                        <Store className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          required
                          value={shopName}
                          onChange={(e) => setShopName(e.target.value)}
                          placeholder="Apna Kirana"
                          className="w-full pl-8 pr-2 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                        />
                      </div>
                    </div>
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
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                      Owner Name *
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        required
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                        placeholder="Rajesh Sharma"
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                      />
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
                      <>Create Verified Store Account</>
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
