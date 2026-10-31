export type AccountRole =
  | 'PLAYER'
  | 'STUDIO_CREATOR'
  | 'SIMULATION_ADMIN'
  | 'ADMIN';

export type SimTransactionType =
  | 'INITIAL_GRANT'
  | 'ADMIN_GIFT'
  | 'SIMULATION_CREATION'
  | 'COLLECTION_UNLOCK'
  | 'CREATOR_ROYALTY';

export interface SimTransaction {
  id: string;
  timestamp: string;
  amount: number; // Positive for credit/royalty/gift, negative for spend
  balanceAfter: number;
  type: SimTransactionType;
  description: string;
  relatedSimulationId?: string;
  counterpartyUsername?: string;
}

export interface SimulationParticipation {
  simulationId: string;
  simulationTitle: string;
  scenarioSummary: string;
  characterId: string;
  characterName: string;
  publicRole: string;
  status: 'ACTIVE' | 'COMPLETED';
  victoryPointsEarned: number;
  roundsParticipated: number;
  joinedAt: string;
  completedAt?: string;
  outcomeSummary?: string;
}

export interface UserAccount {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  displayName: string;
  callsign: string;
  bio: string;
  avatarColor: string;
  accountRole: AccountRole;
  managedSimulationIds?: string[]; // Specific simulation(s) a SIMULATION_ADMIN can run
  simsBalance: number;
  simTransactions: SimTransaction[];
  createdAt: string;
  participations: SimulationParticipation[];
}

export interface AuthSession {
  userId: string;
  loggedInAt: number;
}

export interface ProfileUpdatePayload {
  displayName: string;
  callsign: string;
  bio: string;
  avatarColor: string;
}

export interface RegisterPayload {
  displayName: string;
  username: string;
  email: string;
  password: string;
  callsign?: string;
  preferredCharacterId?: string;
}
