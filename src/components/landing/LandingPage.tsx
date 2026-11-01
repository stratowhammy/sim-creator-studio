import React, { useState } from 'react';
import { SimulationState, SpeechStyle } from '../../types/simulation';
import { UserAccount } from '../../types/user';
import {
  ArrowRight,
  LogIn,
  Mic,
  Play,
  Sparkles,
  UserPlus,
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
    <div className="min-h-screen w-screen overflow-y-auto bg-[#fffef0] text-[#41403e] select-text">
      {/* ==================================================================== */}
      {/* PAPER.CSS NAVBAR                                                     */}
      {/* ==================================================================== */}
      <nav className="border split-nav sticky top-0 z-30 bg-[#fffef0] px-4 py-2">
        <div className="nav-brand flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-secondary" />
          <h3 className="m-0 font-bold tracking-tight">Sim Creator Studio</h3>
        </div>

        <div className="collapsible">
          <ul className="inline flex items-center gap-2 m-0 p-0">
            <li><a href="#how-it-works" className="text-sm">How It Works</a></li>
            <li><a href="#voices" className="text-sm">Voices</a></li>
            <li><a href="#games" className="text-sm">Games</a></li>
            <li>
              <a
                href="/?portal=login"
                onClick={(e) => handleLinkClick(e, onNavigateLogin)}
                className="paper-btn btn-small btn-secondary-outline inline-flex items-center gap-1"
              >
                <LogIn className="w-3.5 h-3.5" />
                Sign In
              </a>
            </li>
            {!currentUser && (
              <li>
                <a
                  href="/?portal=register"
                  onClick={(e) => handleLinkClick(e, onNavigateRegister)}
                  className="paper-btn btn-small inline-flex items-center gap-1"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Sign Up
                </a>
              </li>
            )}
            <li>
              <a
                href="/?portal=app"
                onClick={(e) => handleLinkClick(e, onLaunchApp)}
                className="paper-btn btn-small btn-primary inline-flex items-center gap-1"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {currentUser ? 'Open App' : 'Launch App'}
              </a>
            </li>
          </ul>
        </div>
      </nav>

      {/* ==================================================================== */}
      {/* HERO SECTION                                                         */}
      {/* ==================================================================== */}
      <section className="py-12 sm:py-16 px-4 sm:px-8 max-w-5xl mx-auto text-center">
        <span className="badge secondary gap-1 text-sm py-1 px-3">
          <Sparkles className="w-3.5 h-3.5 inline mr-1" />
          Story &amp; Mystery Games
        </span>

        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mt-4 mb-3">
          Build and Play Story Games with Friends
        </h1>

        <p className="text-lg text-[#555] max-w-xl mx-auto mb-6">
          Create mystery games, take on character roles, and trade secret clues to solve the story together.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
          <a
            href="/?portal=app"
            onClick={(e) => handleLinkClick(e, onLaunchApp)}
            className="paper-btn btn-primary inline-flex items-center gap-2 text-base px-5 py-2"
          >
            <Play className="w-4 h-4 fill-current" />
            {currentUser ? `Play as @${currentUser.username}` : 'Start Playing'}
          </a>

          <a
            href="/?portal=login"
            onClick={(e) => handleLinkClick(e, onNavigateLogin)}
            className="paper-btn btn-secondary inline-flex items-center gap-2 text-base px-5 py-2"
          >
            <LogIn className="w-4 h-4" />
            Demo Sign In
          </a>
        </div>

        {/* Paper Quick Stats */}
        <div className="paper max-w-2xl mx-auto grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs uppercase tracking-wider text-[#777]">Ready Games</div>
            <div className="text-3xl font-bold text-primary">{publishedSims.length}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-[#777]">Author Voices</div>
            <div className="text-3xl font-bold text-secondary">{voices.length}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-[#777]">Starting Sims</div>
            <div className="text-3xl font-bold text-success">100</div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 3 HOW IT WORKS CARDS                                                 */}
      {/* ==================================================================== */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-4 sm:px-8 py-10">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold">How It Works</h2>
          <p className="text-sm text-[#666] mt-1">Simple steps to create and play.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card">
            <div className="card-body">
              <span className="badge primary self-start">1. Create</span>
              <h4 className="card-title text-lg mt-2">Write Your Story</h4>
              <p className="card-text text-sm text-[#555]">
                Type an idea or let AI write one for you. Choose how many characters will play.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <span className="badge secondary self-start">2. Play</span>
              <h4 className="card-title text-lg mt-2">Trade Secret Clues</h4>
              <p className="card-text text-sm text-[#555]">
                Each character gets their own clues. Talk with other players to trade info and complete your goal.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <span className="badge success self-start">3. Invite</span>
              <h4 className="card-title text-lg mt-2">Invite Players</h4>
              <p className="card-text text-sm text-[#555]">
                Search friends by username to fill a character seat, or transfer your seat to another user anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* AI AUTHOR VOICES SECTION                                             */}
      {/* ==================================================================== */}
      <section id="voices" className="max-w-5xl mx-auto px-4 sm:px-8 py-10 border-t-2 border-dashed border-[#ccc]">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold">Writing Voices</h2>
          <p className="text-sm text-[#666] mt-1">Choose how the AI speaks in your game.</p>
        </div>

        <div className="card max-w-3xl mx-auto">
          <div className="card-body space-y-4">
            <div className="flex flex-wrap gap-2 justify-center">
              {voices.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedVoiceId(v.id)}
                  className={`paper-btn btn-small ${
                    v.id === selectedVoiceId ? 'btn-primary' : 'btn-secondary-outline'
                  }`}
                >
                  <Mic className="w-3.5 h-3.5 inline mr-1" />
                  {v.name}
                </button>
              ))}
            </div>

            {activeVoice && (
              <div className="paper bg-white p-4 space-y-2 border">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-base text-primary">{activeVoice.name}</span>
                  <span className="badge secondary">{activeVoice.genre}</span>
                </div>
                <p className="text-sm text-[#666] m-0">{activeVoice.tagline}</p>
                <div className="p-3 bg-[#faf9ee] border border-dashed rounded text-sm italic text-[#444] mt-2">
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
      <section id="games" className="max-w-5xl mx-auto px-4 sm:px-8 py-10 border-t-2 border-dashed border-[#ccc]">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold">Available Games</h2>
            <p className="text-sm text-[#666] mt-1">Pick a game to start playing.</p>
          </div>

          <a
            href="/?portal=app"
            onClick={(e) => handleLinkClick(e, onLaunchApp)}
            className="paper-btn btn-small btn-secondary inline-flex items-center gap-1"
          >
            View All in App
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {publishedSims.map((sim) => (
            <div key={sim.id} className="card">
              <div className="card-body flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="badge secondary">
                      {sim.complexityTier ?? 'STANDARD'}
                    </span>
                    <span className="badge">
                      {sim.usageCostSims ?? 4} Sims
                    </span>
                  </div>

                  <h4 className="card-title text-lg mb-1">{sim.title}</h4>

                  {sim.voiceStyle && (
                    <div className="text-xs text-secondary font-bold mb-2">
                      Voice: {sim.voiceStyle.name}
                    </div>
                  )}

                  <p className="card-text text-sm text-[#555] line-clamp-3">
                    {sim.masterNarrative}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-dashed border-[#ddd] flex justify-end">
                  <a
                    href="/?portal=app"
                    onClick={(e) => handleLinkClick(e, onLaunchApp)}
                    className="paper-btn btn-small btn-primary"
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
      <footer className="border-t-2 border-[#41403e] py-6 px-4 bg-[#f8f7ea] text-sm text-[#666] mt-12">
        <div className="flex flex-wrap items-center justify-between max-w-5xl mx-auto gap-4">
          <p className="m-0 font-bold">Sim Creator Studio — Story &amp; Mystery Games</p>
          <div className="flex gap-4">
            <a href="/?portal=login" onClick={(e) => handleLinkClick(e, onNavigateLogin)} className="hover:underline">
              Sign In
            </a>
            <a href="/?portal=register" onClick={(e) => handleLinkClick(e, onNavigateRegister)} className="hover:underline">
              Create Account
            </a>
            <a href="/?portal=app" onClick={(e) => handleLinkClick(e, onLaunchApp)} className="hover:underline font-bold text-secondary">
              Launch App
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
