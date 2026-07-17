import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  wide?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  wide = false,
  className = '',
  children,
  ...rest
}: ButtonProps): React.JSX.Element {
  const classes = [
    'btn',
    `btn--${variant}`,
    variant === 'primary' ? 'primary' : '',
    wide ? 'btn--wide wide' : '',
    className
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}
