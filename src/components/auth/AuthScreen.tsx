import React, { useEffect, useState } from 'react';
import { SimulationState } from '../../types/simulation';
import { UserAccount } from '../../types/user';
import {
  authenticateUser,
  loadAllUsers,
  registerNewUser,
  ROLE_BADGE_INFO,
} from '../../services/authService';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Coins,
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  Sparkles,
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
    const res = authenticateUser(username, demoPwd, rememberMe);
    if (!res.ok) {
      setErrorMessage(res.error);
      return;
    }
    onAuthenticated(res.user);
  };

  return (
    <div className="min-h-screen w-screen overflow-y-auto bg-base-100 text-base-content flex flex-col justify-center items-center p-4 sm:p-6 select-text font-sans">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Main Form */}
        <div className="lg:col-span-7 card bg-base-200 border border-base-300 shadow-xl">
          <div className="card-body p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center font-bold">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h1 className="text-base font-bold">Sim Creator Studio</h1>
                  <p className="text-xs text-base-content/70">Story game platform</p>
                </div>
              </div>

              {onBackToLanding && (
                <button
                  type="button"
                  onClick={onBackToLanding}
                  className="btn btn-ghost btn-xs gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Home
                </button>
              )}
            </div>

            {/* Mode Switcher Tabs */}
            <div className="join w-full grid grid-cols-2 mb-4">
              <button
                type="button"
                onClick={() => {
                  setMode('LOGIN');
                  setErrorMessage(null);
                }}
                className={`btn btn-sm join-item ${mode === 'LOGIN' ? 'btn-primary' : 'btn-outline'}`}
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
                className={`btn btn-sm join-item ${mode === 'REGISTER' ? 'btn-primary' : 'btn-outline'}`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Create Account
              </button>
            </div>

            {errorMessage && (
              <div className="alert alert-error text-xs py-2 mb-4">
                <AlertCircle className="w-4 h-4" />
                <span>{errorMessage}</span>
              </div>
            )}

            {mode === 'LOGIN' ? (
              <form onSubmit={handleLoginSubmit} className="space-y-3">
                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-xs">Username or Email</span>
                  </label>
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Enter username or email"
                    className="input input-bordered input-sm w-full"
                    required
                  />
                </div>

                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-xs">Password</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      className="input input-bordered input-sm w-full pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/60 hover:text-base-content"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="label cursor-pointer gap-2 py-0">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="checkbox checkbox-primary checkbox-xs"
                    />
                    <span className="label-text text-xs">Remember me</span>
                  </label>
                </div>

                <button type="submit" className="btn btn-primary btn-sm w-full mt-2">
                  <KeyRound className="w-3.5 h-3.5" />
                  Sign In
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegisterSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="form-control">
                    <label className="label py-0.5">
                      <span className="label-text text-xs">Name</span>
                    </label>
                    <input
                      type="text"
                      value={regDisplayName}
                      onChange={(e) => setRegDisplayName(e.target.value)}
                      placeholder="Your name"
                      className="input input-bordered input-sm w-full"
                      required
                    />
                  </div>
                  <div className="form-control">
                    <label className="label py-0.5">
                      <span className="label-text text-xs">Callsign / Nickname</span>
                    </label>
                    <input
                      type="text"
                      value={regCallsign}
                      onChange={(e) => setRegCallsign(e.target.value)}
                      placeholder="e.g. SPARK"
                      className="input input-bordered input-sm w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="form-control">
                    <label className="label py-0.5">
                      <span className="label-text text-xs">Username</span>
                    </label>
                    <input
                      type="text"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder="username"
                      className="input input-bordered input-sm w-full"
                      required
                    />
                  </div>
                  <div className="form-control">
                    <label className="label py-0.5">
                      <span className="label-text text-xs">Email</span>
                    </label>
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="name@email.com"
                      className="input input-bordered input-sm w-full"
                      required
                    />
                  </div>
                </div>

                {heliosSim && (
                  <div className="form-control">
                    <label className="label py-0.5">
                      <span className="label-text text-xs">Choose Your Character</span>
                    </label>
                    <select
                      value={regPreferredRole}
                      onChange={(e) => setRegPreferredRole(e.target.value)}
                      className="select select-bordered select-sm w-full"
                    >
                      {Object.values(heliosSim.characters).map((c) => (
                        <option key={c.playerId} value={c.playerId}>
                          {c.characterName} — {c.publicRole}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="form-control">
                    <label className="label py-0.5">
                      <span className="label-text text-xs">Password</span>
                    </label>
                    <input
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="input input-bordered input-sm w-full"
                      required
                    />
                  </div>
                  <div className="form-control">
                    <label className="label py-0.5">
                      <span className="label-text text-xs">Confirm</span>
                    </label>
                    <input
                      type="password"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="Confirm password"
                      className="input input-bordered input-sm w-full"
                      required
                    />
                  </div>
                </div>

                <button type="submit" className="btn btn-primary btn-sm w-full mt-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Create Account (+100 Sims)
                </button>
              </form>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Quick Test Demo Accounts */}
        <div className="lg:col-span-5 card bg-base-200 border border-base-300 shadow-xl">
          <div className="card-body p-6">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold">Quick Demo Accounts</h2>
            </div>
            <p className="text-xs text-base-content/70 mb-3">
              Click any player below to sign in instantly:
            </p>

            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
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
                  const demoPwd = demoUser.username === 'admin' ? 'admin123' : 'demo123';
                  const roleBadge = ROLE_BADGE_INFO[demoUser.accountRole] ?? ROLE_BADGE_INFO.PLAYER;
                  return (
                    <button
                      key={demoUser.id}
                      type="button"
                      onClick={() => handleQuickDemoSignIn(demoUser.username, demoPwd)}
                      className="btn btn-outline btn-sm w-full justify-between normal-case h-auto py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0 text-left">
                        <div className="avatar placeholder">
                          <div className="bg-primary/20 text-primary w-6 h-6 rounded text-xs">
                            <span>{demoUser.displayName[0]}</span>
                          </div>
                        </div>
                        <div className="truncate">
                          <div className="text-xs font-bold truncate">{demoUser.displayName}</div>
                          <div className="text-[10px] text-base-content/60">@{demoUser.username}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="badge badge-xs badge-ghost">{roleBadge.shortLabel}</span>
                        <span className="text-[10px] text-accent font-mono font-bold flex items-center gap-0.5">
                          <Coins className="w-2.5 h-2.5" />
                          {demoUser.simsBalance ?? 0}
                        </span>
                      </div>
                    </button>
                  );
                })}
            </div>

            <div className="mt-4 pt-3 border-t border-base-300 text-[11px] text-base-content/60 text-center">
              Demo passwords: <code className="badge badge-sm badge-ghost font-mono">demo123</code> (or <code className="badge badge-sm badge-ghost font-mono">admin123</code> for admin).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
