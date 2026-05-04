import { useState, useEffect } from 'react';

interface Testimonial {
  id: number;
  name: string;
  rating: number;
  message: string;
  approved: boolean;
  createdAt: string;
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex gap-1 justify-center my-2" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(star => (
        <i
          key={star}
          className={`bx ${star <= rating ? 'bxs-star' : 'bx-star'} text-lg`}
          style={{ color: star <= rating ? 'var(--p3-cyan)' : 'rgba(156,247,255,0.2)' }}
        />
      ))}
    </div>
  );
}

export function TestimonialsSection() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/testimonials/approved');
        if (!res.ok) { setLoadError(true); return; }
        const json = await res.json() as { success: boolean; data?: Testimonial[] };
        if (json.success) {
          setTestimonials(json.data ?? []);
        } else {
          setLoadError(true);
        }
      } catch {
        setLoadError(true);
      }
    })();
  }, []);

  // Don't render the section if the fetch failed or there are no approved reviews
  if (loadError || testimonials.length === 0) return null;

  return (
    <section
      id="testimonials"
      className="py-24"
      style={{ backgroundColor: 'var(--p3-navy-dk)' }}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <h2
          className="text-4xl text-center mb-16 italic"
          style={{ fontFamily: 'var(--p3-font-h)', color: '#fff' }}
        >
          What Clients <span style={{ color: 'var(--p3-cyan)' }}>Say</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {testimonials.map(t => (
            <div
              key={t.id}
              className="p3-clip-card p-6 text-center"
              style={{ backgroundColor: 'var(--p3-navy)' }}
            >
              {/* Avatar initials circle */}
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{
                  backgroundColor: 'var(--p3-navy-dk)',
                  border: '2px solid var(--p3-cyan-lt)',
                }}
              >
                <span
                  className="font-bold text-lg"
                  style={{ color: 'var(--p3-cyan-lt)', fontFamily: 'var(--p3-font-s)' }}
                >
                  {t.name.charAt(0).toUpperCase()}
                </span>
              </div>

              <h3
                className="text-lg tracking-widest"
                style={{ fontFamily: 'var(--p3-font-s)', color: 'var(--p3-cyan-lt)' }}
              >
                {t.name}
              </h3>
              <StarDisplay rating={t.rating} />
              <p className="text-zinc-400 mt-2 leading-relaxed text-sm">"{t.message}"</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
