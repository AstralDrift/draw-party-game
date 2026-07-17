import { useGame } from '../../app/GameProvider';

export function Deadline(): React.JSX.Element {
  const { deadlineLabel, deadlineUrgent } = useGame();
  return (
    <div
      className={`deadline${deadlineUrgent ? ' is-urgent deadline-warn' : ''}`}
      id="deadline-text"
    >
      {deadlineLabel}
    </div>
  );
}
