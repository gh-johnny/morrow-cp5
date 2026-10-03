import { create } from 'zustand';
type Runtime = {
  blackout: boolean; online: boolean; pending: number; syncing: boolean; syncError: string | null;
  theme: 'dark' | 'light'; biometric: boolean; locked: boolean; toast: string | null;
  set: (value: Partial<Omit<Runtime, 'set' | 'reset'>>) => void; reset: () => void;
};
const initial = { blackout: false, online: true, pending: 0, syncing: false, syncError: null,
  theme: 'dark' as const, biometric: false, locked: false, toast: null };
export const useRuntime = create<Runtime>((set) => ({ ...initial, set, reset: () => set(initial) }));
export function notify(message: string) {
  useRuntime.getState().set({ toast: message });
  setTimeout(() => { if (useRuntime.getState().toast === message) useRuntime.getState().set({ toast: null }); }, 4000);
}
