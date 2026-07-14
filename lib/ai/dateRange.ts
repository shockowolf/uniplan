export type DateRange = {
  label: string;
  from: Date;
  to: Date;
};

const demoToday = new Date('2026-05-03T00:00:00.000Z');

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date: Date, months: number) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
}

function startOfYear(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

function addDays(date: Date, days: number) {
  const shiftedDate = new Date(date);
  shiftedDate.setUTCDate(shiftedDate.getUTCDate() + days);
  return shiftedDate;
}

export function parseDateRange(message: string, now = demoToday): DateRange {
  const normalized = message.replace(/\s+/g, '').toLowerCase();

  if (normalized.includes('지난달') || normalized.includes('전월')) {
    const thisMonth = startOfMonth(now);
    return {
      label: '지난달',
      from: addMonths(thisMonth, -1),
      to: thisMonth,
    };
  }

  if (normalized.includes('최근30일') || normalized.includes('30일')) {
    return {
      label: '최근 30일',
      from: addDays(now, -29),
      to: addDays(now, 1),
    };
  }

  if (
    normalized.includes('최근7일') ||
    normalized.includes('일주일') ||
    normalized.includes('1주일')
  ) {
    return {
      label: '최근 7일',
      from: addDays(now, -6),
      to: addDays(now, 1),
    };
  }

  if (normalized.includes('올해') || normalized.includes('금년')) {
    return {
      label: '올해',
      from: startOfYear(now),
      to: addDays(now, 1),
    };
  }

  if (normalized.includes('오늘')) {
    return {
      label: '오늘',
      from: now,
      to: addDays(now, 1),
    };
  }

  return {
    label: '이번 달',
    from: startOfMonth(now),
    to: addMonths(startOfMonth(now), 1),
  };
}

export function serializeDateRange(range: DateRange) {
  return {
    label: range.label,
    dateFrom: range.from.toISOString(),
    dateTo: range.to.toISOString(),
  };
}

export function deserializeDateRange(
  params?: Record<string, string | number | boolean | null>,
): DateRange | null {
  const label = typeof params?.dateLabel === 'string' ? params.dateLabel : null;
  const dateFrom =
    typeof params?.dateFrom === 'string' ? params.dateFrom : null;
  const dateTo = typeof params?.dateTo === 'string' ? params.dateTo : null;
  if (!label || !dateFrom || !dateTo) return null;
  return { label, from: new Date(dateFrom), to: new Date(dateTo) };
}
