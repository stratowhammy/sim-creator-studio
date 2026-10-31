import {
  loadAllUsers,
  saveAllUsers,
  enrollUserInSimulation,
} from '../authService';
import {
  searchUsersByUsername,
  sendSeatInvitation,
  acceptSeatInvitation,
  declineSeatInvitation,
  cancelSeatInvitation,
  getPendingInvitationsForUser,
  getPendingInvitationForSeat,
  loadAllSeatInvitations,
  saveAllSeatInvitations,
} from '../seatInviteService';
import { SimulationState } from '../../types/simulation';
import { UserAccount } from '../../types/user';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

console.log('--> Running Seat Invitation & Role Transfer Test Suite...');

// Mock localStorage and window in node environment
const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, val: string) => { storage[key] = val; },
  removeItem: (key: string) => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
};

(globalThis as any).localStorage = mockLocalStorage;
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    localStorage: mockLocalStorage,
  };
} else {
  (globalThis as any).window.localStorage = mockLocalStorage;
}

// 1. Setup mock users
const initialUsers: UserAccount[] = [
  {
    id: 'user_creator',
    username: 'architect',
    email: 'creator@simstudio.internal',
    passwordHash: 'hash',
    displayName: 'Lead Architect',
    callsign: 'ARCHON',
    bio: 'Creator of high-stakes worlds',
    avatarColor: 'from-purple-500 to-indigo-700',
    accountRole: 'STUDIO_CREATOR',
    simsBalance: 500,
    simTransactions: [],
    createdAt: '2026-01-01',
    participations: [],
  },
  {
    id: 'user_player1',
    username: 'thorne',
    email: 'thorne@helios.net',
    passwordHash: 'hash',
    displayName: 'Dr. Aris Thorne',
    callsign: 'BIO-1',
    bio: 'Xenobiologist',
    avatarColor: 'from-sky-500 to-blue-700',
    accountRole: 'PLAYER',
    simsBalance: 100,
    simTransactions: [],
    createdAt: '2026-01-01',
    participations: [],
  },
  {
    id: 'user_player2',
    username: 'kael',
    email: 'kael@helios.net',
    passwordHash: 'hash',
    displayName: 'Chief Kael',
    callsign: 'SPARK',
    bio: 'Lead Engineer',
    avatarColor: 'from-emerald-500 to-teal-700',
    accountRole: 'PLAYER',
    simsBalance: 100,
    simTransactions: [],
    createdAt: '2026-01-01',
    participations: [],
  },
];
saveAllUsers(initialUsers);
saveAllSeatInvitations([]);

// 2. Setup mock simulation
const mockSim: SimulationState = {
  id: 'sim_test_001',
  title: 'Protocol Omega',
  masterNarrative: 'A high stakes lockdown simulation',
  mode: 'TURN_BASED',
  status: 'ACTIVE',
  goals: {},
  currentTurnOrTick: 1,
  characters: {
    thorne_char: {
      playerId: 'thorne_char',
      simulationId: 'sim_test_001',
      characterName: 'Dr. Aris Thorne',
      publicRole: 'Chief Science Officer',
      privateNarrativeBio: 'Specialist in pathogen research',
      coreTraits: ['Analytical', 'Guarded'],
      coreMotives: ['Contain pathogen'],
      hiddenStats: { inquiry: 0.8, coercion: 0.5, negotiation: 0.7, deception: 0.4, composure: 0.6, insight: 0.7 },
      defensivePolicy: { protectedCardIds: [], tradeableCardIds: [], stanceByPlayerId: {} },
      isAiControlled: true,
      actionPoints: 3,
      victoryPoints: 0,
      assignedUserId: undefined,
      assignedUsername: undefined,
    },
    kael_char: {
      playerId: 'kael_char',
      simulationId: 'sim_test_001',
      characterName: 'Chief Engineer Kael',
      publicRole: 'Chief Engineer',
      privateNarrativeBio: 'Reactor maintenance',
      coreTraits: ['Pragmatic', 'Resourceful'],
      coreMotives: ['Fix reactor'],
      hiddenStats: { inquiry: 0.7, coercion: 0.6, negotiation: 0.6, deception: 0.5, composure: 0.7, insight: 0.6 },
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

// TEST 1: User search by username / query
console.log('Test 1: Search users by username');
const searchResults = searchUsersByUsername('thorne', ['user_creator']);
assert(searchResults.length === 1, 'Should find thorne');
assert(searchResults[0].username === 'thorne', 'Username should match thorne');

const caseInsensitiveSearch = searchUsersByUsername('THORNE');
assert(caseInsensitiveSearch.length === 1, 'Case-insensitive search should work');

const callsignSearch = searchUsersByUsername('SPARK');
assert(callsignSearch.length === 1 && callsignSearch[0].username === 'kael', 'Callsign search should find kael');

// TEST 2: Creator sends invitation to thorne
console.log('Test 2: Creator sends seat invitation to thorne');
const inviteResult = sendSeatInvitation({
  simulation: mockSim,
  characterId: 'thorne_char',
  fromUser: initialUsers[0],
  targetUser: initialUsers[1],
  inviteType: 'CREATOR_INVITE',
});

assert(inviteResult.ok === true, 'Invitation sending should succeed');
if (!inviteResult.ok) process.exit(1);

const createdInvite = inviteResult.invite;
assert(createdInvite.status === 'PENDING', 'Status must be PENDING');
assert(createdInvite.toUsername === 'thorne', 'Recipient must be thorne');
assert(createdInvite.characterId === 'thorne_char', 'Character ID must match');

// Verify simulation state has invitation
let currentSim = inviteResult.updatedSimulation;
simulationsMap[currentSim.id] = currentSim;

// Pending invitation query check
const thornePending = getPendingInvitationsForUser('user_player1');
assert(thornePending.length === 1, 'Thorne must have 1 pending invitation');
assert(getPendingInvitationForSeat(currentSim.id, 'thorne_char')?.id === createdInvite.id, 'Seat should have pending invite');

// Duplicate invite prevention
const dupInvite = sendSeatInvitation({
  simulation: currentSim,
  characterId: 'thorne_char',
  fromUser: initialUsers[0],
  targetUser: initialUsers[1],
});
assert(!dupInvite.ok, 'Should reject duplicate pending invitation for same seat & user');

// TEST 3: Thorne accepts seat invitation -> permanently assigned
console.log('Test 3: Thorne accepts seat invitation');
const acceptRes = acceptSeatInvitation({
  inviteId: createdInvite.id,
  acceptingUser: initialUsers[1],
  simulations: simulationsMap,
});

assert(acceptRes.ok === true, 'Accepting invitation must succeed');
if (!acceptRes.ok) process.exit(1);

currentSim = acceptRes.updatedSimulation;
simulationsMap[currentSim.id] = currentSim;

// Verify character seat is permanently assigned
const assignedChar = currentSim.characters['thorne_char'];
assert(assignedChar.assignedUserId === 'user_player1', 'assignedUserId must match thorne');
assert(assignedChar.assignedUsername === 'thorne', 'assignedUsername must match thorne');
assert(assignedChar.isAiControlled === false, 'isAiControlled must be false');

// Verify thorne has active participation
const thorneUser = acceptRes.updatedUser;
assert(
  thorneUser.participations.some(
    (p) => p.simulationId === currentSim.id && p.characterId === 'thorne_char' && p.status === 'ACTIVE'
  ),
  'Thorne must have active participation in user profile'
);

// Verify invitation is marked ACCEPTED
assert(getPendingInvitationsForUser('user_player1').length === 0, 'No more pending invitations for thorne');
assert(getPendingInvitationForSeat(currentSim.id, 'thorne_char') === null, 'Seat has no pending invitation');

// TEST 4: Role Transfer - Thorne transfers role to Kael
console.log('Test 4: Role transfer from thorne to kael');
const transferInviteRes = sendSeatInvitation({
  simulation: currentSim,
  characterId: 'thorne_char',
  fromUser: thorneUser,
  targetUser: initialUsers[2],
  inviteType: 'ROLE_TRANSFER',
});

assert(transferInviteRes.ok === true, 'Role transfer invite must succeed');
if (!transferInviteRes.ok) process.exit(1);

const transferInvite = transferInviteRes.invite;
assert(transferInvite.inviteType === 'ROLE_TRANSFER', 'Invite type must be ROLE_TRANSFER');
currentSim = transferInviteRes.updatedSimulation;
simulationsMap[currentSim.id] = currentSim;

// Kael accepts role transfer
const kaelAcceptRes = acceptSeatInvitation({
  inviteId: transferInvite.id,
  acceptingUser: initialUsers[2],
  simulations: simulationsMap,
});

assert(kaelAcceptRes.ok === true, 'Kael accepting role transfer must succeed');
if (!kaelAcceptRes.ok) process.exit(1);

currentSim = kaelAcceptRes.updatedSimulation;
simulationsMap[currentSim.id] = currentSim;

// Verify Kael is now permanently assigned to the role
const reallocatedChar = currentSim.characters['thorne_char'];
assert(reallocatedChar.assignedUserId === 'user_player2', 'assignedUserId must now be kael');
assert(reallocatedChar.assignedUsername === 'kael', 'assignedUsername must now be kael');
assert(reallocatedChar.isAiControlled === false, 'Character remains player controlled');

// Verify Kael has ACTIVE participation
const kaelUser = kaelAcceptRes.updatedUser;
assert(
  kaelUser.participations.some(
    (p) => p.simulationId === currentSim.id && p.characterId === 'thorne_char' && p.status === 'ACTIVE'
  ),
  'Kael must have ACTIVE participation'
);

// TEST 5: Decline and Cancel invitations
console.log('Test 5: Decline and cancel invitation flows');
const simForCancel = currentSim;
const inviteForDecline = sendSeatInvitation({
  simulation: simForCancel,
  characterId: 'kael_char',
  fromUser: initialUsers[0],
  targetUser: thorneUser,
});
assert(inviteForDecline.ok === true, 'Invite should be sent');
if (inviteForDecline.ok) {
  const decRes = declineSeatInvitation(inviteForDecline.invite.id, thorneUser);
  assert(decRes.ok === true, 'Decline should succeed');
  assert(getPendingInvitationsForUser(thorneUser.id).length === 0, 'Thorne pending should be 0');
}

const inviteForCancel = sendSeatInvitation({
  simulation: simForCancel,
  characterId: 'kael_char',
  fromUser: initialUsers[0],
  targetUser: thorneUser,
});
assert(inviteForCancel.ok === true, 'Second invite should be sent');
if (inviteForCancel.ok) {
  const cancelRes = cancelSeatInvitation(inviteForCancel.invite.id);
  assert(cancelRes.ok === true, 'Cancel by sender should succeed');
  assert(getPendingInvitationsForUser(thorneUser.id).length === 0, 'Thorne pending should be 0 after cancellation');
}

console.log('✅ ALL SEAT INVITATION & ROLE TRANSFER TESTS PASSED!');
process.exit(0);
