import { ArrowRight, RotateCcw } from 'lucide';
import { Button } from './Button';
import { GlassPanel } from './GlassPanel';

interface HostAdvanceControlsProps {
  label: 'Continue' | 'Play Again';
  onAdvance: () => void;
  disabled?: boolean;
  hint?: string;
}

export function HostAdvanceControls({
  label,
  onAdvance,
  disabled = false,
  hint
}: HostAdvanceControlsProps): React.JSX.Element {
  return (
    <GlassPanel className={`advance-panel${label === 'Play Again' ? ' encore-panel' : ''}`} tone="soft">
      <p className="eyebrow">Host controls</p>
      <Button
        className="spotlight-button"
        wide
        icon={label === 'Play Again' ? RotateCcw : ArrowRight}
        disabled={disabled}
        onClick={onAdvance}
      >
        {label}
      </Button>
      {hint ? <p className="muted">{hint}</p> : null}
    </GlassPanel>
  );
}
