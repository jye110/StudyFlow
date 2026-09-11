import { useEffect, useState } from "react";

export const sessionEnded = (session, instant) =>
  new Date(session.starts_at).getTime() + session.minutes * 60000 <= instant;

export function sessionStatus(session, instant) {
  if (session.outcome === "completed") return "Completed";
  if (session.outcome === "missed") return "Not completed";
  return sessionEnded(session, instant) ? "Needs confirmation" : "Planned";
}

export function useCurrentTime() {
  const [instant, setInstant] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setInstant(Date.now());
    const timer = setInterval(update, 15000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  return instant;
}
