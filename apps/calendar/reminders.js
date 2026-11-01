import * as S from '../../core/storage/storage.js';
import { occurrences } from '../../core/utilities/recurrence.js';
import { addDays } from '../../core/utilities/dates.js';
// Reminders only fire while a Dr3amy tab is open: static sites have no background push.
export function startReminders(ctx) {
  const fired = new Set();
  const tick = async () => {
    try {
      const now = new Date(), from = new Date(now - 3600000), to = addDays(now, 2);
      for (const r of await S.allDocs()) {
        if (r.doc.$type !== 'calendar') continue;
        for (const ev of r.doc.data.events) {
          if (ev.reminder == null) continue;
          for (const o of occurrences(ev, from, to)) {
            const fire = o.start.getTime() - ev.reminder * 60000, key = ev.id + o.start.getTime();
            if (now >= fire && now - fire < 600000 && !fired.has(key)) {
              fired.add(key);
              const msg = `${ev.title} — ${ev.allDay ? 'all day' : o.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
              ctx.toast('Reminder: ' + msg);
              if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification('Dr3amy', { body: msg });
            }
          }
        }
      }
    } catch {}
  };
  tick(); setInterval(tick, 30000);
}
