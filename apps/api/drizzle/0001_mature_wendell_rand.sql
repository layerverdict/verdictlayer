CREATE TABLE "indexer_checkpoints" (
	"contract" varchar(64) PRIMARY KEY NOT NULL,
	"last_block" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
