import { useState } from 'react';
import { cn } from '../lib/utils';

interface HeaderProps {
  onOpenModal: () => void;
}

const navItems = [
  { label: 'Home', href: '#home' },
  { label: 'Services', href: '#services' },
  { label: 'About Me', href: '#about' },
  { label: 'Contact', href: null },
  { label: 'Review', href: '#review' },
];

export function Header({ onOpenModal }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  const handleContactClick = () => {
    onOpenModal();
    closeMenu();
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-10 py-4 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-800">
      <a href="#home" className="text-xl font-extrabold text-white tracking-tight">
        JJM <span className="text-yellow-400">Fitness</span>
      </a>

      <button
        className="md:hidden text-white text-3xl leading-none"
        onClick={() => setMenuOpen(prev => !prev)}
        aria-label="Toggle menu"
      >
        <i className={cn('bx', menuOpen ? 'bx-x' : 'bx-menu')} />
      </button>

      <nav
        className={cn(
          'absolute top-full left-0 right-0 bg-zinc-950 border-b border-zinc-800',
          'md:static md:bg-transparent md:border-0 md:flex md:items-center md:gap-8',
          menuOpen ? 'block' : 'hidden md:flex'
        )}
      >
        {navItems.map(({ label, href }) =>
          href ? (
            <a
              key={label}
              href={href}
              onClick={closeMenu}
              className="block px-6 py-3 md:p-0 text-zinc-300 hover:text-yellow-400 transition-colors font-medium"
            >
              {label}
            </a>
          ) : (
            <button
              key={label}
              onClick={handleContactClick}
              className="block w-full text-left px-6 py-3 md:p-0 text-zinc-300 hover:text-yellow-400 transition-colors font-medium"
            >
              {label}
            </button>
          )
        )}
      </nav>

      <button
        onClick={onOpenModal}
        className="hidden md:block px-5 py-2 bg-yellow-400 text-zinc-950 font-bold rounded-lg hover:bg-yellow-300 transition-colors"
      >
        Book A Session
      </button>
    </header>
  );
}
