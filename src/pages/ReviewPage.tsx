import { useState } from 'react';

type Step = 'form' | 'success';

export function ReviewPage() {
  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [rating, setRating] = useState<number>(0);
  const [message, setMessage] = useState('');
  const [hovered, setHovered] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (rating === 0) {
      setError('Please select a star rating.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, rating, message }),
      });

      const json = await res.json() as { success: boolean; error?: string };

      if (!json.success) {
        setError(json.error ?? 'Something went wrong. Please try again.');
        return;
      }

      setStep('success');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // The displayed stars use the hovered value while hovering, otherwise the selected rating
  const displayRating = hovered || rating;

  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-white">
            Leave a <span className="text-yellow-400">Review</span>
          </h1>
          <p className="text-zinc-400 mt-2 text-sm">
            Your feedback helps others find the right trainer.
          </p>
        </div>

        {step === 'success' ? (
          <div className="bg-zinc-800 rounded-2xl p-8 text-center border border-zinc-700">
            <i className="bx bx-check-circle text-green-400 text-5xl mb-4 block" />
            <h2 className="text-white text-xl font-bold mb-2">Thank you!</h2>
            <p className="text-zinc-400 text-sm">
              Your review has been submitted and will appear on the site once approved.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-zinc-800 rounded-2xl p-8 border border-zinc-700 flex flex-col gap-5"
          >
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-zinc-300 text-sm font-medium">Your name</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Alex"
                className="bg-zinc-700 text-white placeholder-zinc-500 rounded-lg px-4 py-2.5 text-sm border border-zinc-600 focus:outline-none focus:border-yellow-400"
              />
            </div>

            {/* Star rating */}
            <div className="flex flex-col gap-1.5">
              <label className="text-zinc-300 text-sm font-medium">Rating</label>
              <div
                className="flex gap-1"
                onMouseLeave={() => setHovered(0)}
              >
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHovered(star)}
                    aria-label={`${star} star${star > 1 ? 's' : ''}`}
                    className="text-3xl transition-colors focus:outline-none"
                  >
                    <i className={`bx ${star <= displayRating ? 'bxs-star text-yellow-400' : 'bx-star text-zinc-600'}`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div className="flex flex-col gap-1.5">
              <label className="text-zinc-300 text-sm font-medium">Your experience</label>
              <textarea
                required
                rows={4}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Tell us about your training experience…"
                className="bg-zinc-700 text-white placeholder-zinc-500 rounded-lg px-4 py-2.5 text-sm border border-zinc-600 focus:outline-none focus:border-yellow-400 resize-none"
              />
            </div>

            {/* Error */}
            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold py-3 rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting…' : 'Submit review'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
