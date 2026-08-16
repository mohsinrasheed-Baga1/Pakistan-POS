// Global type declarations for the Electron preload bridge exposed via
// `window.posElectron`. The actual implementation lives in
// `electron/preload.cjs`.
export {};

declare global {
  interface GoogleDriveAPI {
    connect: () => Promise<{ ok: boolean; status?: any; error?: string }>;
    disconnect: () => Promise<{ ok: boolean; error?: string }>;
    status: () => Promise<{
      connected: boolean;
      configured: boolean;
      lastBackup: { id: string; name: string; size: number; date: string; cloud: boolean } | null;
      totalBackups: number;
    }>;
    backup: () => Promise<{ ok: boolean; fileId?: string; name?: string; size?: number; error?: string }>;
    listBackups: () => Promise<{ ok: boolean; backups: Array<{ id: string; name: string; size: string; createdTime: string }>; error?: string }>;
    restore: (fileId: string) => Promise<{ ok: boolean; message?: string; error?: string }>;
    // NEW: Auto-backup triggers (v2.10.4+)
    triggerBackup: (reason?: string) => Promise<{ ok: boolean; fileName?: string; size?: number; error?: string; reason?: string }>;
    getBackupStatus: () => Promise<{
      lastBackupAt: string | null;
      lastError: string | null;
      connected: boolean;
      nextScheduledIn: number;
    }>;
    onAutoBackupDone: (callback: (data: { ok: boolean; reason: string; fileName: string; size: number; timestamp: string }) => void) => () => void;
    onAutoBackupFailed: (callback: (data: { ok: boolean; reason: string; error: string; timestamp: string }) => void) => () => void;
  }

  interface UpdaterAPI {
    check: () => Promise<{
      version: string;
      releaseNotes?: string | null;
      releaseDate?: string;
      downloadSize?: number | null;
    } | null>;
    download: () => Promise<{ ok: boolean }>;
    install: () => Promise<void>;
    onProgress: (callback: (percent: number) => void) => () => void;
  }

  interface Window {
    posElectron?: {
      version: string;
      platform: string;
      openPath?: (p: string) => Promise<{ ok: boolean; opened?: string; error?: string }>;
      googleDrive?: GoogleDriveAPI;
      updater?: UpdaterAPI;
    };
  }
}
