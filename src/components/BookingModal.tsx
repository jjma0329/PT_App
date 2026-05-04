import { useState, useEffect, useCallback } from 'react';
import { cn } from '../lib/utils';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'date' | 'time' | 'form' | 'success';

interface FormData {
  name: string;
  email: string;
  phone: string;
  message: string;
}

const initialFormData: FormData = {
  name: '',
  email: '',
  phone: '',
  message: '',
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOffset(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const STEP_ORDER: Step[] = ['date', 'time', 'form'];
const STEP_LABELS = ['Date', 'Time', 'Details'];

const inputClass =
  'w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-yellow-400 transition-colors';

export function BookingModal({ isOpen, onClose }: BookingModalProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Earliest selectable date: 2 calendar days from today (same rule as the backend)
  const _earliest = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2);
  const earliestBookableStr = toDateStr(_earliest.getFullYear(), _earliest.getMonth(), _earliest.getDate());

  const [step, setStep] = useState<Step>('date');
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedSlot, setConfirmedSlot] = useState<string | null>(null);
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setStep('date');
        setViewYear(today.getFullYear());
        setViewMonth(today.getMonth());
        setSelectedDate(null);
        setSlots([]);
        setSlotsError(false);
        setSelectedSlot(null);
        setFormData(initialFormData);
        setSubmitError(null);
        setConfirmedSlot(null);
        setConfirmedEmail(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const fetchSlots = useCallback(async (dateStr: string) => {
    setSlotsLoading(true);
    setSlotsError(false);
    setSlots([]);
    try {
      const res = await fetch(`/api/slots?date=${dateStr}`);
      if (!res.ok) throw new Error('Failed to fetch slots');
      const json = await res.json();
      setSlots(json.data ?? []);
    } catch {
      setSlotsError(true);
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  const handleDateSelect = (dateStr: string) => {
    setSelectedDate(dateStr);
    setStep('time');
    fetchSlots(dateStr);
  };

  const handleSlotSelect = (slot: string) => {
    setSelectedSlot(slot);
    setStep('form');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, slotTime: selectedSlot }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error ?? 'Something went wrong. Please try again.');
        return;
      }
      setConfirmedSlot(selectedSlot);
      setConfirmedEmail(formData.email);
      setStep('success');
    } catch {
      setSubmitError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const prevMonthDisabled =
    viewYear === today.getFullYear() && viewMonth === today.getMonth();

  const handlePrevMonth = () => {
    if (prevMonthDisabled) return;
    if (viewMonth === 0) {
      setViewYear(y => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(y => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  if (!isOpen) return null;

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDayOffset = getFirstDayOffset(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array(firstDayOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const activeStepIndex = STEP_ORDER.indexOf(step);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4"
      onClick={handleOverlayClick}
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg relative max-h-[90vh] overflow-y-auto">

        {/* Modal header */}
        <div className="px-8 pt-8 pb-6 border-b border-zinc-800">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 text-zinc-400 hover:text-white transition-colors text-2xl leading-none"
            aria-label="Close"
          >
            <i className="bx bx-x" />
          </button>

          <h2 className="text-2xl font-extrabold text-white mb-1">
            Book a <span className="text-yellow-400">Session</span>
          </h2>
          <p className="text-zinc-400 text-sm">
            {step === 'date' && 'Pick a date to see available times.'}
            {step === 'time' && 'Choose a time slot.'}
            {step === 'form' && 'Fill in your details to confirm.'}
            {step === 'success' && "You're all set!"}
          </p>

          {/* Step progress indicator — hidden on success screen */}
          {step !== 'success' && (
            <div className="flex items-center gap-2 mt-5">
              {STEP_ORDER.map((s, i) => (
                <div key={s} className="flex items-center gap-2 flex-1 last:flex-none">
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors',
                    activeStepIndex > i
                      ? 'bg-yellow-400 text-zinc-950'
                      : activeStepIndex === i
                        ? 'bg-yellow-400 text-zinc-950'
                        : 'bg-zinc-700 text-zinc-500'
                  )}>
                    {activeStepIndex > i
                      ? <i className="bx bx-check text-sm" />
                      : i + 1
                    }
                  </div>
                  <span className={cn(
                    'text-xs font-medium whitespace-nowrap',
                    activeStepIndex >= i ? 'text-white' : 'text-zinc-500'
                  )}>
                    {STEP_LABELS[i]}
                  </span>
                  {/* Connector line between steps */}
                  {i < STEP_ORDER.length - 1 && (
                    <div className={cn(
                      'flex-1 h-px transition-colors',
                      activeStepIndex > i ? 'bg-yellow-400' : 'bg-zinc-700'
                    )} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal body */}
        <div className="px-8 py-6">

          {/* Step 1: Date Picker */}
          {step === 'date' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={handlePrevMonth}
                  disabled={prevMonthDisabled}
                  className={cn(
                    'p-1 rounded transition-colors',
                    prevMonthDisabled
                      ? 'text-zinc-700 cursor-not-allowed'
                      : 'text-zinc-400 hover:text-white'
                  )}
                  aria-label="Previous month"
                >
                  <i className="bx bx-chevron-left text-xl" />
                </button>
                <span className="text-white font-semibold">
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </span>
                <button
                  onClick={handleNextMonth}
                  className="p-1 rounded text-zinc-400 hover:text-white transition-colors"
                  aria-label="Next month"
                >
                  <i className="bx bx-chevron-right text-xl" />
                </button>
              </div>

              <div className="grid grid-cols-7 mb-2">
                {DAY_LABELS.map(d => (
                  <div key={d} className="text-center text-xs text-zinc-500 py-1">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, i) => {
                  if (day === null) return <div key={`empty-${i}`} />;
                  const dateStr = toDateStr(viewYear, viewMonth, day);
                  // Disable any date before the 2-day advance booking cutoff
                  const isTooSoon = dateStr < earliestBookableStr;
                  return (
                    <button
                      key={dateStr}
                      onClick={() => !isTooSoon && handleDateSelect(dateStr)}
                      disabled={isTooSoon}
                      className={cn(
                        'aspect-square rounded-lg text-sm font-medium transition-colors',
                        isTooSoon
                          ? 'text-zinc-700 cursor-not-allowed'
                          : selectedDate === dateStr
                            ? 'bg-yellow-400 text-zinc-950'
                            : 'text-white hover:bg-yellow-400 hover:text-zinc-950'
                      )}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Time Slots */}
          {step === 'time' && (
            <div>
              <button
                onClick={() => setStep('date')}
                className="flex items-center gap-1 text-zinc-400 hover:text-white text-sm mb-4 transition-colors"
              >
                <i className="bx bx-arrow-back" /> Back
              </button>

              {selectedDate && (
                <p className="text-zinc-400 text-sm mb-4">
                  Available times for{' '}
                  <span className="text-white font-medium">
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, {
                      weekday: 'long', month: 'long', day: 'numeric',
                    })}
                  </span>
                </p>
              )}

              {slotsLoading && (
                <div className="flex justify-center py-10">
                  <i className="bx bx-loader-alt animate-spin text-yellow-400 text-3xl" />
                </div>
              )}

              {!slotsLoading && slotsError && (
                <div className="text-center py-8">
                  <p className="text-zinc-400 mb-2">Failed to load available times.</p>
                  <button
                    onClick={() => selectedDate && fetchSlots(selectedDate)}
                    className="text-yellow-400 hover:underline text-sm"
                  >
                    Try again
                  </button>
                </div>
              )}

              {!slotsLoading && !slotsError && slots.length === 0 && (() => {
                // If the selected date is before the 2-day cutoff, it's the advance
                // booking rule — not a lack of availability on that day.
                const tooSoon = selectedDate ? selectedDate < earliestBookableStr : false;
                return (
                  <div className="text-center py-8">
                    {tooSoon ? (
                      <>
                        <p className="text-zinc-400 mb-1">This date is too soon to book.</p>
                        <p className="text-zinc-500 text-sm mb-3">
                          Sessions must be booked at least 2 days in advance.
                        </p>
                      </>
                    ) : (
                      <p className="text-zinc-400 mb-2">No available times on this date.</p>
                    )}
                    <button
                      onClick={() => setStep('date')}
                      className="text-yellow-400 hover:underline text-sm"
                    >
                      Choose a different date
                    </button>
                  </div>
                );
              })()}

              {!slotsLoading && !slotsError && slots.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {slots.map(slot => (
                    <button
                      key={slot}
                      onClick={() => handleSlotSelect(slot)}
                      className="py-3 px-4 rounded-lg border border-zinc-700 text-white text-sm font-medium hover:border-yellow-400 hover:text-yellow-400 transition-colors"
                    >
                      {new Date(slot).toLocaleTimeString(undefined, {
                        hour: 'numeric', minute: '2-digit',
                      })}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Booking Form */}
          {step === 'form' && (
            <div>
              <button
                onClick={() => setStep('time')}
                className="flex items-center gap-1 text-zinc-400 hover:text-white text-sm mb-4 transition-colors"
              >
                <i className="bx bx-arrow-back" /> Back
              </button>

              {selectedSlot && (
                <div className="bg-zinc-800 rounded-lg px-4 py-3 mb-5 flex items-center gap-3">
                  <i className="bx bx-calendar text-yellow-400 text-xl shrink-0" />
                  <div>
                    <p className="text-zinc-400 text-xs mb-0.5">Selected time</p>
                    <p className="text-white font-semibold text-sm">
                      {new Date(selectedSlot).toLocaleString(undefined, {
                        weekday: 'long', month: 'long', day: 'numeric',
                        hour: 'numeric', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="text"
                  placeholder="Your Name"
                  required
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className={inputClass}
                />
                <input
                  type="email"
                  placeholder="Your Email"
                  required
                  value={formData.email}
                  onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className={inputClass}
                />
                <input
                  type="tel"
                  placeholder="Phone Number (optional)"
                  value={formData.phone}
                  onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className={inputClass}
                />
                <textarea
                  rows={3}
                  placeholder="Any notes or questions? (optional)"
                  value={formData.message}
                  onChange={e => setFormData(prev => ({ ...prev, message: e.target.value }))}
                  className={cn(inputClass, 'resize-none')}
                />

                {submitError && <p className="text-red-400 text-sm">{submitError}</p>}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={cn(
                    'w-full py-3 font-bold rounded-lg transition-colors flex items-center justify-center gap-2',
                    isSubmitting
                      ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                      : 'bg-yellow-400 text-zinc-950 hover:bg-yellow-300'
                  )}
                >
                  {isSubmitting ? 'Confirming...' : (
                    <>Confirm Booking <i className="bx bx-calendar-check" /></>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Step 4: Success */}
          {step === 'success' && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-yellow-400/10 flex items-center justify-center">
                <i className="bx bx-check-circle text-yellow-400 text-4xl" />
              </div>
              <div>
                <p className="text-white font-semibold text-xl mb-1">Booking confirmed!</p>
                {confirmedSlot && (
                  <p className="text-zinc-300 text-sm mb-1">
                    {new Date(confirmedSlot).toLocaleString(undefined, {
                      weekday: 'long', month: 'long', day: 'numeric',
                      hour: 'numeric', minute: '2-digit',
                    })}
                  </p>
                )}
                {confirmedEmail && (
                  <p className="text-zinc-400 text-sm mt-2">
                    Confirmation sent to{' '}
                    <span className="text-white">{confirmedEmail}</span>
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="mt-2 px-8 py-2.5 bg-yellow-400 text-zinc-950 font-bold rounded-lg hover:bg-yellow-300 transition-colors"
              >
                Done
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
