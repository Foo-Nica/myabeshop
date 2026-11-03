-- CreateEnum
CREATE TYPE "PromoType" AS ENUM ('PERCENT', 'FIXED', 'FREE_SHIPPING');

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('MONTHLY', 'ANNUAL');

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_subscription_id_fkey";

-- DropIndex
DROP INDEX "subscriptions_store_id_idx";

-- DropIndex
DROP INDEX "payments_store_id_idx";

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "referral_code" TEXT,
ADD COLUMN     "referred_by_id" TEXT,
ADD COLUMN     "suspended_reason" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "discount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "promo_code" TEXT;

-- AlterTable
ALTER TABLE "order_events" ADD COLUMN     "client_action_id" TEXT;

-- AlterTable
ALTER TABLE "couriers" ADD COLUMN     "pin_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pin_hash" TEXT,
ADD COLUMN     "pin_locked_until" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'payment';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "checkout_url" TEXT,
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "failure_reason" TEXT,
ADD COLUMN     "gateway_ref" TEXT,
ADD COLUMN     "invoice_number" INTEGER,
ADD COLUMN     "months" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "payer_phone" TEXT,
ADD COLUMN     "period" "BillingPeriod" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "plan_id" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "subscription_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "counters" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "PromoType" NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "min_subtotal" INTEGER,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "usage_limit" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_spends" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "channel" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_spends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_store_id_code_key" ON "promo_codes"("store_id", "code");

-- CreateIndex
CREATE INDEX "ad_spends_store_id_day_idx" ON "ad_spends"("store_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "stores_referral_code_key" ON "stores"("referral_code");

-- CreateIndex
CREATE UNIQUE INDEX "order_events_client_action_id_key" ON "order_events"("client_action_id");

-- CreateIndex
CREATE INDEX "subscriptions_store_id_ends_at_idx" ON "subscriptions"("store_id", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_invoice_number_key" ON "payments"("invoice_number");

-- CreateIndex
CREATE INDEX "payments_store_id_created_at_idx" ON "payments"("store_id", "created_at");

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_referred_by_id_fkey" FOREIGN KEY ("referred_by_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_spends" ADD CONSTRAINT "ad_spends_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

