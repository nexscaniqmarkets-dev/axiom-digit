import { useEffect, useState } from 'react';

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready(): void;
        expand(): void;
        close(): void;
        initData: string;
        initDataUnsafe: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
          };
        };
        themeParams: {
          bg_color?: string;
          text_color?: string;
          hint_color?: string;
          button_color?: string;
          button_text_color?: string;
        };
        colorScheme: 'light' | 'dark';
        viewportHeight: number;
        viewportStableHeight: number;
        isExpanded: boolean;
        MainButton: {
          text: string;
          color: string;
          textColor: string;
          isVisible: boolean;
          isActive: boolean;
          show(): void;
          hide(): void;
          setText(text: string): void;
          onClick(fn: () => void): void;
          offClick(fn: () => void): void;
        };
        BackButton: {
          isVisible: boolean;
          show(): void;
          hide(): void;
          onClick(fn: () => void): void;
        };
        HapticFeedback: {
          impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
          notificationOccurred(type: 'error' | 'success' | 'warning'): void;
          selectionChanged(): void;
        };
        onEvent(eventType: string, fn: () => void): void;
        offEvent(eventType: string, fn: () => void): void;
        setHeaderColor(color: string): void;
        setBackgroundColor(color: string): void;
      };
    };
  }
}

export function useTelegram() {
  const tg = window.Telegram?.WebApp;
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!tg) {
      // Running outside Telegram (browser dev mode) - that's fine
      setIsReady(true);
      return;
    }

    // Tell Telegram the app is ready (hides loading spinner)
    tg.ready();
    // Expand to full height
    tg.expand();
    // Set dark header to match app theme
    tg.setHeaderColor('#0f172a');
    tg.setBackgroundColor('#0f172a');

    setIsReady(true);
  }, []);

  return {
    tg,
    isReady,
    user: tg?.initDataUnsafe?.user ?? null,
    colorScheme: tg?.colorScheme ?? 'dark',
    haptic: tg?.HapticFeedback ?? null,
    isInsideTelegram: !!tg,
  };
}
