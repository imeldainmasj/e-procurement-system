import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'velzon' | 'velzon-dark';

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
}

const prefersDark =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: prefersDark ? 'velzon-dark' : 'velzon',
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === 'velzon' ? 'velzon-dark' : 'velzon' })),
    }),
    {
      name: 'sipita-theme',
      version: 1,
      // v0 stored the old built-in themes (corporate / business).
      migrate: (persisted) => {
        const old = (persisted as { theme?: string } | undefined)?.theme;
        return { theme: old === 'business' ? 'velzon-dark' : 'velzon' } as ThemeState;
      },
    },
  ),
);

// Keep <html data-theme> in sync on every page, including /login.
function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme;
}
applyTheme(useThemeStore.getState().theme);
useThemeStore.subscribe((state) => applyTheme(state.theme));
