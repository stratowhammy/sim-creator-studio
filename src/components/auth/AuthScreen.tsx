import React, { useEffect, useState } from 'react';
import { SimulationState } from '../../types/simulation';
import { UserAccount } from '../../types/user';
import {
  authenticateUser,
  loadAllUsers,
  registerNewUser,
  resolveLiveParticipations,
  ROLE_BADGE_INFO,
} from '../../services/authService';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  CheckCircle2,
  Coins,
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  Radio,
  ShieldCheck,
  Terminal,
  UserPlus,
  Users,
} from 'lucide-react';

interface AuthScreenProps {
  simulations: Record<string, SimulationState>;
  initialMode?: 'LOGIN' | 'REGISTER';
  onBackToLanding?: () => void;
  onAuthenticated: (user: UserAccount) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  simulations,
  initialMode = 'LOGIN',
  onBackToLanding,
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // Login form state
  const [identifier, setIdentifier] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(true);

  // Registration form state
  const [regDisplayName, setRegDisplayName] = useState<string>('');
  const [regUsername, setRegUsername] = useState<string>('');
  const [regEmail, setRegEmail] = useState<string>('');
  const [regCallsign, setRegCallsign] = useState<string>('');
  const [regPreferredRole, setRegPreferredRole] = useState<string>('vance');
  const [regPassword, setRegPassword] = useState<string>('');
  const [regConfirmPassword, setRegConfirmPassword] = useState<string>('');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const existingUsers = loadAllUsers();
  const heliosSim = simulations['sim_helios_001'];

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const res = authenticateUser(identifier, password, rememberMe);
    if (!res.ok) {
      setErrorMessage(res.error);
      return;
    }
    onAuthenticated(res.user);
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (regPassword !== regConfirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    const res = registerNewUser(
      {
        displayName: regDisplayName,
        username: regUsername,
        email: regEmail,
        password: regPassword,
        callsign: regCallsign,
        preferredCharacterId: regPreferredRole,
      },
      simulations
    );

    if (!res.ok) {
      setErrorMessage(res.error);
      return;
    }
    onAuthenticated(res.user);
  };

  const handleQuickDemoSignIn = (username: string, demoPwd: string) => {
    setErrorMessage(null);
    // Keep rememberMe false on quick-switch so multiple browser tabs can run distinct player accounts independently
    const res = authenticateUser(username, demoPwd, rememberMe);
    if (!res.ok) {
      setErrorMessage(res.error);
      return;
    }
    onAuthenticated(res.user);
  };

  return (
    <div className="min-h-screen w-screen overflow-y-auto bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-6 select-text">
      {/* Subtle Background Accents */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* LEFT COLUMN: Sign In / Create Account Form */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-7 shadow-2xl flex flex-col justify-between">
          <div>
            {/* Brand Header */}
            <div className="flex items-center justify-between mb-6 gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/40 flex items-center justify-center">
                  <Radio className="w-5 h-5 text-sky-400" />
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight text-white">
                    Sim Creator Studio
                  </h1>
                  <p className="text-xs text-slate-400">
                    Multi-Agent Narrative Simulation &amp; Roleplay Platform
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onBackToLanding && (
                  <button
                    type="button"
                    onClick={onBackToLanding}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[11px] font-medium transition-colors"
                  >
                    <ArrowLeft className="w-3 h-3 text-sky-400" />
                    Landing Page
                  </button>
                )}
                <span className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                  Auth Portal
                </span>
              </div>
            </div>

            {/* Auth Mode Switcher */}
            <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-950 border border-slate-800 mb-6 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setMode('LOGIN');
                  setErrorMessage(null);
                }}
                className={`py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all ${
                  mode === 'LOGIN'
                    ? 'bg-sky-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('REGISTER');
                  setErrorMessage(null);
                }}
                className={`py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all ${
                  mode === 'REGISTER'
                    ? 'bg-sky-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Create Account
              </button>
            </div>

            {errorMessage && (
              <div className="mb-5 p-3 rounded-xl bg-rose-950/50 border border-rose-500/50 flex items-center gap-2.5 text-xs text-rose-200">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {mode === 'LOGIN' ? (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Username or Email
                  </label>
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. vance@simstudio.io or vance"
                    autoComplete="username"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-sky-500"
                    />
                    <span>Remember session across reloads</span>
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Each browser tab supports independent player sessions
                  </span>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-lg shadow-sky-500/10 mt-2"
                >
                  <KeyRound className="w-4 h-4" />
                  Sign In to Profile
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Full Display Name *
                    </label>
                    <input
                      type="text"
                      value={regDisplayName}
                      onChange={(e) => setRegDisplayName(e.target.value)}
                      placeholder="Jordan Vance"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Callsign / Tag
                    </label>
                    <input
                      type="text"
                      value={regCallsign}
                      onChange={(e) => setRegCallsign(e.target.value)}
                      placeholder="ORBIT-7"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Username *
                    </label>
                    <input
                      type="text"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder="jvance"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="jordan@simstudio.io"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                {heliosSim && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Starting Role Assignment ({heliosSim.title})
                    </label>
                    <select
                      value={regPreferredRole}
                      onChange={(e) => setRegPreferredRole(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                    >
                      {Object.values(heliosSim.characters).map((c) => (
                        <option key={c.playerId} value={c.playerId}>
                          {c.characterName} — {c.publicRole}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Password (min 6 chars) *
                    </label>
                    <input
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Confirm Password *
                    </label>
                    <input
                      type="password"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors mt-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Create Account & Open Profile
                </button>
              </form>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Salted credential verification & per-tab session isolation
            </span>
            <span>Sim Studio v2.0</span>
          </div>
        </div>

        {/* RIGHT COLUMN: One-Click Demo Accounts for Rapid Multi-Player / Admin Review */}
        <div className="lg:col-span-5 bg-slate-900/70 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Users className="w-4 h-4 text-sky-400" />
              <h2 className="text-sm font-bold text-white">
                Quick-Switch Seeded Accounts
              </h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Click any profile below to sign in immediately. Open a second browser tab and sign in as another player to test live 30-second engagement notifications in real time.
            </p>

            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {existingUsers
                .filter((u) =>
                  [
                    'admin',
                    'helios_gm',
                    'architect',
                    'vance',
                    'thorne',
                    'kael',
                    'nyx',
                  ].includes(u.username)
                )
                .sort((a, b) => {
                  const order = [
                    'admin',
                    'helios_gm',
                    'architect',
                    'vance',
                    'thorne',
                    'kael',
                    'nyx',
                  ];
                  return order.indexOf(a.username) - order.indexOf(b.username);
                })
                .map((demoUser) => {
                  const isGlobalAdmin = demoUser.accountRole === 'ADMIN';
                  const demoPwd =
                    demoUser.username === 'admin' ? 'admin123' : 'demo123';
                  const roleBadge =
                    ROLE_BADGE_INFO[demoUser.accountRole] ?? ROLE_BADGE_INFO.PLAYER;
                  const liveParts = resolveLiveParticipations(demoUser, simulations);
                  const totalVp = liveParts.reduce(
                    (acc, p) => acc + p.victoryPointsEarned,
                    0
                  );
                  const activeCount = liveParts.filter(
                    (p) => p.status === 'ACTIVE'
                  ).length;
                  const primaryActive = liveParts[0];
                  const scopedSimName =
                    demoUser.accountRole === 'SIMULATION_ADMIN' &&
                    demoUser.managedSimulationIds?.[0]
                      ? simulations[demoUser.managedSimulationIds[0]]?.title ??
                        demoUser.managedSimulationIds[0]
                      : null;

                  return (
                    <button
                      key={demoUser.id}
                      type="button"
                      onClick={() =>
                        handleQuickDemoSignIn(demoUser.username, demoPwd)
                      }
                      className={`w-full text-left p-2.5 rounded-xl border transition-all group ${
                        isGlobalAdmin
                          ? 'bg-amber-950/20 border-amber-700/40 hover:border-amber-500/70 hover:bg-amber-950/35'
                          : demoUser.accountRole === 'SIMULATION_ADMIN'
                          ? 'bg-emerald-950/15 border-emerald-800/50 hover:border-emerald-500/70 hover:bg-emerald-950/30'
                          : demoUser.accountRole === 'STUDIO_CREATOR'
                          ? 'bg-purple-950/15 border-purple-800/50 hover:border-purple-500/70 hover:bg-purple-950/30'
                          : 'bg-slate-950/80 border-slate-800 hover:border-sky-500/60 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-lg bg-gradient-to-br ${demoUser.avatarColor} flex items-center justify-center text-white font-bold text-xs shrink-0`}
                          >
                            {isGlobalAdmin ? (
                              <Terminal className="w-4 h-4" />
                            ) : (
                              demoUser.displayName
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .slice(0, 2)
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-xs text-white truncate">
                                {demoUser.displayName}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400">
                                @{demoUser.username}
                              </span>
                              <span
                                className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded border ${roleBadge.badgeClass}`}
                              >
                                {roleBadge.shortLabel}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 truncate mt-0.5">
                              {isGlobalAdmin
                                ? 'Multi-Game Admin Overview, All Sims & Studio'
                                : demoUser.accountRole === 'SIMULATION_ADMIN'
                                ? `Single-Sim Admin: ${scopedSimName}`
                                : demoUser.accountRole === 'STUDIO_CREATOR'
                                ? 'Authoring Studio (DAG Compiler) + Player'
                                : primaryActive
                                ? `${primaryActive.characterName} (${primaryActive.publicRole})`
                                : demoUser.callsign}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="flex items-center justify-end gap-1 text-[11px] font-mono font-bold text-amber-300">
                            <Coins className="w-3 h-3 text-amber-400" />
                            {demoUser.simsBalance ?? 0} Sims
                          </div>
                          <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 mt-0.5">
                            <Award className="w-3 h-3 text-sky-400" />
                            {totalVp.toLocaleString()} VP • {activeCount} active
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>

          <div className="mt-4 p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400 leading-relaxed">
            <strong className="text-slate-200">Credentials:</strong> Seeded Role & Player accounts use{' '}
            <code className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300">demo123</code>{' '}
            and Global Admin (<code className="text-amber-300">@admin</code>) uses{' '}
            <code className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300">admin123</code>.
          </div>
        </div>
      </div>
    </div>
  );
};
