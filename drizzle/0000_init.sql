CREATE TYPE "public"."cancel_side" AS ENUM('client', 'driver', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('pending', 'accepted', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."order_mode" AS ENUM('now', 'scheduled');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('searching', 'assigned', 'confirmed', 'en_route', 'arrived', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."penalty_tier" AS ENUM('free', 'late', 'very_late', 'no_confirm');--> statement-breakpoint
CREATE TYPE "public"."pricing_unit" AS ENUM('trip', 'hour');--> statement-breakpoint
CREATE TYPE "public"."service_kind" AS ENUM('cargo', 'equipment');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('client', 'driver', 'admin');--> statement-breakpoint
CREATE TYPE "public"."verification" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."wallet_kind" AS ENUM('topup', 'commission', 'refund', 'fine', 'bonus', 'adjustment');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"verification" "verification" DEFAULT 'pending' NOT NULL,
	"reject_reason" text,
	"balance" integer DEFAULT 0 NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"location_at" timestamp with time zone,
	"home_address" text,
	"home_lat" double precision,
	"home_lng" double precision,
	"going_home" boolean DEFAULT false NOT NULL,
	"detour_km" real DEFAULT 3 NOT NULL,
	"radius_km" real DEFAULT 10 NOT NULL,
	"scheduled_blocked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"price" integer NOT NULL,
	"eta_min" integer,
	"status" "offer_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" serial NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" "service_kind" NOT NULL,
	"mode" "order_mode" NOT NULL,
	"type_id" integer NOT NULL,
	"status" "order_status" DEFAULT 'searching' NOT NULL,
	"pickup_address" text NOT NULL,
	"pickup_lat" double precision NOT NULL,
	"pickup_lng" double precision NOT NULL,
	"dropoff_address" text,
	"dropoff_lat" double precision,
	"dropoff_lng" double precision,
	"distance_km" real,
	"scheduled_at" timestamp with time zone,
	"duration_hours" real,
	"cargo_desc" text,
	"loaders" smallint DEFAULT 0 NOT NULL,
	"comment" text,
	"unit" "pricing_unit" NOT NULL,
	"client_price" integer NOT NULL,
	"final_price" integer,
	"commission" integer,
	"commission_refunded" boolean DEFAULT false NOT NULL,
	"driver_id" uuid,
	"vehicle_id" uuid,
	"urgent" boolean DEFAULT false NOT NULL,
	"assigned_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"arrived_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"billed_hours" real,
	"total_price" integer,
	"cancelled_by" "cancel_side",
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "penalties" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"driver_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"tier" "penalty_tier" NOT NULL,
	"fine" integer DEFAULT 0 NOT NULL,
	"commission_kept" integer DEFAULT 0 NOT NULL,
	"waived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"stars" smallint NOT NULL,
	"text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_codes" (
	"phone" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_points" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"role" "user_role",
	"rating_sum" integer DEFAULT 0 NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"late_cancels" integer DEFAULT 0 NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "vehicle_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "service_kind" NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit" "pricing_unit" NOT NULL,
	"min_hours" real,
	"base_price" integer NOT NULL,
	"per_km" integer DEFAULT 0 NOT NULL,
	"commission_pct" real DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "vehicle_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"type_id" integer NOT NULL,
	"plate" text NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_tx" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"driver_id" uuid NOT NULL,
	"kind" "wallet_kind" NOT NULL,
	"amount" integer NOT NULL,
	"order_id" uuid,
	"provider" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_driver_id_drivers_user_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_type_id_vehicle_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."vehicle_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_driver_id_drivers_user_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_driver_id_drivers_user_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_points" ADD CONSTRAINT "track_points_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_drivers_user_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_type_id_vehicle_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."vehicle_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_tx" ADD CONSTRAINT "wallet_tx_driver_id_drivers_user_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_tx" ADD CONSTRAINT "wallet_tx_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offers_order_driver" ON "offers" USING btree ("order_id","driver_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status","mode","scheduled_at");--> statement-breakpoint
CREATE INDEX "orders_client_idx" ON "orders" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "orders_driver_idx" ON "orders" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "penalties_driver_idx" ON "penalties" USING btree ("driver_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_order_author" ON "reviews" USING btree ("order_id","author_id");--> statement-breakpoint
CREATE INDEX "track_order_idx" ON "track_points" USING btree ("order_id","at");--> statement-breakpoint
CREATE INDEX "wallet_driver_idx" ON "wallet_tx" USING btree ("driver_id","created_at");