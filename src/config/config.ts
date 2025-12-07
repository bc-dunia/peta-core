import dotenv from "dotenv";
import packageJson from '../../package.json' with { type: "json" };

dotenv.config();
export const ENV = process.env;

/**
 * Application basic information configuration
 * Read from package.json to ensure global consistency
 */
export const APP_INFO = {
  name: packageJson.name,
  version: packageJson.version,
  description: packageJson.description || ''
} as const;


