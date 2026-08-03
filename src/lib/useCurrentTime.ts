import { useSyncExternalStore } from 'react';

let currentTime = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      currentTime = Date.now();
      listeners.forEach(activeListener => activeListener());
    }, 30000);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
};

const getSnapshot = () => currentTime;

export const useCurrentTime = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
