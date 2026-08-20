export {};

declare global {
  interface Window {
    electronAPI?: {
      updateSettings: (settings: any) => Promise<void>;
      quitApp: () => void;
    };
  }
}
