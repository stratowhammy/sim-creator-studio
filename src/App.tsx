import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SimulationState, SpeechStyle } from './types/simulation';
import { UserAccount } from './types/user';
import {
  createFantasyValdrisScenario,
  createGenevaAccordScenario,
  createMeridianBlackoutScenario,
  createNoirPier19Scenario,
  createStationHeliosScenario,
} from './alpha/scenarioData';
import { buildRagIndexFromState } from './engine/ragPartition';
import { normalizeAllCharacterPolicies } from './engine/resolution';
import {
  completePendingEngagementWithAI,
  NOTIFICATION_TIMEOUT_MS,
} from './engine/engagementManager';
import {
  canAccessAuthoringStudio,
  canAccessGlobalAdminOverview,
  canAdministerSimulation,
  getActiveAuthSession,
  getPrimaryManagedSimulationId,
  loadAllUsers,
  setActiveAuthSession,
} from './services/authService';
import {
  isTestV4ProEnabled,
  setTestV4ProEnabled,
} from './services/llmOrchestrator';
import {
  broadcastRealtimeEvent,
  subscribeRealtimeEvents,
} from './services/presenceService';
import {
  getBuiltInVoiceById,
  loadSpeechStyleCollection,
} from './services/simsEconomyService';
import { LandingPage } from './components/landing/LandingPage';
import { AuthScreen } from './components/auth/AuthScreen';
import { UserProfileDashboard } from './components/profile/UserProfileDashboard';
import { AdminSimulationsOverview } from './components/admin/AdminSimulationsOverview';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AuthoringStudio } from './components/studio/AuthoringStudio';
import { PlayerDashboard } from './components/player/PlayerDashboard';

const LEGACY_STORAGE_STATE_KEY = 'SIM_CREATOR_LIVE_STATE_V1';
const SIMULATIONS_REGISTRY_KEY = 'SIM_CREATOR_SIMULATIONS_V2';

function buildDefaultSimulationsRegistry(): Record<string, SimulationState> {
  const freshHelios = createStationHeliosScenario();
  let helios = freshHelios;

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const legacy = window.localStorage.getItem(LEGACY_STORAGE_STATE_KEY);
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy) as SimulationState;
        if (
          parsedLegacy &&
          parsedLegacy.id === 'sim_helios_001' &&
          parsedLegacy.characters &&
          parsedLegacy.cards
        ) {
          const legacyVoice =
            parsedLegacy.voiceStyle?.source === 'BUILT_IN'
              ? getBuiltInVoiceById(parsedLegacy.voiceStyle.id)
              : parsedLegacy.voiceStyle ?? freshHelios.voiceStyle;

          helios = {
            ...freshHelios,
            ...parsedLegacy,
            voiceStyle: legacyVoice,
            complexityTier:
              parsedLegacy.complexityTier ?? freshHelios.complexityTier,
            creationCostSims:
              parsedLegacy.creationCostSims ?? freshHelios.creationCostSims,
            usageCostSims:
              parsedLegacy.usageCostSims ?? freshHelios.usageCostSims,
            publishedToCollection:
              parsedLegacy.publishedToCollection ?? true,
          };
        }
      }
    } catch {
      // Ignore legacy parse issues
    }
  }

  const scenarios = [
    helios,
    createGenevaAccordScenario(),
    createMeridianBlackoutScenario(),
    createNoirPier19Scenario(),
    createFantasyValdrisScenario(),
  ];

  const registry: Record<string, SimulationState> = {};
  for (const sim of scenarios) {
    normalizeAllCharacterPolicies(sim);
    if (!sim.ragIndex || sim.ragIndex.length === 0) {
      sim.ragIndex = buildRagIndexFromState(sim);
    }
    registry[sim.id] = sim;
  }

  return registry;
}

function readSimulationsRegistryFromStorage(): Record<
  string,
  SimulationState
> | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(SIMULATIONS_REGISTRY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, SimulationState>;
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
      for (const sim of Object.values(parsed)) {
        normalizeAllCharacterPolicies(sim);
      }
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function loadInitialSimulationsRegistry(): Record<string, SimulationState> {
  const defaults = buildDefaultSimulationsRegistry();
  const existing = readSimulationsRegistryFromStorage();

  if (existing) {
    let didMutate = false;

    for (const [id, defaultSim] of Object.entries(defaults)) {
      if (!existing[id]) {
        existing[id] = defaultSim;
        didMutate = true;
      } else {
        // Backfill Sims & Author-Tailored Voice metadata onto older stored scenarios without losing gameplay state
        const stored = existing[id];
        const latestBuiltIn =
          stored.voiceStyle?.source === 'BUILT_IN'
            ? getBuiltInVoiceById(stored.voiceStyle.id)
            : undefined;
        const needsBuiltInVoiceRefresh =
          latestBuiltIn !== undefined &&
          (stored.voiceStyle?.name !== latestBuiltIn.name ||
            stored.voiceStyle?.authorInspiration !==
              latestBuiltIn.authorInspiration ||
            stored.voiceStyle?.styleDirective !== latestBuiltIn.styleDirective);

        if (
          !stored.voiceStyle ||
          needsBuiltInVoiceRefresh ||
          stored.publishedToCollection === undefined ||
          stored.creationCostSims === undefined
        ) {
          existing[id] = {
            ...defaultSim,
            ...stored,
            voiceStyle: latestBuiltIn ?? stored.voiceStyle ?? defaultSim.voiceStyle,
            knowledgeBriefings: needsBuiltInVoiceRefresh
              ? {}
              : stored.knowledgeBriefings,
            complexityTier: stored.complexityTier ?? defaultSim.complexityTier,
            creatorUserId: stored.creatorUserId ?? defaultSim.creatorUserId,
            creatorUsername:
              stored.creatorUsername ?? defaultSim.creatorUsername,
            creatorDisplayName:
              stored.creatorDisplayName ?? defaultSim.creatorDisplayName,
            creationCostSims:
              stored.creationCostSims ?? defaultSim.creationCostSims,
            usageCostSims: stored.usageCostSims ?? defaultSim.usageCostSims,
            publishedToCollection:
              stored.publishedToCollection ?? defaultSim.publishedToCollection,
          };
          didMutate = true;
        }
      }
    }

    // Also refresh any custom/published simulations that selected a BUILT_IN voice
    for (const [id, sim] of Object.entries(existing)) {
      if (defaults[id]) continue;
      if (sim.voiceStyle?.source === 'BUILT_IN') {
        const latestBuiltIn = getBuiltInVoiceById(sim.voiceStyle.id);
        if (
          sim.voiceStyle.name !== latestBuiltIn.name ||
          sim.voiceStyle.authorInspiration !== latestBuiltIn.authorInspiration ||
          sim.voiceStyle.styleDirective !== latestBuiltIn.styleDirective
        ) {
          existing[id] = {
            ...sim,
            voiceStyle: latestBuiltIn,
            knowledgeBriefings: {},
          };
          didMutate = true;
        }
      }
    }

    if (didMutate && typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(
          SIMULATIONS_REGISTRY_KEY,
          JSON.stringify(existing)
        );
      } catch {
        // Ignore quota errors
      }
    }
    return existing;
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(
        SIMULATIONS_REGISTRY_KEY,
        JSON.stringify(defaults)
      );
    } catch {
      // Ignore quota errors
    }
  }
  return defaults;
}

type PortalMode = 'LANDING' | 'AUTH_LOGIN' | 'AUTH_REGISTER' | 'APP';

function readPortalModeFromUrl(): PortalMode {
  if (typeof window === 'undefined') return 'LANDING';
  const params = new URLSearchParams(window.location.search);
  const portal = params.get('portal');
  if (portal === 'login') return 'AUTH_LOGIN';
  if (portal === 'register') return 'AUTH_REGISTER';
  if (portal === 'app') return 'APP';
  return 'LANDING';
}

type AppView =
  | { type: 'PROFILE' }
  | { type: 'PLAYER_ROOM'; simulationId: string; playerId: string }
  | { type: 'ADMIN_OVERVIEW' }
  | { type: 'GAME_ADMIN'; simulationId: string; previewPlayerId?: string }
  | { type: 'STUDIO'; simulationId: string };

function getDefaultViewForUser(
  user: UserAccount | null,
  simulations: Record<string, SimulationState>
): AppView {
  if (!user) return { type: 'PROFILE' };
  if (canAccessGlobalAdminOverview(user)) {
    return { type: 'ADMIN_OVERVIEW' };
  }
  if (user.accountRole === 'SIMULATION_ADMIN') {
    const managedId = getPrimaryManagedSimulationId(user, simulations);
    if (managedId && simulations[managedId]) {
      return { type: 'GAME_ADMIN', simulationId: managedId };
    }
  }
  return { type: 'PROFILE' };
}

export const App: React.FC = () => {
  const [simulations, setSimulations] = useState<
    Record<string, SimulationState>
  >(loadInitialSimulationsRegistry);
  const simulationsRef = useRef(simulations);
  simulationsRef.current = simulations;

  const [voiceCollection, setVoiceCollection] = useState<SpeechStyle[]>(() =>
    loadSpeechStyleCollection()
  );

  const autoResolvingIdsRef = useRef<Set<string>>(new Set());

  // Portal Routing ('LANDING' at root localhost, or '?portal=login|register|app')
  const [portalMode, setPortalMode] = useState<PortalMode>(() =>
    readPortalModeFromUrl()
  );

  const navigatePortal = useCallback((nextPortal: PortalMode) => {
    setPortalMode(nextPortal);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (nextPortal === 'LANDING') {
        url.searchParams.delete('portal');
      } else if (nextPortal === 'AUTH_LOGIN') {
        url.searchParams.set('portal', 'login');
      } else if (nextPortal === 'AUTH_REGISTER') {
        url.searchParams.set('portal', 'register');
      } else {
        url.searchParams.set('portal', 'app');
      }
      window.history.pushState({}, '', url.toString());
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setPortalMode(readPortalModeFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // DeepSeek 'Test V4 Pro' toggle state (strictly OFF / deepseek-flash unless toggled ON)
  const [testV4Pro, setTestV4Pro] = useState<boolean>(() =>
    isTestV4ProEnabled()
  );

  const handleToggleTestV4Pro = useCallback((enabled: boolean) => {
    setTestV4ProEnabled(enabled, true);
    setTestV4Pro(enabled);
  }, []);

  // Standalone player view launched directly from Admin "Open in New Tab" (?view=player&player=vance&sim=sim_helios_001)
  const [standaloneRoute] = useState<{
    simulationId: string;
    playerId: string;
  } | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'player') {
      return {
        playerId: params.get('player') || 'vance',
        simulationId: params.get('sim') || 'sim_helios_001',
      };
    }
    return null;
  });

  // Logged-in User Account
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    const session = getActiveAuthSession();
    if (!session) return null;
    const allUsers = loadAllUsers();
    return allUsers.find((u) => u.id === session.userId) ?? null;
  });

  // Active Navigation View inside App
  const [activeView, setActiveView] = useState<AppView>(() => {
    const session = getActiveAuthSession();
    if (session) {
      const allUsers = loadAllUsers();
      const found = allUsers.find((u) => u.id === session.userId) ?? null;
      return getDefaultViewForUser(found, loadInitialSimulationsRegistry());
    }
    return { type: 'PROFILE' };
  });

  // Atomic per-simulation state updater with cross-tab BroadcastChannel + localStorage sync
  const updateSimulationById = useCallback(
    (
      simulationId: string,
      updater: SimulationState | ((prev: SimulationState) => SimulationState)
    ) => {
      setSimulations((prevMap) => {
        const storageLatest = readSimulationsRegistryFromStorage();
        const baseMap = storageLatest ?? prevMap;
        const currentSim = baseMap[simulationId] ?? prevMap[simulationId];
        if (!currentSim) return prevMap;

        const nextSim =
          typeof updater === 'function' ? updater(currentSim) : updater;

        const nextMap: Record<string, SimulationState> = {
          ...baseMap,
          [nextSim.id]: nextSim,
        };

        if (typeof window !== 'undefined' && window.localStorage) {
          try {
            window.localStorage.setItem(
              SIMULATIONS_REGISTRY_KEY,
              JSON.stringify(nextMap)
            );
            if (nextSim.id === 'sim_helios_001') {
              window.localStorage.setItem(
                LEGACY_STORAGE_STATE_KEY,
                JSON.stringify(nextSim)
              );
            }
            broadcastRealtimeEvent({
              type: 'SIMULATIONS_UPDATED',
              simulationId: nextSim.id,
            });
          } catch {
            // Ignore storage quota errors
          }
        }

        return nextMap;
      });
    },
    []
  );

  // Add a newly compiled simulation from Authoring Studio to the active registry
  const handleCreateSimulation = useCallback((newSim: SimulationState) => {
    setSimulations((prevMap) => {
      const storageLatest = readSimulationsRegistryFromStorage() ?? prevMap;
      const nextMap: Record<string, SimulationState> = {
        ...storageLatest,
        [newSim.id]: newSim,
      };
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem(
            SIMULATIONS_REGISTRY_KEY,
            JSON.stringify(nextMap)
          );
          broadcastRealtimeEvent({
            type: 'SIMULATIONS_UPDATED',
            simulationId: newSim.id,
          });
        } catch {
          // Ignore storage quota errors
        }
      }
      return nextMap;
    });
    setActiveView({ type: 'STUDIO', simulationId: newSim.id });
  }, []);

  // Subscribe to real-time cross-tab simulation, user role, voice collection, and LLM model updates
  useEffect(() => {
    const unsub = subscribeRealtimeEvents((msg) => {
      if (msg.type === 'SIMULATIONS_UPDATED') {
        const latest = readSimulationsRegistryFromStorage();
        if (latest) {
          setSimulations(latest);
        }
      } else if (msg.type === 'USERS_UPDATED') {
        setCurrentUser((prev) => {
          if (!prev) return null;
          const refreshed = loadAllUsers().find((u) => u.id === prev.id);
          return refreshed ?? prev;
        });
      } else if (msg.type === 'VOICES_UPDATED') {
        setVoiceCollection(loadSpeechStyleCollection());
      } else if (msg.type === 'LLM_MODEL_UPDATED') {
        setTestV4ProEnabled(msg.testV4Pro, false);
        setTestV4Pro(msg.testV4Pro);
      }
    });
    return unsub;
  }, []);

  // Backup 30-second expiry watcher
  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      for (const sim of Object.values(simulationsRef.current)) {
        const expired = (sim.pendingEngagements ?? []).filter((pe) => {
          if (pe.status !== 'NOTIFYING') return false;
          const deadline =
            pe.expiresAt ??
            (pe.notificationStartedAt ?? pe.createdAt) +
              NOTIFICATION_TIMEOUT_MS;
          return now >= deadline + 600;
        });

        for (const pe of expired) {
          if (autoResolvingIdsRef.current.has(pe.id)) continue;
          autoResolvingIdsRef.current.add(pe.id);

          let claimed = false;
          updateSimulationById(sim.id, (prevSim) => {
            const targetPe = (prevSim.pendingEngagements ?? []).find(
              (item) => item.id === pe.id
            );
            if (!targetPe || targetPe.status !== 'NOTIFYING') return prevSim;
            claimed = true;
            return {
              ...prevSim,
              pendingEngagements: (prevSim.pendingEngagements ?? []).map(
                (item) =>
                  item.id === pe.id ? { ...item, status: 'RESOLVING' } : item
              ),
            };
          });

          if (!claimed) {
            autoResolvingIdsRef.current.delete(pe.id);
            continue;
          }

          completePendingEngagementWithAI(
            simulationsRef.current[sim.id] ?? sim,
            pe.id
          )
            .then((res) => {
              if (res) {
                updateSimulationById(sim.id, res.nextState);
              }
            })
            .finally(() => {
              autoResolvingIdsRef.current.delete(pe.id);
            });
        }
      }
    }, 800);

    return () => window.clearInterval(interval);
  }, [updateSimulationById]);

  const handleAuthenticated = (user: UserAccount) => {
    setCurrentUser(user);
    setActiveView(getDefaultViewForUser(user, simulations));
    navigatePortal('APP');
  };

  const handleSignOut = () => {
    setActiveAuthSession(null);
    setCurrentUser(null);
    setActiveView({ type: 'PROFILE' });
    navigatePortal('AUTH_LOGIN');
  };

  // 1. Standalone direct Player tab (?view=player&player=...)
  if (standaloneRoute) {
    const standaloneSim =
      simulations[standaloneRoute.simulationId] ??
      Object.values(simulations)[0];
    return (
      <div className="w-screen h-screen overflow-hidden bg-[#fffef0] text-[#41403e] select-none">
        <PlayerDashboard
          state={standaloneSim}
          playerId={standaloneRoute.playerId}
          currentUser={currentUser ?? undefined}
          onUpdateState={(updater) =>
            updateSimulationById(standaloneSim.id, updater)
          }
        />
      </div>
    );
  }

  // 2. Root Localhost Landing Page
  if (portalMode === 'LANDING') {
    return (
      <LandingPage
        currentUser={currentUser}
        simulations={simulations}
        voices={voiceCollection}
        onNavigateLogin={() => navigatePortal('AUTH_LOGIN')}
        onNavigateRegister={() => navigatePortal('AUTH_REGISTER')}
        onLaunchApp={() =>
          navigatePortal(currentUser ? 'APP' : 'AUTH_LOGIN')
        }
      />
    );
  }

  // 3. Explicit Login / Registration Screen or Unauthenticated App Visit
  if (
    portalMode === 'AUTH_LOGIN' ||
    portalMode === 'AUTH_REGISTER' ||
    !currentUser
  ) {
    return (
      <AuthScreen
        simulations={simulations}
        initialMode={portalMode === 'AUTH_REGISTER' ? 'REGISTER' : 'LOGIN'}
        onBackToLanding={() => navigatePortal('LANDING')}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  // 4. Active Player Simulation Room (accessible by any enrolled user)
  if (activeView.type === 'PLAYER_ROOM') {
    const activeSim =
      simulations[activeView.simulationId] ?? Object.values(simulations)[0];
    return (
      <div className="w-screen h-screen overflow-hidden bg-[#fffef0] text-[#41403e] select-none">
        <PlayerDashboard
          state={activeSim}
          playerId={activeView.playerId}
          currentUser={currentUser}
          onUpdateState={(updater) =>
            updateSimulationById(activeSim.id, updater)
          }
          onBackToProfile={() => setActiveView({ type: 'PROFILE' })}
        />
      </div>
    );
  }

  // 5. Global Admin Multi-Game Overview Dashboard (ADMIN ONLY)
  if (
    activeView.type === 'ADMIN_OVERVIEW' &&
    canAccessGlobalAdminOverview(currentUser)
  ) {
    return (
      <AdminSimulationsOverview
        currentUser={currentUser}
        simulations={simulations}
        voiceCollection={voiceCollection}
        testV4Pro={testV4Pro}
        onToggleTestV4Pro={handleToggleTestV4Pro}
        onSelectGameAdmin={(simulationId) =>
          setActiveView({ type: 'GAME_ADMIN', simulationId })
        }
        onOpenStudio={() =>
          setActiveView({
            type: 'STUDIO',
            simulationId: Object.keys(simulations)[0] ?? 'sim_helios_001',
          })
        }
        onOpenProfile={() => setActiveView({ type: 'PROFILE' })}
        onUsersChanged={(updatedUsers) => {
          const updatedSelf = updatedUsers.find((u) => u.id === currentUser.id);
          if (updatedSelf) setCurrentUser(updatedSelf);
        }}
        onVoicesChanged={(updatedVoices) => setVoiceCollection(updatedVoices)}
        onSignOut={handleSignOut}
      />
    );
  }

  // 6. Single-Game Admin Dashboard (Overall ADMIN for any game, or SIMULATION_ADMIN for their single assigned simulation)
  if (
    activeView.type === 'GAME_ADMIN' &&
    canAdministerSimulation(currentUser, activeView.simulationId)
  ) {
    const isGlobalAdmin = canAccessGlobalAdminOverview(currentUser);
    const adminSim =
      simulations[activeView.simulationId] ?? Object.values(simulations)[0];

    if (activeView.previewPlayerId) {
      return (
        <div className="w-screen h-screen overflow-hidden bg-[#fffef0] text-[#41403e] select-none">
          <PlayerDashboard
            state={adminSim}
            playerId={activeView.previewPlayerId}
            currentUser={currentUser}
            onUpdateState={(updater) =>
              updateSimulationById(adminSim.id, updater)
            }
            onBackToAdmin={() =>
              setActiveView({
                type: 'GAME_ADMIN',
                simulationId: adminSim.id,
              })
            }
          />
        </div>
      );
    }

    return (
      <div className="w-screen h-screen overflow-hidden bg-[#fffef0] text-[#41403e] select-none">
        <AdminDashboard
          state={adminSim}
          simulations={isGlobalAdmin ? simulations : undefined}
          currentUser={currentUser}
          voiceCollection={voiceCollection}
          onUserUpdated={(updated) => setCurrentUser(updated)}
          onCreateSimulation={handleCreateSimulation}
          onSelectSimulation={
            isGlobalAdmin
              ? (nextSimId) =>
                  setActiveView({ type: 'GAME_ADMIN', simulationId: nextSimId })
              : undefined
          }
          onUpdateState={(updater) =>
            updateSimulationById(adminSim.id, updater)
          }
          onOpenPlayerView={(playerId) =>
            setActiveView({
              type: 'GAME_ADMIN',
              simulationId: adminSim.id,
              previewPlayerId: playerId,
            })
          }
          testV4Pro={testV4Pro}
          onToggleTestV4Pro={handleToggleTestV4Pro}
          onBackToOverview={
            isGlobalAdmin
              ? () => setActiveView({ type: 'ADMIN_OVERVIEW' })
              : undefined
          }
          canSwitchSimulations={isGlobalAdmin}
          canUseStudio={canAccessAuthoringStudio(currentUser)}
          roleLabel={isGlobalAdmin ? 'Admin Dashboard' : 'Single-Sim Admin'}
          onBackToProfile={() => setActiveView({ type: 'PROFILE' })}
          onSignOut={handleSignOut}
        />
      </div>
    );
  }

  // 7. Standalone Simulation Authoring Studio (STUDIO_CREATOR or ADMIN)
  if (
    activeView.type === 'STUDIO' &&
    canAccessAuthoringStudio(currentUser)
  ) {
    const isGlobalAdmin = canAccessGlobalAdminOverview(currentUser);
    const studioSim =
      simulations[activeView.simulationId] ?? Object.values(simulations)[0];

    return (
      <div className="w-screen h-screen overflow-hidden bg-[#fffef0] text-[#41403e]">
        <AuthoringStudio
          simulationState={studioSim}
          simulations={simulations}
          currentUser={currentUser}
          voiceCollection={voiceCollection}
          onUserUpdated={(updated) => setCurrentUser(updated)}
          onSelectSimulation={(nextSimId) =>
            setActiveView({ type: 'STUDIO', simulationId: nextSimId })
          }
          onUpdateState={(updatedSim) =>
            updateSimulationById(studioSim.id, updatedSim)
          }
          onCreateSimulation={handleCreateSimulation}
          onLaunchSimulation={() => {
            if (isGlobalAdmin) {
              setActiveView({
                type: 'GAME_ADMIN',
                simulationId: studioSim.id,
              });
            } else {
              setActiveView({ type: 'PROFILE' });
            }
          }}
          onExitStudio={() =>
            setActiveView(
              isGlobalAdmin ? { type: 'ADMIN_OVERVIEW' } : { type: 'PROFILE' }
            )
          }
          exitLabel={isGlobalAdmin ? 'All Simulations' : 'Back to Profile'}
        />
      </div>
    );
  }

  // 8. User Profile & Simulation Management Hub
  return (
    <UserProfileDashboard
      user={currentUser}
      simulations={simulations}
      onUserUpdated={(updated) => setCurrentUser(updated)}
      onUpdateSimulation={(updatedSim) =>
        updateSimulationById(updatedSim.id, updatedSim)
      }
      onEnterSimulation={(simulationId, characterId) =>
        setActiveView({
          type: 'PLAYER_ROOM',
          simulationId,
          playerId: characterId,
        })
      }
      onOpenAdminDashboard={
        canAccessGlobalAdminOverview(currentUser)
          ? () => setActiveView({ type: 'ADMIN_OVERVIEW' })
          : undefined
      }
      onOpenAssignedSimAdmin={
        currentUser.accountRole === 'SIMULATION_ADMIN'
          ? (simulationId) => {
              if (canAdministerSimulation(currentUser, simulationId)) {
                setActiveView({ type: 'GAME_ADMIN', simulationId });
              }
            }
          : undefined
      }
      onOpenAuthoringStudio={
        canAccessAuthoringStudio(currentUser)
          ? () =>
              setActiveView({
                type: 'STUDIO',
                simulationId: Object.keys(simulations)[0] ?? 'sim_helios_001',
              })
          : undefined
      }
      onOpenLandingPage={() => navigatePortal('LANDING')}
      onSignOut={handleSignOut}
    />
  );
};

export default App;
