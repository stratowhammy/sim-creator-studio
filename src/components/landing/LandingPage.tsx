import React, { useState } from 'react';
import { SimulationState, SpeechStyle } from '../../types/simulation';
import { UserAccount } from '../../types/user';
import {
  ArrowRight,
  Coins,
  LogIn,
  Mic,
  Play,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';

interface LandingPageProps {
  currentUser: UserAccount | null;
  simulations: Record<string, SimulationState>;
  voices: SpeechStyle[];
  onNavigateLogin: () => void;
  onNavigateRegister: () => void;
  onLaunchApp: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  currentUser,
  simulations,
  voices,
  onNavigateLogin,
  onNavigateRegister,
  onLaunchApp,
}) => {
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(
    voices[1]?.id ?? voices[0]?.id ?? 'voice_noir'
  );

  const simList = Object.values(simulations);
  const publishedSims = simList.filter((s) => s.publishedToCollection);
  const activeVoice =
    voices.find((v) => v.id === selectedVoiceId) ?? voices[0];

  const handleLinkClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    callback: () => void
  ) => {
    e.preventDefault();
    callback();
  };

  return (
    <div className="min-h-screen w-screen overflow-y-auto bg-base-100 text-base-content select-text font-sans">
      {/* ==================================================================== */}
      {/* DAISYUI NAVBAR                                                       */}
      {/* ==================================================================== */}
      <header className="navbar bg-base-200/90 backdrop-blur border-b border-base-300 sticky top-0 z-30 px-4 sm:px-8">
        <div className="navbar-start gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center font-bold">
            <Sparkles className="w-4 h-4" />
          </div>
          <span className="font-bold text-lg tracking-tight">Sim Creator Studio</span>
        </div>

        <div className="navbar-center hidden md:flex">
          <ul className="menu menu-horizontal px-1 gap-2 text-sm">
            <li><a href="#how-it-works" className="rounded-lg">How It Works</a></li>
            <li><a href="#voices" className="rounded-lg">Voices</a></li>
            <li><a href="#games" className="rounded-lg">Games</a></li>
          </ul>
        </div>

        <div className="navbar-end gap-2">
          <a
            href="/?portal=login"
            onClick={(e) => handleLinkClick(e, onNavigateLogin)}
            className="btn btn-ghost btn-sm"
          >
            <LogIn className="w-4 h-4" />
            Sign In
          </a>

          {!currentUser && (
            <a
              href="/?portal=register"
              onClick={(e) => handleLinkClick(e, onNavigateRegister)}
              className="btn btn-outline btn-sm hidden sm:inline-flex"
            >
              <UserPlus className="w-4 h-4" />
              Sign Up
            </a>
          )}

          <a
            href="/?portal=app"
            onClick={(e) => handleLinkClick(e, onLaunchApp)}
            className="btn btn-primary btn-sm"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {currentUser ? 'Open App' : 'Launch App'}
          </a>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* HERO SECTION                                                         */}
      {/* ==================================================================== */}
      <section className="hero py-12 sm:py-20 px-4 sm:px-8 max-w-6xl mx-auto">
        <div className="hero-content text-center flex-col max-w-3xl">
          <div className="badge badge-primary badge-outline gap-1.5 py-3 px-4 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            Story &amp; Mystery Games
          </div>

          <h1 className="text-4xl sm:text-5xl font-black tracking-tight mt-2">
            Build and Play Story Games with Friends
          </h1>

          <p className="text-base sm:text-lg text-base-content/80 max-w-xl leading-relaxed">
            Create mystery games, take on character roles, and trade secret clues to solve the story together.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
            <a
              href="/?portal=app"
              onClick={(e) => handleLinkClick(e, onLaunchApp)}
              className="btn btn-primary btn-md gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              {currentUser ? `Play as @${currentUser.username}` : 'Start Playing'}
            </a>

            <a
              href="/?portal=login"
              onClick={(e) => handleLinkClick(e, onNavigateLogin)}
              className="btn btn-outline btn-md gap-2"
            >
              <LogIn className="w-4 h-4" />
              Demo Sign In
            </a>
          </div>

          {/* Clean Quick Stats */}
          <div className="stats shadow bg-base-200 border border-base-300 mt-8 w-full max-w-xl">
            <div className="stat place-items-center py-3">
              <div className="stat-title text-xs">Ready Games</div>
              <div className="stat-value text-2xl text-primary">{publishedSims.length}</div>
            </div>
            <div className="stat place-items-center py-3">
              <div className="stat-title text-xs">Author Voices</div>
              <div className="stat-value text-2xl text-secondary">{voices.length}</div>
            </div>
            <div className="stat place-items-center py-3">
              <div className="stat-title text-xs">Starting Sims</div>
              <div className="stat-value text-2xl text-accent">100</div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 3 HOW IT WORKS CARDS                                                 */}
      {/* ==================================================================== */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-4 sm:px-8 py-10">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold">How It Works</h2>
          <p className="text-sm text-base-content/70 mt-1">Simple steps to create and play.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card bg-base-200 border border-base-300 shadow">
            <div className="card-body">
              <span className="badge badge-primary">1. Create</span>
              <h3 className="card-title text-base mt-2">Write Your Story</h3>
              <p className="text-xs text-base-content/70 leading-relaxed">
                Type an idea or let AI write one for you. Choose how many characters will play.
              </p>
            </div>
          </div>

          <div className="card bg-base-200 border border-base-300 shadow">
            <div className="card-body">
              <span className="badge badge-secondary">2. Play</span>
              <h3 className="card-title text-base mt-2">Trade Secret Clues</h3>
              <p className="text-xs text-base-content/70 leading-relaxed">
                Each character gets their own clues. Talk with other players to trade info and complete your goal.
              </p>
            </div>
          </div>

          <div className="card bg-base-200 border border-base-300 shadow">
            <div className="card-body">
              <span className="badge badge-accent">3. Invite</span>
              <h3 className="card-title text-base mt-2">Invite Players</h3>
              <p className="text-xs text-base-content/70 leading-relaxed">
                Search friends by username to fill a character seat, or transfer your seat to another user anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* AI AUTHOR VOICES SECTION                                             */}
      {/* ==================================================================== */}
      <section id="voices" className="max-w-6xl mx-auto px-4 sm:px-8 py-10 border-t border-base-300">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold">Writing Voices</h2>
          <p className="text-sm text-base-content/70 mt-1">Choose how the AI speaks in your game.</p>
        </div>

        <div className="card bg-base-200 border border-base-300 shadow max-w-3xl mx-auto">
          <div className="card-body space-y-4">
            <div className="flex flex-wrap gap-2 justify-center">
              {voices.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedVoiceId(v.id)}
                  className={`btn btn-sm ${
                    v.id === selectedVoiceId ? 'btn-primary' : 'btn-ghost border-base-300'
                  }`}
                >
                  <Mic className="w-3.5 h-3.5" />
                  {v.name}
                </button>
              ))}
            </div>

            {activeVoice && (
              <div className="p-4 rounded-xl bg-base-100 border border-base-300 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-primary">{activeVoice.name}</span>
                  <span className="badge badge-sm badge-outline">{activeVoice.genre}</span>
                </div>
                <p className="text-xs text-base-content/70">{activeVoice.tagline}</p>
                <div className="p-3 rounded-lg bg-base-200 text-xs italic text-base-content/90 border border-base-300">
                  &ldquo;{activeVoice.sampleLine}&rdquo;
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* AVAILABLE GAMES LIBRARY                                              */}
      {/* ==================================================================== */}
      <section id="games" className="max-w-6xl mx-auto px-4 sm:px-8 py-10 border-t border-base-300">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">Available Games</h2>
            <p className="text-sm text-base-content/70 mt-1">Pick a game to start playing.</p>
          </div>

          <a
            href="/?portal=app"
            onClick={(e) => handleLinkClick(e, onLaunchApp)}
            className="btn btn-outline btn-sm"
          >
            View All in App
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {publishedSims.map((sim) => (
            <div key={sim.id} className="card bg-base-200 border border-base-300 shadow">
              <div className="card-body">
                <div className="flex items-center justify-between gap-2">
                  <span className="badge badge-sm badge-secondary">
                    {sim.complexityTier ?? 'STANDARD'}
                  </span>
                  <span className="badge badge-sm badge-ghost font-mono">
                    {sim.usageCostSims ?? 4} Sims
                  </span>
                </div>

                <h3 className="card-title text-base mt-1">{sim.title}</h3>

                {sim.voiceStyle && (
                  <span className="text-[11px] text-primary font-medium">
                    Voice: {sim.voiceStyle.name}
                  </span>
                )}

                <p className="text-xs text-base-content/70 line-clamp-3">
                  {sim.masterNarrative}
                </p>

                <div className="card-actions justify-end mt-4 pt-3 border-t border-base-300">
                  <a
                    href="/?portal=app"
                    onClick={(e) => handleLinkClick(e, onLaunchApp)}
                    className="btn btn-primary btn-xs"
                  >
                    Play Game
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ==================================================================== */}
      {/* SIMPLE FOOTER                                                        */}
      {/* ==================================================================== */}
      <footer className="footer footer-center p-6 bg-base-200 text-base-content/60 border-t border-base-300 text-xs">
        <div className="flex flex-wrap items-center justify-between w-full max-w-6xl mx-auto gap-4">
          <p>Sim Creator Studio — Story &amp; Mystery Games</p>
          <div className="flex gap-4">
            <a href="/?portal=login" onClick={(e) => handleLinkClick(e, onNavigateLogin)} className="link link-hover">
              Sign In
            </a>
            <a href="/?portal=register" onClick={(e) => handleLinkClick(e, onNavigateRegister)} className="link link-hover">
              Create Account
            </a>
            <a href="/?portal=app" onClick={(e) => handleLinkClick(e, onLaunchApp)} className="link link-hover font-bold text-primary">
              Launch App
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
