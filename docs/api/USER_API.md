# Peta Core User API Protocol Documentation

## Overview

This document describes the complete protocol specification for Peta Core User API. All user operations are provided through a unified `/user` endpoint using an action-based request routing mechanism.

**Architecture Note**: The User API is part of a transport-agnostic architecture where business logic (UserRequestHandler) is shared between two communication layers:
- **HTTP API** (`POST /user`) - RESTful interface (this document)
- **Socket.IO** (events) - Real-time bidirectional communication

Both protocols execute the same business logic and produce identical results.

## Basic Information

- **Endpoint**: `POST /user`
- **Authentication**: Bearer Token (any valid user)
- **Content Type**: `application/json`
- **Character Encoding**: UTF-8
- **Key Difference from Admin API**: No role checking - any valid, enabled user can access

## Unified Request Format

All user requests use a unified `UserRequest` structure:

```typescript
interface UserRequest<T = any> {
  action: UserActionType;  // Operation type (numeric enum)
  data?: T;                // Operation data (specific type depends on action)
}
```

### UserActionType Enum

*User operation type enum - uses numeric values for performance*

```typescript
export enum UserActionType {
  // ========== 1000-1999: Capability configuration operations ==========
  GET_CAPABILITIES = 1001,           // Get user's capability configuration
  SET_CAPABILITIES = 1002,           // Set user's capability configuration

  // ========== 2000-2999: Server configuration operations ==========
  CONFIGURE_SERVER = 2001,           // Configure a server for user
  UNCONFIGURE_SERVER = 2002,         // Unconfigure a server for user

  // ========== 3000-3999: Session query operations ==========
  GET_ONLINE_SESSIONS = 3001,        // Get user's online session list
}
```

### Request Examples

**curl example:**
```bash
curl -X POST http://localhost:3002/user \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "action": 1001
  }'
```

**TypeScript example:**
```typescript
const response = await fetch('http://localhost:3002/user', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    action: 1001,  // GET_CAPABILITIES
  })
});

const result = await response.json();
if (!result.success) {
  console.error('Operation failed:', result.error);
}
```

## Unified Response Format

All user requests return a unified `UserResponse` structure:

```typescript
interface UserResponse<T = any> {
  success: boolean;         // Whether operation succeeded
  data?: T;                // Return data on success
  error?: {                // Error information on failure
    code: UserErrorCode;   // Error code (numeric)
    message: string;       // Error message
  };
}
```

**Success response example:**
```json
{
  "success": true,
  "data": {
    "server1": {
      "enabled": true,
      "serverName": "Server 1",
      "tools": {...}
    }
  }
}
```

**Error response example:**
```json
{
  "success": false,
  "error": {
    "code": 2001,
    "message": "Server notion not found"
  }
}
```

## Permission Description

User API permissions are simple and straightforward:

- **Authentication Required**: All operations require a valid Bearer Token
- **No Role Checking**: Unlike Admin API, any valid, enabled user can access all operations
- **Token Validation**: UserAuthMiddleware validates token and checks user enabled status
- **Per-Operation Access Control**: Some operations (like CONFIGURE_SERVER) have additional validation based on server configuration

---

## API List

### Capability Operations (1000-1999)

#### 1001 GET_CAPABILITIES

**Function**: Get user's complete capability configuration, including all accessible servers, tools, resources, and prompts

**Request Parameters** (data):
```json
{}
```
*No parameters required - capabilities are retrieved for the authenticated user*

**Return Result** (data):
```json
{
  "filesystem": {
    "enabled": true,
    "serverName": "Filesystem Server",
    "tools": {
      "read_file": {
        "enabled": true,
        "description": "Read file contents",
        "dangerLevel": 0
      },
      "write_file": {
        "enabled": true,
        "description": "Write file contents",
        "dangerLevel": 2
      }
    },
    "resources": {
      "file://": {
        "enabled": true,
        "description": "File system resources"
      }
    },
    "prompts": {}
  },
  "notion": {
    "enabled": false,
    "serverName": "Notion Integration",
    "tools": {
      "search_pages": {
        "enabled": false,
        "description": "Search Notion pages",
        "dangerLevel": 0
      }
    },
    "resources": {},
    "prompts": {}
  }
}
```

**Field Description**:
- Each key is a `serverId`
- `enabled`: Whether user has access to this server
- `serverName`: Human-readable server name
- `tools`: Object mapping tool names to their configuration
  - `enabled`: Whether user can use this tool
  - `description`: Tool description
  - `dangerLevel`: Risk level (0=safe, 1=caution, 2=danger)
- `resources`: Object mapping resource URIs to their configuration
- `prompts`: Object mapping prompt names to their configuration

**Business Logic**:
1. Calls `CapabilitiesService.getUserCapabilities(userId)`
2. Merges admin-configured permissions with user-specific preferences
3. Returns complete `McpServerCapabilities` object

**Use Case**: Client applications call this on startup to display available features and enforce UI restrictions

---

#### 1002 SET_CAPABILITIES

**Function**: Update user's capability preferences (enable/disable servers, tools, resources, prompts)

**Request Parameters** (data):
```json
{
  "filesystem": {
    "enabled": true,
    "tools": {
      "write_file": {
        "enabled": false
      }
    }
  },
  "notion": {
    "enabled": false
  }
}
```

*User can submit partial configuration - only provided fields will be validated and saved*

**Return Result** (data):
```json
{
  "message": "Capabilities updated successfully"
}
```

**Business Logic**:
1. Get current complete capabilities via `handleGetCapabilities(userId)`
2. Validate submitted configuration:
   - Only save `enabled` fields
   - Skip non-existent servers/tools/resources/prompts
   - Ignore invalid data structures
3. Update `userPreferences` field in database
4. Notify all active MCP sessions via `SessionStore.updateUserPreferences(userId)`
   - Sessions receive `tools/list_changed`, `resources/list_changed`, `prompts/list_changed` events

**Important Notes**:
- Cannot enable capabilities not granted by admin
- Can only disable capabilities, not add new ones
- Changes take effect immediately for all user's active sessions
- User preferences are merged with admin permissions (admin takes precedence)

**Error Cases**:
- `INVALID_CAPABILITIES (3001)`: Malformed capability data structure

---

### Server Configuration Operations (2000-2999)

#### 2001 CONFIGURE_SERVER

**Function**: Configure a user-specific server with authentication credentials. Creates temporary server instance for this user.

**Request Parameters** (data):
```json
{
  "serverId": "notion",
  "authConf": [
    {
      "key": "{{NOTION_API_KEY}}",
      "value": "secret_ntn_123456789abcdef",
      "dataType": 1
    }
  ]
}
```

**Parameter Description**:
- `serverId` (string, required): Server ID to configure
- `authConf` (array, required): Authentication configuration array
  - `key` (string): Placeholder key from server's configTemplate (e.g., `{{API_KEY}}`)
  - `value` (string): Actual credential value to substitute
  - `dataType` (number): Data type (currently only `1` = string replacement is supported)

**Return Result** (data):
```json
{
  "serverId": "notion",
  "message": "Server configured and started successfully"
}
```

**Business Logic**:
1. **Validation**:
   - Check server exists in database
   - Verify `server.allowUserInput === true`
   - Verify `server.enabled === true`
   - Verify `server.configTemplate` exists
2. **Configuration Assembly**:
   - Parse server's `configTemplate` JSON
   - Extract `mcpJsonConf` from template
   - Replace placeholders with user-provided credentials
   - Handle OAuth expiration dates dynamically (Notion: 30 days, Figma: 90 days)
3. **Encryption and Storage**:
   - Encrypt launchConfig using user's token as encryption key
   - Save to `user.launchConfigs` database field
   - Update in-memory session data
4. **Server Startup**:
   - Create temporary server via `ServerManager.createTemporaryServer()`
   - Temporary server is isolated to this user
   - Extract and store server capabilities to `user.userPreferences`
5. **Notification**:
   - Push permission change notification to all user's connected clients (Socket.IO)
   - Notify all active MCP sessions to reload capabilities

**Error Cases**:
- `SERVER_NOT_FOUND (2001)`: Specified serverId doesn't exist
- `SERVER_DISABLED (2002)`: Server is disabled by admin
- `SERVER_NOT_ALLOW_USER_INPUT (2004)`: Server doesn't allow user configuration
- `SERVER_NO_CONFIG_TEMPLATE (2005)`: Server missing configTemplate
- `SERVER_CONFIG_INVALID (2003)`: Invalid authConf format or configTemplate JSON

**Security Notes**:
- Credentials are encrypted with user's token (AES-256-GCM)
- Only the user who configured the server can decrypt the credentials
- Temporary servers are isolated per-user (no cross-user access)

**Use Case**: User configures personal Notion/Figma/GitHub integration with their own API keys

---

#### 2002 UNCONFIGURE_SERVER

**Function**: Remove user's server configuration and stop temporary server instance. Idempotent operation.

**Request Parameters** (data):
```json
{
  "serverId": "notion"
}
```

**Return Result** (data):
```json
{
  "serverId": "notion",
  "message": "Server unconfigured successfully"
}
```

**If server not configured**:
```json
{
  "serverId": "notion",
  "message": "Server not configured (already unconfigured)"
}
```

**Business Logic**:
1. **Idempotency Check**:
   - Check if `launchConfigs[serverId]` exists
   - If not configured, return success immediately (idempotent)
2. **Server Cleanup**:
   - Force close temporary server via `ServerManager.closeTemporaryServer()`
   - Don't wait for pending requests (force close)
   - Continue even if server close fails (server may not exist)
3. **Data Cleanup**:
   - Remove from `user.launchConfigs` database field
   - Remove from `user.userPreferences` database field
4. **Notification**:
   - Notify all related users via Socket.IO (if server affects multiple users)
   - Notify all active MCP sessions to reload capabilities

**Important Notes**:
- Operation is idempotent - safe to call multiple times
- Server close failures are logged but don't block cleanup
- User's credentials are permanently deleted

**Use Case**: User revokes Notion integration or wants to reconfigure with new credentials

---

### Session Query Operations (3000-3999)

#### 3001 GET_ONLINE_SESSIONS

**Function**: Get list of user's currently active MCP sessions across all devices

**Request Parameters** (data):
```json
{}
```
*No parameters required - sessions are retrieved for the authenticated user*

**Return Result** (data):
```json
[
  {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "clientName": "Claude Desktop",
    "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "lastActive": "2026-01-15T08:30:45.123Z"
  },
  {
    "sessionId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "clientName": "Claude Web",
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
    "lastActive": "2026-01-15T08:28:12.456Z"
  }
]
```

**Field Description**:
- `sessionId` (string): Unique session identifier (UUID format)
- `clientName` (string): Client application name (from MCP initialize request)
- `userAgent` (string): HTTP User-Agent header from session creation
- `lastActive` (Date): ISO 8601 timestamp of last activity

**Business Logic**:
1. Get all `ClientSession` instances for user via `SessionStore.getUserSessions(userId)`
2. Map each session to `SessionData` format
3. Return array (empty if user has no active sessions)

**Important Notes**:
- Sessions are created when client connects to `/mcp` endpoint
- Sessions expire after 30 minutes of inactivity (configurable)
- Closing browser/app doesn't immediately remove session (waits for timeout or explicit DELETE)

**Use Case**:
- User wants to see which devices are connected to their account
- Security audit: check for unexpected sessions
- Multi-device management: identify sessions to disconnect

---

## Appendix: Error Code Reference

### General Errors (1000-1999)

| Error Code | Name | Trigger Condition |
|--------|------|----------|
| 1001 | INVALID_REQUEST | Request format error, missing `action` field, invalid action value |
| 1002 | UNAUTHORIZED | No valid authentication token provided or token expired |
| 1003 | USER_DISABLED | User account has been disabled by administrator |

### Server Configuration Errors (2000-2999)

| Error Code | Name | Trigger Condition |
|--------|------|----------|
| 2001 | SERVER_NOT_FOUND | Specified serverId does not exist in database |
| 2002 | SERVER_DISABLED | Server has been disabled by administrator (`enabled = false`) |
| 2003 | SERVER_CONFIG_INVALID | Invalid configTemplate JSON or authConf format; credential replacement resulted in invalid JSON |
| 2004 | SERVER_NOT_ALLOW_USER_INPUT | Server's `allowUserInput` field is `false` (only admin can configure) |
| 2005 | SERVER_NO_CONFIG_TEMPLATE | Server is missing `configTemplate` field (required for user configuration) |

### Capability Errors (3000-3999)

| Error Code | Name | Trigger Condition |
|--------|------|----------|
| 3001 | INVALID_CAPABILITIES | Submitted capabilities data structure is malformed or invalid |

### Internal Errors (5000+)

| Error Code | Name | Trigger Condition |
|--------|------|----------|
| 5001 | INTERNAL_ERROR | Unexpected server error (database failure, service unavailable, etc.) |

---

## HTTP Status Codes

The User API uses standard HTTP status codes in addition to application-level error codes:

| HTTP Status | Usage |
|-------------|-------|
| 200 OK | Request succeeded (check `success` field in response body) |
| 400 Bad Request | Invalid request format, malformed JSON |
| 401 Unauthorized | Missing or invalid authentication token |
| 500 Internal Server Error | Server error occurred (check `error.code` for details) |

---

## Version Information

- **Protocol Version**: 1.0
- **Last Updated**: January 15, 2026
- **Release Notes**:
  - Initial release of User API
  - Support for 5 core operations: capabilities management, server configuration, session queries
  - Transport-agnostic architecture (HTTP + Socket.IO)
  - Follows Admin API design patterns for consistency

---

## Comparison with Admin API

| Feature | User API | Admin API |
|---------|----------|-----------|
| **Endpoint** | `POST /user` | `POST /admin` |
| **Authentication** | Bearer Token | Bearer Token |
| **Role Checking** | ❌ No (any valid user) | ✅ Yes (Owner/Admin only) |
| **Operations** | 5 user-facing operations | 40+ admin operations |
| **Scope** | User's own data and preferences | System-wide management |
| **Transport** | HTTP + Socket.IO | HTTP only |

---

## Best Practices

### For Client Developers

1. **Call GET_CAPABILITIES on Startup**:
   ```typescript
   const capabilities = await fetchUserCapabilities(token);
   // Use capabilities to show/hide UI features
   if (!capabilities.filesystem.tools.write_file.enabled) {
     disableFileWriteButton();
   }
   ```

2. **Handle Errors Gracefully**:
   ```typescript
   if (!response.success) {
     switch (response.error.code) {
       case 2001: // SERVER_NOT_FOUND
         showError('This server is not available');
         break;
       case 2002: // SERVER_DISABLED
         showError('This server has been disabled by admin');
         break;
       default:
         showError(response.error.message);
     }
   }
   ```

3. **Listen for Real-time Updates**:
   - If using Socket.IO, listen for `notification` events with `type: 'permission_changed'`
   - Re-fetch capabilities when permissions change
   - Update UI to reflect new capabilities

4. **Use Idempotent Operations**:
   - `UNCONFIGURE_SERVER` is safe to retry
   - Check current state with `GET_CAPABILITIES` before operations

### For Server Administrators

1. **Server Configuration**:
   - Set `allowUserInput = true` only for servers that support user-provided credentials
   - Provide clear `configTemplate` with placeholder keys (e.g., `{{API_KEY}}`)
   - Document required credentials in server description

2. **Permission Management**:
   - Use Admin API to set baseline permissions for users
   - User's SET_CAPABILITIES only affects `enabled` flags, not add new capabilities
   - Admin permissions always take precedence

3. **Security**:
   - User credentials are encrypted with user's token (no admin access)
   - Temporary servers are isolated per-user
   - Monitor `GET_ONLINE_SESSIONS` for unusual activity

---

## Related Documentation

- **Admin API**: `docs/api/ADMIN_API.md` - System administration operations
- **MCP API**: `docs/api/API.md` - Model Context Protocol endpoints
- **Socket.IO**: `docs/api/SOCKET_USAGE.md` - Real-time communication layer
- **Architecture**: `CLAUDE.md` - System architecture and design patterns

---

## Support

For issues, questions, or feature requests:
- GitHub Issues: [https://github.com/dunialabs/peta-core/issues](https://github.com/dunialabs/peta-core/issues)
- Documentation: [https://github.com/dunialabs/peta-core](https://github.com/dunialabs/peta-core)
