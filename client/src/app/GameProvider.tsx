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
import {
  defaultRoomSettings,
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
  cancelJoin: () => void;
  send: (message: ClientMessage) => void;
  updateSettings: (settings: RoomSettings) => void;
  toggleSound: () => void;
  haptic: (pattern?: number | number[]) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

function getStoredValue(key: string, fallback: () => string): string {
  const stored = localStorage.getItem(key);
  if (stored) {
    return stored;
  }
  const value = fallback();
  localStorage.setItem(key, value);
  return value;
}

function hostTokenKey(roomCode: string): string {
  return `draw-party-host-token-${roomCode}`;
}

function getStoredHostToken(roomCode: string): string | null {
  return localStorage.getItem(hostTokenKey(roomCode));
}

function storeHostToken(roomCode: string, hostToken: string): void {
  localStorage.setItem(hostTokenKey(roomCode), hostToken);
}

function detectRole(): { role: ClientRole; initialRoomCode: string } {
  const joinMatch = window.location.pathname.match(/^\/join\/([A-Z0-9]{4})/i);
  return {
    role: joinMatch ? 'player' : 'display',
    initialRoomCode: joinMatch?.[1]?.toUpperCase() ?? ''
  };
}

export function GameProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const boot = useMemo(() => detectRole(), []);
  const clientId = useMemo(() => getStoredValue('draw-party-client-id', () => crypto.randomUUID()), []);
  const socketRef = useRef<GameSocket | null>(null);
  const reconnectTimerRef = useRef(0);
  const lastPhaseRef = useRef('');
  const lastTickSecondRef = useRef(-1);
  const pendingJoinRef = useRef<PendingJoin | null>(null);
  const snapshotRef = useRef<RoomSnapshot | null>(null);
  const burstIdRef = useRef(0);

  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState(boot.role === 'player' ? 'Ready to join' : 'Disconnected');
  const [errorMessage, setErrorMessage] = useState('');
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('draw-party-name') ?? '');
  const [roomCodeDraft, setRoomCodeDraft] = useState(boot.initialRoomCode);
  const [pendingJoin, setPendingJoin] = useState<PendingJoin | null>(null);
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
    socketRef.current?.send(message);
  }, []);

  const applySnapshot = useCallback((next: RoomSnapshot) => {
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
  }, []);

  const handleServerMessage = useCallback(
    (message: ServerMessage) => {
      setErrorMessage('');
      switch (message.type) {
        case 'roomCreated':
          storeHostToken(message.snapshot.roomCode, message.hostToken);
          applySnapshot(message.snapshot);
          break;
        case 'roomSnapshot':
        case 'phaseChanged':
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
          setErrorMessage(message.message);
          if (['room_not_found', 'game_in_progress', 'room_full'].includes(message.code)) {
            setPendingJoin(null);
            setStatus('Ready to join');
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
    [applySnapshot]
  );

  const connect = useCallback(
    (roomCode?: string) => {
      socketRef.current?.close();
      const socket = new GameSocket({
        role: boot.role,
        clientId,
        roomCode,
        hostToken:
          boot.role === 'display' && roomCode ? getStoredHostToken(roomCode) ?? undefined : undefined,
        onOpen: () => {
          if (reconnectTimerRef.current) {
            window.clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = 0;
          }
          if (boot.role === 'display') {
            if (snapshotRef.current?.roomCode) {
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
          if (reconnectTimerRef.current) {
            return;
          }
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = 0;
            if (boot.role === 'display') {
              connect(snapshotRef.current?.roomCode);
            } else if (pendingJoinRef.current) {
              connect(pendingJoinRef.current.roomCode);
            }
          }, 1200);
        },
        onMessage: handleServerMessage,
        onStatus: setStatus
      });
      socketRef.current = socket;
      socket.connect();
    },
    [boot.role, clientId, handleServerMessage]
  );

  useEffect(() => {
    if (boot.role === 'display') {
      connect();
    }
    return () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      socketRef.current?.close();
    };
  }, [boot.role, connect]);

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
      localStorage.setItem('draw-party-name', name);
      setPlayerName(name);
      setRoomCodeDraft(roomCode);
      const next = { roomCode, name };
      setPendingJoin(next);
      pendingJoinRef.current = next;
      connect(roomCode);
      haptic(8);
    },
    [connect, haptic]
  );

  const cancelJoin = useCallback(() => {
    setPendingJoin(null);
    pendingJoinRef.current = null;
    socketRef.current?.close();
    setSnapshot(null);
    setStatus('Ready to join');
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

export function useDefaultSettings(): RoomSettings {
  return defaultRoomSettings();
}
