import { useState } from 'react';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { ServicesSection } from './components/ServicesSection';
import { AboutSection } from './components/AboutSection';
import { PlansSection } from './components/PlansSection';
import { ReviewsSection } from './components/ReviewsSection';
import { Footer } from './components/Footer';
import { ContactModal } from './components/ContactModal';

export default function App() {
  const [modalOpen, setModalOpen] = useState(false);

  const openModal = () => setModalOpen(true);
  const closeModal = () => setModalOpen(false);

  return (
    <>
      <Header onOpenModal={openModal} />
      <main>
        <HeroSection onOpenModal={openModal} />
        <ServicesSection />
        <AboutSection onOpenModal={openModal} />
        <PlansSection onOpenModal={openModal} />
        <ReviewsSection />
      </main>
      <Footer />
      <ContactModal isOpen={modalOpen} onClose={closeModal} />
    </>
  );
}
