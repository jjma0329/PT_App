import { Router } from 'express';
import { createContact } from '../controllers/contactController.js';

const router = Router();

router.post('/', createContact);

export default router;
