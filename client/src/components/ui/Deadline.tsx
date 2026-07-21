import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../app/GameProvider';
import {
  deadlineUrgencyText,
  nextUrgentDeadlineAnnouncement
} from '../../deadline-urgency';

export function Deadline(): React.JSX.Element {
  const { snapshot, deadlineLabel, deadlineUrgent } = useGame();
  const announcedKeyRef = useRef('');
  const [announcement, setAnnouncement] = useState('');
  const urgencyText = deadlineUrgencyText(deadlineLabel, deadlineUrgent);

  useEffect(() => {
    const next = nextUrgentDeadlineAnnouncement(
      snapshot?.roomCode ?? '',
      snapshot?.turnToken ?? 0,
      deadlineLabel,
      deadlineUrgent,
      announcedKeyRef.current
    );
    announcedKeyRef.current = next.announcedKey;
    setAnnouncement(next.text);
  }, [deadlineUrgent, snapshot?.roomCode, snapshot?.turnToken]);

  return (
    <div
      className={`deadline${deadlineUrgent ? ' is-urgent deadline-warn' : ''}`}
      id="deadline-text"
    >
      <span>{deadlineLabel}</span>
      {urgencyText ? <span className="deadline-urgency"> · {urgencyText}</span> : null}
      <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </div>
  );
}
