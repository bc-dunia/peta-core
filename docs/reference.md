# Reference

## Usage Examples

### Admin API (Peta Console)

Peta Console uses a single `/admin` endpoint to perform administrative operations.

**Example: create a user**

```bash
curl -X POST http://localhost:3002/admin \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "action": 1010,
    "data": {
      "userId": "user123",
      "status": 1,
      "role": 0
    }
  }'
```

The exact action codes and payloads are defined in `api/ADMIN_API.md`.

### Socket.IO (Peta Desk)

Peta Desk uses Socket.IO for real-time communication with Peta Core.

**Example: connect and fetch capabilities**

```ts
import { io } from "socket.io-client";

const socket = io("http://localhost:3002", {
  auth: { token: "USER_ACCESS_TOKEN" },
});

socket.on("connect", () => {
  console.log("connected", socket.id);

  socket.emit("get_capabilities", { requestId: "req-123" });
});

socket.on("socket_response", (response) => {
  if (response.requestId === "req-123" && response.success) {
    console.log("capabilities", response.data);
  }
});

socket.on("notification", (payload) => {
  // handle capability changes, approval requests, etc.
});
```

See `api/SOCKET_USAGE.md` for the full event list and payload schemas.

### OAuth 2.0

Peta Core exposes an OAuth 2.0 service for obtaining access tokens that can be used with MCP clients and the Admin API.

**Client Credentials Grant (server-to-server)**

```bash
curl -X POST http://localhost:3002/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "client_credentials",
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "scope": "default"
  }'
```

**Authorization Code + PKCE (user-interactive)**

```bash
# 1. Create code_verifier and code_challenge
CODE_VERIFIER=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-43)
CODE_CHALLENGE=$(echo -n "$CODE_VERIFIER" | openssl dgst -sha256 -binary | base64 | tr -d "=+/" | cut -c1-43)

# 2. Open the authorization URL in a browser
echo "http://localhost:3002/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_CALLBACK&response_type=code&code_challenge=$CODE_CHALLENGE&code_challenge_method=S256"

# 3. After the user authorizes, exchange the code for a token
curl -X POST http://localhost:3002/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "AUTHORIZATION_CODE_FROM_CALLBACK",
    "client_id": "YOUR_CLIENT_ID",
    "code_verifier": "'"$CODE_VERIFIER"'"
  }'
```

See `api/API.md` for full OAuth 2.0 details.

---

## API & Documentation

### API Surfaces

Peta Core exposes different APIs for different roles:

- **MCP protocol interface** (`/mcp`)
  Standard MCP endpoints for MCP-compatible clients such as Claude Desktop, ChatGPT MCP, or Cursor.
  Authentication: bearer token (OAuth access token or Peta service token).
  Transport: HTTP/SSE depending on your MCP host.

- **Admin API** (`/admin`)
  Used by Peta Console and automation scripts to manage users, servers, permissions, and quotas.

- **Socket.IO channel** (`/socket.io`)
  Used by Peta Desk for real-time notifications, capability configuration, and approval workflows.

- **OAuth 2.0 endpoints** (`/oauth/*`)
  Used by clients to obtain access tokens (client credentials, authorization code with PKCE, and related flows).

### Reference Docs

| Document | Target Users | Description | Link |
|----------|-------------|-------------|------|
| **API.md** | End Users | API overview, authentication, MCP protocol, OAuth 2.0 | [View](./api/API.md) |
| **ADMIN_API.md** | Administrators | Complete admin API protocol (80+ operations) | [View](./api/ADMIN_API.md) |
| **SOCKET_USAGE.md** | Peta Desk Users | Complete Socket.IO real-time communication guide | [View](./api/SOCKET_USAGE.md) |
| **MCP Official Docs** | Developers | Model Context Protocol standard | [View](https://modelcontextprotocol.io/docs/) |

### Quick Links

- **[OAuth 2.0 Authentication](./api/API.md#2-oauth-20-authentication)** - Get access tokens for MCP connections
- **[MCP Protocol](./api/API.md#1-mcp-protocol-interface)** - MCP endpoints and namespaces
- **[Admin API](./api/ADMIN_API.md)** - User, server, permission management (for Peta Console)
- **[Socket.IO](./api/SOCKET_USAGE.md)** - Real-time notifications and request-response (for Peta Desk)
- **[Complete Examples](./api/API.md#complete-examples)** - OAuth + MCP workflow

---

## Tech Stack

- **Runtime**: Node.js (v18+) and TypeScript
- **Framework**: Express
- **Database**: PostgreSQL with Prisma ORM
- **Real-time**: Socket.IO
- **Logging**: Structured logging and database audit logs
- **Containerization**: Docker and Docker Compose

---

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- --testPathPattern=PersistentEventStore.test.ts

# Run tests with coverage
npm test -- --coverage

# Watch mode (recommended for development)
npm test -- --watch
```

### Test Structure

Test files follow these naming conventions:
- Unit tests: `*.test.ts` (same directory as source file or `__tests__` directory)
- Integration tests: `*.integration.test.ts`
- E2E tests: `*.e2e.test.ts`

### Testing Best Practices

1. **Mock Singleton Services**:

   ```ts
   // Mock ServerManager in tests
   jest.mock('./ServerManager', () => ({
     instance: {
       createServerConnection: jest.fn(),
       // ...
     }
   }));
   ```

2. **Use In-Memory EventStore**:

   ```ts
   const eventStore = new PersistentEventStore({
     useInMemory: true  // Speeds up tests
   });
   ```

3. **Clean Up Resources**:

   ```ts
   afterEach(async () => {
     await proxySession.cleanup();
     jest.clearAllMocks();
   });
   ```

4. **Test RequestId Mapping**:

   ```ts
   it('should map client requestId to proxy requestId', () => {
     const mapper = new RequestIdMapper('session123');
     const proxyId = mapper.mapToProxy('client-req-1');
     expect(proxyId).toMatch(/^session123:client-req-1:\d+$/);
   });
   ```

### Current Test Status

- Automated test coverage is being added; no test files are currently committed.
- Integration and end-to-end scenarios are especially valuable.

Additional test contributions are especially useful for:

- Complete `ProxySession` lifecycle tests.
- `RequestIdMapper` edge-case coverage.
- `GlobalRequestRouter` routing behavior.
- Concurrency tests for the persistent event store.
- OAuth 2.0 flows.
- Socket.IO connection and notification scenarios.

See `../CONTRIBUTING.md` for details.

