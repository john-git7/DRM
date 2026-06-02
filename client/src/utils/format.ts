const SIZE_UNITS = ['Bytes', 'KB', 'MB', 'GB'] as const;

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${SIZE_UNITS[i]}`;
}

export function formatDate(
  dateStr: string,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(undefined, options);
}
