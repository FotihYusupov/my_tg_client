export function normalizeTelegramDate(date: any): Date {
  if (!date) return new Date();
  if (typeof date === 'number') {
    // If the timestamp is in seconds, convert to milliseconds (Telegram values are in seconds)
    // 5,000,000,000 corresponds to the year 2128, anything lower is definitely seconds.
    return new Date(date < 5000000000 ? date * 1000 : date);
  }
  if (date instanceof Date) return date;
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function calculateDiffMinutes(date1: Date, date2: Date): number {
  const t1 = date1 instanceof Date ? date1.getTime() : new Date(date1).getTime();
  const t2 = date2 instanceof Date ? date2.getTime() : new Date(date2).getTime();
  
  if (isNaN(t1) || isNaN(t2)) return 0;
  
  const diffMs = Math.abs(t1 - t2);
  return diffMs / (60 * 1000);
}

export function safeDate(date: any): Date {
  if (!date) return new Date();
  if (date instanceof Date) return date;
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}
