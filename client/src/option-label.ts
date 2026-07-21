const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

export function optionLabel(index: number): string {
  return OPTION_LABELS[index] ?? String(index + 1);
}
