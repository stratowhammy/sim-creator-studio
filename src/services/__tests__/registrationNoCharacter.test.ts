import { registerNewUser, loadAllUsers, saveAllUsers } from '../authService';
import { SimulationState } from '../../types/simulation';

console.log('--> Running Account Registration (No Character) Test Suite...');

// Setup mock simulation map
const mockSim: SimulationState = {
  id: 'sim_helios_001',
  title: 'Protocol Helios',
  masterNarrative: 'A high stakes lockdown simulation',
  mode: 'TURN_BASED',
  status: 'ACTIVE',
  goals: {},
  currentTurnOrTick: 1,
  characters: {
    vance: {
      playerId: 'vance',
      simulationId: 'sim_helios_001',
      characterName: 'Commander Vance',
      publicRole: 'Station Commander',
      privateNarrativeBio: 'Station head',
      coreTraits: ['Analytical', 'Guarded'],
      coreMotives: ['Contain breach'],
      hiddenStats: { inquiry: 0.8, coercion: 0.5, negotiation: 0.7, deception: 0.4, composure: 0.6, insight: 0.7 },
      defensivePolicy: { protectedCardIds: [], tradeableCardIds: [], stanceByPlayerId: {} },
      isAiControlled: true,
      actionPoints: 3,
      victoryPoints: 0,
      assignedUserId: undefined,
      assignedUsername: undefined,
    },
  },
  cards: {},
  interactions: [],
  readabilityLevel: 'NORMAL',
  creationCostSims: 40,
  usageCostSims: 4,
  tokens: [],
  ragIndex: [],
  seatInvitations: [],
};

const simulationsMap: Record<string, SimulationState> = {
  [mockSim.id]: mockSim,
};

// Test 1: Register new user without preferredCharacterId
console.log('Test 1: User registers without selecting any character');
const testUsername = `user_${Date.now()}`;
const regResult = registerNewUser(
  {
    displayName: 'Test Operator',
    username: testUsername,
    email: `${testUsername}@nexus.local`,
    password: 'securePassword123',
    callsign: 'SPECTRE',
    // Notice: NO preferredCharacterId provided!
  },
  simulationsMap
);

if (!regResult.ok) {
  console.error('FAILED Test 1: Registration rejected:', (regResult as any).error);
  process.exit(1);
}

const newUser = regResult.user;
console.log(`Registered user: ${newUser.username} (${newUser.displayName})`);

if (newUser.participations.length !== 0) {
  console.error(
    `FAILED: Expected 0 initial participations, got ${newUser.participations.length}`,
    newUser.participations
  );
  process.exit(1);
}
console.log('✓ Success: New user created with 0 assigned characters (participations is empty)');

if (newUser.simsBalance !== 100) {
  console.error(`FAILED: Expected 100 Sims balance, got ${newUser.simsBalance}`);
  process.exit(1);
}
console.log('✓ Success: New user received 100 starting Sims grant');

console.log('✅ ALL REGISTRATION (NO CHARACTER) TESTS PASSED!');
