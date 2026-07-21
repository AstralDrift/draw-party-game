import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { GameSocket } from '../net';
import { HostTokenCache } from '../host-token-cache';
import {
  type ClientMessage,
  type ReactionEmoji,
  type RoomSettings,
  type RoomSnapshot,
  type ServerMessage
} from '../protocol';
import { playCue, setSoundEnabled, soundEnabled } from '../sound';
import { formatDeadline, nowMs, syncServerClock } from '../time';

export type ClientRole = 'display' | 'player';

export interface PendingJoin {
  roomCode: string;
  name: string;
}

export interface ReactionBurst {
  id: number;
  name: string;
  emoji: ReactionEmoji;
}

interface GameContextValue {
  role: ClientRole;
  clientId: string;
  initialRoomCode: string;
  snapshot: RoomSnapshot | null;
  prompt: string;
  status: string;
  errorMessage: string;
  playerName: string;
  roomCodeDraft: string;
  pendingJoin: PendingJoin | null;
  selectedVote: { turnToken: number; optionId: string } | null;
  deadlineLabel: string;
  deadlineUrgent: boolean;
  soundOn: boolean;
  reactionBursts: ReactionBurst[];
  setPlayerName: (name: string) => void;
  setRoomCodeDraft: (code: string) => void;
  setErrorMessage: (message: string) => void;
  clearError: () => void;
  setSelectedVote: (vote: { turnToken: number; optionId: string } | null) => void;
  joinRoom: (roomCode: string, name: string) => void;
  setName: (name: string) => void;
  cancelJoin: () => void;
  send: (message: ClientMessage) => boolean;
  updateSettings: (settings: RoomSettings) => void;
  toggleSound: () => void;
  haptic: (pattern?: number | number[]) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

function readStoredValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Party play still works when a browser blocks persistent storage.
  }
}

const ACTIVE_PLAYER_ROOM_KEY = 'draw-party-active-player-room';
const TAB_RECOVERY_NAME_PREFIX = 'draw-party-tab:';
const RETRYABLE_VOTE_ERROR_CODES = new Set([
  'invalid_vote',
  'own_guess',
  'stale_turn',
  'deadline_expired',
  'invalid_phase',
  'artist_action',
  'spectator',
  'not_round_player',
  'not_connected',
  'not_joined',
  'not_in_room'
]);

function tabRecoveryId(): string {
  if (window.name.startsWith(TAB_RECOVERY_NAME_PREFIX)) {
    return window.name.slice(TAB_RECOVERY_NAME_PREFIX.length);
  }
  const id = crypto.randomUUID();
  window.name = `${TAB_RECOVERY_NAME_PREFIX}${id}`;
  return id;
}

function readActivePlayerRoom(tabId: string): string | null {
  try {
    const stored = sessionStorage.getItem(ACTIVE_PLAYER_ROOM_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { roomCode?: unknown; tabId?: unknown };
    return parsed.tabId === tabId && typeof parsed.roomCode === 'string'
      ? parsed.roomCode.trim().toUpperCase()
      : null;
  } catch {
    return null;
  }
}

function writeActivePlayerRoom(roomCode: string, tabId: string): void {
  try {
    sessionStorage.setItem(ACTIVE_PLAYER_ROOM_KEY, JSON.stringify({ roomCode, tabId }));
  } catch {
    // Refresh recovery is optional when session storage is unavailable.
  }
}

function clearActivePlayerRoom(): void {
  try {
    sessionStorage.removeItem(ACTIVE_PLAYER_ROOM_KEY);
  } catch {
    // There is no persistent recovery marker to clear.
  }
}

function getStoredValue(key: string, fallback: () => string): string {
  const stored = readStoredValue(key);
  if (stored) {
    return stored;
  }
  const value = fallback();
  writeStoredValue(key, value);
  return value;
}

function detectRole(): { role: ClientRole; initialRoomCode: string } {
  const joinMatch = window.location.pathname.match(/^\/join(?:\/([A-Z0-9]{4}))?\/?$/i);
  return {
    role: joinMatch ? 'player' : 'display',
    initialRoomCode: joinMatch?.[1]?.toUpperCase() ?? ''
  };
}

export function GameProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const boot = useMemo(() => detectRole(), []);
  const clientId = useMemo(() => getStoredValue('draw-party-client-id', () => crypto.randomUUID()), []);
  const sessionToken = useMemo(
    () => getStoredValue('draw-party-session-token', () => crypto.randomUUID()),
    []
  );
  const currentTabId = useMemo(() => tabRecoveryId(), []);
  const storedPlayerName = useMemo(() => readStoredValue('draw-party-name') ?? '', []);
  const activePlayerRoom = useMemo(() => readActivePlayerRoom(currentTabId), [currentTabId]);
  const initialPendingJoin = useMemo<PendingJoin | null>(() => {
    if (
      boot.role !== 'player' ||
      !boot.initialRoomCode ||
      activePlayerRoom !== boot.initialRoomCode ||
      !storedPlayerName
    ) {
      return null;
    }
    return { roomCode: boot.initialRoomCode, name: storedPlayerName };
  }, [activePlayerRoom, boot.initialRoomCode, boot.role, storedPlayerName]);
  const socketRef = useRef<GameSocket | null>(null);
  const reconnectTimerRef = useRef(0);
  const lastPhaseRef = useRef('');
  const lastTickSecondRef = useRef(-1);
  const pendingJoinRef = useRef<PendingJoin | null>(initialPendingJoin);
  const snapshotRef = useRef<RoomSnapshot | null>(null);
  const reconnectSuppressedRef = useRef(false);
  const connectRef = useRef<(roomCode?: string) => void>(() => undefined);
  const hostTokens = useMemo(() => new HostTokenCache(), []);
  const burstIdRef = useRef(0);

  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState(boot.role === 'player' ? 'Ready to join' : 'Disconnected');
  const [errorMessage, setErrorMessage] = useState('');
  const [playerName, setPlayerName] = useState(storedPlayerName);
  const [roomCodeDraft, setRoomCodeDraft] = useState(boot.initialRoomCode);
  const [pendingJoin, setPendingJoin] = useState<PendingJoin | null>(initialPendingJoin);
  const [selectedVote, setSelectedVote] = useState<{ turnToken: number; optionId: string } | null>(null);
  const [deadlineLabel, setDeadlineLabel] = useState('');
  const [deadlineUrgent, setDeadlineUrgent] = useState(false);
  const [soundOn, setSoundOn] = useState(() => soundEnabled());
  const [reactionBursts, setReactionBursts] = useState<ReactionBurst[]>([]);

  useEffect(() => {
    pendingJoinRef.current = pendingJoin;
  }, [pendingJoin]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const haptic = useCallback((pattern: number | number[] = 10) => {
    try {
      if (!('vibrate' in navigator)) {
        return;
      }
      navigator.vibrate(pattern);
    } catch {
      // optional
    }
  }, []);

  const send = useCallback((message: ClientMessage) => {
    return socketRef.current?.send(message) ?? false;
  }, []);

  const applySnapshot = useCallback(
    (next: RoomSnapshot) => {
      syncServerClock(next);
      const phaseChanged = Boolean(lastPhaseRef.current && lastPhaseRef.current !== next.phase);
      if (phaseChanged) {
        playCue(next.phase === 'results' ? 'results' : next.phase === 'finalScores' ? 'podium' : 'phase');
      }
      lastPhaseRef.current = next.phase;
      setSnapshot(next);
      setSelectedVote((current) => {
        if (next.phase !== 'voting' || current?.turnToken !== next.turnToken) {
          return null;
        }
        return current;
      });

      if (boot.role === 'player') {
        const self = next.players.find((player) => player.id === clientId);
        if (self) {
          writeActivePlayerRoom(next.roomCode, currentTabId);
          writeStoredValue('draw-party-name', self.name);
          setPlayerName(self.name);
          setRoomCodeDraft(next.roomCode);
          const confirmedJoin = { roomCode: next.roomCode, name: self.name };
          pendingJoinRef.current = confirmedJoin;
          setPendingJoin(confirmedJoin);
          const canonicalPath = `/join/${next.roomCode}`;
          if (window.location.pathname !== canonicalPath) {
            window.history.replaceState(null, '', canonicalPath);
          }
        }
      }
    },
    [boot.role, clientId, currentTabId]
  );

  const handleServerMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case 'roomCreated':
          setErrorMessage('');
          hostTokens.set(message.snapshot.roomCode, message.hostToken);
          applySnapshot(message.snapshot);
          break;
        case 'roomSnapshot':
        case 'phaseChanged':
          setErrorMessage('');
          applySnapshot(message.snapshot);
          break;
        case 'promptAssigned':
          setPrompt(message.prompt);
          break;
        case 'playerListChanged':
          setSnapshot((current) => {
            if (!current) {
              return current;
            }
            if (message.players.length > current.players.length) {
              playCue('join');
            }
            return { ...current, players: message.players };
          });
          break;
        case 'drawingReveal':
          setSnapshot((current) =>
            current
              ? {
                  ...current,
                  currentArtistId: message.artistId,
                  currentArtistName: message.artistName,
                  currentDrawing: message.drawing
                }
              : current
          );
          break;
        case 'votingOptions':
          setSnapshot((current) => (current ? { ...current, votingOptions: message.options } : current));
          break;
        case 'roundResult':
          setSnapshot((current) => (current ? { ...current, roundResult: message.result } : current));
          break;
        case 'finalScores':
          setSnapshot((current) => (current ? { ...current, finalScores: message.scores } : current));
          playCue('podium');
          break;
        case 'reactionBurst': {
          const id = ++burstIdRef.current;
          setReactionBursts((current) => [...current, { id, name: message.name, emoji: message.emoji }]);
          window.setTimeout(() => {
            setReactionBursts((current) => current.filter((burst) => burst.id !== id));
          }, 1600);
          break;
        }
        case 'pong':
          break;
        case 'error':
          if (RETRYABLE_VOTE_ERROR_CODES.has(message.code)) {
            setSelectedVote(null);
          }
          if (message.code === 'session_in_use' || message.code === 'invalid_player_session') {
            reconnectSuppressedRef.current = true;
            setErrorMessage(
              message.code === 'session_in_use'
                ? 'This game controller is already active in another tab.'
                : 'This player identity belongs to another device.'
            );
            socketRef.current?.close();
            break;
          }
          if (
            boot.role === 'display' &&
            (message.code === 'room_not_found' || message.code === 'unauthorized_display')
          ) {
            const deadCode = snapshotRef.current?.roomCode ?? hostTokens.activeRoomCode();
            if (deadCode) {
              hostTokens.delete(deadCode);
            }
            setSnapshot(null);
            snapshotRef.current = null;
            setErrorMessage("Couldn't reattach to that room. Creating a fresh lobby…");
            socketRef.current?.close();
            connectRef.current();
            break;
          }
          setErrorMessage(message.message);
          if (['room_not_found', 'room_full'].includes(message.code)) {
            clearActivePlayerRoom();
            setPendingJoin(null);
            pendingJoinRef.current = null;
            setStatus('Ready to join');
            if (boot.role === 'player' && window.location.pathname !== '/join') {
              window.history.replaceState(null, '', '/join');
            }
            socketRef.current?.close();
          }
          break;
        default: {
          const _exhaustive: never = message;
          void _exhaustive;
          break;
        }
      }
    },
    [applySnapshot, boot.role, hostTokens]
  );

  const connect = useCallback(
    (roomCode?: string) => {
      socketRef.current?.close();
      let socket: GameSocket;
      socket = new GameSocket({
        role: boot.role,
        clientId,
        sessionToken,
        roomCode,
        hostToken:
          boot.role === 'display' && roomCode
            ? hostTokens.get(roomCode) ?? undefined
            : undefined,
        onOpen: () => {
          if (socketRef.current !== socket) {
            return;
          }
          if (reconnectTimerRef.current) {
            window.clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = 0;
          }
          if (boot.role === 'display') {
            if (roomCode || snapshotRef.current?.roomCode) {
              return;
            }
            socket.send({ type: 'createRoom' });
          } else if (pendingJoinRef.current) {
            socket.send({
              type: 'joinRoom',
              roomCode: pendingJoinRef.current.roomCode,
              name: pendingJoinRef.current.name
            });
          }
        },
        onClose: () => {
          if (socketRef.current !== socket) {
            return;
          }
          setSelectedVote(null);
          if (reconnectSuppressedRef.current) {
            return;
          }
          if (reconnectTimerRef.current) {
            return;
          }
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = 0;
            if (boot.role === 'display') {
              connect(
                snapshotRef.current?.roomCode ??
                  roomCode ??
                  hostTokens.activeRoomCode() ??
                  undefined
              );
            } else if (pendingJoinRef.current) {
              connect(pendingJoinRef.current.roomCode);
            }
          }, 1200);
        },
        onMessage: (message) => {
          if (socketRef.current === socket) {
            handleServerMessage(message);
          }
        },
        onStatus: (nextStatus) => {
          if (socketRef.current === socket) {
            setStatus(nextStatus);
          }
        }
      });
      socketRef.current = socket;
      socket.connect();
    },
    [boot.role, clientId, handleServerMessage, hostTokens, sessionToken]
  );

  connectRef.current = connect;

  useEffect(() => {
    if (boot.role === 'display') {
      connect(hostTokens.activeRoomCode() ?? undefined);
    } else if (initialPendingJoin) {
      connect(initialPendingJoin.roomCode);
    }
    return () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      socketRef.current?.close();
    };
  }, [boot.role, connect, hostTokens, initialPendingJoin]);

  useEffect(() => {
    const tick = () => {
      const current = snapshotRef.current;
      if (!current?.deadlineMs) {
        lastTickSecondRef.current = -1;
        setDeadlineLabel('');
        setDeadlineUrgent(false);
        return;
      }
      const label = formatDeadline(current);
      const remaining = Math.max(0, current.deadlineMs - nowMs());
      const remainingSeconds = Math.ceil(remaining / 1000);
      const urgent = remaining <= 10_000;
      if (remaining > 0 && remaining <= 3000 && remainingSeconds !== lastTickSecondRef.current) {
        lastTickSecondRef.current = remainingSeconds;
        playCue('tick');
      }
      setDeadlineLabel(label);
      setDeadlineUrgent(urgent);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [snapshot?.deadlineMs, snapshot?.turnToken]);

  const joinRoom = useCallback(
    (roomCode: string, name: string) => {
      const normalizedRoomCode = roomCode.trim().toUpperCase();
      const safeName = name.trim() || 'Player';
      clearActivePlayerRoom();
      writeStoredValue('draw-party-name', safeName);
      setPlayerName(safeName);
      setRoomCodeDraft(normalizedRoomCode);
      const next = { roomCode: normalizedRoomCode, name: safeName };
      reconnectSuppressedRef.current = false;
      setPendingJoin(next);
      pendingJoinRef.current = next;
      const socket = socketRef.current;
      if (socket?.isOpen()) {
        socket.send({ type: 'joinRoom', roomCode: normalizedRoomCode, name: safeName });
      } else {
        connect(normalizedRoomCode);
      }
      haptic(8);
    },
    [connect, haptic]
  );

  const setName = useCallback(
    (name: string) => {
      const safeName = name.trim() || 'Player';
      writeStoredValue('draw-party-name', safeName);
      setPlayerName(safeName);
      setPendingJoin((current) => {
        if (!current) {
          return current;
        }
        return { ...current, name: safeName };
      });
      send({ type: 'setName', name: safeName });
      haptic(8);
    },
    [haptic, send]
  );

  const cancelJoin = useCallback(() => {
    clearActivePlayerRoom();
    setPendingJoin(null);
    pendingJoinRef.current = null;
    socketRef.current?.close();
    setSnapshot(null);
    setRoomCodeDraft('');
    setStatus('Ready to join');
    if (window.location.pathname !== '/join') {
      window.history.replaceState(null, '', '/join');
    }
  }, []);

  const updateSettings = useCallback(
    (settings: RoomSettings) => {
      send({ type: 'updateRoomSettings', settings });
    },
    [send]
  );

  const toggleSound = useCallback(() => {
    setSoundOn((current) => {
      const next = !current;
      setSoundEnabled(next);
      return next;
    });
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({
      role: boot.role,
      clientId,
      initialRoomCode: boot.initialRoomCode,
      snapshot,
      prompt,
      status,
      errorMessage,
      playerName,
      roomCodeDraft,
      pendingJoin,
      selectedVote,
      deadlineLabel,
      deadlineUrgent,
      soundOn,
      reactionBursts,
      setPlayerName,
      setRoomCodeDraft,
      setErrorMessage,
      clearError: () => setErrorMessage(''),
      setSelectedVote,
      joinRoom,
      setName,
      cancelJoin,
      send,
      updateSettings,
      toggleSound,
      haptic
    }),
    [
      boot.role,
      boot.initialRoomCode,
      clientId,
      snapshot,
      prompt,
      status,
      errorMessage,
      playerName,
      roomCodeDraft,
      pendingJoin,
      selectedVote,
      deadlineLabel,
      deadlineUrgent,
      soundOn,
      reactionBursts,
      joinRoom,
      setName,
      cancelJoin,
      send,
      updateSettings,
      toggleSound,
      haptic
    ]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const value = useContext(GameContext);
  if (!value) {
    throw new Error('useGame must be used within GameProvider');
  }
  return value;
}
