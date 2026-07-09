import React from 'react';
import { useStore } from '../../../store/useStore';
import { CalendarClock, Clock, Mail, Send, Trash2 } from 'lucide-react';
import { AppDateTimePicker } from '../../../components/Shared/AppDateTimePicker';
import { AppSelect } from '../../../components/Shared/AppSelect';

export const ScheduleReportModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const sendReportEmailNow = useStore(s => s.sendReportEmailNow);
  const reportSchedules = useStore(s => s.reportSchedules);
  const createReportSchedule = useStore(s => s.createReportSchedule);
  const deleteReportSchedule = useStore(s => s.deleteReportSchedule);
  const fetchReportSchedules = useStore(s => s.fetchReportSchedules);
  const currentUser = useStore(s => s.currentUser);

  const [scheduleType, setScheduleType] = React.useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [time, setTime] = React.useState('09:00');
  const [dayOfWeek, setDayOfWeek] = React.useState(1);
  const [dayOfMonth, setDayOfMonth] = React.useState(1);
  const [saving, setSaving] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      fetchReportSchedules();
    }
  }, [open, fetchReportSchedules]);

  if (!open || currentUser?.role !== 'Admin') return null;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const frequencyOptions = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' }
  ];
  const dayOfWeekOptions = dayNames.map((name, index) => ({
    value: String(index),
    label: name
  }));
  const dayOfMonthOptions = Array.from({ length: 28 }, (_, index) => ({
    value: String(index + 1),
    label: String(index + 1)
  }));

  const formatNextRun = (value: string) => (
    new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value))
  );

  const handleSave = async () => {
    setSaving(true);
    const saved = await createReportSchedule({
      schedule_type: scheduleType,
      time_of_day: time,
      day_of_week: scheduleType === 'weekly' ? dayOfWeek : undefined,
      day_of_month: scheduleType === 'monthly' ? dayOfMonth : undefined
    });
    setSaving(false);
    if (saved) {
      fetchReportSchedules();
    }
  };

  const handleSendNow = async () => {
    setSending(true);
    await sendReportEmailNow();
    setSending(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div style={{ width: '520px', maxWidth: '95%', background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Mail size={16} /> Report Email
          </h3>
          <button className="primary-btn" onClick={onClose} style={{ padding: '0.4rem 0.6rem' }}>Close</button>
        </div>

        {/* Send now */}
        <button
          className="primary-btn"
          onClick={handleSendNow}
          disabled={sending}
          style={{ width: '100%', marginBottom: '1rem', opacity: sending ? 0.7 : 1 }}
        >
          <Send size={16} />
          {sending ? 'Sending...' : 'Send Report to Admins Now'}
        </button>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <h4 style={{ margin: '0 0 1rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={14} /> Schedule Recurring Delivery
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-4)', display: 'block', marginBottom: '0.3rem' }}>Frequency</label>
              <AppSelect
                value={scheduleType}
                onChange={value => setScheduleType(value as 'daily' | 'weekly' | 'monthly')}
                options={frequencyOptions}
                fullWidth
              />
            </div>

            {scheduleType === 'weekly' && (
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-4)', display: 'block', marginBottom: '0.3rem' }}>Day of Week</label>
                <AppSelect
                  value={String(dayOfWeek)}
                  onChange={value => setDayOfWeek(Number(value))}
                  options={dayOfWeekOptions}
                  fullWidth
                />
              </div>
            )}

            {scheduleType === 'monthly' && (
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-4)', display: 'block', marginBottom: '0.3rem' }}>Day of Month</label>
                <AppSelect
                  value={String(dayOfMonth)}
                  onChange={value => setDayOfMonth(Number(value))}
                  options={dayOfMonthOptions}
                  fullWidth
                />
              </div>
            )}

            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-4)', display: 'block', marginBottom: '0.3rem' }}>Time</label>
              <AppDateTimePicker
                value={time}
                onChange={setTime}
                includeDate={false}
                includeTime
                placeholder="Select time"
              />
            </div>

            <button className="primary-btn" onClick={handleSave} disabled={saving} style={{ opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Save Schedule'}
            </button>
          </div>
        </div>

        {/* Existing schedules */}
        {reportSchedules.length > 0 && (
          <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--text-4)' }}>Active Schedules</h4>
            {reportSchedules.map(rs => (
              <div key={rs.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{rs.schedule_type}</span>
                  <span style={{ color: 'var(--text-4)', marginLeft: '0.5rem' }}>
                    at {rs.time_of_day.slice(0, 5)}
                    {rs.schedule_type === 'weekly' && ` on ${dayNames[rs.day_of_week ?? 0]}`}
                    {rs.schedule_type === 'monthly' && ` on day ${rs.day_of_month}`}
                  </span>
                  <div style={{ color: 'var(--text-4)', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <CalendarClock size={13} />
                    Next: {formatNextRun(rs.next_run_at)}
                  </div>
                </div>
                <button
                  onClick={() => deleteReportSchedule(rs.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-4)', padding: '0.25rem' }}
                  title="Delete schedule"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ScheduleReportModal;
