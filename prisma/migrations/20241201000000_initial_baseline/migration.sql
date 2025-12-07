-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."proxy" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "proxy_key" VARCHAR(255) NOT NULL DEFAULT '',
    "addtime" INTEGER NOT NULL,
    "start_port" INTEGER NOT NULL DEFAULT 3002,

    CONSTRAINT "proxy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user" (
    "user_id" VARCHAR(64) NOT NULL,
    "status" INTEGER NOT NULL,
    "role" INTEGER NOT NULL,
    "permissions" TEXT NOT NULL,
    "server_api_keys" TEXT NOT NULL,
    "expires_at" INTEGER NOT NULL DEFAULT 0,
    "created_at" INTEGER NOT NULL DEFAULT 0,
    "updated_at" INTEGER NOT NULL DEFAULT 0,
    "ratelimit" INTEGER NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "encrypted_token" TEXT,
    "proxy_id" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "user_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "public"."server" (
    "server_id" VARCHAR(128) NOT NULL,
    "server_name" VARCHAR(128) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "launch_config" TEXT NOT NULL,
    "capabilities" TEXT NOT NULL,
    "created_at" INTEGER NOT NULL DEFAULT 0,
    "updated_at" INTEGER NOT NULL DEFAULT 0,
    "allow_user_input" BOOLEAN NOT NULL DEFAULT false,
    "proxy_id" INTEGER NOT NULL DEFAULT 0,
    "tool_tmpl_id" VARCHAR(128),

    CONSTRAINT "server_pkey" PRIMARY KEY ("server_id")
);

-- CreateTable
CREATE TABLE "public"."log" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" VARCHAR(64) NOT NULL,
    "type" INTEGER NOT NULL,
    "request_content" TEXT,
    "response_content" TEXT,
    "error_content" TEXT,
    "serverID" VARCHAR(128),

    CONSTRAINT "log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."mcp_events" (
    "id" SERIAL NOT NULL,
    "event_id" VARCHAR(255) NOT NULL,
    "stream_id" VARCHAR(255) NOT NULL,
    "session_id" VARCHAR(255) NOT NULL,
    "message_type" VARCHAR(50) NOT NULL,
    "message_data" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."dns_conf" (
    "id" SERIAL NOT NULL,
    "subdomain" VARCHAR(128) NOT NULL DEFAULT '',
    "type" INTEGER NOT NULL DEFAULT 0,
    "public_ip" VARCHAR(128) NOT NULL DEFAULT '',
    "proxy_id" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "dns_conf_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_events_event_id_key" ON "public"."mcp_events"("event_id");

-- CreateIndex
CREATE INDEX "mcp_events_stream_id_idx" ON "public"."mcp_events"("stream_id");

-- CreateIndex
CREATE INDEX "mcp_events_session_id_idx" ON "public"."mcp_events"("session_id");

-- CreateIndex
CREATE INDEX "mcp_events_created_at_idx" ON "public"."mcp_events"("created_at");

-- CreateIndex
CREATE INDEX "mcp_events_expires_at_idx" ON "public"."mcp_events"("expires_at");

