import { Router } from 'express';
import {
  createTestimonial,
  getApprovedTestimonials,
  getTestimonials,
  approveTestimonial,
} from '../controllers/testimonialController.ts';
import { requireJwt } from '../middleware/requireJwt.ts';

const router = Router();

// GET /api/testimonials/approved — public, used by the landing page
// Must be registered BEFORE /:id routes to prevent 'approved' being parsed as an ID
router.get('/approved', getApprovedTestimonials);

// GET /api/testimonials — trainer-only, returns all (pending + approved) for admin UI
router.get('/', requireJwt, getTestimonials);

// POST /api/testimonials — public, client submits a review
router.post('/', createTestimonial);

// PATCH /api/testimonials/:id/approve — trainer-only
router.patch('/:id/approve', requireJwt, approveTestimonial);

export default router;
