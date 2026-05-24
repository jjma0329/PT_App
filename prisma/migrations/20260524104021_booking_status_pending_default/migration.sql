-- AlterTable
ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'pending';

-- CreateIndex
CREATE INDEX "Booking_status_slotTime_reminderSentAt_idx" ON "Booking"("status", "slotTime", "reminderSentAt");

-- CreateIndex
CREATE INDEX "Booking_status_slotTime_reviewRequestSentAt_idx" ON "Booking"("status", "slotTime", "reviewRequestSentAt");

-- CreateIndex
CREATE INDEX "Booking_email_idx" ON "Booking"("email");
