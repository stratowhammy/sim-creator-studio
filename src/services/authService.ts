import { SimulationState } from '../types/simulation';
import {
  AccountRole,
  AuthSession,
  ProfileUpdatePayload,
  RegisterPayload,
  SimulationParticipation,
  UserAccount,
} from '../types/user';
import { broadcastRealtimeEvent } from './presenceService';

export const ROLE_BADGE_INFO: Record<
  AccountRole,
  {
    label: string;
    shortLabel: string;
    description: string;
    badgeClass: string;
  }
> = {
  PLAYER: {
    label: 'Player Only',
    shortLabel: 'Player',
    description:
      'Access only to Operative Profile and playing inside Simulation Rooms.',
    badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/35',
  },
  STUDIO_CREATOR: {
    label: 'Studio Creator',
    shortLabel: 'Studio',
    description:
      'Access to Simulation Authoring Studio (DAG Compiler & Validator) plus Player Rooms.',
    badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/35',
  },
  SIMULATION_ADMIN: {
    label: 'Simulation Admin (Single Game)',
    shortLabel: 'Sim Admin',
    description:
      'Runs and administers a single assigned simulation without global multi-game admin or Studio access.',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
  },
  ADMIN: {
    label: 'Global Administrator',
    shortLabel: 'Global Admin',
    description:
      'Full access to Multi-Game Admin Overview, all Simulation Admin Dashboards, Authoring Studio, and Role Management.',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/45',
  },
};

export function canAccessGlobalAdminOverview(
  user: UserAccount | null | undefined
): boolean {
  return user?.accountRole === 'ADMIN';
}

export function canAccessAuthoringStudio(
  user: UserAccount | null | undefined
): boolean {
  return (
    user?.accountRole === 'ADMIN' || user?.accountRole === 'STUDIO_CREATOR'
  );
}

export function canAdministerSimulation(
  user: UserAccount | null | undefined,
  simulationId: string
): boolean {
  if (!user || !simulationId) return false;
  if (user.accountRole === 'ADMIN') return true;
  if (user.accountRole === 'SIMULATION_ADMIN') {
    return (user.managedSimulationIds ?? []).includes(simulationId);
  }
  return false;
}

export function getPrimaryManagedSimulationId(
  user: UserAccount | null | undefined,
  simulations: Record<string, SimulationState>
): string | null {
  if (!user) return null;
  if (user.accountRole === 'ADMIN') {
    return simulations['sim_helios_001']
      ? 'sim_helios_001'
      : Object.keys(simulations)[0] ?? null;
  }
  if (user.accountRole === 'SIMULATION_ADMIN') {
    const managed = user.managedSimulationIds ?? [];
    return managed.find((id) => Boolean(simulations[id])) ?? managed[0] ?? null;
  }
  return null;
}

const USERS_STORAGE_KEY = 'SIM_CREATOR_USERS_V1';
const TAB_SESSION_STORAGE_KEY = 'SIM_CREATOR_TAB_SESSION_V1';
const PERSISTED_SESSION_STORAGE_KEY = 'SIM_CREATOR_PERSISTED_SESSION_V1';

/**
 * Deterministic salted hash suitable for synchronous & client-side verification.
 */
export function hashPassword(password: string): string {
  const salted = `sim_studio_v1::${password}::helios_salt`;
  let h1 = 0xdeadbeef ^ salted.length;
  let h2 = 0x41c6ce57 ^ salted.length;
  for (let i = 0; i < salted.length; i++) {
    const ch = salted.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (
    'sh1_' +
    (h2 >>> 0).toString(16).padStart(8, '0') +
    (h1 >>> 0).toString(16).padStart(8, '0')
  );
}

function defaultSimsGrantForRole(role: AccountRole): number {
  switch (role) {
    case 'ADMIN':
      return 1000000;
    case 'STUDIO_CREATOR':
      return 250;
    case 'SIMULATION_ADMIN':
      return 150;
    default:
      return 80;
  }
}

function createSeededGrantTx(idSlug: string, amount: number, dateStr: string) {
  return [
    {
      id: `tx_seed_${idSlug}`,
      timestamp: `${dateStr}T12:00:00.000Z`,
      amount,
      balanceAfter: amount,
      type: 'INITIAL_GRANT' as const,
      description: `Starter Sims wallet allocation (+${amount} Sims)`,
    },
  ];
}

function createInitialUsers(): UserAccount[] {
  return [
    {
      id: 'usr_vance',
      username: 'vance',
      email: 'vance@simstudio.io',
      passwordHash: hashPassword('demo123'),
      displayName: 'Alex Mercer',
      callsign: 'EXEC-COMMAND',
      bio: 'Veteran crisis simulation participant specializing in executive command, high-stakes brinkmanship, and treaty arbitration.',
      avatarColor: 'from-sky-500 to-blue-700',
      accountRole: 'PLAYER',
      simsBalance: 80,
      simTransactions: createSeededGrantTx('vance', 80, '2026-04-12'),
      createdAt: '2026-04-12',
      participations: [
        {
          simulationId: 'sim_helios_001',
          simulationTitle: 'Sabotage at Station Helios',
          scenarioSummary:
            'Investigate deliberate sabotage of primary reactor coolant line 4 aboard deep-space refinery Station Helios.',
          characterId: 'vance',
          characterName: 'Commander Vance',
          publicRole: 'Station Commander',
          status: 'ACTIVE',
          victoryPointsEarned: 0,
          roundsParticipated: 0,
          joinedAt: '2026-10-30',
        },
        {
          simulationId: 'sim_geneva_002',
          simulationTitle: 'The Geneva Quantum Accord',
          scenarioSummary:
            'Closed-door diplomatic lockdown at the Palais des Nations following an unauthorized quantum vault readout.',
          characterId: 'vance',
          characterName: 'Envoy Julian Vance',
          publicRole: 'Chief Treaty Mediator',
          status: 'ACTIVE',
          victoryPointsEarned: 400,
          roundsParticipated: 2,
          joinedAt: '2026-10-28',
        },
        {
          simulationId: 'sim_hist_kepler_09',
          simulationTitle: 'Mutiny at Outpost Kepler',
          scenarioSummary:
            'Orbital mining tribunal investigating disappeared supply convoys and falsified life-support telemetry.',
          characterId: 'corvus',
          characterName: 'Marshal Corvus',
          publicRole: 'Colonial Magistrate',
          status: 'COMPLETED',
          victoryPointsEarned: 1600,
          roundsParticipated: 6,
          joinedAt: '2026-09-14',
          completedAt: '2026-09-19',
          outcomeSummary: 'Uncovered the convoy smuggling syndicate first and secured full tribunal indictment.',
        },
        {
          simulationId: 'sim_hist_venice_04',
          simulationTitle: 'The Venetian Cipher',
          scenarioSummary:
            'Renaissance council intrigue over intercepted diplomatic dispatches in the Doge’s Palace.',
          characterId: 'lorenzo',
          characterName: 'Senator Lorenzo Contarini',
          publicRole: 'Council Inquisitor',
          status: 'COMPLETED',
          victoryPointsEarned: 1000,
          roundsParticipated: 5,
          joinedAt: '2026-08-03',
          completedAt: '2026-08-08',
          outcomeSummary: 'Decoded the ambassadorial key on Round 4 and brokered maritime alliance.',
        },
        {
          simulationId: 'sim_hist_sector7_02',
          simulationTitle: 'Blackout in Sector 7',
          scenarioSummary:
            'Municipal grid cascade inquiry among energy regulators, cyber-forensics, and union leadership.',
          characterId: 'hale',
          characterName: 'Director Marcus Hale',
          publicRole: 'Grid Oversight Chair',
          status: 'COMPLETED',
          victoryPointsEarned: 1300,
          roundsParticipated: 4,
          joinedAt: '2026-06-21',
          completedAt: '2026-06-24',
          outcomeSummary: 'Synthesized the substation transformer dossier and preserved grid autonomy.',
        },
      ],
    },
    {
      id: 'usr_thorne',
      username: 'thorne',
      email: 'thorne@simstudio.io',
      passwordHash: hashPassword('demo123'),
      displayName: 'Dr. Elena Rostova',
      callsign: 'BIO-ANALYTIC',
      bio: 'Methodical investigator focused on forensic synthesis, technical deduction, and defensive information control.',
      avatarColor: 'from-purple-500 to-indigo-700',
      accountRole: 'PLAYER',
      simsBalance: 80,
      simTransactions: createSeededGrantTx('thorne', 80, '2026-05-02'),
      createdAt: '2026-05-02',
      participations: [
        {
          simulationId: 'sim_helios_001',
          simulationTitle: 'Sabotage at Station Helios',
          scenarioSummary:
            'Investigate deliberate sabotage of primary reactor coolant line 4 aboard deep-space refinery Station Helios.',
          characterId: 'thorne',
          characterName: 'Dr. Aris Thorne',
          publicRole: 'Chief Science Officer',
          status: 'ACTIVE',
          victoryPointsEarned: 0,
          roundsParticipated: 0,
          joinedAt: '2026-10-30',
        },
        {
          simulationId: 'sim_geneva_002',
          simulationTitle: 'The Geneva Quantum Accord',
          scenarioSummary:
            'Closed-door diplomatic lockdown at the Palais des Nations following an unauthorized quantum vault readout.',
          characterId: 'thorne',
          characterName: 'Dr. Linnea Lindqvist',
          publicRole: 'Lead Quantum Cryptographer',
          status: 'ACTIVE',
          victoryPointsEarned: 600,
          roundsParticipated: 2,
          joinedAt: '2026-10-28',
        },
        {
          simulationId: 'sim_hist_kepler_09',
          simulationTitle: 'Mutiny at Outpost Kepler',
          scenarioSummary:
            'Orbital mining tribunal investigating disappeared supply convoys and falsified life-support telemetry.',
          characterId: 'voss',
          characterName: 'Dr. Selene Voss',
          publicRole: 'Chief Xenobiologist',
          status: 'COMPLETED',
          victoryPointsEarned: 2000,
          roundsParticipated: 6,
          joinedAt: '2026-09-14',
          completedAt: '2026-09-19',
          outcomeSummary: 'Solved both primary and secondary lab dossiers without surrendering guarded research.',
        },
        {
          simulationId: 'sim_hist_marrow_06',
          simulationTitle: 'Quarantine on Marrow-IV',
          scenarioSummary:
            'Deep-sea research platform containment breach with conflicting corporate and medical mandates.',
          characterId: 'solis',
          characterName: 'Dr. Nadia Solis',
          publicRole: 'Quarantine Director',
          status: 'COMPLETED',
          victoryPointsEarned: 1400,
          roundsParticipated: 5,
          joinedAt: '2026-07-11',
          completedAt: '2026-07-15',
          outcomeSummary: 'Traced vector origin and negotiated safe evacuation protocol.',
        },
      ],
    },
    {
      id: 'usr_kael',
      username: 'kael',
      email: 'kael@simstudio.io',
      passwordHash: hashPassword('demo123'),
      displayName: 'Marcus Chen',
      callsign: 'SYS-FORGE',
      bio: 'Pragmatic negotiator who thrives on asymmetric information trades, technical diagnostics, and coalition building.',
      avatarColor: 'from-emerald-500 to-teal-700',
      accountRole: 'PLAYER',
      simsBalance: 80,
      simTransactions: createSeededGrantTx('kael', 80, '2026-05-19'),
      createdAt: '2026-05-19',
      participations: [
        {
          simulationId: 'sim_helios_001',
          simulationTitle: 'Sabotage at Station Helios',
          scenarioSummary:
            'Investigate deliberate sabotage of primary reactor coolant line 4 aboard deep-space refinery Station Helios.',
          characterId: 'kael',
          characterName: 'Chief Engineer Kael',
          publicRole: 'Chief Engineer',
          status: 'ACTIVE',
          victoryPointsEarned: 0,
          roundsParticipated: 0,
          joinedAt: '2026-10-30',
        },
        {
          simulationId: 'sim_geneva_002',
          simulationTitle: 'The Geneva Quantum Accord',
          scenarioSummary:
            'Closed-door diplomatic lockdown at the Palais des Nations following an unauthorized quantum vault readout.',
          characterId: 'kael',
          characterName: 'Architect Viktor Petrov',
          publicRole: 'Vault Infrastructure Lead',
          status: 'ACTIVE',
          victoryPointsEarned: 300,
          roundsParticipated: 2,
          joinedAt: '2026-10-28',
        },
        {
          simulationId: 'sim_hist_sector7_02',
          simulationTitle: 'Blackout in Sector 7',
          scenarioSummary:
            'Municipal grid cascade inquiry among energy regulators, cyber-forensics, and union leadership.',
          characterId: 'reyes',
          characterName: 'Foreman Tomas Reyes',
          publicRole: 'Chief Substation Engineer',
          status: 'COMPLETED',
          victoryPointsEarned: 1600,
          roundsParticipated: 4,
          joinedAt: '2026-06-21',
          completedAt: '2026-06-24',
          outcomeSummary: 'Leveraged maintenance schematics in reciprocal trades to expose firmware tampering.',
        },
      ],
    },
    {
      id: 'usr_nyx',
      username: 'nyx',
      email: 'nyx@simstudio.io',
      passwordHash: hashPassword('demo123'),
      displayName: 'Sera Kerr',
      callsign: 'SHADOW-CIPHER',
      bio: 'Counter-intelligence and covert operations enthusiast adept at reading bluffs and uncovering hidden agendas.',
      avatarColor: 'from-amber-500 to-rose-700',
      accountRole: 'PLAYER',
      simsBalance: 80,
      simTransactions: createSeededGrantTx('nyx', 80, '2026-06-01'),
      createdAt: '2026-06-01',
      participations: [
        {
          simulationId: 'sim_helios_001',
          simulationTitle: 'Sabotage at Station Helios',
          scenarioSummary:
            'Investigate deliberate sabotage of primary reactor coolant line 4 aboard deep-space refinery Station Helios.',
          characterId: 'nyx',
          characterName: 'Operative Nyx',
          publicRole: 'Security Consultant',
          status: 'ACTIVE',
          victoryPointsEarned: 0,
          roundsParticipated: 0,
          joinedAt: '2026-10-30',
        },
        {
          simulationId: 'sim_geneva_002',
          simulationTitle: 'The Geneva Quantum Accord',
          scenarioSummary:
            'Closed-door diplomatic lockdown at the Palais des Nations following an unauthorized quantum vault readout.',
          characterId: 'nyx',
          characterName: 'Attaché Celine Moreau',
          publicRole: 'Directorate Security Liaison',
          status: 'ACTIVE',
          victoryPointsEarned: 500,
          roundsParticipated: 2,
          joinedAt: '2026-10-28',
        },
        {
          simulationId: 'sim_hist_venice_04',
          simulationTitle: 'The Venetian Cipher',
          scenarioSummary:
            'Renaissance council intrigue over intercepted diplomatic dispatches in the Doge’s Palace.',
          characterId: 'sofia',
          characterName: 'Contessa Sofia Bellini',
          publicRole: 'Special Envoy',
          status: 'COMPLETED',
          victoryPointsEarned: 2200,
          roundsParticipated: 5,
          joinedAt: '2026-08-03',
          completedAt: '2026-08-08',
          outcomeSummary: 'Highest score in council; intercepted both rival dispatches undetected.',
        },
      ],
    },
    {
      id: 'usr_admin',
      username: 'admin',
      email: 'admin@simstudio.io',
      passwordHash: hashPassword('admin123'),
      displayName: 'Game Master (Admin)',
      callsign: 'SIM-DIRECTOR',
      bio: 'Simulation architect and administrator with full server telemetry, AP testing controls, and narrative compiler access.',
      avatarColor: 'from-amber-400 to-orange-600',
      accountRole: 'ADMIN',
      simsBalance: 1000000,
      simTransactions: createSeededGrantTx('admin', 1000000, '2026-01-10'),
      createdAt: '2026-01-10',
      participations: [
        {
          simulationId: 'sim_helios_001',
          simulationTitle: 'Sabotage at Station Helios',
          scenarioSummary:
            'Investigate deliberate sabotage of primary reactor coolant line 4 aboard deep-space refinery Station Helios.',
          characterId: 'vance',
          characterName: 'Commander Vance',
          publicRole: 'Station Commander',
          status: 'ACTIVE',
          victoryPointsEarned: 0,
          roundsParticipated: 0,
          joinedAt: '2026-10-30',
        },
        {
          simulationId: 'sim_hist_protocol_01',
          simulationTitle: 'Protocol Zero Playtest',
          scenarioSummary:
            'Internal verification run of cold-war satellite verification mechanics.',
          characterId: 'director',
          characterName: 'Director Kestrel',
          publicRole: 'Verification Lead',
          status: 'COMPLETED',
          victoryPointsEarned: 1500,
          roundsParticipated: 5,
          joinedAt: '2026-03-15',
          completedAt: '2026-03-16',
          outcomeSummary: 'Validated multi-goal exclusivity decay curves.',
        },
      ],
    },
    {
      id: 'usr_helios_gm',
      username: 'helios_gm',
      email: 'gm@simstudio.io',
      passwordHash: hashPassword('demo123'),
      displayName: 'Capt. Mara Solis',
      callsign: 'SIM-OPERATOR',
      bio: 'Dedicated single-simulation director authorized to administer Sabotage at Station Helios without global multi-game admin or Studio privileges.',
      avatarColor: 'from-emerald-500 to-cyan-700',
      accountRole: 'SIMULATION_ADMIN',
      managedSimulationIds: ['sim_helios_001'],
      simsBalance: 150,
      simTransactions: createSeededGrantTx('helios_gm', 150, '2026-07-04'),
      createdAt: '2026-07-04',
      participations: [
        {
          simulationId: 'sim_geneva_002',
          simulationTitle: 'The Geneva Quantum Accord',
          scenarioSummary:
            'Closed-door diplomatic lockdown at the Palais des Nations following an unauthorized quantum vault readout.',
          characterId: 'vance',
          characterName: 'Envoy Julian Vance',
          publicRole: 'Chief Treaty Mediator',
          status: 'ACTIVE',
          victoryPointsEarned: 400,
          roundsParticipated: 2,
          joinedAt: '2026-10-28',
        },
      ],
    },
    {
      id: 'usr_architect',
      username: 'architect',
      email: 'studio@simstudio.io',
      passwordHash: hashPassword('demo123'),
      displayName: 'Devon Sterling',
      callsign: 'LORE-WEAVER',
      bio: 'Narrative designer with Simulation Authoring Studio access (DAG Compiler & Graph Validator) and standard Player room participation.',
      avatarColor: 'from-purple-500 to-fuchsia-700',
      accountRole: 'STUDIO_CREATOR',
      simsBalance: 250,
      simTransactions: createSeededGrantTx('architect', 250, '2026-08-19'),
      createdAt: '2026-08-19',
      participations: [
        {
          simulationId: 'sim_meridian_003',
          simulationTitle: 'Lockdown at Relay Meridian-9',
          scenarioSummary:
            'Deep-ocean fiber and satellite relay fortress placed under emergency lockdown after a spoofed solar-storm packet wipe.',
          characterId: 'vance',
          characterName: 'Warden Reyes',
          publicRole: 'Relay Station Warden',
          status: 'ACTIVE',
          victoryPointsEarned: 300,
          roundsParticipated: 1,
          joinedAt: '2026-10-29',
        },
      ],
    },
  ];
}

export function loadAllUsers(): UserAccount[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createInitialUsers();
  }
  const seeded = createInitialUsers();
  try {
    const saved = window.localStorage.getItem(USERS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as UserAccount[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        let didMutate = false;
        const normalized = parsed.map((u) => {
          const role = u.accountRole || ('PLAYER' as AccountRole);
          const needsRole = !u.accountRole;
          const needsSims = typeof u.simsBalance !== 'number';
          const needsTx = !Array.isArray(u.simTransactions);
          const needsAdminGrant =
            (u.accountRole === 'ADMIN' || u.username === 'admin') &&
            (u.simsBalance ?? 0) < 1000000;

          if (needsRole || needsSims || needsTx || needsAdminGrant) {
            didMutate = true;
            let fallbackBalance = needsSims
              ? defaultSimsGrantForRole(role)
              : u.simsBalance;

            if (needsAdminGrant) {
              fallbackBalance = 1000000;
            }

            const simTransactions = needsTx
              ? createSeededGrantTx(
                  u.username,
                  fallbackBalance,
                  u.createdAt || '2026-10-30'
                )
              : needsAdminGrant
              ? [
                  ...(u.simTransactions || []),
                  {
                    id: `tx_admin_endowment_${Date.now()}`,
                    timestamp: new Date().toISOString(),
                    amount: 1000000 - (u.simsBalance || 0),
                    balanceAfter: 1000000,
                    type: 'INITIAL_GRANT' as const,
                    description:
                      'Global Administrator system credit endowment (+1,000,000 Sims)',
                  },
                ]
              : u.simTransactions;

            return {
              ...u,
              accountRole: role,
              simsBalance: fallbackBalance,
              simTransactions,
            };
          }
          return u;
        });

        // Auto-merge any newly added seeded accounts (e.g. helios_gm, architect) into existing storage
        for (const seedUser of seeded) {
          const exists = normalized.some(
            (u) =>
              u.id === seedUser.id ||
              u.username.toLowerCase() === seedUser.username.toLowerCase()
          );
          if (!exists) {
            normalized.push(seedUser);
            didMutate = true;
          }
        }

        if (didMutate) {
          window.localStorage.setItem(
            USERS_STORAGE_KEY,
            JSON.stringify(normalized)
          );
        }
        return normalized;
      }
    }
  } catch {
    // Fall back to seeded accounts
  }
  saveAllUsers(seeded);
  return seeded;
}

export function updateUserRoleAndPermissions(
  actorUser: UserAccount,
  targetUserId: string,
  newRole: AccountRole,
  managedSimulationIds?: string[]
):
  | { ok: true; user: UserAccount; allUsers: UserAccount[] }
  | { ok: false; error: string } {
  if (!canAccessGlobalAdminOverview(actorUser)) {
    return {
      ok: false,
      error: 'Only Global Administrators can modify user roles and permissions.',
    };
  }

  const users = loadAllUsers();
  const idx = users.findIndex((u) => u.id === targetUserId);
  if (idx === -1) {
    return { ok: false, error: 'Target user account not found.' };
  }

  // Prevent accidentally removing the last Global Admin
  if (users[idx].accountRole === 'ADMIN' && newRole !== 'ADMIN') {
    const remainingAdmins = users.filter(
      (u) => u.id !== targetUserId && u.accountRole === 'ADMIN'
    );
    if (remainingAdmins.length === 0) {
      return {
        ok: false,
        error: 'Cannot demote the last remaining Global Administrator.',
      };
    }
  }

  let normalizedManagedIds: string[] | undefined = undefined;
  if (newRole === 'SIMULATION_ADMIN') {
    const picked = (managedSimulationIds ?? []).filter(Boolean);
    if (picked.length === 0) {
      return {
        ok: false,
        error: 'Select a simulation for this Simulation Admin to manage.',
      };
    }
    // Single-simulation admin scopes to one specific simulation
    normalizedManagedIds = [picked[0]];
  }

  const updatedUser: UserAccount = {
    ...users[idx],
    accountRole: newRole,
    managedSimulationIds: normalizedManagedIds,
  };

  const nextUsers = [...users];
  nextUsers[idx] = updatedUser;
  saveAllUsers(nextUsers);
  return { ok: true, user: updatedUser, allUsers: nextUsers };
}

export function saveAllUsers(users: UserAccount[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    broadcastRealtimeEvent({ type: 'USERS_UPDATED' });
  } catch {
    // Ignore storage quota errors
  }
}

export function getActiveAuthSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const tabRaw = window.sessionStorage?.getItem(TAB_SESSION_STORAGE_KEY);
    if (tabRaw) {
      if (tabRaw === 'SIGNED_OUT') return null;
      return JSON.parse(tabRaw) as AuthSession;
    }
    const persistedRaw = window.localStorage?.getItem(PERSISTED_SESSION_STORAGE_KEY);
    if (persistedRaw) {
      const parsed = JSON.parse(persistedRaw) as AuthSession;
      window.sessionStorage?.setItem(TAB_SESSION_STORAGE_KEY, JSON.stringify(parsed));
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function setActiveAuthSession(
  session: AuthSession | null,
  rememberMe: boolean = true
): void {
  if (typeof window === 'undefined') return;
  try {
    if (session) {
      window.sessionStorage?.setItem(TAB_SESSION_STORAGE_KEY, JSON.stringify(session));
      if (rememberMe) {
        window.localStorage?.setItem(
          PERSISTED_SESSION_STORAGE_KEY,
          JSON.stringify(session)
        );
      }
    } else {
      // Mark this tab explicitly signed out so other tabs keep their own active sessions
      window.sessionStorage?.setItem(TAB_SESSION_STORAGE_KEY, 'SIGNED_OUT');
      window.localStorage?.removeItem(PERSISTED_SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function authenticateUser(
  identifier: string,
  password: string,
  rememberMe: boolean = true
): { ok: true; user: UserAccount } | { ok: false; error: string } {
  const trimmed = identifier.trim().toLowerCase();
  if (!trimmed || !password) {
    return { ok: false, error: 'Please enter both username/email and password.' };
  }

  const users = loadAllUsers();
  const matched = users.find(
    (u) => u.username.toLowerCase() === trimmed || u.email.toLowerCase() === trimmed
  );

  if (!matched) {
    return { ok: false, error: 'No account found matching that username or email.' };
  }

  if (matched.passwordHash !== hashPassword(password)) {
    return { ok: false, error: 'Incorrect password. Please try again.' };
  }

  setActiveAuthSession({ userId: matched.id, loggedInAt: Date.now() }, rememberMe);
  return { ok: true, user: matched };
}

export function registerNewUser(
  payload: RegisterPayload,
  simulations: Record<string, SimulationState>
): { ok: true; user: UserAccount } | { ok: false; error: string } {
  const displayName = payload.displayName.trim();
  const username = payload.username.trim().toLowerCase();
  const email = payload.email.trim().toLowerCase();

  if (!displayName || !username || !email || !payload.password) {
    return { ok: false, error: 'All required fields must be filled out.' };
  }
  if (!/^[a-z0-9_.-]{3,24}$/.test(username)) {
    return {
      ok: false,
      error: 'Username must be 3–24 characters (letters, numbers, _, ., -).',
    };
  }
  if (!email.includes('@') || !email.includes('.')) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (payload.password.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters long.' };
  }

  const users = loadAllUsers();
  if (users.some((u) => u.username.toLowerCase() === username)) {
    return { ok: false, error: 'That username is already taken.' };
  }
  if (users.some((u) => u.email.toLowerCase() === email)) {
    return { ok: false, error: 'An account with that email already exists.' };
  }

  const helios = simulations['sim_helios_001'];
  const preferredRole = payload.preferredCharacterId || 'vance';
  const char =
    helios?.characters[preferredRole] ??
    (helios ? Object.values(helios.characters)[0] : undefined);

  const initialParticipations: SimulationParticipation[] = [];
  if (helios && char) {
    initialParticipations.push({
      simulationId: helios.id,
      simulationTitle: helios.title,
      scenarioSummary: helios.masterNarrative,
      characterId: char.playerId,
      characterName: char.characterName,
      publicRole: char.publicRole,
      status: helios.status === 'COMPLETED' ? 'COMPLETED' : 'ACTIVE',
      victoryPointsEarned: char.victoryPoints,
      roundsParticipated: helios.currentTurnOrTick,
      joinedAt: new Date().toISOString().slice(0, 10),
    });
  }

  const avatarPalette = [
    'from-sky-500 to-blue-700',
    'from-purple-500 to-indigo-700',
    'from-emerald-500 to-teal-700',
    'from-amber-500 to-rose-700',
    'from-cyan-500 to-sky-700',
  ];
  const newUser: UserAccount = {
    id: `usr_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    username,
    email,
    passwordHash: hashPassword(payload.password),
    displayName,
    callsign: (payload.callsign?.trim() || username.toUpperCase()).slice(0, 18),
    bio: 'Operative enrolled in live Sim Creator Studio narrative simulations.',
    avatarColor: avatarPalette[users.length % avatarPalette.length],
    accountRole: 'PLAYER',
    simsBalance: 100,
    simTransactions: createSeededGrantTx(
      username,
      100,
      new Date().toISOString().slice(0, 10)
    ),
    createdAt: new Date().toISOString().slice(0, 10),
    participations: initialParticipations,
  };

  const nextUsers = [...users, newUser];
  saveAllUsers(nextUsers);
  setActiveAuthSession({ userId: newUser.id, loggedInAt: Date.now() }, true);
  return { ok: true, user: newUser };
}

export function updateUserProfile(
  userId: string,
  updates: ProfileUpdatePayload
): { ok: true; user: UserAccount } | { ok: false; error: string } {
  if (!updates.displayName.trim()) {
    return { ok: false, error: 'Display name cannot be empty.' };
  }
  const users = loadAllUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) {
    return { ok: false, error: 'User account not found.' };
  }

  const updated: UserAccount = {
    ...users[idx],
    displayName: updates.displayName.trim(),
    callsign: updates.callsign.trim() || users[idx].callsign,
    bio: updates.bio.trim(),
    avatarColor: updates.avatarColor || users[idx].avatarColor,
  };

  const nextUsers = [...users];
  nextUsers[idx] = updated;
  saveAllUsers(nextUsers);
  return { ok: true, user: updated };
}

export function updateUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): { ok: true } | { ok: false; error: string } {
  if (newPassword.length < 6) {
    return { ok: false, error: 'New password must be at least 6 characters.' };
  }
  const users = loadAllUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) {
    return { ok: false, error: 'User account not found.' };
  }
  if (users[idx].passwordHash !== hashPassword(currentPassword)) {
    return { ok: false, error: 'Current password is incorrect.' };
  }
  const nextUsers = [...users];
  nextUsers[idx] = {
    ...users[idx],
    passwordHash: hashPassword(newPassword),
  };
  saveAllUsers(nextUsers);
  return { ok: true };
}

export function enrollUserInSimulation(
  userId: string,
  sim: SimulationState,
  characterId: string
): UserAccount | null {
  const char = sim.characters[characterId];
  if (!char) return null;

  const users = loadAllUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return null;

  const existingIdx = users[idx].participations.findIndex(
    (p) => p.simulationId === sim.id
  );

  const entry: SimulationParticipation = {
    simulationId: sim.id,
    simulationTitle: sim.title,
    scenarioSummary: sim.masterNarrative,
    characterId: char.playerId,
    characterName: char.characterName,
    publicRole: char.publicRole,
    status: sim.status === 'COMPLETED' ? 'COMPLETED' : 'ACTIVE',
    victoryPointsEarned: char.victoryPoints,
    roundsParticipated: sim.currentTurnOrTick,
    joinedAt:
      existingIdx >= 0
        ? users[idx].participations[existingIdx].joinedAt
        : new Date().toISOString().slice(0, 10),
    completedAt:
      sim.status === 'COMPLETED'
        ? new Date().toISOString().slice(0, 10)
        : undefined,
  };

  const nextParticipations = [...users[idx].participations];
  if (existingIdx >= 0) {
    nextParticipations[existingIdx] = entry;
  } else {
    nextParticipations.unshift(entry);
  }

  const updatedUser: UserAccount = {
    ...users[idx],
    participations: nextParticipations,
  };
  const nextUsers = [...users];
  nextUsers[idx] = updatedUser;
  saveAllUsers(nextUsers);
  return updatedUser;
}

/**
 * Overlay live simulation VP, role, turn count, and ACTIVE/COMPLETED status onto a user's participations.
 */
export function resolveLiveParticipations(
  user: UserAccount,
  simulations: Record<string, SimulationState>
): SimulationParticipation[] {
  return user.participations.map((p) => {
    const liveSim = simulations[p.simulationId];
    if (!liveSim) return p;

    const liveChar = liveSim.characters[p.characterId];
    const isCompleted = liveSim.status === 'COMPLETED';

    return {
      ...p,
      simulationTitle: liveSim.title,
      scenarioSummary: liveSim.masterNarrative || p.scenarioSummary,
      characterName: liveChar?.characterName ?? p.characterName,
      publicRole: liveChar?.publicRole ?? p.publicRole,
      status: isCompleted ? 'COMPLETED' : 'ACTIVE',
      victoryPointsEarned: liveChar ? liveChar.victoryPoints : p.victoryPointsEarned,
      roundsParticipated: liveSim.currentTurnOrTick,
      completedAt:
        isCompleted && !p.completedAt
          ? new Date().toISOString().slice(0, 10)
          : p.completedAt,
    };
  });
}
