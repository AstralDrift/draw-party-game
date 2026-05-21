import QRCode from 'qrcode';
import './style.css';
import { button, clear, el } from './dom';
import { DrawingPad, estimateDrawingBytes, renderDrawing } from './drawing';
import { GameSocket } from './net';
import { phaseLabel, type RoomSnapshot, type RoundResult, type ScoreEntry, type ServerMessage, type VotingOption } from './protocol';

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
let status = 'Disconnected';
let errorMessage = '';
let playerName = localStorage.getItem('draw-party-name') ?? '';
let pendingJoin: { roomCode: string; name: string } | null = null;
let viewKey = '';
let drawingPad: DrawingPad | null = null;
let reconnectTimer = 0;

function connect(roomCode?: string): void {
  socket?.close();
  socket = new GameSocket({
    role,
    clientId,
    roomCode,
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

function handleServerMessage(message: ServerMessage): void {
  errorMessage = '';
  switch (message.type) {
    case 'roomSnapshot':
    case 'phaseChanged':
      snapshot = message.snapshot;
      render();
      break;
    case 'promptAssigned':
      prompt = message.prompt;
      updatePromptText();
      break;
    case 'playerListChanged':
      if (snapshot) {
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
      render();
      break;
  }
}

function render(): void {
  const key = getViewKey();
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

function getViewKey(): string {
  if (!snapshot) {
    return `${role}:join:${pendingJoin?.roomCode ?? initialRoomCode}`;
  }

  const base = `${role}:${snapshot.roomCode}:${snapshot.phase}:${snapshot.currentRound}:${snapshot.turnToken}:${snapshot.currentArtistId ?? ''}`;
  const playersKey = snapshot.players
    .map((player) => `${player.id}:${player.name}:${player.score}:${player.connected}`)
    .join('|');

  if (role === 'display') {
    return [
      base,
      playersKey,
      snapshot.drawingSubmittedIds.join(','),
      snapshot.guessSubmittedIds.join(','),
      snapshot.voteSubmittedIds.join(','),
      snapshot.votingOptions.map((option) => `${option.id}:${option.text}`).join('|'),
      snapshot.roundResult?.correctAnswer ?? '',
      snapshot.finalScores.map((score) => `${score.playerId}:${score.score}`).join('|')
    ].join(';');
  }

  const ownDrawingSubmitted = snapshot.drawingSubmittedIds.includes(clientId);
  const ownGuessSubmitted = snapshot.guessSubmittedIds.includes(clientId);
  const ownVoteSubmitted = snapshot.voteSubmittedIds.includes(clientId);
  return [
    base,
    snapshot.phase === 'lobby' ? playersKey : '',
    ownDrawingSubmitted,
    ownGuessSubmitted,
    ownVoteSubmitted,
    snapshot.votingOptions.map((option) => `${option.id}:${option.text}:${option.authorPlayerId ?? ''}`).join('|'),
    snapshot.roundResult?.correctAnswer ?? '',
    snapshot.finalScores.map((score) => `${score.playerId}:${score.score}`).join('|')
  ].join(';');
}

function renderDisplay(): HTMLElement {
  if (!snapshot) {
    return shell('TV Display', el('p', { class: 'muted' }, status));
  }

  const content = document.createElement('div');
  content.className = 'display-grid';

  if (snapshot.phase === 'lobby') {
    content.append(renderRoomPanel(), renderPlayersPanel(true));
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
    content.append(renderResults(snapshot.roundResult), renderAdvancePanel());
  } else {
    content.append(renderScores(snapshot.finalScores), renderAdvancePanel());
  }

  return shell('Draw Party', content);
}

function renderPlayer(): HTMLElement {
  if (!snapshot) {
    return renderJoin();
  }

  if (snapshot.phase === 'lobby') {
    return shell('Lobby', renderPlayersPanel(false));
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
    return shell('Results', renderResults(snapshot.roundResult));
  }
  return shell('Final Scores', renderScores(snapshot.finalScores));
}

function renderJoin(): HTMLElement {
  const roomInput = el('input', {
    class: 'input code-input',
    value: initialRoomCode,
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
  const join = () => {
    const roomCode = roomInput.value.trim().toUpperCase();
    const name = nameInput.value.trim() || 'Player';
    if (roomCode.length !== 4) {
      errorMessage = 'Enter the four-letter room code from the TV.';
      render();
      return;
    }
    playerName = name;
    localStorage.setItem('draw-party-name', playerName);
    pendingJoin = { roomCode, name };
    connect(roomCode);
  };

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
      el('p', { class: 'muted' }, status)
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

  const canStart = snapshot.players.length >= snapshot.minPlayers;
  return el(
    'section',
    { class: 'panel room-panel' },
    el('p', { class: 'eyebrow' }, 'Room Code'),
    el('div', { class: 'room-code' }, snapshot.roomCode),
    qrCanvas,
    el('p', { class: 'join-url' }, joinUrl),
    button('Start Game', 'primary wide', () => send({ type: 'startGame' }), !canStart),
    el('p', { class: 'muted' }, canStart ? 'Ready to start.' : `Need ${snapshot.minPlayers} players.`)
  );
}

function renderPlayersPanel(showScores: boolean): HTMLElement {
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

  return el(
    'section',
    { class: 'panel' },
    el('div', { class: 'panel-title' }, 'Players'),
    list,
    snapshot ? el('p', { class: 'muted' }, `${snapshot.players.length}/${snapshot.maxPlayers} joined`) : null
  );
}

function renderDrawingTurn(): HTMLElement {
  if (!snapshot) {
    return el('section', { class: 'panel' });
  }

  const submitted = snapshot.drawingSubmittedIds.includes(clientId);
  const turnToken = snapshot.turnToken;
  const submitButton = button('Submit Drawing', 'primary wide', () => {
    if (!drawingPad?.hasInk()) {
      errorMessage = 'Draw at least one stroke before submitting.';
      render();
      return;
    }
    send({ type: 'submitDrawing', turnToken, drawing: drawingPad.getDrawing() });
  }, submitted);

  drawingPad = new DrawingPad(() => {
    submitButton.disabled = !drawingPad?.hasInk();
    updateDrawingBytes();
  });
  submitButton.disabled = submitted || !drawingPad.hasInk();

  return el(
    'section',
    { class: 'panel play-panel' },
    el('div', { class: 'prompt', id: 'prompt-text' }, prompt ? `Draw: ${prompt}` : 'Waiting for prompt...'),
    el('div', { class: 'deadline', id: 'deadline-text' }),
    submitted ? el('div', { class: 'success-box' }, 'Drawing submitted. Watch the TV.') : drawingPad.root,
    el('div', { class: 'muted', id: 'drawing-bytes' }, ''),
    submitButton
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
      el('div', { class: 'deadline', id: 'deadline-text' }),
      canvas,
      el('div', { class: 'success-box' }, 'This is your drawing. Wait for guesses.')
    );
  }

  const input = el('input', {
    class: 'input',
    maxlength: 60,
    placeholder: 'Fake answer',
    disabled: submitted
  });
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
      input.disabled = true;
    }, submitted),
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
    el('div', { class: 'deadline', id: 'deadline-text' }),
    canvas,
    isArtist
      ? el('div', { class: 'success-box' }, 'This is your drawing. Watch the vote.')
      : renderVotingOptions(snapshot.votingOptions, true, submitted)
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
    const disabled = submitted || option.authorPlayerId === clientId;
    container.appendChild(
      button(option.text, disabled ? 'vote-option disabled' : 'vote-option', () => {
        send({ type: 'submitVote', turnToken: snapshot?.turnToken ?? 0, optionId: option.id });
      }, !interactive || disabled)
    );
  }
  return container;
}

function renderProgressPanel(label: string, submittedIds: string[]): HTMLElement {
  const total = snapshot?.players.length ?? 0;
  return el(
    'section',
    { class: 'panel progress-panel' },
    el('div', { class: 'panel-title' }, label),
    el('div', { class: 'big-count' }, `${submittedIds.length}/${total}`),
    renderPlayersPanel(false)
  );
}

function renderResults(result: RoundResult | null | undefined): HTMLElement {
  if (!result) {
    return el('section', { class: 'panel' }, 'Waiting for results...');
  }

  const breakdown = el('div', { class: 'breakdown' });
  for (const item of result.breakdown) {
    breakdown.appendChild(
      el(
        'div',
        { class: `breakdown-row ${item.isCorrect ? 'correct' : ''}` },
        el('div', { class: 'breakdown-answer' }, item.optionText),
        item.authorName ? el('div', { class: 'muted' }, `By ${item.authorName}`) : null,
        el('div', { class: 'muted' }, item.voterNames.length ? `Votes: ${item.voterNames.join(', ')}` : 'No votes')
      )
    );
  }

  return el(
    'section',
    { class: 'panel results-panel' },
    el('p', { class: 'eyebrow' }, `Drawing by ${result.artistName}`),
    el('h2', {}, 'The real prompt was'),
    el('div', { class: 'prompt' }, result.correctAnswer),
    breakdown
  );
}

function renderScores(scores: ScoreEntry[]): HTMLElement {
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
  return el('section', { class: 'panel scores-panel' }, el('div', { class: 'panel-title' }, 'Scores'), list);
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
  return el(
    'main',
    { class: `app-shell ${role}` },
    el(
      'header',
      { class: 'topbar' },
      el('div', {}, el('div', { class: 'brand' }, title), snapshot ? el('div', { class: 'phase' }, phaseLabel(snapshot.phase)) : null),
      el('div', { class: 'connection', id: 'connection-text' }, status)
    ),
    errorMessage ? el('div', { class: 'error' }, errorMessage) : null,
    child
  );
}

function updateDynamicText(): void {
  updateConnectionText();
  updatePromptText();
  updateDeadlineText();
  updateDrawingBytes();
}

function updateConnectionText(): void {
  const node = document.querySelector('#connection-text');
  if (node) {
    node.textContent = status;
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
    });
    return;
  }
  const remaining = Math.max(0, snapshot.deadlineMs - Date.now());
  const seconds = Math.ceil(remaining / 1000);
  const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  nodes.forEach((node) => {
    node.textContent = label;
  });
}

function updateDrawingBytes(): void {
  const node = document.querySelector('#drawing-bytes');
  if (node && drawingPad) {
    node.textContent = `${Math.round(estimateDrawingBytes(drawingPad.getDrawing()) / 1024)}KB vector payload`;
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

window.setInterval(updateDeadlineText, 250);

if (role === 'display') {
  connect();
} else {
  render();
}
