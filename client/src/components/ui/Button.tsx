import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { IconNode } from 'lucide';
import { LucideIcon } from './LucideIcon';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  wide?: boolean;
  icon?: IconNode;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  wide = false,
  icon,
  className = '',
  children,
  ...rest
}: ButtonProps): React.JSX.Element {
  const classes = ['btn', `btn--${variant}`, wide ? 'btn--wide' : '', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} {...rest}>
      {icon ? <LucideIcon icon={icon} /> : null}
      {children}
    </button>
  );
}
