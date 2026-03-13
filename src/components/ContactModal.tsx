import { useState, useEffect } from 'react';
import { cn } from '../lib/utils';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FormData {
  name: string;
  email: string;
  phone: string;
  goal: string;
  message: string;
}

const initialFormData: FormData = {
  name: '',
  email: '',
  phone: '',
  goal: '',
  message: '',
};

export function ContactModal({ isOpen, onClose }: ContactModalProps) {
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setFormData(initialFormData);
        setIsSuccess(false);
        setError(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error('Server error');

      setIsSuccess(true);
      setTimeout(() => onClose(), 2500);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const inputClass =
    'w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-yellow-400 transition-colors';

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4"
      onClick={handleOverlayClick}
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-md relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors text-2xl leading-none"
          aria-label="Close"
        >
          <i className="bx bx-x" />
        </button>

        <h2 className="text-2xl font-extrabold text-white mb-1">
          Book a <span className="text-yellow-400">Session</span>
        </h2>
        <p className="text-zinc-400 text-sm mb-6">
          Fill in your details and I'll get back to you within 24 hours.
        </p>

        {isSuccess ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <i className="bx bx-check-circle text-yellow-400 text-6xl" />
            <p className="text-white font-semibold text-lg">Thanks! I'll be in touch soon.</p>
          </div>
        ) : (
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
            <select
              value={formData.goal}
              onChange={e => setFormData(prev => ({ ...prev, goal: e.target.value }))}
              className={cn(
                inputClass,
                formData.goal === '' ? 'text-zinc-500' : 'text-white'
              )}
            >
              <option value="" disabled>
                Your Fitness Goal
              </option>
              <option value="fat-loss">Fat Loss</option>
              <option value="muscle-gain">Muscle / Weight Gain</option>
              <option value="strength">Strength Training</option>
              <option value="cardio">Cardio &amp; Endurance</option>
              <option value="general">General Fitness</option>
            </select>
            <textarea
              rows={4}
              placeholder="Tell me a bit about your goals or any questions..."
              value={formData.message}
              onChange={e => setFormData(prev => ({ ...prev, message: e.target.value }))}
              className={cn(inputClass, 'resize-none')}
            />

            {error && <p className="text-red-400 text-sm">{error}</p>}

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
              {isSubmitting ? (
                'Sending...'
              ) : (
                <>
                  Send Message <i className="bx bx-send" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
