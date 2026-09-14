import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { cancelReminder, fireDueReminders } from '../services/reminderService';

interface Reminder {
  id: number;
  text: string;
  scheduled_for: string;
  triggered: number;
}

interface Props {
  onBack: () => void;
  onAdd: () => void;
}

export default function RemindersScreen({ onBack, onAdd }: Props) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReminders = useCallback(async () => {
    try {
      const data = await api.getReminders();
      setReminders(data);
      // Fire any that are due but weren't triggered
      const due = data.filter((r: Reminder) => !r.triggered && new Date(r.scheduled_for) <= new Date());
      if (due.length > 0) {
        fireDueReminders(due);
        // Mark them as triggered server-side
        for (const r of due) {
          api.markReminderTriggered(r.id).catch(() => {});
        }
        setReminders(prev => prev.map((r: Reminder) => due.find((d: Reminder) => d.id === r.id) ? { ...r, triggered: 1 } : r));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load reminders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReminders();
  }, [loadReminders]);

  const handleDelete = async (reminder: Reminder) => {
    try {
      await api.deleteReminder(reminder.id);
      await cancelReminder(String(reminder.id));
      setReminders(prev => prev.filter(r => r.id !== reminder.id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete reminder');
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  };

  if (loading) return <div className="text-center text-slate-400 py-10">Loading reminders...</div>;

  const active = reminders.filter(r => !r.triggered);
  const triggered = reminders.filter(r => r.triggered);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col safe-top safe-bottom">
      <header className="border-b border-slate-800/80 px-5 py-3 flex items-center justify-between sticky top-0 bg-slate-950/90 backdrop-blur-md z-10 safe-top">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-1.5 py-1 rounded-lg hover:bg-slate-800/50"
          >
            Back
          </button>
          <h1 className="text-lg font-bold">Reminders</h1>
        </div>
        <button
          onClick={loadReminders}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50"
        >
          Refresh
        </button>
      </header>

      {error && (
        <div className="px-5 py-3 bg-red-950/40 border-b border-red-800/60 text-red-300 text-sm">
          {error}
        </div>
      )}

      {reminders.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-5">
          <div className="text-center max-w-xs">
            <div className="text-4xl mb-4">🔔</div>
            <h2 className="text-lg font-semibold text-slate-200 mb-1">No reminders yet</h2>
            <p className="text-sm text-slate-500 mb-4">
              Add a reminder and we'll notify you on your phone at the right time.
            </p>
            <NavLink
              onClick={(e) => { e.preventDefault(); onAdd(); }}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 active:scale-[0.98] transition-all"
            >
              <PlusIcon /> Add Reminder
            </NavLink>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 pb-20">
          {active.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-2">Pending</div>
              {active.map(r => (
                <div key={r.id} className="rounded-2xl border border-slate-700 bg-slate-900 p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{r.text}</p>
                    <p className="text-xs text-slate-500 mt-1">{formatTime(r.scheduled_for)}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(r)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/30 transition-colors shrink-0"
                    title="Delete reminder"
                  >
                    <XIcon />
                  </button>
                </div>
              ))}
            </div>
          )}

          {triggered.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-2">Completed</div>
              {triggered.map(r => (
                <div key={r.id} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 opacity-60">
                  <div className="flex items-center gap-3">
                    <CheckIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-500 line-through truncate">{r.text}</p>
                      <p className="text-xs text-slate-600 mt-1">{formatTime(r.scheduled_for)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20">
        <button
          onClick={onAdd}
          className="flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 hover:bg-indigo-500 active:scale-95 transition-all"
        >
          <PlusIcon /> Add Reminder
        </button>
      </div>
    </div>
  );
}

function NavLink({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <span className={className} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', textDecoration: 'none' }}>
      {children}
    </span>
  );
}

function PlusIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function XIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CheckIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
