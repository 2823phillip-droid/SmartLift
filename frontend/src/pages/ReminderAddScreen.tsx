import { useState } from 'react';
import { scheduleReminder } from '../services/reminderService';

interface Props {
  onSave: () => void;
}

export default function ReminderAddScreen({ onSave }: Props) {
  const [text, setText] = useState('');
  const [dateVal, setDateVal] = useState('');
  const [timeVal, setTimeVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Reminder text is required');
      return;
    }

    if (!dateVal || !timeVal) {
      setError('Date and time are required');
      return;
    }

    const scheduled = new Date(`${dateVal}T${timeVal}:00`);
    if (isNaN(scheduled.getTime())) {
      setError('Invalid date or time');
      return;
    }
    if (scheduled.getTime() <= Date.now()) {
      setError('Notification time must be in the future');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await scheduleReminder(trimmed, scheduled);
      onSave?.();
    } catch (err: any) {
      setError(err.message || 'Failed to schedule reminder');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col safe-top safe-bottom">
      <header className="border-b border-slate-800/80 px-5 py-3 flex items-center justify-between sticky top-0 bg-slate-950/90 backdrop-blur-md z-10 safe-top">
        <button
          onClick={onSave}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50"
        >
          Cancel
        </button>
        <h1 className="text-lg font-bold">New Reminder</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </header>

      {error && (
        <div className="px-5 py-3 bg-red-950/40 border-b border-red-800/60 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
        <div>
          <label className="block text-sm font-semibold text-slate-200 mb-2">What's the reminder?</label>
          <textarea
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 resize-none focus:outline-none focus:border-indigo-500"
            rows={3}
            placeholder="e.g. Take pre-workout, hydrate before session"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-200 mb-2">When?</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Date</label>
              <input
                type="date"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                value={dateVal}
                onChange={(e) => setDateVal(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Time</label>
              <input
                type="time"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                value={timeVal}
                onChange={(e) => setTimeVal(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-500">
            Your phone will notify you at the scheduled time, even if the app is closed.
            Notifications require iOS/Android local notification permission (granted automatically on first schedule).
          </p>
        </div>
      </div>
    </div>
  );
}
