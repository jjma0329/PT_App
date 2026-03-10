import { Request, Response } from 'express';
import { PrismaClient } from '../../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import { sendContactAlert } from '../services/emailService.ts';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

export async function createContact(req: Request, res: Response): Promise<void> {
  const { name, email, phone, goal, message } = req.body;

  if (!name || !email) {
    res.status(400).json({ success: false, error: 'Name and email are required.' });
    return;
  }

  try {
    const submission = await prisma.contactSubmission.create({
      data: { name, email, phone: phone || null, goal: goal || null, message: message || null },
    });

    await sendContactAlert({ name, email, phone, goal, message });

    res.status(201).json({ success: true, data: submission });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to save submission.' });
  }
}
