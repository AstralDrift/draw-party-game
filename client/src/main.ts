import QRCode from 'qrcode';
import './style.css';
import { button, clear, el } from './dom';
import { DrawingPad, renderDrawing } from './drawing';
import { GameSocket } from './net';
import { finalWinnerText, roundOutcomeText } from './polish';
import {
  defaultRoomSettings,
  phaseLabel,
  type RoomSettings,
  type RoomSnapshot,
  type RoundResult,
  type ScoreEntry,
  type ServerMessage,
  type VotingOption
} from './protocol';
import { playCue, setSoundEnabled, soundEnabled } from './sound';
import { viewKeyFor } from './store';
import { formatDeadline, nowMs, syncServerClock } from './time';

const appRoot = document.querySelector<HTMLDivElement>('#app');
if (!appRoot) {
  throw new Error('App root was not found.');
}
const app = appRoot;

const joinMatch = window.location.pathname.match(/^\/join\/([A-Z0-9]{4})/i);
const role = joinMatch ? 'player' : 'display';
const initialRoomCode = joinMatch?.[1]?.toUpperCase() ?? '';
const clientId = getStoredValue('draw-party-client-id', () => crypto.randomUUID());

let socket: GameSocket | null = null;
let snapshot: RoomSnapshot | null = null;
let prompt = '';
let status = role === 'player' ? 'Ready to join' : 'Disconnected';
let errorMessage = '';
let playerName = localStorage.getItem('draw-party-name') ?? '';
let roomCodeDraft = initialRoomCode;
let pendingJoin: { roomCode: string; name: string } | null = null;
let viewKey = '';
let drawingPad: DrawingPad | null = null;
let reconnectTimer = 0;
let lastPhase = '';
let lastPlayerCount = 0;
let selectedVote: { turnToken: number; optionId: string } | null = null;

function connect(roomCode?: string): void {
  socket?.close();
  socket = new GameSocket({
    role,
    clientId,
    roomCode,
    hostToken: role === 'display' && roomCode ? getStoredHostToken(roomCode) ?? undefined : undefined,
    onOpen: () => {
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = 0;
      }
      if (role === 'display') {
        if (snapshot?.roomCode) {
          return;
        }
        send({ type: 'createRoom' });
      } else if (pendingJoin) {
        send({ type: 'joinRoom', roomCode: pendingJoin.roomCode, name: pendingJoin.name });
      }
    },
    onClose: scheduleReconnect,
    onMessage: handleServerMessage,
    onStatus: (nextStatus) => {
      status = nextStatus;
      updateConnectionText();
    }
  });
  socket.connect();
}

function scheduleReconnect(): void {
  if (reconnectTimer) {
    return;
  }
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = 0;
    if (role === 'display') {
      connect(snapshot?.roomCode);
    } else if (pendingJoin) {
      connect(pendingJoin.roomCode);
    }
  }, 1200);
}

function send(message: Parameters<GameSocket['send']>[0]): void {
  socket?.send(message);
}

function clearErrorMessage(): void {
  if (!errorMessage) {
    return;
  }
  errorMessage = '';
  render();
}

function handleServerMessage(message: ServerMessage): void {
  errorMessage = '';
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
      prompt = message.prompt;
      updatePromptText();
      break;
    case 'playerListChanged':
      if (snapshot) {
        if (message.players.length > snapshot.players.length) {
          playCue('join');
        }
        lastPlayerCount = message.players.length;
        snapshot = { ...snapshot, players: message.players };
      }
      render();
      break;
    case 'drawingReveal':
      if (snapshot) {
        snapshot = {
          ...snapshot,
          currentArtistId: message.artistId,
          currentArtistName: message.artistName,
          currentDrawing: message.drawing
        };
      }
      render();
      break;
    case 'votingOptions':
      if (snapshot) {
        snapshot = { ...snapshot, votingOptions: message.options };
      }
      render();
      break;
    case 'roundResult':
      if (snapshot) {
        snapshot = { ...snapshot, roundResult: message.result };
      }
      render();
      break;
    case 'finalScores':
      if (snapshot) {
        snapshot = { ...snapshot, finalScores: message.scores };
      }
      render();
      break;
    case 'pong':
      render();
      break;
    case 'error':
      errorMessage = message.message;
      if (['room_not_found', 'game_in_progress', 'room_full'].includes(message.code)) {
        pendingJoin = null;
        status = 'Ready to join';
        socket?.close();
      }
      render();
      break;
  }
}

function applySnapshot(nextSnapshot: RoomSnapshot): void {
  syncServerClock(nextSnapshot);
  if (nextSnapshot.phase !== 'voting' || selectedVote?.turnToken !== nextSnapshot.turnToken) {
    selectedVote = null;
  }
  if (lastPhase && lastPhase !== nextSnapshot.phase) {
    playCue(nextSnapshot.phase === 'results' ? 'results' : 'phase');
  }
  if (nextSnapshot.players.length > lastPlayerCount) {
    playCue('join');
  }
  lastPhase = nextSnapshot.phase;
  lastPlayerCount = nextSnapshot.players.length;
  snapshot = nextSnapshot;
  render();
}

function render(): void {
  const key = [
    viewKeyFor({
      role,
      clientId,
      initialRoomCode,
      pendingRoomCode: pendingJoin?.roomCode,
      snapshot
    }),
    errorMessage,
    selectedVote ? `vote:${selectedVote.turnToken}:${selectedVote.optionId}` : ''
  ].join(';error:');
  if (key === viewKey) {
    updateDynamicText();
    return;
  }
  viewKey = key;
  drawingPad = null;
  clear(app);
  app.appendChild(role === 'display' ? renderDisplay() : renderPlayer());
  updateDynamicText();
}

function renderDisplay(): HTMLElement {
  if (!snapshot) {
    return shell('TV Display', el('p', { class: 'muted' }, status));
  }

  const content = document.createElement('div');
  content.className = 'display-grid';

  if (snapshot.phase === 'lobby') {
    content.append(renderRoomPanel(), renderLobbySidePanel());
  } else if (snapshot.phase === 'drawing') {
    content.append(
      heroPanel('Players are drawing', `Round ${snapshot.currentRound} of ${snapshot.totalRounds}`),
      renderProgressPanel('Drawings', snapshot.drawingSubmittedIds)
    );
  } else if (snapshot.phase === 'guessing') {
    content.append(renderRevealPanel('What is this?', false), renderProgressPanel('Guesses', snapshot.guessSubmittedIds));
  } else if (snapshot.phase === 'voting') {
    content.append(renderRevealPanel('Vote for the real prompt', false), renderVotingOptions(snapshot.votingOptions, false));
  } else if (snapshot.phase === 'results') {
    content.append(renderResults(snapshot.roundResult, true), renderAdvancePanel());
  } else {
    content.append(renderScores(snapshot.finalScores, true), renderAdvancePanel());
  }

  return shell('Draw Party', content);
}

function renderPlayer(): HTMLElement {
  if (!snapshot) {
    return renderJoin();
  }

  if (snapshot.phase === 'lobby') {
    return shell('Lobby', renderPlayerLobby());
  }
  if (snapshot.phase === 'drawing') {
    return shell('Draw', renderDrawingTurn());
  }
  if (snapshot.phase === 'guessing') {
    return shell('Guess', renderGuessingTurn());
  }
  if (snapshot.phase === 'voting') {
    return shell('Vote', renderVotingTurn());
  }
  if (snapshot.phase === 'results') {
    return shell('Results', renderResults(snapshot.roundResult, false));
  }
  return shell('Final Scores', renderScores(snapshot.finalScores, false));
}

function renderPlayerLobby(): HTMLElement {
  const readyText = playerName ? `${playerName}, you're in` : "You're in";
  return el(
    'div',
    { class: 'player-lobby-stack' },
    el(
      'section',
      { class: 'panel ready-panel' },
      el('p', { class: 'eyebrow' }, 'Ready'),
      el('h2', {}, readyText),
      el('p', { class: 'muted' }, 'Watch the TV. The host can start once enough phones are connected.')
    ),
    renderPlayersPanel(false)
  );
}

function renderJoin(): HTMLElement {
  if (pendingJoin) {
    return shell(
      'Join Game',
      el(
        'section',
        { class: 'panel narrow waiting-panel' },
        el('p', { class: 'eyebrow' }, pendingJoin.roomCode),
        el('h2', {}, 'Joining room'),
        el('p', { class: 'muted' }, status === 'Connected' ? 'Waiting for the TV to confirm your spot.' : 'Reconnecting to the room.'),
        button('Change Room', 'tool-button wide', () => {
          pendingJoin = null;
          socket?.close();
          snapshot = null;
          status = 'Ready to join';
          render();
        })
      )
    );
  }

  const roomInput = el('input', {
    class: 'input code-input',
    value: roomCodeDraft,
    maxlength: 4,
    placeholder: 'CODE',
    autocomplete: 'off'
  });
  const nameInput = el('input', {
    class: 'input',
    value: playerName,
    maxlength: 24,
    placeholder: 'Your name',
    autocomplete: 'name'
  });
  roomInput.addEventListener('input', () => {
    roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    roomCodeDraft = roomInput.value;
    clearErrorMessage();
  });
  nameInput.addEventListener('input', () => {
    playerName = nameInput.value;
    clearErrorMessage();
  });
  const join = () => {
    const roomCode = roomInput.value.trim().toUpperCase();
    const name = nameInput.value.trim() || 'Player';
    if (roomCode.length !== 4) {
      errorMessage = 'Enter the four-letter room code from the TV.';
      render();
      return;
    }
    playerName = name;
    roomCodeDraft = roomCode;
    localStorage.setItem('draw-party-name', playerName);
    pendingJoin = { roomCode, name };
    connect(roomCode);
    render();
  };
  roomInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      nameInput.focus();
    }
  });
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      join();
    }
  });

  return shell(
    'Join Game',
    el(
      'section',
      { class: 'panel narrow' },
      el('label', { class: 'label' }, 'Room code'),
      roomInput,
      el('label', { class: 'label' }, 'Name'),
      nameInput,
      button('Join', 'primary wide', join),
      el('p', { class: 'muted join-note' }, initialRoomCode ? 'Enter your name, then join from this phone.' : 'Enter the room code from the TV.')
    )
  );
}

function renderRoomPanel(): HTMLElement {
  if (!snapshot) {
    return el('section', { class: 'panel' });
  }

  const joinUrl = `${window.location.origin}/join/${snapshot.roomCode}`;
  const qrCanvas = document.createElement('canvas');
  qrCanvas.className = 'qr';
  QRCode.toCanvas(qrCanvas, joinUrl, {
    width: 260,
    margin: 1,
    color: { dark: '#10131f', light: '#ffffff' }
  }).catch(() => {
    qrCanvas.replaceWith(el('p', { class: 'muted' }, joinUrl));
  });

  const connectedPlayers = snapshot.players.filter((player) => player.connected);
  const canStart = connectedPlayers.length >= snapshot.minPlayers;
  const neededPlayers = Math.max(0, snapshot.minPlayers - connectedPlayers.length);
  return el(
    'section',
    { class: 'panel room-panel' },
    el('p', { class: 'eyebrow' }, 'Room Code'),
    el('div', { class: 'room-code' }, snapshot.roomCode),
    qrCanvas,
    el('p', { class: 'join-url' }, joinUrl),
    button('Start Game', 'primary wide start-button', () => send({ type: 'startGame' }), !canStart),
    el(
      'p',
      { class: canStart ? 'start-note ready' : 'start-note' },
      canStart
        ? `${connectedPlayers.length} connected players ready.`
        : connectedPlayers.length === 0
          ? `Need ${snapshot.minPlayers} connected players. Phones can scan the code now.`
          : `Need ${neededPlayers} more connected ${neededPlayers === 1 ? 'player' : 'players'}.`
    )
  );
}

function renderPlayersPanel(showScores: boolean): HTMLElement {
  const list = renderPlayerList(showScores);

  return el(
    'section',
    { class: 'panel players-panel' },
    el('div', { class: 'panel-title' }, 'Players'),
    list,
    snapshot ? el('p', { class: 'muted' }, playerCountLabel(snapshot)) : null
  );
}

function renderPlayerList(showScores: boolean): HTMLElement {
  const list = el('div', { class: 'player-list' });
  for (const player of snapshot?.players ?? []) {
    list.appendChild(
      el(
        'div',
        { class: `player-row ${player.connected ? '' : 'offline'}` },
        el('span', {}, player.name),
        el('span', { class: 'pill' }, showScores ? `${player.score} pts` : player.connected ? 'online' : 'offline')
      )
    );
  }
  if (!snapshot?.players.length) {
    list.appendChild(el('div', { class: 'empty-state' }, 'Waiting for phones to join.'));
  }
  return list;
}

function playerCountLabel(room: RoomSnapshot): string {
  const connected = room.players.filter((player) => player.connected).length;
  return `${connected} connected · ${room.players.length}/${room.maxPlayers} joined`;
}

function renderLobbySidePanel(): HTMLElement {
  const wrapper = el('div', { class: 'lobby-side' }, renderPlayersPanel(true), renderSettingsPanel());
  return wrapper;
}

function renderSettingsPanel(): HTMLElement {
  const settings = snapshot?.settings ?? defaultRoomSettings();
  const rounds = numberInput(settings.rounds, 1, 12);
  const draw = numberInput(settings.drawSeconds, 30, 180);
  const guess = numberInput(settings.guessSeconds, 15, 120);
  const vote = numberInput(settings.voteSeconds, 10, 90);

  const save = () => {
    const nextSettings: RoomSettings = {
      rounds: clampInput(rounds.value, 1, 12, settings.rounds),
      drawSeconds: clampInput(draw.value, 30, 180, settings.drawSeconds),
      guessSeconds: clampInput(guess.value, 15, 120, settings.guessSeconds),
      voteSeconds: clampInput(vote.value, 10, 90, settings.voteSeconds),
      promptPackId: 'safe-party'
    };
    send({ type: 'updateRoomSettings', settings: nextSettings });
  };

  return el(
    'section',
    { class: 'panel settings-panel' },
    el('div', { class: 'panel-title' }, 'Room Settings'),
    el('label', { class: 'label' }, 'Rounds'),
    rounds,
    el('label', { class: 'label' }, 'Drawing seconds'),
    draw,
    el('label', { class: 'label' }, 'Guessing seconds'),
    guess,
    el('label', { class: 'label' }, 'Voting seconds'),
    vote,
    el('p', { class: 'muted' }, 'Prompt pack: Party Safe'),
    button('Save Settings', 'primary wide', save),
    button(soundEnabled() ? 'Sound On' : 'Sound Off', `tool-button wide sound-toggle ${soundEnabled() ? 'is-selected' : ''}`, () => {
      setSoundEnabled(!soundEnabled());
      render();
    })
  );
}

function numberInput(value: number, min: number, max: number): HTMLInputElement {
  return el('input', {
    class: 'input compact-input',
    type: 'number',
    min,
    max,
    value
  });
}

function clampInput(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function renderDrawingTurn(): HTMLElement {
  if (!snapshot) {
    return el('section', { class: 'panel' });
  }

  const submitted = snapshot.drawingSubmittedIds.includes(clientId);
  const turnToken = snapshot.turnToken;
  const submitButton = button('Draw before submitting', 'primary wide', () => {
    if (!drawingPad?.hasInk()) {
      errorMessage = 'Draw at least one stroke before submitting.';
      render();
      return;
    }
    send({ type: 'submitDrawing', turnToken, drawing: drawingPad.getDrawing() });
    playCue('submit');
  }, submitted);

  const submitDock = el('div', { class: 'submit-dock' }, submitButton);
  const updateSubmitButton = () => {
    const hasInk = Boolean(drawingPad?.hasInk());
    submitButton.disabled = submitted || !hasInk;
    submitButton.textContent = hasInk ? 'Submit Drawing' : 'Draw before submitting';
  };
  drawingPad = new DrawingPad(() => {
    updateSubmitButton();
  }, submitDock);
  updateSubmitButton();

  return el(
    'section',
    { class: 'panel play-panel' },
    el('div', { class: 'prompt', id: 'prompt-text' }, prompt ? `Draw: ${prompt}` : 'Waiting for prompt...'),
    el('div', { class: 'deadline', id: 'deadline-text' }),
    renderReconnectHint(submitted ? 'Your drawing is already submitted.' : 'Keep drawing. If your phone reconnects, this screen will return.'),
    submitted ? el('div', { class: 'success-box' }, 'Drawing submitted. Watch the TV.') : drawingPad.root
  );
}

function renderGuessingTurn(): HTMLElement {
  if (!snapshot) {
    return el('section', { class: 'panel' });
  }
  const isArtist = snapshot.currentArtistId === clientId;
  const submitted = snapshot.guessSubmittedIds.includes(clientId);
  const turnToken = snapshot.turnToken;
  const canvas = document.createElement('canvas');
  canvas.className = 'reveal-canvas phone-canvas';
  renderDrawing(canvas, snapshot.currentDrawing);

  if (isArtist) {
    return el(
      'section',
      { class: 'panel play-panel' },
      el('p', { class: 'eyebrow' }, 'Your drawing'),
      el('div', { class: 'deadline', id: 'deadline-text' }),
      canvas,
      renderReconnectHint('You are the artist for this reveal. Other players are writing fake answers.'),
      el('div', { class: 'success-box' }, 'This is your drawing. Wait for guesses.')
    );
  }

  const input = el('input', {
    class: 'input',
    maxlength: 60,
    placeholder: 'Fake answer',
    disabled: submitted
  });
  input.addEventListener('input', clearErrorMessage);
  return el(
    'section',
    { class: 'panel play-panel' },
    el('div', { class: 'deadline', id: 'deadline-text' }),
    canvas,
    input,
    button('Submit Guess', 'primary wide', () => {
      const guess = input.value.trim();
      if (!guess) {
        errorMessage = 'Enter a guess first.';
        render();
        return;
      }
      send({ type: 'submitGuess', turnToken, guess });
      playCue('submit');
      input.disabled = true;
    }, submitted),
    renderReconnectHint(submitted ? 'Your guess is in.' : 'Make a convincing fake answer.'),
    submitted ? el('p', { class: 'success-box' }, 'Guess submitted.') : null
  );
}

function renderVotingTurn(): HTMLElement {
  if (!snapshot) {
    return el('section', { class: 'panel' });
  }
  const isArtist = snapshot.currentArtistId === clientId;
  const submitted = snapshot.voteSubmittedIds.includes(clientId);
  const canvas = document.createElement('canvas');
  canvas.className = 'reveal-canvas phone-canvas';
  renderDrawing(canvas, snapshot.currentDrawing);
  return el(
    'section',
    { class: 'panel play-panel' },
    el('p', { class: 'eyebrow' }, isArtist ? 'Your drawing' : 'Pick an answer'),
    el('div', { class: 'deadline', id: 'deadline-text' }),
    canvas,
    renderReconnectHint(submitted ? 'Your vote is in.' : isArtist ? 'You drew this one. Watch the votes come in.' : 'Choose the real prompt. You cannot vote for your own fake answer.'),
    isArtist
      ? el('div', { class: 'success-box' }, 'This is your drawing. Watch the vote.')
      : renderVotingOptions(snapshot.votingOptions, true, submitted)
  );
}

function renderReconnectHint(message: string): HTMLElement {
  const connected = status === 'Connected';
  return el(
    'div',
    { class: connected ? 'reconnect-hint stable' : 'reconnect-hint warning' },
    connected ? message : `Reconnecting. ${message}`
  );
}

function renderRevealPanel(title: string, showAnswer: boolean): HTMLElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'reveal-canvas';
  renderDrawing(canvas, snapshot?.currentDrawing);
  return el(
    'section',
    { class: 'panel reveal-panel' },
    el('p', { class: 'eyebrow' }, snapshot?.currentArtistName ? `By ${snapshot.currentArtistName}` : 'Drawing'),
    el('h2', {}, title),
    el('div', { class: 'deadline', id: 'deadline-text' }),
    canvas,
    showAnswer && snapshot?.roundResult ? el('div', { class: 'prompt' }, snapshot.roundResult.correctAnswer) : null
  );
}

function renderVotingOptions(options: VotingOption[], interactive: boolean, submitted = false): HTMLElement {
  const container = el('section', { class: interactive ? 'vote-list compact' : 'panel vote-list' });
  if (!interactive) {
    container.appendChild(el('div', { class: 'panel-title' }, 'Options'));
  }
  for (const option of options) {
    const ownGuess = option.authorPlayerId === clientId;
    const selectedVoteForTurn = selectedVote?.turnToken === snapshot?.turnToken ? selectedVote : null;
    const selected = selectedVoteForTurn?.optionId === option.id;
    const waitingForVoteAck = Boolean(selectedVoteForTurn);
    const disabled = submitted || ownGuess || waitingForVoteAck;
    const voteButton = el(
      'button',
      {
        class: `${disabled ? 'vote-option disabled' : 'vote-option'}${selected ? ' is-selected' : ''}`,
        disabled: !interactive || disabled
      },
      el('span', { class: 'vote-answer' }, option.text),
      interactive && selected ? el('span', { class: 'vote-reason' }, 'Your vote') : null,
      interactive && ownGuess ? el('span', { class: 'vote-reason' }, 'Your fake answer') : null,
      interactive && submitted && !ownGuess && !selected ? el('span', { class: 'vote-reason' }, 'Vote submitted') : null
    );
    if (interactive && !disabled) {
      voteButton.addEventListener('click', () => {
        const turnToken = snapshot?.turnToken ?? 0;
        selectedVote = { turnToken, optionId: option.id };
        render();
        send({ type: 'submitVote', turnToken, optionId: option.id });
        playCue('submit');
      });
    }
    container.appendChild(voteButton);
  }
  return container;
}

function renderProgressPanel(label: string, submittedIds: string[]): HTMLElement {
  const activePlayers = snapshot?.players.filter((player) => player.connected) ?? [];
  const activeSubmittedIds = submittedIds.filter((playerId) => activePlayers.some((player) => player.id === playerId));
  const waitingNames = activePlayers
    .filter((player) => !submittedIds.includes(player.id))
    .map((player) => player.name);
  return el(
    'section',
    { class: 'panel progress-panel' },
    el('div', { class: 'panel-title' }, label),
    el('div', { class: 'big-count' }, `${activeSubmittedIds.length}/${activePlayers.length}`),
    el(
      'p',
      { class: 'muted' },
      waitingNames.length === 0 ? 'Everyone is in.' : `Waiting on ${waitingNames.join(', ')}.`
    ),
    renderPlayerList(false)
  );
}

function renderResults(result: RoundResult | null | undefined, includeDrawing: boolean): HTMLElement {
  if (!result) {
    return el('section', { class: 'panel' }, 'Waiting for results...');
  }

  const breakdown = el('div', { class: 'breakdown' });
  for (const item of result.breakdown) {
    breakdown.appendChild(
      el(
        'div',
        { class: `breakdown-row ${item.isCorrect ? 'correct' : ''}` },
        el(
          'div',
          { class: 'breakdown-kind' },
          item.isCorrect ? 'Correct answer' : item.authorName ? `Fake answer by ${item.authorName}` : 'Fake answer'
        ),
        el('div', { class: 'breakdown-answer' }, item.optionText),
        renderVoterChips(item.voterNames)
      )
    );
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'reveal-canvas result-canvas';
  renderDrawing(canvas, snapshot?.currentDrawing);
  const deltas = renderScoreDeltas(result.scoreDeltas);

  return el(
    'section',
    { class: 'panel results-panel' },
    el('p', { class: 'eyebrow' }, `Drawing by ${result.artistName}`),
    el('div', { class: 'round-outcome' }, roundOutcomeText(result)),
    el('h2', {}, 'The real prompt was'),
    el('div', { class: 'prompt' }, result.correctAnswer),
    includeDrawing ? canvas : null,
    deltas,
    breakdown
  );
}

function renderVoterChips(names: string[]): HTMLElement {
  if (names.length === 0) {
    return el('div', { class: 'muted' }, 'No votes');
  }
  return el(
    'div',
    { class: 'chip-row' },
    el('span', { class: 'chip-label' }, 'Voted by'),
    ...names.map((name) => el('span', { class: 'pill vote-chip' }, name))
  );
}

function renderScoreDeltas(deltas: RoundResult['scoreDeltas']): HTMLElement | null {
  const activeDeltas = deltas.filter((delta) => delta.delta > 0);
  if (activeDeltas.length === 0) {
    return el('div', { class: 'score-deltas muted' }, 'No points this reveal.');
  }
  return el(
    'div',
    { class: 'score-deltas' },
    ...activeDeltas.map((delta) => el('span', { class: 'pill score-delta' }, `${delta.name} +${delta.delta}`))
  );
}

function renderScores(scores: ScoreEntry[], podium: boolean): HTMLElement {
  const topScores = podium ? scores.slice(0, 3) : [];
  const list = el('div', { class: 'score-list' });
  for (const [index, score] of scores.entries()) {
    list.appendChild(
      el(
        'div',
        { class: `score-row ${index === 0 ? 'winner' : ''}` },
        el('span', {}, `${index + 1}. ${score.name}`),
        el('span', { class: 'pill' }, `${score.score} pts`)
      )
    );
  }
  return el(
    'section',
    { class: 'panel scores-panel' },
    el('div', { class: 'panel-title' }, podium ? 'Final Podium' : 'Scores'),
    el('div', { class: 'winner-callout' }, finalWinnerText(scores)),
    podium
      ? el(
          'div',
          { class: 'podium' },
          ...topScores.map((score, index) =>
            el(
              'div',
              { class: `podium-place place-${index + 1}` },
              el('span', { class: 'podium-rank' }, podiumRank(index)),
              el('strong', {}, score.name),
              el('span', {}, `${score.score} pts`)
            )
          )
        )
      : null,
    list
  );
}

function podiumRank(index: number): string {
  return ['1st', '2nd', '3rd'][index] ?? `${index + 1}th`;
}

function renderAdvancePanel(): HTMLElement {
  if (role !== 'display') {
    return el('section', { class: 'panel' }, el('p', { class: 'muted' }, 'Watch the TV for the next step.'));
  }
  const final = snapshot?.phase === 'finalScores';
  return el(
    'section',
    { class: 'panel' },
    button(final ? 'Play Again' : 'Continue', 'primary wide', () => send({ type: 'startGame' }))
  );
}

function heroPanel(title: string, subtitle: string): HTMLElement {
  return el(
    'section',
    { class: 'panel hero-panel' },
    el('p', { class: 'eyebrow' }, subtitle),
    el('h2', {}, title),
    el('div', { class: 'deadline', id: 'deadline-text' })
  );
}

function shell(title: string, child: HTMLElement): HTMLElement {
  const waitingToJoin = role === 'player' && !pendingJoin && !snapshot;
  const reconnecting = !waitingToJoin && status !== 'Connected' && status !== 'Disconnected';
  const connectionText = displayStatusText();
  return el(
    'main',
    { class: `app-shell ${role} ${shellPhaseClass()}` },
    el(
      'header',
      { class: 'topbar' },
      el('div', {}, el('div', { class: 'brand' }, title), snapshot ? el('div', { class: 'phase' }, phaseLabel(snapshot.phase)) : null),
      el('div', { class: 'connection', id: 'connection-text' }, connectionText)
    ),
    reconnecting ? el('div', { class: 'connection-banner' }, status) : null,
    errorMessage ? el('div', { class: 'error', role: 'alert' }, errorMessage) : null,
    child
  );
}

function displayStatusText(): string {
  if (role === 'player' && !pendingJoin && !snapshot) {
    return 'Ready to join';
  }
  return status;
}

function updateDynamicText(): void {
  updateConnectionText();
  updatePromptText();
  updateDeadlineText();
}

function updateConnectionText(): void {
  const node = document.querySelector('#connection-text');
  if (node) {
    node.textContent = displayStatusText();
  }
}

function updatePromptText(): void {
  const node = document.querySelector('#prompt-text');
  if (node) {
    node.textContent = prompt ? `Draw: ${prompt}` : 'Waiting for prompt...';
  }
}

function updateDeadlineText(): void {
  const nodes = document.querySelectorAll('#deadline-text');
  if (!snapshot?.deadlineMs) {
    nodes.forEach((node) => {
      node.textContent = '';
      node.classList.remove('is-urgent');
    });
    return;
  }
  const label = formatDeadline(snapshot);
  const urgent = Math.max(0, snapshot.deadlineMs - nowMs()) <= 10_000;
  nodes.forEach((node) => {
    node.textContent = label;
    node.classList.toggle('is-urgent', urgent);
  });
}

function shellPhaseClass(): string {
  if (!snapshot) {
    return role === 'player' && !pendingJoin ? 'phase-join' : 'phase-connecting';
  }
  switch (snapshot.phase) {
    case 'finalScores':
      return 'phase-final-scores';
    default:
      return `phase-${snapshot.phase}`;
  }
}

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

window.setInterval(updateDeadlineText, 250);
registerServiceWorker();

if (role === 'display') {
  connect();
} else {
  render();
}

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // The game still works online if PWA caching is unavailable.
    });
  });
}
