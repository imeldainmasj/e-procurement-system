import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'corporate' | 'business';

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
}

const prefersDark =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: prefersDark ? 'business' : 'corporate',
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === 'corporate' ? 'business' : 'corporate' })),
    }),
    { name: 'sipita-theme' },
  ),
);

// Keep <html data-theme> in sync on every page, including /login.
function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', theme);
}
applyTheme(useThemeStore.getState().theme);
useThemeStore.subscribe((state) => applyTheme(state.theme));
