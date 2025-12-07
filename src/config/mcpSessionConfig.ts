import { 
  SUPPORTED_PROTOCOL_VERSIONS as SDK_SUPPORTED_VERSIONS,
  LATEST_PROTOCOL_VERSION as SDK_LATEST_VERSION
} from "@modelcontextprotocol/sdk/types.js";

export const MCP_SESSION_TIMEOUT_MINUTES = 60;
export const MCP_SESSION_MAX_COUNT = 1000;

// Import protocol versions from MCP SDK to ensure version synchronization
export const SUPPORTED_PROTOCOL_VERSIONS = SDK_SUPPORTED_VERSIONS;
export const DEFAULT_PROTOCOL_VERSION = SDK_LATEST_VERSION;
