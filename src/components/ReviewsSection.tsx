import rev1 from '../assets/1.jpg';
import rev2 from '../assets/2.jpg';
import rev3 from '../assets/3.jpg';

const reviews = [
  { img: rev1, name: 'Joseph', text: 'review here review here' },
  { img: rev2, name: 'Yucheng', text: 'review here review here' },
  { img: rev3, name: 'Alicia', text: 'review here review here' },
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
