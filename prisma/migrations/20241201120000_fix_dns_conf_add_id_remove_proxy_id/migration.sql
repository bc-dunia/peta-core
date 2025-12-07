-- CreateTable
-- Create dns_conf table for DNS configuration management

CREATE TABLE IF NOT EXISTS dns_conf (
  id SERIAL PRIMARY KEY,
  subdomain VARCHAR(128) DEFAULT '' NOT NULL,
  type INT DEFAULT 0 NOT NULL,
  public_ip VARCHAR(128) DEFAULT '' NOT NULL
);

-- This table is used to manage DNS configurations
-- - id: Primary key, auto-increment
-- - subdomain: Subdomain name 
-- - type: DNS record type (0: A record, 1: CNAME, etc.)
-- - public_ip: Public IP address