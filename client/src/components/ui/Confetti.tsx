interface ConfettiProps {
  variant?: 'result' | 'final';
}

export function Confetti({ variant = 'result' }: ConfettiProps): React.JSX.Element {
  return (
    <div className={`confetti confetti-${variant}`} aria-hidden="true">
      {Array.from({ length: 18 }, (_, index) => (
        <span key={index} className={`confetti-piece piece-${(index % 6) + 1}`} />
      ))}
    </div>
  );
}
