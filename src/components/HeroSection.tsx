import { useEffect, useRef } from 'react';
import Typed from 'typed.js';
import heroImage from '../assets/psyduck1.png';

interface HeroSectionProps {
  onOpenModal: () => void;
}

export function HeroSection({ onOpenModal }: HeroSectionProps) {
  const typedRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!typedRef.current) return;

    const typed = new Typed(typedRef.current, {
      strings: ['Physical Fitness', 'Weight Gain', 'Strength Training', 'Fat Loss', 'Weight Lifting'],
      typeSpeed: 60,
      backSpeed: 60,
      backDelay: 1000,
      loop: true,
    });

    return () => typed.destroy();
  }, []);

  return (
    <section id="home" className="relative min-h-screen flex items-center">
      {/* Full-bleed background image */}
      <img
        src={heroImage}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover object-center"
      />

      {/* Gradient overlay — strong on the left for text legibility, fades out to the right */}
      <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/80 to-zinc-950/10" />

      {/* Content sits above the image and overlay */}
      <div className="relative z-10 w-full px-6 md:px-16 lg:px-24 pt-24 pb-16">
        <div className="max-w-2xl space-y-6">
          <h1 className="text-5xl md:text-7xl font-extrabold text-white leading-tight">
            Train <span className="text-yellow-400">Smarter.</span>
            <br />
            Become <span className="text-yellow-400">Stronger.</span>
          </h1>

          <h3 className="text-2xl font-bold text-yellow-400 min-h-[2rem]">
            <span ref={typedRef} />
          </h3>

          <p className="text-zinc-300 text-lg max-w-md">
            I help busy people build sustainable strength and confidence — without the guesswork.
          </p>

          <button
            onClick={onOpenModal}
            className="inline-block px-8 py-3 bg-yellow-400 text-zinc-950 font-bold rounded-lg hover:bg-yellow-300 transition-colors text-lg"
          >
            Book a Session
          </button>
        </div>
      </div>
    </section>
  );
}
