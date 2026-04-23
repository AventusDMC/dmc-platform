-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_dueDate_idx" ON "payments"("dueDate");

-- CreateIndex
CREATE INDEX "payments_createdAt_idx" ON "payments"("createdAt");
