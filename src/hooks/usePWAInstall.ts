import { useEffect, useState, useCallback } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode
    if (typeof window === 'undefined') return;

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      document.referrer.includes('android-app://');

    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua);
    const isAndroidDevice = /android/.test(ua);
    const inApp = /fbav|fban|instagram|messenger|line|tiktok|micromessenger/i.test(ua);

    setIsIOS(isIosDevice);
    setIsAndroid(isAndroidDevice);
    setIsInAppBrowser(inApp);

    // Automatic popup: if the user browses the website and has not installed the app,
    // automatically trigger the install & add to home screen modal
    let autoPopupTimer: NodeJS.Timeout | null = null;
    if (!isStandalone) {
      // Small timeout to allow the webpage UI and branding to smoothly load first
      autoPopupTimer = setTimeout(() => {
        setIsModalOpen(true);
      }, 1000);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Automatically pop up modal when browser signals PWA install readiness
      if (!isStandalone) {
        setIsModalOpen(true);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setIsModalOpen(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      if (autoPopupTimer) clearTimeout(autoPopupTimer);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
          setDeferredPrompt(null);
          setIsModalOpen(false);
          return true;
        }
      } catch (err) {
        console.error('Error invoking deferred install prompt:', err);
      }
      return false;
    }
    // If no direct prompt is ready (e.g. iOS Safari, desktop or already fired), open modal guide
    setIsModalOpen(true);
    return false;
  }, [deferredPrompt]);

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    isAndroid,
    isInAppBrowser,
    isModalOpen,
    setIsModalOpen,
    triggerInstall,
  };
}
