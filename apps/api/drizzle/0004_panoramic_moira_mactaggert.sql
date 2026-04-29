CREATE TABLE "authenticity_checks" (
	"id" integer NOT NULL,
	"chain_id" integer NOT NULL,
	"submitter" varchar(42) NOT NULL,
	"asset_hash" varchar(66) NOT NULL,
	"reference_hash" varchar(66) NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"assertion_id" varchar(66),
	"reasoning_root" varchar(66),
	"submitted_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authenticity_checks_chain_id_id_pk" PRIMARY KEY("chain_id","id")
);
--> statement-breakpoint
CREATE TABLE "escrows" (
	"id" integer NOT NULL,
	"chain_id" integer NOT NULL,
	"client" varchar(42) NOT NULL,
	"freelancer" varchar(42) NOT NULL,
	"token" varchar(42) NOT NULL,
	"amount" numeric NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"dispute_response_deadline" timestamp with time zone,
	"status" varchar(32) DEFAULT 'FUNDED' NOT NULL,
	"scope" text NOT NULL,
	"delivery_evidence" varchar(66),
	"client_evidence" varchar(66),
	"freelancer_evidence" varchar(66),
	"assertion_id" varchar(66),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "escrows_chain_id_id_pk" PRIMARY KEY("chain_id","id")
);
--> statement-breakpoint
CREATE TABLE "grants" (
	"id" integer NOT NULL,
	"chain_id" integer NOT NULL,
	"dao" varchar(42) NOT NULL,
	"grantee" varchar(42) NOT NULL,
	"token" varchar(42) NOT NULL,
	"total_amount" numeric NOT NULL,
	"released_amount" numeric DEFAULT '0' NOT NULL,
	"milestone_count" integer NOT NULL,
	"milestones_released" integer DEFAULT 0 NOT NULL,
	"grant_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grants_chain_id_id_pk" PRIMARY KEY("chain_id","id")
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" integer NOT NULL,
	"chain_id" integer NOT NULL,
	"insurer" varchar(42) NOT NULL,
	"holder" varchar(42) NOT NULL,
	"premium" numeric NOT NULL,
	"payout" numeric NOT NULL,
	"coverage_start" timestamp with time zone NOT NULL,
	"coverage_end" timestamp with time zone NOT NULL,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"condition" text NOT NULL,
	"claim_evidence" varchar(66),
	"assertion_id" varchar(66),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policies_chain_id_id_pk" PRIMARY KEY("chain_id","id")
);
--> statement-breakpoint
CREATE INDEX "checks_submitter_idx" ON "authenticity_checks" USING btree ("submitter");--> statement-breakpoint
CREATE INDEX "checks_status_idx" ON "authenticity_checks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "checks_asset_idx" ON "authenticity_checks" USING btree ("asset_hash");--> statement-breakpoint
CREATE INDEX "checks_created_idx" ON "authenticity_checks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "escrows_client_idx" ON "escrows" USING btree ("client");--> statement-breakpoint
CREATE INDEX "escrows_freelancer_idx" ON "escrows" USING btree ("freelancer");--> statement-breakpoint
CREATE INDEX "escrows_status_idx" ON "escrows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "escrows_created_idx" ON "escrows" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "grants_dao_idx" ON "grants" USING btree ("dao");--> statement-breakpoint
CREATE INDEX "grants_grantee_idx" ON "grants" USING btree ("grantee");--> statement-breakpoint
CREATE INDEX "grants_created_idx" ON "grants" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "policies_holder_idx" ON "policies" USING btree ("holder");--> statement-breakpoint
CREATE INDEX "policies_insurer_idx" ON "policies" USING btree ("insurer");--> statement-breakpoint
CREATE INDEX "policies_status_idx" ON "policies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "policies_created_idx" ON "policies" USING btree ("created_at");