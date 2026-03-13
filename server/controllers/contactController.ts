import { Request, Response } from 'express';
import { prisma } from '../lib/prisma.ts';
import { sendContactAlert } from '../services/emailService.ts';

export async function createContact(req: Request, res: Response): Promise<void> {
  const { name, email, phone, goal, message } = req.body as {
    name?: string;
    email?: string;
    phone?: string;
    goal?: string;
    message?: string;
  };

  if (!name || !email) {
    res.status(400).json({ success: false, error: 'Name and email are required.' });
    return;
  }

  try {
    const submission = await prisma.contactSubmission.create({
      data: { name, email, phone: phone || null, goal: goal || null, message: message || null },
    });

    try {
      await sendContactAlert({ name, email, phone, goal, message });
    } catch {
      // Email failure is non-fatal — submission is already saved
    }

    res.status(201).json({ success: true, data: submission });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to save submission.' });
  }
}
