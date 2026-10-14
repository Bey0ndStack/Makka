export const market = {
  currency: "EGP",
  timeZone: "Africa/Cairo",
  arabicLocale: "ar-EG",
  englishLocale: "en-EG"
} as const;

function calendarParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

export function startOfDayInTimeZone(date: Date, timeZone = market.timeZone) {
  const current = calendarParts(date, timeZone);
  const wallClockAtStartOfDay = Date.UTC(current.year, current.month - 1, current.day);
  let candidate = wallClockAtStartOfDay;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const local = calendarParts(new Date(candidate), timeZone);
    const wallClock = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    candidate = wallClockAtStartOfDay - (wallClock - candidate);
  }

  return new Date(candidate);
}

export function calendarDayOffset(date: Date, offset: number, timeZone = market.timeZone) {
  const current = calendarParts(date, timeZone);
  const targetCalendarDate = new Date(Date.UTC(current.year, current.month - 1, current.day + offset, 12));
  return startOfDayInTimeZone(targetCalendarDate, timeZone);
}

export function startOfMonthInTimeZone(date: Date, timeZone = market.timeZone) {
  const current = calendarParts(date, timeZone);
  return startOfDayInTimeZone(new Date(Date.UTC(current.year, current.month - 1, 1, 12)), timeZone);
}

export function startOfNextMonthInTimeZone(date: Date, timeZone = market.timeZone) {
  const current = calendarParts(date, timeZone);
  return startOfDayInTimeZone(new Date(Date.UTC(current.year, current.month, 1, 12)), timeZone);
}
