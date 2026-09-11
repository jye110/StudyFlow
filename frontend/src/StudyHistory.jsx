import { useState } from "react";
import { formatMinutes } from "./components";
import { useCurrentTime } from "./session-status";
import { studyHistory, studyChartScale } from "./study-history";

const shortDate = (date) => date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const lastDate = (bucket) => new Date(bucket.end.getTime() - 1);
const bucketLabel = (bucket, days) => days === 7
  ? bucket.start.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
  : `${shortDate(bucket.start)} – ${shortDate(lastDate(bucket))}`;

export function StudyHistory({ sessions }) {
  const [days, setDays] = useState(7);
  const [selected, setSelected] = useState(null);
  const instant = useCurrentTime();
  const buckets = studyHistory(sessions, instant, days);
  const total = buckets.reduce((sum, bucket) => sum + bucket.minutes, 0);
  const scale = studyChartScale(Math.max(...buckets.map((bucket) => bucket.minutes)));
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time";
  const chosen = buckets.find((bucket) => bucket.start.getTime() === selected);
  return (
    <section className="panel study-history" aria-labelledby="study-history-title">
      <header className="panel-heading">
        <div>
          <h2 id="study-history-title">Study time</h2>
          <p>Confirmed completed sessions · {zone.replaceAll("_", " ")}</p>
        </div>
        <div className="study-history-switch" role="group" aria-label="Study history range">
          {[7, 30].map((count) => (
            <button key={count} type="button" aria-pressed={days === count}
              onClick={() => { setDays(count); setSelected(null); }}>Last {count} days</button>
          ))}
        </div>
      </header>
      <div className="study-history-summary">
        <strong data-testid="study-history-total">{formatMinutes(total)}</strong>
        <span>{shortDate(buckets[0].start)} – {shortDate(lastDate(buckets.at(-1)))} · {days === 7 ? "Daily totals" : "Weekly totals (Mon–Sun)"}</span>
      </div>
      <div className="study-history-scroll">
        <div className="study-history-chart" style={{ "--bar-count": buckets.length }}>
          <div className="study-history-axis" aria-hidden="true">
            {scale.ticks.map((value) => <span key={value} style={{ bottom: `${value / scale.maximum * 100}%` }}>{formatMinutes(value)}</span>)}
          </div>
          <div>
            <div className="study-history-bars" role="group" aria-label={days === 7 ? "Daily study time" : "Weekly study time"}>
              {buckets.map((bucket) => (
                <button key={bucket.start.getTime()} type="button" className="study-history-bar"
                  style={{ "--bar-height": `${bucket.minutes / scale.maximum * 100}%` }}
                  aria-label={`${bucketLabel(bucket, days)}: ${formatMinutes(bucket.minutes)}`}
                  aria-pressed={selected === bucket.start.getTime()}
                  title={`${bucketLabel(bucket, days)}: ${formatMinutes(bucket.minutes)}`}
                  onClick={() => setSelected(bucket.start.getTime())}>
                  <span className="study-history-fill" style={{ minHeight: bucket.minutes ? 3 : 0 }} />
                  <span className="study-history-value">{formatMinutes(bucket.minutes)}</span>
                </button>
              ))}
            </div>
            <div className="study-history-labels" aria-hidden="true">
              {buckets.map((bucket) => <span key={bucket.start.getTime()}>
                {days === 7 ? bucket.start.toLocaleDateString(undefined, { weekday: "short" }) : shortDate(bucket.start)}
                <small>{days === 7 ? shortDate(bucket.start) : `– ${shortDate(lastDate(bucket))}`}</small>
              </span>)}
            </div>
          </div>
        </div>
      </div>
      <p className="study-history-note" aria-live="polite">
        {chosen ? `${bucketLabel(chosen, days)}: ${formatMinutes(chosen.minutes)} confirmed study.`
          : total ? "Select a bar for details." : "No confirmed study in this period. Confirm completed sessions in Schedule to see your study time here."}
        {days === 30 && " First and last weeks include only dates within this 30-day period."}
      </p>
    </section>
  );
}
