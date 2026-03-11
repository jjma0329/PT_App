import image1 from '../assets/image1.jpg';
import image2 from '../assets/image2.jpg';
import image3 from '../assets/image3.jpg';
import image4 from '../assets/image4.jpg';
import image5 from '../assets/image5.jpg';
import aboutImg from '../assets/about.jpg';

const services = [
  { img: image1, label: 'Physical Fitness' },
  { img: image2, label: 'Weight Gain' },
  { img: image3, label: 'Strength Training' },
  { img: image4, label: 'Fat Loss' },
  { img: image5, label: 'Weight Training' },
  { img: aboutImg, label: 'Cardio' },
];

export function ServicesSection() {
  return (
    <section id="services" className="py-24 bg-zinc-900">
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <h2 className="text-4xl font-extrabold text-white text-center mb-16">
          Our <span className="text-yellow-400">Services</span>
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          {services.map(({ img, label }) => (
            <div key={label} className="relative overflow-hidden rounded-xl group cursor-default">
              <img
                src={img}
                alt={label}
                className="w-full h-44 md:h-64 object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/85 via-zinc-950/20 to-transparent flex items-end">
                <h4 className="text-white font-bold text-base md:text-lg p-4">{label}</h4>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
