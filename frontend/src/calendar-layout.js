export const HOUR_HEIGHT = 80;
export const MIN_EVENT_HEIGHT = 18;
// Fractional zoom scales can leave touching edges a few floating-point bits apart.
const EDGE_EPSILON = 1e-7;

export function splitDayEvents(events, day, hourHeight = HOUR_HEIGHT) {
  const end = new Date(day);
  end.setDate(end.getDate() + 1);
  const minutes = (date) =>
    date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  return events
    .filter(
      (event) =>
        new Date(event.starts_at) < end && new Date(event.ends_at) > day,
    )
    .map((event) => {
      const startAt = new Date(event.starts_at),
        endAt = new Date(event.ends_at);
      const startMinute = startAt < day ? 0 : minutes(startAt);
      const endMinute = endAt >= end ? 1440 : minutes(endAt);
      const top = Math.min(
        (startMinute * hourHeight) / 60,
        24 * hourHeight - MIN_EVENT_HEIGHT,
      );
      const height = Math.min(
        Math.max(
          MIN_EVENT_HEIGHT,
          ((endMinute - startMinute) * hourHeight) / 60,
        ),
        24 * hourHeight - top,
      );
      return {
        ...event,
        top,
        height,
        continuesBefore: startAt < day,
        continuesAfter: endAt > end,
      };
    });
}

export function layoutDayEvents(events, day, hourHeight = HOUR_HEIGHT) {
  const sorted = splitDayEvents(events, day, hourHeight).sort(
    (a, b) =>
      a.top - b.top ||
      b.height - a.height ||
      String(a.id).localeCompare(String(b.id)),
  );
  let group = [],
    laneEnds = [],
    groupEnd = -1;
  const result = [];
  const flush = () => {
    for (const event of group)
      result.push({ ...event, columns: laneEnds.length });
    group = [];
    laneEnds = [];
    groupEnd = -1;
  };
  for (const event of sorted) {
    if (event.top + EDGE_EPSILON >= groupEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= event.top + EDGE_EPSILON);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = event.top + event.height;
    groupEnd = Math.max(groupEnd, laneEnds[lane]);
    group.push({ ...event, lane });
  }
  flush();
  return result;
}
