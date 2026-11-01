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
  const [regPassword, setRegPassword] = useState<string>('');
  const [regConfirmPassword, setRegConfirmPassword] = useState<string>('');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const existingUsers = loadAllUsers();

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
    <div className="min-h-screen w-screen overflow-y-auto bg-[#fffef0] text-[#41403e] flex flex-col justify-center items-center p-4 sm:p-6 select-text">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Main Form */}
        <div className="lg:col-span-7 card">
          <div className="card-body p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-secondary" />
                <div>
                  <h3 className="m-0 text-lg font-bold">Sim Creator Studio</h3>
                  <p className="text-xs text-[#777] m-0">Story game platform</p>
                </div>
              </div>

              {onBackToLanding && (
                <button
                  type="button"
                  onClick={onBackToLanding}
                  className="paper-btn btn-small inline-flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Home
                </button>
              )}
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex w-full gap-2 mb-4">
              <button
                type="button"
                onClick={() => {
                  setMode('LOGIN');
                  setErrorMessage(null);
                }}
                className={`paper-btn btn-small flex-1 inline-flex items-center justify-center gap-1 ${mode === 'LOGIN' ? 'btn-primary' : ''}`}
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
                className={`paper-btn btn-small flex-1 inline-flex items-center justify-center gap-1 ${mode === 'REGISTER' ? 'btn-primary' : ''}`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Create Account
              </button>
            </div>

            {errorMessage && (
              <div className="alert alert-danger text-xs py-2 mb-4">
                <AlertCircle className="w-4 h-4 inline mr-1" />
                <span>{errorMessage}</span>
              </div>
            )}

            {mode === 'LOGIN' ? (
              <form onSubmit={handleLoginSubmit} className="space-y-3">
                <div className="form-group mb-2">
                  <label className="block text-xs font-bold mb-1">Username or Email</label>
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Enter username or email"
                    className="w-full text-sm"
                    required
                  />
                </div>

                <div className="form-group mb-2">
                  <label className="block text-xs font-bold mb-1">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full text-sm pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#777] hover:text-[#222] border-0 p-1 bg-transparent"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="cursor-pointer flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <span>Remember me</span>
                  </label>
                </div>

                <button type="submit" className="paper-btn btn-primary btn-block mt-3 inline-flex items-center justify-center gap-1">
                  <KeyRound className="w-3.5 h-3.5" />
                  Sign In
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegisterSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="form-group mb-1">
                    <label className="block text-xs font-bold mb-1">Name</label>
                    <input
                      type="text"
                      value={regDisplayName}
                      onChange={(e) => setRegDisplayName(e.target.value)}
                      placeholder="Your name"
                      className="w-full text-sm"
                      required
                    />
                  </div>
                  <div className="form-group mb-1">
                    <label className="block text-xs font-bold mb-1">Callsign / Nickname</label>
                    <input
                      type="text"
                      value={regCallsign}
                      onChange={(e) => setRegCallsign(e.target.value)}
                      placeholder="e.g. SPARK"
                      className="w-full text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="form-group mb-1">
                    <label className="block text-xs font-bold mb-1">Username</label>
                    <input
                      type="text"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder="username"
                      className="w-full text-sm"
                      required
                    />
                  </div>
                  <div className="form-group mb-1">
                    <label className="block text-xs font-bold mb-1">Email</label>
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="name@email.com"
                      className="w-full text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="form-group mb-1">
                    <label className="block text-xs font-bold mb-1">Password</label>
                    <input
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="w-full text-sm"
                      required
                    />
                  </div>
                  <div className="form-group mb-1">
                    <label className="block text-xs font-bold mb-1">Confirm</label>
                    <input
                      type="password"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="Confirm password"
                      className="w-full text-sm"
                      required
                    />
                  </div>
                </div>

                <button type="submit" className="paper-btn btn-primary btn-block mt-3 inline-flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Create Account (+100 Sims)
                </button>
              </form>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Quick Test Demo Accounts */}
        <div className="lg:col-span-5 card">
          <div className="card-body p-6">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-secondary" />
              <h4 className="text-base font-bold m-0">Quick Demo Accounts</h4>
            </div>
            <p className="text-xs text-[#777] mb-3">
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
                      className="paper-btn btn-small w-full flex items-center justify-between text-left py-2 px-3 m-0 mb-1"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="badge secondary text-xs w-6 h-6 flex items-center justify-center p-0">
                          {demoUser.displayName[0]}
                        </span>
                        <div className="truncate">
                          <div className="text-xs font-bold truncate leading-tight">{demoUser.displayName}</div>
                          <div className="text-[10px] text-[#777]">@{demoUser.username}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="badge text-[10px]">{roleBadge.shortLabel}</span>
                        <span className="text-[10px] text-amber-700 font-bold flex items-center gap-0.5">
                          <Coins className="w-2.5 h-2.5" />
                          {demoUser.simsBalance ?? 0}
                        </span>
                      </div>
                    </button>
                  );
                })}
            </div>

            <div className="mt-4 pt-3 border-t border-dashed border-[#ccc] text-xs text-[#777] text-center">
              Demo passwords: <span className="badge">demo123</span> (or <span className="badge">admin123</span> for admin).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
