import { useState } from 'react';
import { Header } from '../components/Header';
import { HeroSection } from '../components/HeroSection';
import { ServicesSection } from '../components/ServicesSection';
import { AboutSection } from '../components/AboutSection';
import { PlansSection } from '../components/PlansSection';
import { ReviewsSection } from '../components/ReviewsSection';
import { TestimonialsSection } from '../components/TestimonialsSection';
import { Footer } from '../components/Footer';
import { ContactModal } from '../components/ContactModal';
import { BookingModal } from '../components/BookingModal';

export function LandingPage() {
  const [contactOpen, setContactOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);

  return (
    <>
      <Header onOpenModal={() => setBookingOpen(true)} onOpenContact={() => setContactOpen(true)} />
      <main>
        <HeroSection onOpenModal={() => setBookingOpen(true)} />
        <ServicesSection />
        <AboutSection onOpenModal={() => setBookingOpen(true)} />
        <PlansSection onOpenModal={() => setBookingOpen(true)} />
        <ReviewsSection />
        <TestimonialsSection />
      </main>
      <Footer />
      <ContactModal isOpen={contactOpen} onClose={() => setContactOpen(false)} />
      <BookingModal isOpen={bookingOpen} onClose={() => setBookingOpen(false)} />
    </>
  );
}
