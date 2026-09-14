/**
 * Reminder notifications via Capacitor LocalNotifications on iOS/Android.
 * Browser dev fallback uses the Notification API when available.
 */
import { Capacitor } from '@capacitor/core';

let localNotifications: any = null;

async function getLocalNotifications(): Promise<any> {
  if (localNotifications) return localNotifications;
  if (!Capacitor.isNativePlatform()) return null;
  const mod = await import('@capacitor/local-notifications');
  localNotifications = mod.LocalNotifications;
  return localNotifications;
}

export async function requestPermissions(): Promise<'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' | 'unknown'> {
  if (!Capacitor.isNativePlatform()) return 'unknown';
  const LN = await getLocalNotifications();
  if (!LN) return 'unknown';
  const status = await LN.requestPermissions();
  return status.receive;
}

export async function scheduleReminder(text: string, scheduledFor: Date): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    // Browser dev: use Notification API if permitted
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Askeo Reminder', { body: text });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
      const granted = await Notification.requestPermission();
      if (granted === 'granted') {
        new Notification('Askeo Reminder', { body: text });
      }
    }
    return `web-${Date.now()}`;
  }

  const LN = await getLocalNotifications();
  const id = `askeo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const now = new Date();
  const diffMs = scheduledFor.getTime() - now.getTime();

  const base: any = {
    id,
    title: 'Askeo Reminder',
    body: text,
    sound: 'default',
    attachments: [],
    actionTypeId: '',
    extra: {},
  };

  if (diffMs <= 0) {
    // Due right now — fire immediately
    await LN.schedule({ notifications: [{ ...base, schedule: false }] });
  } else {
    await LN.schedule({
      notifications: [
        {
          ...base,
          trigger: {
            type: 'date',
            value: scheduledFor.toISOString(),
          },
        },
      ],
    });
  }

  return id;
}

export async function cancelReminder(id: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const LN = await getLocalNotifications();
  if (!LN) return;
  await LN.cancel({ notifications: [{ id }] });
}

export async function cancelAllReminders(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const LN = await getLocalNotifications();
  if (!LN) return;
  await LN.cancelAll();
}
