import { Request, Response } from 'express';
import { prisma } from '../lib/prisma.ts';

// POST /api/testimonials — public
// Accepts a submitted review from a client. Stored with approved=false until
// the trainer approves it from the admin UI.
// Expects: { name, rating, message }
export async function createTestimonial(req: Request, res: Response): Promise<void> {
  const { name, rating, message } = req.body as {
    name?: string;
    rating?: unknown;
    message?: string;
  };

  if (!name?.trim()) {
    res.status(400).json({ success: false, error: 'name is required.' });
    return;
  }

  if (name.trim().length > 100) {
    res.status(400).json({ success: false, error: 'name must be 100 characters or fewer.' });
    return;
  }

  if (!message?.trim()) {
    res.status(400).json({ success: false, error: 'message is required.' });
    return;
  }

  if (message.trim().length > 2000) {
    res.status(400).json({ success: false, error: 'message must be 2000 characters or fewer.' });
    return;
  }

  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    res.status(400).json({ success: false, error: 'rating must be an integer between 1 and 5.' });
    return;
  }

  try {
    const testimonial = await prisma.testimonial.create({
      data: {
        name:    name.trim(),
        rating:  ratingNum,
        message: message.trim(),
        // approved defaults to false — trainer must explicitly approve
      },
    });

    res.status(201).json({ success: true, data: testimonial });
  } catch (err) {
    console.error('createTestimonial error:', err);
    res.status(500).json({ success: false, error: 'Failed to save testimonial.' });
  }
}

// GET /api/testimonials/approved — public
// Returns only approved testimonials for the public landing page.
// Ordered oldest-first so the order feels stable across page loads.
export async function getApprovedTestimonials(req: Request, res: Response): Promise<void> {
  try {
    const testimonials = await prisma.testimonial.findMany({
      where:   { approved: true },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ success: true, data: testimonials });
  } catch (err) {
    console.error('getApprovedTestimonials error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch testimonials.' });
  }
}

// GET /api/testimonials — trainer-only
// Returns all testimonials (pending and approved) for the admin dashboard.
// Pending ones come first so the trainer sees what needs action.
export async function getTestimonials(req: Request, res: Response): Promise<void> {
  try {
    const testimonials = await prisma.testimonial.findMany({
      orderBy: [
        { approved: 'asc' },    // false (pending) before true (approved)
        { createdAt: 'desc' },   // newest within each group first
      ],
    });

    res.json({ success: true, data: testimonials });
  } catch (err) {
    console.error('getTestimonials error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch testimonials.' });
  }
}

// PATCH /api/testimonials/:id/approve — trainer-only
// Marks a testimonial as approved. Once approved it becomes visible on the public landing page.
export async function approveTestimonial(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid testimonial ID.' });
    return;
  }

  try {
    const testimonial = await prisma.testimonial.findUnique({ where: { id } });

    if (!testimonial) {
      res.status(404).json({ success: false, error: 'Testimonial not found.' });
      return;
    }

    if (testimonial.approved) {
      res.status(409).json({ success: false, error: 'Testimonial is already approved.' });
      return;
    }

    const updated = await prisma.testimonial.update({
      where: { id },
      data:  { approved: true },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('approveTestimonial error:', err);
    res.status(500).json({ success: false, error: 'Failed to approve testimonial.' });
  }
}
