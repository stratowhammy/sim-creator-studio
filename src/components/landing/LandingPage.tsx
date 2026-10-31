import React, { useState } from 'react';
import { SimulationState, SpeechStyle } from '../../types/simulation';
import { UserAccount } from '../../types/user';
import {
  calculateCollectionUsageCostSims,
  COMPLEXITY_TIER_CONFIG,
  CUSTOM_VOICE_CREATION_COST_SIMS,
  V4_PRO_CREATION_COST_SIMS,
} from '../../services/simsEconomyService';
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Coins,
  Cpu,
  Globe,
  Layers,
  Lock,
  LogIn,
  Mic,
  Play,
  Radio,
  Shield,
  Sparkles,
  Terminal,
  UserPlus,
  Users,
  Wand2,
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
    <div className="min-h-screen w-screen overflow-y-auto bg-slate-950 text-slate-100 font-sans select-text">
      {/* Ambient Backdrop */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-48 left-1/4 w-[34rem] h-[34rem] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute top-96 -right-32 w-[30rem] h-[30rem] rounded-full bg-purple-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-10 w-[28rem] h-[28rem] rounded-full bg-amber-500/10 blur-3xl" />
      </div>

      {/* ==================================================================== */}
      {/* STICKY TOP NAVIGATION                                                */}
      {/* ==================================================================== */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-slate-950/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/40 flex items-center justify-center shadow-lg shadow-sky-500/10">
              <Radio className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-white">
                Sim Creator Studio
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                v2.5 Live
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
            <a href="#features" className="hover:text-sky-300 transition-colors">
              Architecture
            </a>
            <a href="#voices" className="hover:text-violet-300 transition-colors">
              AI Speech Styles
            </a>
            <a href="#economy" className="hover:text-amber-300 transition-colors">
              'Sims' Economy
            </a>
            <a
              href="#collection"
              className="hover:text-emerald-300 transition-colors"
            >
              Simulations Collection
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <a
              href="/?portal=login"
              onClick={(e) => handleLinkClick(e, onNavigateLogin)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
            >
              <LogIn className="w-3.5 h-3.5 text-sky-400" />
              Log In
            </a>

            <a
              href="/?portal=register"
              onClick={(e) => handleLinkClick(e, onNavigateRegister)}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-emerald-700/50 text-xs font-semibold transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Sign Up
            </a>

            <a
              href="/?portal=app"
              onClick={(e) => handleLinkClick(e, onLaunchApp)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold shadow-lg shadow-sky-500/20 transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {currentUser
                ? `Open App (@${currentUser.username})`
                : 'Launch App'}
            </a>
          </div>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* HERO BANNER                                                          */}
      {/* ==================================================================== */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-16 pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-950/60 border border-purple-500/40 text-xs text-purple-200">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>
                Asymmetric Multi-Agent Mysteries • Epistemic RAG Isolation • 'Sims' Creator Royalties
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-[1.12]">
              Author Living Conspiracies.{' '}
              <span className="bg-gradient-to-r from-sky-400 via-violet-400 to-amber-300 bg-clip-text text-transparent">
                Step Inside the Room.
              </span>
            </h1>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
              <strong>Sim Creator Studio</strong> compiles master prose into mathematically solvable multi-character clue graphs, partitions every character’s private memory, weaves distinct AI speech voices—from <em>Hardboiled Film Noir</em> to <em>High Fantasy Chronicles</em>—and rewards creators with <strong>'Sims'</strong> credits whenever players unlock their published worlds.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a
                href="/?portal=app"
                onClick={(e) => handleLinkClick(e, onLaunchApp)}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm shadow-xl shadow-sky-500/20 transition-all"
              >
                {currentUser
                  ? `Continue to Studio App (@${currentUser.username} • ${
                      currentUser.simsBalance ?? 0
                    } Sims)`
                  : 'Launch Sim Studio App'}
                <ArrowRight className="w-4 h-4" />
              </a>

              <a
                href="/?portal=login"
                onClick={(e) => handleLinkClick(e, onNavigateLogin)}
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white border border-slate-700 font-semibold text-sm transition-colors"
              >
                <LogIn className="w-4 h-4 text-sky-400" />
                Log In / Demo Accounts
              </a>

              <a
                href="/?portal=register"
                onClick={(e) => handleLinkClick(e, onNavigateRegister)}
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/40 font-semibold text-sm transition-colors"
              >
                <Coins className="w-4 h-4 text-amber-400" />
                Create Account (+100 Free Sims)
              </a>
            </div>

            {/* Trust / Architecture Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
              <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800">
                <div className="text-xl font-bold text-sky-300">
                  {publishedSims.length}
                </div>
                <div className="text-[11px] text-slate-400">
                  Playable Scenarios
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800">
                <div className="text-xl font-bold text-violet-300">
                  {voices.length}+
                </div>
                <div className="text-[11px] text-slate-400">
                  AI Speech Voices
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800">
                <div className="text-xl font-bold text-emerald-300">30s</div>
                <div className="text-[11px] text-slate-400">
                  Live Response Window
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800">
                <div className="text-xl font-bold text-amber-300">10%</div>
                <div className="text-[11px] text-slate-400">
                  Nominal Play Royalty
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Live Voice Preview Card */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl bg-slate-900/85 border border-slate-800 p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Mic className="w-4 h-4 text-violet-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-violet-300 font-mono">
                    Live AI Voice Engine Preview
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-emerald-300 border border-slate-800">
                  Epistemic Integrity Active
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {voices.slice(0, 6).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVoiceId(v.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                      activeVoice?.id === v.id
                        ? 'bg-violet-600 text-white border-violet-400 shadow'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {v.authorInspiration ?? v.name}
                  </button>
                ))}
              </div>

              {activeVoice && (
                <div className="p-4 rounded-xl bg-slate-950 border border-violet-500/30 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-sm font-bold text-white block">
                        {activeVoice.name}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {activeVoice.genre && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-sky-300 border border-slate-800">
                            Genre: {activeVoice.genre}
                          </span>
                        )}
                        {activeVoice.authorInspiration && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-950/70 text-violet-200 border border-violet-500/40">
                            Author Focus: {activeVoice.authorInspiration}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-violet-300 shrink-0">
                      {activeVoice.source === 'ADMIN_ADDED'
                        ? 'Admin Curated'
                        : 'Single-Author Voice'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{activeVoice.tagline}</p>
                  <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 text-xs italic text-violet-100 leading-relaxed">
                    {activeVoice.sampleLine}
                  </div>
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <Wand2 className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Want a custom dialect? Define your own speech style in Studio for{' '}
                    <strong className="text-amber-300">
                      +{CUSTOM_VOICE_CREATION_COST_SIMS} Sims
                    </strong>
                    .
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* CORE PLATFORM ARCHITECTURE (#features)                               */}
      {/* ==================================================================== */}
      <section
        id="features"
        className="relative z-10 max-w-7xl mx-auto px-6 py-14 border-t border-slate-900"
      >
        <div className="max-w-2xl mb-10">
          <span className="text-xs font-mono uppercase tracking-wider text-sky-400">
            Platform Capabilities
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">
            Engineered for High-Stakes Asymmetric Roleplay
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            Every layer separates server-side resolution math from the player’s private immersion.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
              <Layers className="w-4 h-4 text-purple-400" />
            </div>
            <h3 className="text-sm font-bold text-white">
              DAG Compiler &amp; Solvability Proofs
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Automatically deconstructs master lore into atomic clues and verifies Zero Self-Sufficiency, 100% Global Reachability, and Asymmetric Leverage before launch.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
              <Shield className="w-4 h-4 text-sky-400" />
            </div>
            <h3 className="text-sm font-bold text-white">
              Strict Epistemic Player Isolation
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Players see a personalized AI Current Knowledge briefing and non-targeted investigative questions—never hidden stats, server rolls, or unowned secrets.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Bell className="w-4 h-4 text-amber-400" />
            </div>
            <h3 className="text-sm font-bold text-white">
              30-Second Live Rooms &amp; AI Mediation
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Active players receive real-time bottom-right hails with 30 seconds to type a direct reply (AI-mediated for lore integrity) or pick suggested stances before AI takeover.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-fuchsia-400" />
            </div>
            <h3 className="text-sm font-bold text-white">
              Flash Thinking + V4 Pro Authoring
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Powered by DeepSeek Flash Thinking for responsive play, with optional paid V4 Pro narrative synthesis in Studio and an Admin 'Test V4 Pro' benchmark switch.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Terminal className="w-4 h-4 text-emerald-400" />
            </div>
            <h3 className="text-sm font-bold text-white">
              Multi-Game Admin &amp; 4-Tier RBAC
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Granular permissions for Global Admins, Single-Simulation Game Masters, Studio Creators, and Players—plus 1-click exact Player View inspection.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
              <Users className="w-4 h-4 text-cyan-400" />
            </div>
            <h3 className="text-sm font-bold text-white">
              Strategic Guard &amp; Shareable Leverage
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Guard 1 vital secret while marking intelligence Shareable to boost discovery odds (+8% per shareable card) across multi-round character transcripts.
            </p>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* AI SPEECH STYLES SHOWCASE (#voices)                                  */}
      {/* ==================================================================== */}
      <section
        id="voices"
        className="relative z-10 max-w-7xl mx-auto px-6 py-14 border-t border-slate-900"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-violet-400">
              Single-Author Genre Voices
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">
              Each Genre Tailored Around One Master Author’s Craft
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
              Every built-in AI voice anchors its prose cadence, subtext, and dialogue rhythm around a single iconic author from that genre—or spend Sims in Studio to define your own literary voice.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {voices.map((voice) => (
            <div
              key={voice.id}
              className="p-5 rounded-2xl bg-slate-900/65 border border-slate-800 hover:border-violet-500/50 transition-all flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-white">
                    {voice.name}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-950/60 text-violet-300 border border-violet-700/40 shrink-0">
                    {voice.source === 'ADMIN_ADDED' ? 'Admin Added' : 'Collection'}
                  </span>
                </div>
                {(voice.genre || voice.authorInspiration) && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {voice.genre && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-sky-300 border border-slate-800">
                        {voice.genre}
                      </span>
                    )}
                    {voice.authorInspiration && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/40 text-amber-200 border border-amber-500/30">
                        Style of {voice.authorInspiration}
                      </span>
                    )}
                  </div>
                )}
                <p className="text-xs text-violet-200/90">{voice.tagline}</p>
              </div>
              <p className="text-xs italic text-slate-300 bg-slate-950/80 p-3 rounded-xl border border-slate-800/80">
                {voice.sampleLine}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ==================================================================== */}
      {/* THE 'SIMS' CREDIT & CREATOR ROYALTY ECONOMY (#economy)               */}
      {/* ==================================================================== */}
      <section
        id="economy"
        className="relative z-10 max-w-7xl mx-auto px-6 py-14 border-t border-slate-900"
      >
        <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900/95 to-amber-950/25 border border-amber-500/30 p-7 sm:p-10 space-y-8">
          <div className="max-w-3xl space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-amber-300">
              <Coins className="w-4 h-4 text-amber-400" />
              The 'Sims' Creator Economy
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white">
              Spend 'Sims' to Build Deeper Worlds. Earn 'Sims' When Players Explore Them.
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Every new account receives starter <strong>Sims</strong>, Global Admins can gift bonus <strong>Sims</strong> anytime, and creators earn automatic royalties whenever another user unlocks their published simulation for a nominal <strong>10%</strong> of its build cost.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-slate-950/85 border border-slate-800 space-y-2">
              <div className="text-xs font-mono uppercase text-purple-300">
                1. Scale Complexity
              </div>
              <div className="text-lg font-bold text-white">
                {COMPLEXITY_TIER_CONFIG.STANDARD.costSims} /{' '}
                {COMPLEXITY_TIER_CONFIG.ELEVATED.costSims} /{' '}
                {COMPLEXITY_TIER_CONFIG.LABYRINTHINE.costSims} Sims
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Choose Standard (8–12 clues), Elevated (14–18 clues), or Labyrinthine (20–26 clues &amp; multi-hop objectives).
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-950/85 border border-slate-800 space-y-2">
              <div className="text-xs font-mono uppercase text-fuchsia-300">
                2. Optional Pro Upgrades
              </div>
              <div className="text-lg font-bold text-white">
                +{V4_PRO_CREATION_COST_SIMS} V4 Pro • +{CUSTOM_VOICE_CREATION_COST_SIMS} Custom Voice
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Toggle DeepSeek V4 Pro when compiling narratives or author a custom speech style tailored to your setting.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-950/85 border border-emerald-500/40 space-y-2">
              <div className="text-xs font-mono uppercase text-emerald-300">
                3. Publish &amp; Earn 10% Royalties
              </div>
              <div className="text-lg font-bold text-emerald-300">
                2–15 Sims Nominal Unlock
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Players unlock any published simulation for 10% of what the creator paid—and 100% of those Sims go straight to the creator!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* AVAILABLE SIMULATIONS COLLECTION PREVIEW (#collection)               */}
      {/* ==================================================================== */}
      <section
        id="collection"
        className="relative z-10 max-w-7xl mx-auto px-6 py-14 border-t border-slate-900"
      >
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-emerald-400">
              <Globe className="w-3.5 h-3.5" />
              Available Simulations Collection
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">
              Featured Mysteries Ready to Unlock &amp; Play
            </h2>
          </div>

          <a
            href="/?portal=app"
            onClick={(e) => handleLinkClick(e, onLaunchApp)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-400 hover:text-sky-300"
          >
            Browse Full Collection in App <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {publishedSims.map((sim) => {
            const creatorCost = sim.creationCostSims ?? 20;
            const playFee =
              sim.usageCostSims ??
              calculateCollectionUsageCostSims(creatorCost);
            return (
              <div
                key={sim.id}
                className="rounded-2xl bg-slate-900/75 border border-slate-800 p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-purple-950/70 text-purple-300 border border-purple-700/50">
                      {sim.complexityTier ?? 'STANDARD'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-700/50">
                      <Lock className="w-2.5 h-2.5" />
                      {playFee} Sims (10% of {creatorCost})
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white">{sim.title}</h3>

                  {sim.voiceStyle && (
                    <div className="text-[11px] text-violet-300 font-medium">
                      Voice: {sim.voiceStyle.name}
                    </div>
                  )}

                  <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                    {sim.masterNarrative}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400">
                    Creator:{' '}
                    <strong className="text-slate-200">
                      @{sim.creatorUsername ?? 'studio'}
                    </strong>
                  </span>
                  <a
                    href="/?portal=app"
                    onClick={(e) => handleLinkClick(e, onLaunchApp)}
                    className="inline-flex items-center gap-1 font-bold text-sky-400 hover:text-sky-300"
                  >
                    Play in App <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ==================================================================== */}
      {/* FOOTER CTA                                                           */}
      {/* ==================================================================== */}
      <footer className="relative z-10 border-t border-slate-900 bg-slate-950/95 py-10 mt-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>
              <strong className="text-white">Sim Creator Studio</strong> — Localhost Multi-Agent Simulation Suite
            </span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="/?portal=login"
              onClick={(e) => handleLinkClick(e, onNavigateLogin)}
              className="hover:text-white transition-colors"
            >
              Log In
            </a>
            <a
              href="/?portal=register"
              onClick={(e) => handleLinkClick(e, onNavigateRegister)}
              className="hover:text-white transition-colors"
            >
              Create Account
            </a>
            <a
              href="/?portal=app"
              onClick={(e) => handleLinkClick(e, onLaunchApp)}
              className="text-sky-400 hover:text-sky-300 font-bold transition-colors"
            >
              Launch App →
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
