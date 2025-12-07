-- CreateIndex
CREATE INDEX "idx_oauth_client_duplicate_check" ON "oauth_clients"("name", "token_endpoint_auth_method");
