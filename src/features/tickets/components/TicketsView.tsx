import React from 'react';
import { CheckCircle2, Clock, Inbox, Send, Ticket, XCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AppDateTimePicker } from '../../../components/Shared/AppDateTimePicker';
import { AppSelect } from '../../../components/Shared/AppSelect';
import { formatDateTime } from '../../../lib/format';
import type { TaskPriority, TicketRequest, TicketStatus } from '../../../lib/supabase';
import { useStore } from '../../../store/useStore';

const PRIORITY_OPTIONS: { value: TaskPriority; color: string }[] = [
  { value: 'High', color: '#ef4444' },
  { value: 'Medium', color: '#f59e0b' },
  { value: 'Low', color: '#22c55e' }
];

const TICKET_STATUS_OPTIONS: { value: TicketStatus; label: string; color: string }[] = [
  { value: 'Open', label: 'Open', color: '#3b82f6' },
  { value: 'In Review', label: 'In Review', color: '#f59e0b' },
  { value: 'Approved', label: 'Approved', color: '#22c55e' },
  { value: 'Rejected', label: 'Rejected', color: '#ef4444' }
];

export const TicketsView: React.FC = () => {
  const currentUser = useStore(s => s.currentUser);
  const profiles = useStore(s => s.profiles);
  const categories = useStore(s => s.categories);
  const ticketRequests = useStore(s => s.ticketRequests);
  const createTicketRequest = useStore(s => s.createTicketRequest);
  const fetchTicketRequests = useStore(s => s.fetchTicketRequests);
  const updateTicketRequestStatus = useStore(s => s.updateTicketRequestStatus);
  const setAlertData = useStore(s => s.setAlertData);

  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [priority, setPriority] = React.useState<TaskPriority>('Medium');
  const [category, setCategory] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (currentUser?.role === 'Admin') fetchTicketRequests();
  }, [currentUser?.role, fetchTicketRequests]);

  if (!currentUser) return null;

  const selectedPriorityColor = PRIORITY_OPTIONS.find(option => option.value === priority)?.color || '#f59e0b';
  const selectedCategoryColor = categories.find(option => option.name === category)?.color || '#818cf8';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;

    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      setAlertData({ message: 'End date cannot be before the start date.', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    const created = await createTicketRequest({
      title: title.trim(),
      description: description.trim() || null,
      priority,
      category: category || null,
      start_date: startDate || null,
      end_date: endDate || null
    });
    setIsSubmitting(false);

    if (created) {
      setTitle('');
      setDescription('');
      setPriority('Medium');
      setCategory('');
      setStartDate('');
      setEndDate('');
    }
  };

  if (currentUser.role !== 'Admin') {
    return (
      <div className="animate-fadeIn">
        <TicketsHeader title="Request a Ticket" subtitle="Send a task-shaped request to the admin team." />
        <div className="modal-grid" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
          <TicketForm
            title={title}
            description={description}
            priority={priority}
            category={category}
            startDate={startDate}
            endDate={endDate}
            categories={categories}
            isSubmitting={isSubmitting}
            selectedPriorityColor={selectedPriorityColor}
            selectedCategoryColor={selectedCategoryColor}
            onSubmit={handleSubmit}
            setTitle={setTitle}
            setDescription={setDescription}
            setPriority={setPriority}
            setCategory={setCategory}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
          />
          <TicketPreview
            title={title}
            description={description}
            priority={priority}
            category={category}
            startDate={startDate}
            endDate={endDate}
            priorityColor={selectedPriorityColor}
            categoryColor={selectedCategoryColor}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <TicketsHeader title="Tickets" subtitle="Requests submitted by users for admin review." />
      {ticketRequests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)' }}>
          <Inbox size={28} style={{ color: 'var(--text-4)', opacity: 0.55, marginBottom: '1rem' }} />
          <h3 style={{ color: 'var(--text-2)', fontSize: '1.05rem' }}>No ticket requests</h3>
          <p style={{ color: 'var(--text-4)', fontSize: '0.85rem', marginTop: '0.35rem' }}>New user requests will appear here.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {ticketRequests.map(ticket => (
            <AdminTicketCard
              key={ticket.id}
              ticket={ticket}
              requesterName={profiles.find(profile => profile.id === ticket.requester_id)?.full_name || 'Unknown'}
              categoryColor={categories.find(cat => cat.name === ticket.category)?.color || '#64748b'}
              onStatusChange={status => updateTicketRequestStatus(ticket.id, status)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const TicketsHeader = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <header style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
    <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Ticket size={18} style={{ color: 'var(--primary)' }} />
    </div>
    <div>
      <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-1)' }}>{title}</h1>
      <p style={{ color: 'var(--text-4)', fontSize: '0.85rem' }}>{subtitle}</p>
    </div>
  </header>
);

const TicketForm = ({
  title,
  description,
  priority,
  category,
  startDate,
  endDate,
  categories,
  isSubmitting,
  selectedPriorityColor,
  selectedCategoryColor,
  onSubmit,
  setTitle,
  setDescription,
  setPriority,
  setCategory,
  setStartDate,
  setEndDate
}: {
  title: string;
  description: string;
  priority: TaskPriority;
  category: string;
  startDate: string;
  endDate: string;
  categories: { id: string; name: string; color: string }[];
  isSubmitting: boolean;
  selectedPriorityColor: string;
  selectedCategoryColor: string;
  onSubmit: (event: React.FormEvent) => void;
  setTitle: (value: string) => void;
  setDescription: (value: string) => void;
  setPriority: (value: TaskPriority) => void;
  setCategory: (value: string) => void;
  setStartDate: (value: string) => void;
  setEndDate: (value: string) => void;
}) => (
  <form onSubmit={onSubmit} style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.35rem' }}>
    <div>
      <label style={labelStyle}>Ticket Title *</label>
      <input required value={title} onChange={event => setTitle(event.target.value)} placeholder="What should admins review?" style={inputStyle} />
    </div>
    <div>
      <label style={labelStyle}>Description <span style={{ color: 'var(--text-4)', fontStyle: 'italic', fontWeight: 400 }}>(Markdown)</span></label>
      <textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="Add context, requirements, links, or notes..." style={{ ...inputStyle, minHeight: '120px', resize: 'vertical' }} />
    </div>
    <div>
      <label style={labelStyle}>Priority</label>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {PRIORITY_OPTIONS.map(option => (
          <button key={option.value} type="button" onClick={() => setPriority(option.value)} style={pillStyle(priority === option.value, option.color)}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: option.color }} />
            {option.value}
          </button>
        ))}
      </div>
    </div>
    <div>
      <label style={labelStyle}>Category</label>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setCategory('')} style={pillStyle(category === '', 'var(--primary)')}>None</button>
        {categories.map(cat => (
          <button key={cat.id} type="button" onClick={() => setCategory(cat.name)} style={pillStyle(category === cat.name, cat.color)}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: cat.color }} />
            {cat.name}
          </button>
        ))}
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
      <div>
        <label style={labelStyle}>Start Date</label>
        <AppDateTimePicker value={startDate} onChange={setStartDate} placeholder="Select start date" />
      </div>
      <div>
        <label style={labelStyle}>End Date</label>
        <AppDateTimePicker value={endDate} onChange={setEndDate} placeholder="Select end date" min={startDate} />
      </div>
    </div>
    <button type="submit" className="primary-btn" disabled={isSubmitting} style={{ background: selectedCategoryColor || selectedPriorityColor, opacity: isSubmitting ? 0.7 : 1 }}>
      <Send size={16} /> {isSubmitting ? 'Submitting...' : 'Submit Ticket'}
    </button>
  </form>
);

const TicketPreview = ({
  title,
  description,
  priority,
  category,
  startDate,
  endDate,
  priorityColor,
  categoryColor
}: {
  title: string;
  description: string;
  priority: TaskPriority;
  category: string;
  startDate: string;
  endDate: string;
  priorityColor: string;
  categoryColor: string;
}) => (
  <aside style={{ background: 'var(--surface-2)', borderLeft: '1px solid var(--border)', padding: '2rem' }}>
    <div style={sectionLabel}>Preview</div>
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${category ? categoryColor : priorityColor}`, borderRadius: 'var(--radius-lg)', padding: '1.125rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.5rem' }}>
        <span style={tagStyle(priorityColor)}>{priority}</span>
        {category && <span style={tagStyle(categoryColor)}>{category}</span>}
      </div>
      <div style={{ fontWeight: 700, color: 'var(--text-1)', fontSize: '0.95rem', marginBottom: '0.4rem' }}>
        {title || <span style={{ opacity: 0.35, fontStyle: 'italic' }}>Ticket title...</span>}
      </div>
      {description && (
        <div className="task-desc-markdown" style={{ fontSize: '0.78rem' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
        </div>
      )}
      <div style={{ marginTop: '0.85rem', color: 'var(--text-4)', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <Clock size={12} />
        {!startDate && !endDate
          ? 'No date'
          : startDate && endDate
            ? `${formatDateTime(startDate)} - ${formatDateTime(endDate)}`
            : formatDateTime(startDate || endDate)}
      </div>
    </div>
  </aside>
);

const AdminTicketCard = ({
  ticket,
  requesterName,
  categoryColor,
  onStatusChange
}: {
  ticket: TicketRequest;
  requesterName: string;
  categoryColor: string;
  onStatusChange: (status: TicketStatus) => void;
}) => {
  const priorityColor = PRIORITY_OPTIONS.find(option => option.value === ticket.priority)?.color || '#f59e0b';
  const statusColor = TICKET_STATUS_OPTIONS.find(option => option.value === ticket.status)?.color || '#3b82f6';

  return (
    <article style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `4px solid ${statusColor}`, borderRadius: 'var(--radius-lg)', padding: '1rem', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          <span style={tagStyle(priorityColor)}>{ticket.priority}</span>
          {ticket.category && <span style={tagStyle(categoryColor)}>{ticket.category}</span>}
        </div>
        {ticket.status === 'Approved' ? <CheckCircle2 size={16} color="#22c55e" /> : ticket.status === 'Rejected' ? <XCircle size={16} color="#ef4444" /> : <Ticket size={16} color={statusColor} />}
      </div>
      <h3 style={{ color: 'var(--text-1)', fontSize: '0.98rem', fontWeight: 700, marginBottom: '0.4rem' }}>{ticket.title}</h3>
      <div className="task-desc-markdown" style={{ fontSize: '0.78rem', color: 'var(--text-3)', WebkitLineClamp: 5 }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{ticket.description || '*No description provided.*'}</ReactMarkdown>
      </div>
      <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', color: 'var(--text-4)', fontSize: '0.72rem' }}>
        <span>Requested by {requesterName}</span>
        <span>{ticket.start_date || ticket.end_date ? `${formatDateTime(ticket.start_date || undefined)} - ${formatDateTime(ticket.end_date || undefined)}` : 'No timeline requested'}</span>
      </div>
      <div style={{ marginTop: '0.85rem' }}>
        <AppSelect
          value={ticket.status}
          onChange={value => onStatusChange(value as TicketStatus)}
          options={TICKET_STATUS_OPTIONS}
          accentColor={statusColor}
          compact
        />
      </div>
    </article>
  );
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.72rem',
  fontWeight: 600,
  color: 'var(--text-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '0.45rem'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.7rem 1rem',
  borderRadius: 'var(--radius-md)',
  border: '1.5px solid var(--border-strong)',
  background: 'var(--surface)',
  fontSize: '0.9rem',
  color: 'var(--text-1)',
  outline: 'none'
};

const sectionLabel: React.CSSProperties = {
  fontSize: '0.65rem',
  fontWeight: 700,
  color: 'var(--text-4)',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  marginBottom: '0.7rem'
};

const pillStyle = (isSelected: boolean, color: string): React.CSSProperties => ({
  padding: '0.35rem 0.875rem',
  borderRadius: 'var(--radius-full)',
  fontSize: '0.78rem',
  fontWeight: 600,
  border: `1.5px solid ${isSelected ? color : 'var(--border-strong)'}`,
  background: isSelected ? `${color}15` : 'transparent',
  color: isSelected ? color : 'var(--text-3)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem'
});

const tagStyle = (color: string): React.CSSProperties => ({
  fontSize: '0.6rem',
  fontWeight: 800,
  color,
  background: `${color}12`,
  padding: '0.15rem 0.45rem',
  borderRadius: 'var(--radius-sm)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  border: `1px solid ${color}20`
});

export default TicketsView;
