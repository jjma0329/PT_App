import rev1 from '../assets/test1.png';
import rev2 from '../assets/test2.jfif';
import rev3 from '../assets/test3.png';

const reviews = [
  {
    img: rev1,
    name: 'James',
    text: "I was a bit worried the sessions would be too 'rough and tumble' for a gentleman of my refined upbringing, but I was wrong! The core strength I've gained is simply marvelous—I can now hold a single rose between my teeth for hours without a single quiver! Plus, the trainer was surprisingly patient when I had to pause mid-squat to polish my favorite bottle caps. Such class! Such vigor!",
  },
  {
    img: rev2,
    name: 'Jessie',
    text: "Finally, a trainer who understands that a silhouette as stunning as mine requires more than just chasing a yellow rat through the woods! This workout is intense, dramatic, and absolutely fabulous. My hair has never looked more aerodynamic during a tactical retreat, and my lung capacity for long-winded speeches has tripled! If you want to look this good while failing at world domination, you simply must sign up.",
  },
  {
    img: rev3,
    name: 'Meowth',
    text: "I'm usually the one doin' the heavy liftin' for these two, but after workin' wit' dis trainer, I feel like a Persian in a Meowth's body! Me paws are quicker, me 'Fury Swipes' are actually scary now, and I got enough stamina to build a giant mechanical Magikarp without takin' a nap! It cost us a few paychecks we didn't exactly 'earn,' but hey—it's worth every penny!",
  },
];

function StarRating() {
  return (
    <div className="flex gap-1 justify-center my-2" aria-label="5 stars">
      {Array.from({ length: 5 }).map((_, i) => (
        <i key={i} className="bx bxs-star text-yellow-400 text-lg" />
      ))}
    </div>
  );
}

export function ReviewsSection() {
  return (
    <section id="review" className="py-24 bg-zinc-950">
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <h2 className="text-4xl font-extrabold text-white text-center mb-16">
          Client <span className="text-yellow-400">Reviews</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {reviews.map(({ img, name, text }) => (
            <div
              key={name}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center hover:border-yellow-400/50 transition-colors"
            >
              <img
                src={img}
                alt={name}
                className="w-24 h-24 rounded-full object-cover mx-auto mb-4 border-2 border-zinc-700"
              />
              <h3 className="text-white font-bold text-xl">{name}</h3>
              <StarRating />
              <p className="text-zinc-400 mt-2 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
