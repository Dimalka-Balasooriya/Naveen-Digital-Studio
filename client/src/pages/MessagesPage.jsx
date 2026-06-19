import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Inbox, Mail, Send, Users } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { normalizeRole } from '../utils/roles';

const tabs = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'sent', label: 'Sent Messages', icon: Send },
  { id: 'compose', label: 'Compose', icon: Mail }
];

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || error.response?.data?.error || fallback;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '-';
}

function MessageBadge({ type }) {
  if (type !== 'warning') return <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">Normal</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">
      <AlertTriangle size={13} /> WARNING
    </span>
  );
}

export default function MessagesPage() {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  const canSendWarning = ['OWNER', 'CO_ADMIN'].includes(role);
  const [activeTab, setActiveTab] = useState('inbox');
  const [inboxMessages, setInboxMessages] = useState([]);
  const [sentMessages, setSentMessages] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    recipient_ids: [],
    subject: '',
    body: '',
    type: 'normal'
  });

  const unreadCount = useMemo(
    () => inboxMessages.filter((message) => !message.is_read).length,
    [inboxMessages]
  );

  async function loadMessages() {
    setLoading(true);
    setError('');
    try {
      const [inboxResponse, sentResponse, recipientsResponse] = await Promise.all([
        api.get('/messages/inbox'),
        api.get('/messages/sent'),
        api.get('/messages/recipients')
      ]);
      setInboxMessages(inboxResponse.data);
      setSentMessages(sentResponse.data);
      setRecipients(recipientsResponse.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Messages could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMessages();
  }, []);

  function toggleRecipient(id) {
    setForm((current) => ({
      ...current,
      recipient_ids: current.recipient_ids.includes(id)
        ? current.recipient_ids.filter((recipientId) => recipientId !== id)
        : [...current.recipient_ids, id]
    }));
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setNotice('');
    setError('');
    try {
      const payload = {
        ...form,
        type: canSendWarning ? form.type : 'normal'
      };
      const { data } = await api.post('/messages/send', payload);
      setNotice(data.message || 'Message sent successfully.');
      setForm({ recipient_ids: [], subject: '', body: '', type: 'normal' });
      setActiveTab('sent');
      await loadMessages();
      window.dispatchEvent(new Event('nds-messages-updated'));
    } catch (err) {
      setError(getErrorMessage(err, 'Message could not be sent.'));
    } finally {
      setSending(false);
    }
  }

  async function openInboxMessage(message) {
    setSelectedMessage(message);
    if (message.is_read) return;
    try {
      await api.patch(`/messages/${message.id}/read`);
      setInboxMessages((messages) => messages.map((item) => (
        item.id === message.id ? { ...item, is_read: 1, read_at: new Date().toISOString() } : item
      )));
      window.dispatchEvent(new Event('nds-messages-updated'));
    } catch {
      // The message is still readable locally even if the read receipt update fails.
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Internal Messaging</p>
          <h1 className="text-2xl font-semibold text-slate-950">Messages</h1>
          <p className="text-sm text-slate-500">Send staff updates, warnings, and internal notes.</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Unread</p>
          <p className="text-2xl font-semibold text-slate-950">{unreadCount}</p>
        </div>
      </div>

      {notice ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition ${
              activeTab === id ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Icon size={16} />
            {label}
            {id === 'inbox' && unreadCount ? (
              <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs text-white">{unreadCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading messages...</div>
      ) : null}

      {!loading && activeTab === 'inbox' ? (
        <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
          <div className="grid grid-cols-12 gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500">
            <span className="col-span-3">Sender</span>
            <span className="col-span-5">Message</span>
            <span className="col-span-2">Type</span>
            <span className="col-span-2 text-right">Time</span>
          </div>
          {inboxMessages.length ? inboxMessages.map((message) => (
            <button
              key={message.id}
              type="button"
              onClick={() => openInboxMessage(message)}
              className={`grid w-full grid-cols-12 gap-3 border-t border-slate-100 px-4 py-4 text-left transition hover:bg-slate-50 ${
                message.type === 'warning' ? 'bg-rose-50/70' : ''
              } ${message.is_read ? '' : 'font-semibold'}`}
            >
              <span className="col-span-3">
                <span className="block text-sm text-slate-950">{message.sender_name}</span>
                <span className="block text-xs font-normal text-slate-500">{message.sender_role}</span>
              </span>
              <span className="col-span-5">
                <span className="block text-sm text-slate-950">{message.subject}</span>
                <span className="line-clamp-1 text-xs font-normal text-slate-500">{message.body}</span>
              </span>
              <span className="col-span-2"><MessageBadge type={message.type} /></span>
              <span className="col-span-2 text-right text-xs font-normal text-slate-500">
                {!message.is_read ? <span className="mb-1 block text-rose-600">Unread</span> : null}
                {formatDate(message.created_at)}
              </span>
            </button>
          )) : (
            <div className="p-6 text-sm text-slate-500">No inbox messages.</div>
          )}
        </div>
      ) : null}

      {!loading && activeTab === 'sent' ? (
        <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
          <div className="grid grid-cols-12 gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500">
            <span className="col-span-4">Recipients</span>
            <span className="col-span-4">Message</span>
            <span className="col-span-2">Read</span>
            <span className="col-span-2 text-right">Time</span>
          </div>
          {sentMessages.length ? sentMessages.map((message) => (
            <div key={message.id} className={`grid grid-cols-12 gap-3 border-t border-slate-100 px-4 py-4 ${message.type === 'warning' ? 'bg-rose-50/70' : ''}`}>
              <span className="col-span-4 text-sm text-slate-700">{message.recipients}</span>
              <span className="col-span-4">
                <span className="block text-sm font-semibold text-slate-950">{message.subject}</span>
                <span className="line-clamp-1 text-xs text-slate-500">{message.body}</span>
                <span className="mt-2 block"><MessageBadge type={message.type} /></span>
              </span>
              <span className="col-span-2 text-sm text-slate-700">{Number(message.read_count || 0)} / {Number(message.recipient_count || 0)}</span>
              <span className="col-span-2 text-right text-xs text-slate-500">{formatDate(message.created_at)}</span>
            </div>
          )) : (
            <div className="p-6 text-sm text-slate-500">No sent messages.</div>
          )}
        </div>
      ) : null}

      {!loading && activeTab === 'compose' ? (
        <form onSubmit={sendMessage} className="grid gap-6 rounded-md border border-slate-200 bg-white p-5 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Users size={18} className="text-teal-700" />
              <h2 className="text-lg font-semibold text-slate-950">Recipients</h2>
            </div>
            <div className="max-h-96 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-3">
              {recipients.length ? recipients.map((recipient) => (
                <label key={recipient.id} className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={form.recipient_ids.includes(recipient.id)}
                    onChange={() => toggleRecipient(recipient.id)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-950">{recipient.name}</span>
                    <span className="block text-xs text-slate-500">{recipient.role} - {recipient.email}</span>
                  </span>
                </label>
              )) : (
                <p className="text-sm text-slate-500">No recipients available for your role.</p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-slate-700">Subject</label>
              <input
                value={form.subject}
                onChange={(event) => setForm({ ...form, subject: event.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="Message subject"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700">Message</label>
              <textarea
                value={form.body}
                onChange={(event) => setForm({ ...form, body: event.target.value })}
                rows={8}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="Write your message"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700">Message type</label>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, type: 'normal' })}
                  className={`rounded-md px-3 py-2 text-sm font-semibold ${form.type === 'normal' ? 'bg-slate-950 text-white' : 'border border-slate-200 text-slate-700'}`}
                >
                  Normal
                </button>
                {canSendWarning ? (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, type: 'warning' })}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${form.type === 'warning' ? 'bg-rose-600 text-white' : 'border border-rose-200 text-rose-700'}`}
                  >
                    <AlertTriangle size={16} /> Warning
                  </button>
                ) : (
                  <span className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-500">Production employees can send normal messages only.</span>
                )}
              </div>
            </div>
            <button
              disabled={sending}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
            >
              {sending ? 'Sending...' : 'Send Message'} <Send size={16} />
            </button>
          </div>
        </form>
      ) : null}

      {selectedMessage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className={`w-full max-w-2xl rounded-md bg-white shadow-xl ${selectedMessage.type === 'warning' ? 'border-2 border-rose-300' : ''}`}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <div className="mb-2"><MessageBadge type={selectedMessage.type} /></div>
                <h2 className="text-xl font-semibold text-slate-950">{selectedMessage.subject}</h2>
                <p className="text-sm text-slate-500">From {selectedMessage.sender_name} ({selectedMessage.sender_role}) - {formatDate(selectedMessage.created_at)}</p>
              </div>
              <button onClick={() => setSelectedMessage(null)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100">Close</button>
            </div>
            <div className="space-y-4 p-5">
              {selectedMessage.type === 'warning' ? (
                <div className="flex items-center gap-2 rounded-md bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                  <AlertTriangle size={17} /> WARNING MESSAGE
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                  <CheckCircle2 size={17} /> Normal message
                </div>
              )}
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{selectedMessage.body}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
