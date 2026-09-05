import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Music2, Volume2, VolumeX } from 'lucide';
import { useGame } from '../../app/GameProvider';
import { type SoundMode } from '../../sound';
import { Button } from './Button';

const MODES: Array<{ mode: SoundMode; label: string }> = [
  { mode: 'off', label: 'Off' },
  { mode: 'effects', label: 'Effects' },
  { mode: 'full', label: 'Music + Effects' }
];

export function AudioControl() {
  const { audioMode, selectSoundMode } = useGame();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, right: 12 });
  const selected = MODES.find((entry) => entry.mode === audioMode) ?? MODES[0]!;

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const box = trigger.current?.getBoundingClientRect();
      if (box) setPosition({ top: Math.max(8, Math.min(box.bottom + 8, window.innerHeight - 200)), right: Math.max(12, window.innerWidth - box.right) });
    };
    place();
    menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target) && !menu.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
      if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const options = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
        const current = options.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 :
          (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options[next]?.focus();
      }
  };
  return (
    <div className="audio-control" ref={root} onKeyDown={onKeyDown}
      onBlur={(event) => { if (!root.current?.contains(event.relatedTarget) && !menu.current?.contains(event.relatedTarget)) setOpen(false); }}>
      <Button ref={trigger} variant="ghost" className="sound-toggle"
        icon={audioMode === 'off' ? VolumeX : audioMode === 'full' ? Music2 : Volume2}
        aria-label={`Game audio: ${selected.label}`} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((value) => !value)} />
      {open ? createPortal(
        <div ref={menu} className="audio-options" style={position} role="menu" aria-label="Game audio">
          {MODES.map((entry) => (
            <Button key={entry.mode} variant="ghost" role="menuitemradio"
              aria-checked={entry.mode === audioMode} onClick={() => {
                selectSoundMode(entry.mode); setOpen(false); trigger.current?.focus();
              }}>{entry.label}</Button>
          ))}
        </div>, document.body
      ) : null}
    </div>
  );
}
