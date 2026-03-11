interface PlansSectionProps {
  onOpenModal: () => void;
}

const plans = [
  { sessions: 10, price: '1400 NTD' },
  { sessions: 20, price: '1200 NTD' },
  { sessions: 30, price: '1000 NTD' },
];

export function PlansSection({ onOpenModal }: PlansSectionProps) {
  return (
    <section id="plans" className="py-24 bg-zinc-900">
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <h2 className="text-4xl font-extrabold text-white text-center mb-16">
          Session <span className="text-yellow-400">Plans</span>
        </h2>

        <div className="flex flex-col md:flex-row items-stretch justify-center gap-6 max-w-3xl mx-auto">
          {plans.map(({ sessions, price }) => (
            <div
              key={sessions}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-2xl p-8 text-center hover:border-yellow-400 transition-colors"
            >
              <h3 className="text-xl font-bold text-white mb-4">{sessions} Sessions</h3>
              <p className="text-3xl font-extrabold text-yellow-400">
                {price}
                <span className="text-sm text-zinc-500 font-normal"> /Month</span>
              </p>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <button
            onClick={onOpenModal}
            className="inline-flex items-center gap-2 px-8 py-3 bg-yellow-400 text-zinc-950 font-bold rounded-lg hover:bg-yellow-300 transition-colors text-lg"
          >
            Join Now
            <i className="bx bx-right-arrow-alt text-xl" />
          </button>
        </div>
      </div>
    </section>
  );
}
