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
  acknowledgeDuplicateSubmission,
  coalescePendingRenameIntent,
  createPendingRenameIntent,
  markPendingRenameSent,
  pendingRenameDesiredName,
  playerActionAlert,
  queuePendingRenameAfterDisconnect,
  reconcilePendingRenameAcknowledgement,
  reconcilePendingRenameSnapshot,
  reconcilePendingSubmission,
  retryPendingSubmission,
  scheduleSubmissionWatchdog,
  type PendingRenameIntent,
  type PendingSubmission,
  type SubmissionKind,
  type SubmissionMessage
} from '../controller';
import {
  type ClientMessage,
  type ReactionEmoji,
  type RoomSettings,
  type RoomSnapshot,
  type ServerMessage
} from '../protocol';
import { playCue, setSoundMode, setSoundScope, setSoundPhase, soundEnabled, soundMode, stopSound, unlockSound, type SoundMode } from '../sound';
import { PendingRenameCache } from '../pending-rename-cache';
import { clearTurnDraft, reconcileTurnDraft } from '../turn-draft-cache';
import {
  beginServerClockSession,
  formatDeadline,
  nowMs,
  syncServerClock,
  syncServerTime
} from '../time';

export type ClientRole = 'display' | 'player';

export interface PendingJoin {
  roomCode: string;
  name: string;
}

export interface ReactionBurst {
  id: number;
  playerId: string;
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
  pendingSubmission: PendingSubmission | null;
  deadlineLabel: string;
  deadlineUrgent: boolean;
  soundOn: boolean;
  audioMode: SoundMode;
  selectSoundMode: (mode: SoundMode) => void;
  reactionBursts: ReactionBurst[];
  setPlayerName: (name: string) => void;
  setRoomCodeDraft: (code: string) => void;
  setErrorMessage: (message: string) => void;
  clearError: () => void;
  joinRoom: (roomCode: string, name: string) => void;
  setName: (name: string) => void;
  cancelJoin: () => void;
  send: (message: ClientMessage) => boolean;
  submitAction: (
    kind: SubmissionKind,
    message: SubmissionMessage,
    optionId?: string
  ) => boolean;
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
const MAX_RETAINED_REACTION_BURSTS = 12;
const DEADLINE_CUE_PHASES = new Set<RoomSnapshot['phase']>([
  'drawing',
  'guessing',
  'voting',
  'results'
]);
const RETRYABLE_SUBMISSION_ERROR_CODES = new Set([
  'invalid_vote',
  'own_guess',
  'empty_guess',
  'invalid_drawing_size',
  'blank_drawing',
  'drawing_too_large',
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
  const pendingRenameCache = useMemo(() => new PendingRenameCache(), []);
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
  const initialPendingRename = useMemo(
    () =>
      boot.role === 'player' && initialPendingJoin
        ? pendingRenameCache.restore(initialPendingJoin.roomCode, clientId)
        : null,
    [boot.role, clientId, initialPendingJoin, pendingRenameCache]
  );
  const socketRef = useRef<GameSocket | null>(null);
  const reconnectTimerRef = useRef(0);
  const lastPhaseRef = useRef('');
  const lastActionCueKeyRef = useRef('');
  const lastTickSecondRef = useRef(-1);
  const pendingJoinRef = useRef<PendingJoin | null>(initialPendingJoin);
  const snapshotRef = useRef<RoomSnapshot | null>(null);
  const reconnectSuppressedRef = useRef(false);
  const connectRef = useRef<(roomCode?: string) => void>(() => undefined);
  const hostTokens = useMemo(() => new HostTokenCache(), []);
  const burstIdRef = useRef(0);
  const pendingSubmissionRef = useRef<PendingSubmission | null>(null);
  const pendingRenameRef = useRef<PendingRenameIntent | null>(initialPendingRename);
  const authoritativeSnapshotRevisionRef = useRef(0);

  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState(boot.role === 'player' ? 'Ready to join' : 'Disconnected');
  const [errorMessage, setErrorMessage] = useState('');
  const [playerName, setPlayerName] = useState(storedPlayerName);
  const [roomCodeDraft, setRoomCodeDraft] = useState(boot.initialRoomCode);
  const [pendingJoin, setPendingJoin] = useState<PendingJoin | null>(initialPendingJoin);
  const [pendingSubmission, setPendingSubmission] = useState<PendingSubmission | null>(null);
  const [authoritativeSnapshotRevision, setAuthoritativeSnapshotRevision] = useState(0);
  const [deadlineLabel, setDeadlineLabel] = useState('');
  const [deadlineUrgent, setDeadlineUrgent] = useState(false);
  const [audioMode, setAudioModeState] = useState(() => soundMode());
  const soundOn = audioMode !== 'off';
  const [reactionBursts, setReactionBursts] = useState<ReactionBurst[]>([]);

  useEffect(() => {
    pendingJoinRef.current = pendingJoin;
  }, [pendingJoin]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    setSoundScope(boot.role === 'player' ? 'controller' : 'display');
  }, [boot.role]);

  useEffect(() => {
    const update = () => {
      setSoundPhase(status === 'Connected' && !document.hidden ? snapshot?.phase ?? null : null);
      if (document.hidden || status !== 'Connected') stopSound();
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [snapshot?.phase, status]);

  useEffect(() => {
    window.addEventListener('pointerdown', unlockSound);
    window.addEventListener('keydown', unlockSound);
    return () => {
      window.removeEventListener('pointerdown', unlockSound);
      window.removeEventListener('keydown', unlockSound);
      setSoundPhase(null);
      stopSound();
    };
  }, []);

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

  const commitPendingSubmission = useCallback((next: PendingSubmission | null) => {
    pendingSubmissionRef.current = next;
    setPendingSubmission(next);
  }, []);

  const commitPendingRename = useCallback(
    (next: PendingRenameIntent | null, roomCode?: string) => {
      pendingRenameRef.current = next;
      if (!next) {
        pendingRenameCache.clear();
        return;
      }
      const activeRoomCode =
        roomCode ?? snapshotRef.current?.roomCode ?? pendingJoinRef.current?.roomCode;
      if (activeRoomCode) {
        pendingRenameCache.save(activeRoomCode, clientId, next);
      }
    },
    [clientId, pendingRenameCache]
  );

  const submitAction = useCallback(
    (kind: SubmissionKind, message: SubmissionMessage, optionId?: string) => {
      const current = pendingSubmissionRef.current;
      if (
        current?.turnToken === message.turnToken &&
        (current.state === 'sending' || current.state === 'accepted')
      ) {
        return false;
      }

      const next: PendingSubmission = {
        kind,
        turnToken: message.turnToken,
        state: 'sending',
        ...(optionId ? { optionId } : {})
      };
      commitPendingSubmission(next);
      if (send(message)) {
        return true;
      }
      commitPendingSubmission({ ...next, state: 'retry' });
      return false;
    },
    [commitPendingSubmission, send]
  );

  const applySnapshot = useCallback(
    (next: RoomSnapshot) => {
      const snapshotRevision = ++authoritativeSnapshotRevisionRef.current;
      setAuthoritativeSnapshotRevision(snapshotRevision);
      syncServerClock(next);
      snapshotRef.current = next;
      if (next.deadlineMs) {
        const remaining = Math.max(0, next.deadlineMs - nowMs());
        setDeadlineLabel(formatDeadline(next));
        setDeadlineUrgent(remaining <= 10_000);
      } else {
        setDeadlineLabel('');
        setDeadlineUrgent(false);
      }
      const phaseChanged = Boolean(lastPhaseRef.current && lastPhaseRef.current !== next.phase);
      if (boot.role === 'display' && phaseChanged) {
        playCue(next.phase === 'finalScores' ? 'podium' : 'phase');
      }
      lastPhaseRef.current = next.phase;

      const pending = pendingSubmissionRef.current;
      const reconciliation = reconcilePendingSubmission(pending, next, clientId);
      if (reconciliation.newlyAccepted) {
        playCue('submit');
        haptic(12);
      }
      if (reconciliation.next !== pending) {
        commitPendingSubmission(reconciliation.next);
      }

      if (boot.role === 'player') {
        reconcileTurnDraft(next, clientId);
        const actionAlert = playerActionAlert(
          next,
          clientId,
          lastActionCueKeyRef.current,
          soundEnabled()
        );
        if (actionAlert) {
          lastActionCueKeyRef.current = actionAlert.key;
          if (actionAlert.playSound) {
            playCue('phase');
          }
          if (actionAlert.haptic) {
            haptic([30, 50, 30]);
          }
        }
      }

      setSnapshot(next);

      if (boot.role === 'player') {
        const self = next.players.find((player) => player.id === clientId);
        if (self) {
          writeActivePlayerRoom(next.roomCode, currentTabId);
          const renameIntent = pendingRenameRef.current;
          const renameResolution = reconcilePendingRenameSnapshot(
            renameIntent,
            snapshotRevision,
            self.name,
            crypto.randomUUID()
          );
          let nextRename = renameResolution.next;
          if (renameResolution.sendName && nextRename) {
            if (
              send({
                type: 'setName',
                name: renameResolution.sendName,
                requestId: nextRename.requestId
              })
            ) {
              nextRename = markPendingRenameSent(nextRename, snapshotRevision);
            }
          }
          commitPendingRename(nextRename, next.roomCode);

          if (pendingRenameRef.current) {
            const desiredName = pendingRenameDesiredName(pendingRenameRef.current);
            writeStoredValue('draw-party-name', desiredName);
            setPlayerName(desiredName);
          } else {
            writeStoredValue('draw-party-name', self.name);
            setPlayerName(self.name);
          }
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
    [
      boot.role,
      clientId,
      commitPendingRename,
      commitPendingSubmission,
      currentTabId,
      haptic,
      send
    ]
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
        case 'nameSet': {
          const renameResolution = reconcilePendingRenameAcknowledgement(
            pendingRenameRef.current,
            message.requestId,
            message.canonicalName,
            authoritativeSnapshotRevisionRef.current,
            crypto.randomUUID()
          );
          if (!renameResolution.matched) {
            break;
          }
          let nextRename = renameResolution.next;
          if (renameResolution.sendName && nextRename) {
            if (
              send({
                type: 'setName',
                name: renameResolution.sendName,
                requestId: nextRename.requestId
              })
            ) {
              nextRename = markPendingRenameSent(
                nextRename,
                authoritativeSnapshotRevisionRef.current
              );
            }
          }
          commitPendingRename(nextRename);
          if (nextRename) {
            const desiredName = pendingRenameDesiredName(nextRename);
            writeStoredValue('draw-party-name', desiredName);
            setPlayerName(desiredName);
          } else {
            writeStoredValue('draw-party-name', message.canonicalName);
            setPlayerName(message.canonicalName);
          }
          break;
        }
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
          break;
        case 'reactionBurst': {
          const id = ++burstIdRef.current;
          setReactionBursts((current) =>
            [
              ...current,
              { id, playerId: message.playerId, name: message.name, emoji: message.emoji }
            ].slice(-MAX_RETAINED_REACTION_BURSTS)
          );
          window.setTimeout(() => {
            setReactionBursts((current) => current.filter((burst) => burst.id !== id));
          }, 1600);
          break;
        }
        case 'pong':
          syncServerTime(message.nowMs);
          break;
        case 'error':
          if (message.code === 'duplicate_submission') {
            const duplicateAck = acknowledgeDuplicateSubmission(
              pendingSubmissionRef.current,
              snapshotRef.current
            );
            if (duplicateAck.newlyAccepted) {
              commitPendingSubmission(duplicateAck.next);
              setErrorMessage('');
              playCue('submit');
              haptic(12);
              break;
            }
          }
          if (
            pendingSubmissionRef.current?.state === 'sending' ||
            RETRYABLE_SUBMISSION_ERROR_CODES.has(message.code)
          ) {
            commitPendingSubmission(retryPendingSubmission(pendingSubmissionRef.current));
          }
          if (message.code === 'session_in_use' || message.code === 'invalid_player_session') {
            reconnectSuppressedRef.current = true;
            commitPendingSubmission(null);
            commitPendingRename(null);
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
            commitPendingSubmission(null);
            setErrorMessage("Couldn't reattach to that room. Creating a fresh lobby…");
            socketRef.current?.close();
            connectRef.current();
            break;
          }
          setErrorMessage(message.message);
          if (['room_not_found', 'room_full'].includes(message.code)) {
            clearActivePlayerRoom();
            clearTurnDraft();
            commitPendingSubmission(null);
            commitPendingRename(null);
            setSnapshot(null);
            snapshotRef.current = null;
            setPrompt('');
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
    [
      applySnapshot,
      boot.role,
      commitPendingRename,
      commitPendingSubmission,
      haptic,
      hostTokens,
      send
    ]
  );

  const connect = useCallback(
    (roomCode?: string) => {
      commitPendingRename(
        queuePendingRenameAfterDisconnect(pendingRenameRef.current),
        roomCode
      );
      socketRef.current?.close();
      beginServerClockSession();
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
          commitPendingSubmission(retryPendingSubmission(pendingSubmissionRef.current));
          commitPendingRename(
            queuePendingRenameAfterDisconnect(pendingRenameRef.current),
            roomCode
          );
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
    [
      boot.role,
      clientId,
      commitPendingRename,
      commitPendingSubmission,
      handleServerMessage,
      hostTokens,
      sessionToken
    ]
  );

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (!pendingSubmission || pendingSubmission.state !== 'sending') {
      return;
    }
    return scheduleSubmissionWatchdog(
      pendingSubmission,
      () => pendingSubmissionRef.current,
      () => {
        commitPendingSubmission(retryPendingSubmission(pendingSubmissionRef.current));
        if (boot.role !== 'player') {
          return;
        }
        const roomCode =
          snapshotRef.current?.roomCode ?? pendingJoinRef.current?.roomCode ?? undefined;
        commitPendingRename(
          queuePendingRenameAfterDisconnect(pendingRenameRef.current),
          roomCode
        );
        socketRef.current?.close();
        if (roomCode) {
          connectRef.current(roomCode);
        }
      }
    );
  }, [
    authoritativeSnapshotRevision,
    boot.role,
    commitPendingRename,
    commitPendingSubmission,
    pendingSubmission
  ]);

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
      const deadlineCueActive = DEADLINE_CUE_PHASES.has(current.phase);
      if (!deadlineCueActive) {
        lastTickSecondRef.current = -1;
      }
      if (
        boot.role === 'display' &&
        deadlineCueActive &&
        remaining > 0 &&
        remaining <= 3000 &&
        remainingSeconds !== lastTickSecondRef.current
      ) {
        lastTickSecondRef.current = remainingSeconds;
        playCue('tick');
      }
      setDeadlineLabel(label);
      setDeadlineUrgent(urgent);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [boot.role, snapshot?.deadlineMs, snapshot?.turnToken]);

  const joinRoom = useCallback(
    (roomCode: string, name: string) => {
      const normalizedRoomCode = roomCode.trim().toUpperCase();
      const safeName = name.trim();
      if (!safeName) {
        setErrorMessage('Enter your name so everyone knows who is playing.');
        return;
      }
      clearActivePlayerRoom();
      clearTurnDraft();
      commitPendingRename(null);
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
    [commitPendingRename, connect, haptic]
  );

  const setName = useCallback(
    (name: string) => {
      const safeName = name.trim() || 'Player';
      const canonicalNameAtRequest =
        snapshotRef.current?.players.find((player) => player.id === clientId)?.name ??
        pendingJoinRef.current?.name ??
        safeName;
      writeStoredValue('draw-party-name', safeName);
      setPlayerName(safeName);
      const current = pendingRenameRef.current;
      let sent = false;
      let next: PendingRenameIntent;
      if (current?.state === 'sent') {
        next = coalescePendingRenameIntent(current, safeName);
      } else {
        const requestId = crypto.randomUUID();
        sent = send({ type: 'setName', name: safeName, requestId });
        next = createPendingRenameIntent(
          safeName,
          canonicalNameAtRequest,
          sent,
          authoritativeSnapshotRevisionRef.current,
          requestId
        );
      }
      const roomCode = snapshotRef.current?.roomCode ?? pendingJoinRef.current?.roomCode;
      commitPendingRename(next, roomCode);
      if (current?.state !== 'sent' && !sent && pendingJoinRef.current) {
        connect(pendingJoinRef.current.roomCode);
      }
      haptic(8);
    },
    [clientId, commitPendingRename, connect, haptic, send]
  );

  const cancelJoin = useCallback(() => {
    clearActivePlayerRoom();
    clearTurnDraft();
    setPendingJoin(null);
    pendingJoinRef.current = null;
    commitPendingRename(null);
    socketRef.current?.close();
    commitPendingSubmission(null);
    setSnapshot(null);
    setRoomCodeDraft('');
    setStatus('Ready to join');
    setErrorMessage('');
    if (window.location.pathname !== '/join') {
      window.history.replaceState(null, '', '/join');
    }
  }, [commitPendingRename, commitPendingSubmission]);

  const updateSettings = useCallback(
    (settings: RoomSettings) => {
      send({ type: 'updateRoomSettings', settings });
    },
    [send]
  );

  const selectSoundMode = useCallback((next: SoundMode) => {
    setSoundMode(next);
    setAudioModeState(next);
  }, []);

  const toggleSound = useCallback(() => {
    selectSoundMode(soundEnabled() ? 'off' : 'effects');
  }, [selectSoundMode]);

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
      pendingSubmission,
      deadlineLabel,
      deadlineUrgent,
      soundOn,
      audioMode,
      selectSoundMode,
      reactionBursts,
      setPlayerName,
      setRoomCodeDraft,
      setErrorMessage,
      clearError: () => setErrorMessage(''),
      joinRoom,
      setName,
      cancelJoin,
      send,
      submitAction,
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
      pendingSubmission,
      deadlineLabel,
      deadlineUrgent,
      soundOn,
      audioMode,
      selectSoundMode,
      reactionBursts,
      joinRoom,
      setName,
      cancelJoin,
      send,
      submitAction,
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
