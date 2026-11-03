-- CreateEnum
CREATE TYPE "StoreRole" AS ENUM ('OWNER', 'MANAGER', 'AGENT', 'COURIER');

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('ACTIVE', 'CLOSED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'UNREACHABLE', 'CONFIRMED', 'CANCELLED', 'SHIPPED', 'POSTPONED', 'DELIVERED', 'REFUSED', 'RETURNED');

-- CreateEnum
CREATE TYPE "OrderEventType" AS ENUM ('CREATED', 'STATUS', 'NOTE', 'CALL', 'WHATSAPP', 'ASSIGN', 'EDIT');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "password_hash" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "is_super_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "custom_domain" TEXT,
    "country" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "category" TEXT NOT NULL DEFAULT 'other',
    "description" TEXT,
    "logo_url" TEXT,
    "banner_url" TEXT,
    "primary_color" TEXT NOT NULL DEFAULT '#0f766e',
    "theme" TEXT NOT NULL DEFAULT 'classic',
    "phone" TEXT,
    "whatsapp_phone" TEXT,
    "address" TEXT,
    "opening_hours" TEXT,
    "social" JSONB NOT NULL DEFAULT '{}',
    "delivery_policy" TEXT,
    "return_policy" TEXT,
    "status" "StoreStatus" NOT NULL DEFAULT 'ACTIVE',
    "closed_message" TEXT,
    "max_orders_per_phone_per_day" INTEGER NOT NULL DEFAULT 5,
    "block_unserved_zones" BOOLEAN NOT NULL DEFAULT true,
    "order_seq" INTEGER NOT NULL DEFAULT 0,
    "plan_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_members" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "StoreRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "short_code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" INTEGER NOT NULL,
    "compare_at_price" INTEGER,
    "cost" INTEGER,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "video_url" TEXT,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "track_stock" BOOLEAN NOT NULL DEFAULT false,
    "stock" INTEGER,
    "low_stock_threshold" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "title" TEXT NOT NULL,
    "price" INTEGER,
    "stock" INTEGER,
    "sku" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quantity_offers" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "label" TEXT,

    CONSTRAINT "quantity_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "delivered_count" INTEGER NOT NULL DEFAULT 0,
    "refused_count" INTEGER NOT NULL DEFAULT 0,
    "blacklisted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "fee" INTEGER NOT NULL,
    "free_above" INTEGER,
    "delay" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "tracking_token" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
    "currency" TEXT NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "delivery_fee" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "zone_id" TEXT,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "gps_lat" DOUBLE PRECISION,
    "gps_lng" DOUBLE PRECISION,
    "note" TEXT,
    "source" TEXT,
    "utm" JSONB,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "agent_id" TEXT,
    "courier_id" TEXT,
    "call_attempts" INTEGER NOT NULL DEFAULT 0,
    "postponed_to" TIMESTAMP(3),
    "refusal_reason" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "title" TEXT NOT NULL,
    "variant_title" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "type" "OrderEventType" NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus",
    "user_id" TEXT,
    "user_name" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "couriers" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "commission" INTEGER NOT NULL DEFAULT 0,
    "cash_balance" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "couriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_remittances" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "courier_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "note" TEXT,
    "validated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_remittances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "limits" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "otp_codes_target_created_at_idx" ON "otp_codes"("target", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "stores_slug_key" ON "stores"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "stores_custom_domain_key" ON "stores"("custom_domain");

-- CreateIndex
CREATE INDEX "store_members_user_id_idx" ON "store_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_members_store_id_user_id_key" ON "store_members"("store_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_short_code_key" ON "products"("short_code");

-- CreateIndex
CREATE INDEX "products_store_id_status_idx" ON "products"("store_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "products_store_id_slug_key" ON "products"("store_id", "slug");

-- CreateIndex
CREATE INDEX "product_variants_store_id_idx" ON "product_variants"("store_id");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE INDEX "quantity_offers_store_id_idx" ON "quantity_offers"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "quantity_offers_product_id_quantity_key" ON "quantity_offers"("product_id", "quantity");

-- CreateIndex
CREATE UNIQUE INDEX "customers_store_id_phone_key" ON "customers"("store_id", "phone");

-- CreateIndex
CREATE INDEX "delivery_zones_store_id_idx" ON "delivery_zones"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_tracking_token_key" ON "orders"("tracking_token");

-- CreateIndex
CREATE INDEX "orders_store_id_status_created_at_idx" ON "orders"("store_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "orders_store_id_created_at_idx" ON "orders"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_store_id_customer_phone_idx" ON "orders"("store_id", "customer_phone");

-- CreateIndex
CREATE INDEX "orders_courier_id_idx" ON "orders"("courier_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_store_id_number_key" ON "orders"("store_id", "number");

-- CreateIndex
CREATE INDEX "order_items_store_id_idx" ON "order_items"("store_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_events_order_id_created_at_idx" ON "order_events"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "order_events_store_id_idx" ON "order_events"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "couriers_store_id_phone_key" ON "couriers"("store_id", "phone");

-- CreateIndex
CREATE INDEX "cash_remittances_store_id_idx" ON "cash_remittances"("store_id");

-- CreateIndex
CREATE INDEX "cash_remittances_courier_id_created_at_idx" ON "cash_remittances"("courier_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE INDEX "subscriptions_store_id_idx" ON "subscriptions"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");

-- CreateIndex
CREATE INDEX "payments_store_id_idx" ON "payments"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_store_id_type_key" ON "integrations"("store_id", "type");

-- CreateIndex
CREATE INDEX "audit_logs_store_id_created_at_idx" ON "audit_logs"("store_id", "created_at");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_members" ADD CONSTRAINT "store_members_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_members" ADD CONSTRAINT "store_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quantity_offers" ADD CONSTRAINT "quantity_offers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_courier_id_fkey" FOREIGN KEY ("courier_id") REFERENCES "couriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "couriers" ADD CONSTRAINT "couriers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_remittances" ADD CONSTRAINT "cash_remittances_courier_id_fkey" FOREIGN KEY ("courier_id") REFERENCES "couriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
