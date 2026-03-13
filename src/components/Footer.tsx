export function Footer() {
  return (
    <footer className="bg-zinc-900 border-t border-zinc-800 py-8 text-center">
      <div className="flex justify-center gap-6 mb-4">
        <a
          href="#"
          aria-label="Facebook"
          className="text-zinc-400 hover:text-yellow-400 transition-colors text-2xl"
        >
          <i className="bx bxl-facebook" />
        </a>
        <a
          href="#"
          aria-label="Instagram"
          className="text-zinc-400 hover:text-yellow-400 transition-colors text-2xl"
        >
          <i className="bx bxl-instagram" />
        </a>
        <a
          href="#"
          aria-label="LinkedIn"
          className="text-zinc-400 hover:text-yellow-400 transition-colors text-2xl"
        >
          <i className="bx bxl-linkedin" />
        </a>
      </div>
      <p className="text-zinc-500 text-sm">© JJM Fitness 2026 — All Rights Reserved</p>
    </footer>
  );
}
