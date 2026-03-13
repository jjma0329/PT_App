import { useEffect, useRef } from 'react';
import Typed from 'typed.js';
import heroImage from '../assets/heroImage.png';

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
    <section
      id="home"
      className="min-h-screen flex items-center pt-20 bg-zinc-950"
    >
      <div className="max-w-7xl mx-auto px-6 md:px-10 w-full flex flex-col-reverse md:flex-row items-center gap-12 py-16">
        <div className="flex-1 space-y-6 text-center md:text-left">
          <h1 className="text-5xl md:text-7xl font-extrabold text-white leading-tight">
            Train <span className="text-yellow-400">Smarter.</span>
            <br />
            Become <span className="text-yellow-400">Stronger.</span>
          </h1>

          <h3 className="text-2xl font-bold text-yellow-400 min-h-[2rem]">
            <span ref={typedRef} />
          </h3>

          <p className="text-zinc-400 text-lg max-w-md mx-auto md:mx-0">
            I help busy people build sustainable strength and confidence — without the guesswork.
          </p>

          <button
            onClick={onOpenModal}
            className="inline-block px-8 py-3 bg-yellow-400 text-zinc-950 font-bold rounded-lg hover:bg-yellow-300 transition-colors text-lg"
          >
            Book a Session
          </button>
        </div>

        <div className="flex-1 flex justify-center">
          <img
            src={heroImage}
            alt="JJM Fitness trainer"
            className="max-h-[560px] w-auto object-contain drop-shadow-2xl"
          />
        </div>
      </div>
    </section>
  );
}
