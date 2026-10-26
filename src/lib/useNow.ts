import { useEffect, useState } from 'react';

export function useNow(active = true, interval = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(id);
  }, [active, interval]);
  return now;
}
