export interface RoomPresenceEntry {
  simulationId: string;
  playerId: string;
  tabId: string;
  lastHeartbeatAt: number;
}

const PRESENCE_STORAGE_KEY = 'SIM_CREATOR_PRESENCE_V1';
const REALTIME_CHANNEL_NAME = 'SIM_CREATOR_REALTIME_V1';
const PRESENCE_TTL_MS = 10_000;

let broadcastChannel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null;
  }
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel(REALTIME_CHANNEL_NAME);
    } catch {
      broadcastChannel = null;
    }
  }
  return broadcastChannel;
}

export type RealtimeMessage =
  | { type: 'PRESENCE_UPDATED' }
  | { type: 'SIMULATIONS_UPDATED'; simulationId?: string }
  | { type: 'USERS_UPDATED' }
  | { type: 'VOICES_UPDATED' }
  | { type: 'LLM_MODEL_UPDATED'; testV4Pro: boolean }
  | {
      type: 'NOTIFICATION_BROADCAST';
      title: string;
      body: string;
      targetUserId?: string;
    };

export function broadcastRealtimeEvent(msg: RealtimeMessage): void {
  const ch = getChannel();
  if (ch) {
    try {
      ch.postMessage(msg);
    } catch {
      // Ignore closed channel errors
    }
  }
}

export function subscribeRealtimeEvents(
  listener: (msg: RealtimeMessage) => void
): () => void {
  const ch = getChannel();
  const handleChannelMessage = (e: MessageEvent<RealtimeMessage>) => {
    if (e.data && typeof e.data.type === 'string') {
      listener(e.data);
    }
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === PRESENCE_STORAGE_KEY) {
      listener({ type: 'PRESENCE_UPDATED' });
    } else if (e.key === 'SIM_CREATOR_SIMULATIONS_V2') {
      listener({ type: 'SIMULATIONS_UPDATED' });
    } else if (e.key === 'SIM_CREATOR_USERS_V1') {
      listener({ type: 'USERS_UPDATED' });
    } else if (e.key === 'SIM_CREATOR_VOICES_V1') {
      listener({ type: 'VOICES_UPDATED' });
    }
  };

  if (ch) {
    ch.addEventListener('message', handleChannelMessage);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorage);
  }

  return () => {
    if (ch) {
      ch.removeEventListener('message', handleChannelMessage);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorage);
    }
  };
}

function readAllPresence(): RoomPresenceEntry[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(PRESENCE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RoomPresenceEntry[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((entry) => now - entry.lastHeartbeatAt < PRESENCE_TTL_MS);
  } catch {
    return [];
  }
}

function writeAllPresence(entries: RoomPresenceEntry[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const now = Date.now();
    const fresh = entries.filter((entry) => now - entry.lastHeartbeatAt < PRESENCE_TTL_MS);
    window.localStorage.setItem(PRESENCE_STORAGE_KEY, JSON.stringify(fresh));
    broadcastRealtimeEvent({ type: 'PRESENCE_UPDATED' });
  } catch {
    // Ignore storage quota errors
  }
}

export function upsertRoomPresence(
  simulationId: string,
  playerId: string,
  tabId: string
): void {
  const entries = readAllPresence().filter(
    (e) => !(e.simulationId === simulationId && e.playerId === playerId && e.tabId === tabId)
  );
  entries.push({
    simulationId,
    playerId,
    tabId,
    lastHeartbeatAt: Date.now(),
  });
  writeAllPresence(entries);
}

export function removeRoomPresence(
  simulationId: string,
  playerId: string,
  tabId: string
): void {
  const current = readAllPresence();
  const next = current.filter(
    (e) => !(e.simulationId === simulationId && e.playerId === playerId && e.tabId === tabId)
  );
  writeAllPresence(next);
}

export function isPlayerActivelyInRoom(
  simulationId: string,
  playerId: string
): boolean {
  const entries = readAllPresence();
  return entries.some(
    (e) => e.simulationId === simulationId && e.playerId === playerId
  );
}

export function getActivePlayersInSimulation(simulationId: string): string[] {
  const entries = readAllPresence();
  return Array.from(
    new Set(
      entries
        .filter((e) => e.simulationId === simulationId)
        .map((e) => e.playerId)
    )
  );
}
