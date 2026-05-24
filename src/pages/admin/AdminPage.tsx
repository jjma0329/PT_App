import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authHeaders, removeToken } from '../../lib/auth';
import { ReschedulePanel } from '../../components/ReschedulePanel';

interface Booking {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  slotTime: string;
  status: string;
  confirmedAt: string | null;
  createdAt: string;
}

interface Testimonial {
  id: number;
  name: string;
  rating: number;
  message: string;
  approved: boolean;
  createdAt: string;
}

type Filter = 'all' | 'pending' | 'confirmed' | 'cancelled';
type View   = 'bookings' | 'testimonials';

// Format ISO datetime string for display in the admin UI
function formatSlot(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function AdminPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('bookings');

  // --- Bookings state ---
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // confirmingId: the booking awaiting cancel confirmation — shows inline confirm UI
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  // approvingBookingId: the pending booking being confirmed (loading state)
  const [approvingBookingId, setApprovingBookingId] = useState<number | null>(null);
  // reschedulingId: the booking whose reschedule panel is open
  const [reschedulingId, setReschedulingId] = useState<number | null>(null);

  // --- Testimonials state ---
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [testimonialsLoading, setTestimonialsLoading] = useState(false);
  const [testimonialsError, setTestimonialsError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/bookings', { headers: authHeaders() });

      // Expired / invalid token — send back to login
      if (res.status === 401) {
        removeToken();
        navigate('/admin/login', { replace: true });
        return;
      }

      const json = await res.json() as { success: boolean; data?: Booking[]; error?: string };
      if (!json.success) {
        setError(json.error ?? 'Failed to load bookings.');
        return;
      }

      setBookings(json.data ?? []);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const fetchTestimonials = useCallback(async () => {
    setTestimonialsLoading(true);
    setTestimonialsError(null);

    try {
      const res = await fetch('/api/testimonials', { headers: authHeaders() });

      if (res.status === 401) {
        removeToken();
        navigate('/admin/login', { replace: true });
        return;
      }

      const json = await res.json() as { success: boolean; data?: Testimonial[]; error?: string };
      if (!json.success) {
        setTestimonialsError(json.error ?? 'Failed to load testimonials.');
        return;
      }

      setTestimonials(json.data ?? []);
    } catch {
      setTestimonialsError('Network error. Please try again.');
    } finally {
      setTestimonialsLoading(false);
    }
  }, [navigate]);

  // Fetch testimonials when switching to that view (lazy — don't fetch until needed)
  useEffect(() => {
    if (view === 'testimonials') fetchTestimonials();
  }, [view, fetchTestimonials]);

  const handleApprove = async (id: number) => {
    setApprovingId(id);

    try {
      const res = await fetch(`/api/testimonials/${id}/approve`, {
        method: 'PATCH',
        headers: authHeaders(),
      });

      if (res.status === 401) {
        removeToken();
        navigate('/admin/login', { replace: true });
        return;
      }

      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) {
        setTestimonialsError(json.error ?? 'Failed to approve testimonial.');
        return;
      }

      // Update in place — flip approved flag without re-fetching
      setTestimonials(prev => prev.map(t => t.id === id ? { ...t, approved: true } : t));
    } catch {
      setTestimonialsError('Network error. Could not approve testimonial.');
    } finally {
      setApprovingId(null);
    }
  };

  const handleLogout = () => {
    removeToken();
    navigate('/admin/login', { replace: true });
  };

  // Fetches the Google OAuth URL from the server (with JWT auth), then redirects the
  // browser there. A plain window.location.href = '/auth/google' won't work because
  // the browser has no way to attach the Authorization header on navigation.
  const handleReconnectGoogle = async () => {
    setReconnecting(true);
    setReconnectError(null);

    try {
      const res = await fetch('/auth/google/url', { headers: authHeaders() });

      if (res.status === 401) {
        removeToken();
        navigate('/admin/login', { replace: true });
        return;
      }

      const json = await res.json() as { success: boolean; data?: { url: string }; error?: string };

      if (!json.success || !json.data?.url) {
        setReconnectError(json.error ?? 'Could not get authorization URL.');
        return;
      }

      // Navigate the browser to Google's consent screen — session cookie carries the state
      window.location.href = json.data.url;
    } catch {
      setReconnectError('Network error. Could not start Google authorization.');
    } finally {
      setReconnecting(false);
    }
  };

  const handleCancel = async (id: number) => {
    setCancellingId(id);

    try {
      const res = await fetch(`/api/bookings/${id}/cancel`, {
        method: 'PATCH',
        headers: authHeaders(),
      });

      if (res.status === 401) {
        removeToken();
        navigate('/admin/login', { replace: true });
        return;
      }

      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) {
        setError(json.error ?? 'Failed to cancel booking.');
        return;
      }

      // Update in place — no re-fetch needed
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'cancelled' } : b));
    } catch {
      setError('Network error. Could not cancel booking.');
    } finally {
      setCancellingId(null);
      setConfirmingId(null);
    }
  };

  const handleConfirmBooking = async (id: number) => {
    setApprovingBookingId(id);

    try {
      const res = await fetch(`/api/bookings/${id}/confirm`, {
        method: 'PATCH',
        headers: authHeaders(),
      });

      if (res.status === 401) {
        removeToken();
        navigate('/admin/login', { replace: true });
        return;
      }

      const json = await res.json() as { success: boolean; data?: Booking; error?: string };
      if (!json.success) {
        setError(json.error ?? 'Failed to confirm booking.');
        return;
      }

      // Update in place — flip status to confirmed without re-fetching
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'confirmed' } : b));
    } catch {
      setError('Network error. Could not confirm booking.');
    } finally {
      setApprovingBookingId(null);
    }
  };

  const handleRescheduleSuccess = (updated: Booking) => {
    // Swap the updated booking in state and close the panel
    setBookings(prev => prev.map(b => b.id === updated.id ? updated : b));
    setReschedulingId(null);
  };

  const now            = new Date();
  const pendingCount   = bookings.filter(b => b.status === 'pending').length;
  const confirmedCount = bookings.filter(b =>
    b.status === 'confirmed' && b.confirmedAt !== null && new Date(b.slotTime) > now
  ).length;
  const cancelledCount = bookings.filter(b => b.status === 'cancelled').length;
  const filtered = filter === 'all'
    ? bookings
    : filter === 'confirmed'
    // Confirmed tab: only upcoming sessions explicitly approved by admin (confirmedAt set + future slotTime)
    ? bookings.filter(b =>
        b.status === 'confirmed' &&
        b.confirmedAt !== null &&
        new Date(b.slotTime) > now
      )
    : bookings.filter(b => b.status === filter);

  const pendingTestimonialsCount = testimonials.filter(t => !t.approved).length;

  return (
    <div className="min-h-screen bg-zinc-900 text-white">

      {/* Top bar */}
      <header className="bg-zinc-800 border-b border-zinc-700 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight">JJM Fitness</h1>
          <p className="text-zinc-400 text-xs">Admin Dashboard</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-4">
            <button
              onClick={handleReconnectGoogle}
              disabled={reconnecting}
              className="text-zinc-400 hover:text-white text-sm transition-colors disabled:opacity-50"
            >
              {reconnecting ? 'Connecting…' : 'Reconnect Google Calendar'}
            </button>
            <button
              onClick={handleLogout}
              className="text-zinc-400 hover:text-white text-sm transition-colors"
            >
              Sign out
            </button>
          </div>
          {reconnectError && (
            <p className="text-red-400 text-xs">{reconnectError}</p>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">

        {/* View tabs — Bookings / Testimonials */}
        <div className="flex gap-2 mb-8">
          {(['bookings', 'testimonials'] as View[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-5 py-2 rounded-full text-sm font-semibold capitalize transition-colors ${
                view === v
                  ? 'bg-yellow-400 text-zinc-900'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {v}
              {/* Badge showing pending bookings or testimonials needing action */}
              {v === 'bookings' && pendingCount > 0 && (
                <span className="ml-2 bg-yellow-400 text-zinc-900 text-xs rounded-full px-1.5 py-0.5">
                  {pendingCount}
                </span>
              )}
              {v === 'testimonials' && pendingTestimonialsCount > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {pendingTestimonialsCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── BOOKINGS VIEW ── */}
        {view === 'bookings' && (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Total',     value: bookings.length },
                { label: 'Pending',   value: pendingCount },
                { label: 'Confirmed', value: confirmedCount },
                { label: 'Cancelled', value: cancelledCount },
              ].map(stat => (
                <div key={stat.label} className="bg-zinc-800 rounded-xl px-5 py-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider">{stat.label}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Status filter tabs */}
            <div className="flex gap-2 mb-6">
              {(['all', 'pending', 'confirmed', 'cancelled'] as Filter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${
                    filter === f
                      ? 'bg-yellow-400 text-zinc-900'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3 mb-6">
                {error}
              </div>
            )}

            {loading && <div className="text-zinc-400 text-sm">Loading bookings…</div>}

            {!loading && filtered.length === 0 && (
              <div className="text-zinc-500 text-sm">
                {filter === 'all' ? 'No bookings yet.' : `No ${filter} bookings.`}
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <div className="flex flex-col gap-3">
                {filtered.map(booking => (
                  <div
                    key={booking.id}
                    className="bg-zinc-800 rounded-xl p-5 flex flex-col gap-4"
                  >
                    {/* Top row: booking details + action buttons */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                      {/* Booking details */}
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{booking.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            booking.status === 'confirmed'
                              ? 'bg-green-500/15 text-green-400'
                              : booking.status === 'pending'
                              ? 'bg-yellow-400/15 text-yellow-400'
                              : 'bg-zinc-600 text-zinc-400'
                          }`}>
                            {booking.status}
                          </span>
                        </div>
                        <p className="text-yellow-400 text-sm font-medium">{formatSlot(booking.slotTime)}</p>
                        <p className="text-zinc-400 text-sm">{booking.email}</p>
                        {booking.phone && (
                          <p className="text-zinc-400 text-sm">{booking.phone}</p>
                        )}
                        {booking.message && (
                          <p className="text-zinc-500 text-sm italic mt-1">"{booking.message}"</p>
                        )}
                      </div>

                      {/* Actions — shown for pending and confirmed bookings */}
                      {booking.status !== 'cancelled' && (
                        <div className="flex-shrink-0 flex flex-col items-end gap-2">

                          {/* Pending: Confirm + Decline */}
                          {booking.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleConfirmBooking(booking.id)}
                                disabled={approvingBookingId === booking.id}
                                className="text-xs bg-green-500/20 hover:bg-green-500/30 text-green-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                              >
                                {approvingBookingId === booking.id ? 'Confirming…' : 'Confirm booking'}
                              </button>
                              {/* Decline reuses the cancel endpoint — same outcome */}
                              {confirmingId === booking.id ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-zinc-400 text-xs">Decline this request?</span>
                                  <button
                                    onClick={() => handleCancel(booking.id)}
                                    disabled={cancellingId === booking.id}
                                    className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                                  >
                                    {cancellingId === booking.id ? 'Declining…' : 'Yes, decline'}
                                  </button>
                                  <button
                                    onClick={() => setConfirmingId(null)}
                                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                                  >
                                    Keep
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmingId(booking.id)}
                                  className="text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                  Decline
                                </button>
                              )}
                            </>
                          )}

                          {/* Confirmed: Cancel + Reschedule */}
                          {booking.status === 'confirmed' && (
                            <>
                              {confirmingId === booking.id ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-zinc-400 text-xs">Cancel this booking?</span>
                                  <button
                                    onClick={() => handleCancel(booking.id)}
                                    disabled={cancellingId === booking.id}
                                    className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                                  >
                                    {cancellingId === booking.id ? 'Cancelling…' : 'Yes, cancel'}
                                  </button>
                                  <button
                                    onClick={() => setConfirmingId(null)}
                                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                                  >
                                    Keep
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setConfirmingId(booking.id);
                                    setReschedulingId(null);
                                  }}
                                  className="text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                  Cancel booking
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setReschedulingId(reschedulingId === booking.id ? null : booking.id);
                                  setConfirmingId(null);
                                }}
                                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                                  reschedulingId === booking.id
                                    ? 'bg-yellow-400/20 text-yellow-400'
                                    : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                                }`}
                              >
                                {reschedulingId === booking.id ? 'Close' : 'Reschedule'}
                              </button>
                            </>
                          )}

                        </div>
                      )}
                    </div>

                    {/* Reschedule panel — expands inline below the booking details */}
                    {reschedulingId === booking.id && (
                      <ReschedulePanel
                        booking={booking}
                        onSuccess={handleRescheduleSuccess}
                        onClose={() => setReschedulingId(null)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── TESTIMONIALS VIEW ── */}
        {view === 'testimonials' && (
          <>
            {/* Error */}
            {testimonialsError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3 mb-6">
                {testimonialsError}
              </div>
            )}

            {testimonialsLoading && (
              <div className="text-zinc-400 text-sm">Loading testimonials…</div>
            )}

            {!testimonialsLoading && testimonials.length === 0 && (
              <div className="text-zinc-500 text-sm">No testimonials yet.</div>
            )}

            {!testimonialsLoading && testimonials.length > 0 && (
              <div className="flex flex-col gap-3">
                {testimonials.map(t => (
                  <div
                    key={t.id}
                    className="bg-zinc-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4"
                  >
                    {/* Testimonial details */}
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{t.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          t.approved
                            ? 'bg-green-500/15 text-green-400'
                            : 'bg-yellow-400/15 text-yellow-400'
                        }`}>
                          {t.approved ? 'approved' : 'pending'}
                        </span>
                      </div>
                      {/* Star rating display */}
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(star => (
                          <i
                            key={star}
                            className={`bx ${star <= t.rating ? 'bxs-star text-yellow-400' : 'bx-star text-zinc-600'} text-sm`}
                          />
                        ))}
                      </div>
                      <p className="text-zinc-300 text-sm mt-1">"{t.message}"</p>
                    </div>

                    {/* Approve action — only shown for pending testimonials */}
                    {!t.approved && (
                      <div className="flex-shrink-0">
                        <button
                          onClick={() => handleApprove(t.id)}
                          disabled={approvingId === t.id}
                          className="text-xs bg-green-500/20 hover:bg-green-500/30 text-green-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {approvingId === t.id ? 'Approving…' : 'Approve'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

      </main>
    </div>
  );
}
