declare class Typed {
    constructor(element: string | Element, options: {
        strings: string[];
        typeSpeed: number;
        backSpeed: number;
        backDelay: number;
        loop: boolean;
    });
}

/* Modal Logic */

const modal = document.getElementById('contactModal') as HTMLElement;
const closeModalBtn = document.getElementById('closeModal') as HTMLElement;
const contactForm = document.getElementById('contactForm') as HTMLFormElement;
const formSuccess = document.getElementById('formSuccess') as HTMLElement;

document.querySelectorAll<HTMLElement>('.open-modal').forEach(btn => {
    btn.addEventListener('click', (e: MouseEvent) => {
        e.preventDefault();
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
});

function closeModal(): void {
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

closeModalBtn.addEventListener('click', closeModal);

modal.addEventListener('click', (e: MouseEvent) => {
    if (e.target === modal) closeModal();
});

document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeModal();
});

contactForm.addEventListener('submit', async (e: SubmitEvent) => {
    e.preventDefault();

    const submitBtn = contactForm.querySelector<HTMLButtonElement>('.submit-btn')!;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    const body = {
        name: (document.getElementById('formName') as HTMLInputElement).value,
        email: (document.getElementById('formEmail') as HTMLInputElement).value,
        phone: (document.getElementById('formPhone') as HTMLInputElement).value,
        goal: (document.getElementById('formGoal') as HTMLSelectElement).value,
        message: (document.getElementById('formMessage') as HTMLTextAreaElement).value,
    };

    try {
        const res = await fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!res.ok) throw new Error('Server error');

        contactForm.style.display = 'none';
        formSuccess.classList.add('visible');
        setTimeout(() => {
            closeModal();
            contactForm.reset();
            contactForm.style.display = '';
            formSuccess.classList.remove('visible');
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Send Message <i class="bx bx-send"></i>';
        }, 2500);
    } catch {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Send Message <i class="bx bx-send"></i>';
        alert('Something went wrong. Please try again.');
    }
});

/* Menu Toggle */

const menu = document.querySelector<HTMLElement>('#menu-icon')!;
const navbar = document.querySelector<HTMLElement>('.navbar')!;

menu.onclick = (e: MouseEvent) => {
    e.stopPropagation();
    menu.classList.toggle('bx-x');
    navbar.classList.toggle('active');
};

window.onscroll = (): void => {
    menu.classList.remove('bx-x');
    navbar.classList.remove('active');
};

/* Typing Text */

new Typed('.multiple-text', {
    strings: ['Physical Fitness', 'Weight Gain', 'Strength Training', 'Fat Loss', 'Weight Lifting'],
    typeSpeed: 60,
    backSpeed: 60,
    backDelay: 1000,
    loop: true,
});
