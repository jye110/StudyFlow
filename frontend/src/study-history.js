export function studyHistory(sessions, instant, days = 7) {
  const today = new Date(instant);
  today.setHours(0, 0, 0, 0);
  const first = new Date(today);
  first.setDate(first.getDate() - days + 1);
  const completed = sessions.filter((s) => s.outcome === "completed")
    .map((s) => ({ start: new Date(s.starts_at).getTime(), end: new Date(s.starts_at).getTime() + s.minutes * 60000 }))
    .filter((s) => s.end <= instant);
  const daily = Array.from({ length: days }, (_, index) => {
    const start = new Date(first);
    start.setDate(start.getDate() + index);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end, minutes: completed.reduce((sum, s) =>
      sum + Math.max(0, Math.min(s.end, end.getTime()) - Math.max(s.start, start.getTime())) / 60000, 0) };
  });
  if (days === 7) return daily;
  // Calendar weeks run Monday–Sunday, clipped to the selected 30-day range.
  const weeks = [];
  for (const day of daily) {
    if (!weeks.length || day.start.getDay() === 1) weeks.push({ ...day });
    else {
      weeks.at(-1).end = day.end;
      weeks.at(-1).minutes += day.minutes;
    }
  }
  return weeks;
}

export function studyChartScale(maximum) {
  const step = [15, 30, 60, 120, 240, 480, 960, 1920].find((value) => value * 4 >= maximum)
    || Math.ceil(maximum / 240) * 60;
  return { maximum: step * 4, ticks: [0, step, step * 2, step * 3, step * 4] };
}
