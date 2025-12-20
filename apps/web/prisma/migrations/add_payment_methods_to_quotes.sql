-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('INVOICE', 'CREDIT_CARD', 'ACH', 'WIRE', 'PO');

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'INVOICE';
ALTER TABLE "Quote" ADD COLUMN "paymentTerms" TEXT;
ALTER TABLE "Quote" ADD COLUMN "poNumber" TEXT;