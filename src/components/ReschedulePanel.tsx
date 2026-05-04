import { useState, useEffect } from 'react';
import { authHeaders } from '../lib/auth';

interface Booking {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  slotTime: string;
  status: string;
  createdAt: string;
}

interface Props {
  booking: Booking;
  onSuccess: (updated: Booking) => void;
  onClose: () => void;
}

// Returns today's date as YYYY-MM-DD — used as the min for the date input
function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

// Formats an ISO slot string for display in the slot picker buttons
function formatSlotButton(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function ReschedulePanel({ booking, onSuccess, onClose }: Props) {
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch available slots whenever the date changes
  useEffect(() => {
    if (!selectedDate) return;

    setSlots([]);
    setSelectedSlot(null);
    setSlotsError(null);
    setLoadingSlots(true);

    (async () => {
      try {
        const res = await fetch(`/api/slots?date=${selectedDate}`);
        const json = await res.json() as { success: boolean; data?: string[]; error?: string };

        if (!json.success) {
          setSlotsError(json.error ?? 'Could not load slots.');
          return;
        }

        setSlots(json.data ?? []);
      } catch {
        setSlotsError('Network error. Could not load slots.');
      } finally {
        setLoadingSlots(false);
      }
    })();
  }, [selectedDate]);

  const handleConfirm = async () => {
    if (!selectedSlot) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`/api/bookings/${booking.id}/reschedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ newSlotTime: selectedSlot }),
      });

      const json = await res.json() as { success: boolean; data?: Booking; error?: string };

      if (!json.success) {
        setSubmitError(json.error ?? 'Failed to reschedule booking.');
        return;
      }

      onSuccess(json.data!);
    } catch {
      setSubmitError('Network error. Could not reschedule booking.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-zinc-700">
      <p className="text-xs text-zinc-400 mb-3 font-medium uppercase tracking-wider">Reschedule to</p>

      {/* Date picker */}
      <div className="mb-3">
        <input
          type="date"
          min={todayString()}
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="bg-zinc-700 text-white text-sm rounded-lg px-3 py-2 border border-zinc-600 focus:outline-none focus:border-yellow-400 w-full sm:w-auto"
        />
      </div>

      {/* Slot picker */}
      {loadingSlots && (
        <p className="text-zinc-500 text-xs">Loading slots…</p>
      )}

      {slotsError && (
        <p className="text-red-400 text-xs">{slotsError}</p>
      )}

      {!loadingSlots && !slotsError && selectedDate && slots.length === 0 && (
        <p className="text-zinc-500 text-xs">No available slots for this date.</p>
      )}

      {slots.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {slots.map(slot => (
            <button
              key={slot}
              onClick={() => setSelectedSlot(slot)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                selectedSlot === slot
                  ? 'bg-yellow-400 text-zinc-900'
                  : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
              }`}
            >
              {formatSlotButton(slot)}
            </button>
          ))}
        </div>
      )}

      {/* Submit error */}
      {submitError && (
        <p className="text-red-400 text-xs mb-2">{submitError}</p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleConfirm}
          disabled={!selectedSlot || submitting}
          className="text-xs bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? 'Rescheduling…' : 'Confirm reschedule'}
        </button>
        <button
          onClick={onClose}
          disabled={submitting}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
