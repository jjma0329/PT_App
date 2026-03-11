import aboutImg from '../assets/about.jpg';

interface AboutSectionProps {
  onOpenModal: () => void;
}

export function AboutSection({ onOpenModal }: AboutSectionProps) {
  return (
    <section id="about" className="py-24 bg-zinc-950">
      <div className="max-w-7xl mx-auto px-6 md:px-10 flex flex-col md:flex-row items-center gap-12 md:gap-16">
        <div className="flex-1">
          <img
            src={aboutImg}
            alt="About the trainer"
            className="rounded-2xl w-full object-cover shadow-2xl"
          />
        </div>

        <div className="flex-1 space-y-5">
          <h2 className="text-4xl font-extrabold text-white">
            About <span className="text-yellow-400">Me</span>
          </h2>

          <p className="text-zinc-400 leading-relaxed">
            I haven't always been the person you see in these photos; I've personally navigated the
            challenges of being both underweight and overweight at different stages of my life.
          </p>
          <p className="text-zinc-400 leading-relaxed">
            Those experiences taught me that fitness isn't just about a physical shift, but about
            overcoming the unique mental and emotional hurdles that come with every body type.
          </p>
          <p className="text-zinc-400 leading-relaxed">
            My mission is to use that perspective to provide you with a professional, judgment-free
            space where your specific struggles are truly understood and respected.
          </p>
          <p className="text-zinc-400 leading-relaxed">
            Together, we will move past the "one-size-fits-all" approach to build a sustainable
            lifestyle that honors where you are today while pushing you toward your strongest self.
          </p>

          <button
            onClick={onOpenModal}
            className="inline-block px-8 py-3 bg-yellow-400 text-zinc-950 font-bold rounded-lg hover:bg-yellow-300 transition-colors"
          >
            Book a Free Class
          </button>
        </div>
      </div>
    </section>
  );
}
