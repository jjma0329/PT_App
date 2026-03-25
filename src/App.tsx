import { useState } from 'react';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { ServicesSection } from './components/ServicesSection';
import { AboutSection } from './components/AboutSection';
import { PlansSection } from './components/PlansSection';
import { ReviewsSection } from './components/ReviewsSection';
import { Footer } from './components/Footer';
import { ContactModal } from './components/ContactModal';
import { BookingModal } from './components/BookingModal';

export default function App() {
  // contactOpen: general inquiry form (existing Phase 1 contact flow)
  const [contactOpen, setContactOpen] = useState(false);
  // bookingOpen: the Phase 3 booking flow (date → time → form → confirmation)
  const [bookingOpen, setBookingOpen] = useState(false);

  return (
    <>
      <Header onOpenModal={() => setBookingOpen(true)} />
      <main>
        <HeroSection onOpenModal={() => setBookingOpen(true)} />
        <ServicesSection />
        <AboutSection onOpenModal={() => setBookingOpen(true)} />
        <PlansSection onOpenModal={() => setBookingOpen(true)} />
        <ReviewsSection />
      </main>
      <Footer />
      <ContactModal isOpen={contactOpen} onClose={() => setContactOpen(false)} />
      <BookingModal isOpen={bookingOpen} onClose={() => setBookingOpen(false)} />
    </>
  );
}
