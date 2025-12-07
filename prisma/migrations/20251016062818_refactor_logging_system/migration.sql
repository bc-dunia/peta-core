/*
  Warnings:

  - You are about to drop the column `proxy_id` on the `dns_conf` table. All the data in the column will be lost.
  - You are about to drop the column `event_type` on the `log` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."dns_conf" DROP COLUMN "proxy_id";

-- AlterTable
ALTER TABLE "public"."log" DROP COLUMN "event_type",
ADD COLUMN     "duration" INTEGER,
ADD COLUMN     "parent_uniform_request_id" VARCHAR,
ADD COLUMN     "proxy_request_id" VARCHAR,
ADD COLUMN     "server_id" VARCHAR(128),
ADD COLUMN     "status_code" INTEGER,
ALTER COLUMN "addtime" SET DATA TYPE BIGINT,
ALTER COLUMN "uniform_request_id" DROP NOT NULL,
ALTER COLUMN "uniform_request_id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "public"."oauth_clients" (
    "client_id" VARCHAR(255) NOT NULL,
    "client_secret" VARCHAR(255),
    "token_endpoint_auth_method" VARCHAR(50) NOT NULL DEFAULT 'client_secret_basic',
    "name" VARCHAR(255) NOT NULL,
    "redirect_uris" JSONB NOT NULL,
    "scopes" JSONB NOT NULL,
    "grant_types" JSONB NOT NULL,
    "response_types" JSONB NOT NULL DEFAULT '[]',
    "user_id" VARCHAR(64),
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("client_id")
);

-- CreateTable
CREATE TABLE "public"."oauth_authorization_codes" (
    "code" VARCHAR(255) NOT NULL,
    "client_id" VARCHAR(255) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "scopes" JSONB NOT NULL,
    "resource" TEXT,
    "code_challenge" VARCHAR(255),
    "challenge_method" VARCHAR(10),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "oauth_authorization_codes_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "public"."oauth_tokens" (
    "token_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "client_id" VARCHAR(255) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "scopes" JSONB NOT NULL,
    "resource" TEXT,
    "access_token_expires_at" TIMESTAMP(3) NOT NULL,
    "refresh_token_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "oauth_tokens_pkey" PRIMARY KEY ("token_id")
);

-- CreateIndex
CREATE INDEX "oauth_authorization_codes_client_id_idx" ON "public"."oauth_authorization_codes"("client_id");

-- CreateIndex
CREATE INDEX "oauth_authorization_codes_user_id_idx" ON "public"."oauth_authorization_codes"("user_id");

-- CreateIndex
CREATE INDEX "oauth_authorization_codes_expires_at_idx" ON "public"."oauth_authorization_codes"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_tokens_access_token_key" ON "public"."oauth_tokens"("access_token");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_tokens_refresh_token_key" ON "public"."oauth_tokens"("refresh_token");

-- CreateIndex
CREATE INDEX "oauth_tokens_client_id_idx" ON "public"."oauth_tokens"("client_id");

-- CreateIndex
CREATE INDEX "oauth_tokens_user_id_idx" ON "public"."oauth_tokens"("user_id");

-- CreateIndex
CREATE INDEX "oauth_tokens_access_token_idx" ON "public"."oauth_tokens"("access_token");

-- CreateIndex
CREATE INDEX "oauth_tokens_refresh_token_idx" ON "public"."oauth_tokens"("refresh_token");

-- CreateIndex
CREATE INDEX "oauth_tokens_access_token_expires_at_idx" ON "public"."oauth_tokens"("access_token_expires_at");

-- CreateIndex
CREATE INDEX "log_userid_idx" ON "public"."log"("userid");

-- CreateIndex
CREATE INDEX "log_session_id_idx" ON "public"."log"("session_id");

-- CreateIndex
CREATE INDEX "log_uniform_request_id_idx" ON "public"."log"("uniform_request_id");

-- CreateIndex
CREATE INDEX "log_server_id_idx" ON "public"."log"("server_id");

-- CreateIndex
CREATE INDEX "log_addtime_idx" ON "public"."log"("addtime");

-- AddForeignKey
ALTER TABLE "public"."oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."oauth_tokens" ADD CONSTRAINT "oauth_tokens_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;
