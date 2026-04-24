CREATE TABLE "assertions" (
	"id" varchar(66) PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"claim" text NOT NULL,
	"mode" varchar(16) NOT NULL,
	"asserter" varchar(42) NOT NULL,
	"bond" numeric NOT NULL,
	"callback" varchar(42) NOT NULL,
	"callback_selector" varchar(10) NOT NULL,
	"challenge_period" integer NOT NULL,
	"outcome" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"reasoning_root" varchar(66),
	"verdict_tx" varchar(66),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"assertion_id" varchar(66) NOT NULL,
	"root_hash" varchar(66) NOT NULL,
	"uploader" varchar(42) NOT NULL,
	"mime" varchar(64),
	"size" integer,
	"metadata" jsonb,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "judge_agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_id" integer NOT NULL,
	"model" varchar(64) NOT NULL,
	"provider_address" varchar(42) NOT NULL,
	"total_verdicts" integer DEFAULT 0 NOT NULL,
	"appeals_lost" integer DEFAULT 0 NOT NULL,
	"reputation" numeric DEFAULT '1000' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "judge_agents_token_id_unique" UNIQUE("token_id")
);
--> statement-breakpoint
CREATE TABLE "reasoning_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"assertion_id" varchar(66) NOT NULL,
	"judge_token_id" integer,
	"storage_root" varchar(66) NOT NULL,
	"outcome" varchar(16) NOT NULL,
	"confidence" numeric,
	"chat_id" varchar(128),
	"tee_attestation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_assertion_id_assertions_id_fk" FOREIGN KEY ("assertion_id") REFERENCES "public"."assertions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reasoning_logs" ADD CONSTRAINT "reasoning_logs_assertion_id_assertions_id_fk" FOREIGN KEY ("assertion_id") REFERENCES "public"."assertions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reasoning_logs" ADD CONSTRAINT "reasoning_logs_judge_token_id_judge_agents_token_id_fk" FOREIGN KEY ("judge_token_id") REFERENCES "public"."judge_agents"("token_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assertions_asserter_idx" ON "assertions" USING btree ("asserter");--> statement-breakpoint
CREATE INDEX "assertions_outcome_idx" ON "assertions" USING btree ("outcome");--> statement-breakpoint
CREATE INDEX "assertions_created_idx" ON "assertions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "evidence_assertion_idx" ON "evidence" USING btree ("assertion_id");--> statement-breakpoint
CREATE INDEX "evidence_root_idx" ON "evidence" USING btree ("root_hash");--> statement-breakpoint
CREATE INDEX "reasoning_assertion_idx" ON "reasoning_logs" USING btree ("assertion_id");