import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

interface FieldProps {
  label: string;
  children: ReactNode;
  hideLabel?: boolean;
}

export function Field({ label, children, hideLabel = false }: FieldProps): React.JSX.Element {
  return (
    <label className="field">
      <span className={hideLabel ? 'field-label visually-hidden' : 'field-label'}>{label}</span>
      {children}
    </label>
  );
}

export function TextInput({
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input className={['input', 'field-input', className].filter(Boolean).join(' ')} {...rest} />;
}

export function TextSelect({
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return (
    <select className={['input', 'compact-input', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </select>
  );
}
