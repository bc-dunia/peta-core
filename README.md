# Peta Core – MCP Gateway & Runtime for AI Agents

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)
![License](https://img.shields.io/badge/license-ELv2-blue.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)

Peta Core is the operations and permissions layer for AI agents, built on top of Model Context Protocol (MCP).

It runs as a zero‑trust gateway and managed runtime in front of your MCP servers: every request from an agent is authenticated, evaluated against policy, executed with server‑side credentials, and written to an audit log.

Use Peta Core to connect ChatGPT, Claude, Cursor, n8n or other MCP‑compatible clients (AI agents) to your internal tools, APIs, and data sources without exposing raw secrets to agents. The gateway centralizes authentication, authorization, rate limiting, and observability for every MCP server.


📘 **Full Documentation** → [https://docs.peta.io](https://docs.peta.io)
🚀 **Download / Official Website** → [https://peta.io](https://peta.io)

---

## Table of Contents

- [About the Project](#about-the-project)
  - [What is Peta Core?](#what-is-peta-core)
  - [Why Peta Core?](#why-peta-core)
  - [System Components](#system-components)
- [Core Features](#core-features)
- [System Architecture](#system-architecture)
  - [High-Level Overview](#high-level-overview)
  - [Gateway Responsibilities](#gateway-responsibilities)
- [Companion Applications](#companion-applications)
  - [Peta Console (Admin Interface)](#peta-console-admin-interface)
  - [Peta Desk (User Client)](#peta-desk-user-client)
- [Permission Control System](#permission-control-system)
  - [Three-Layer Model](#three-layer-model)
  - [Human-in-the-Loop Controls](#human-in-the-loop-controls)
- [Project Structure](#project-structure)
  - [Data Flow Description](#data-flow-description)
  - [Core Design Patterns](#core-design-patterns)
- [Quick Start](#quick-start)
  - [Prerequisites](#prerequisites)
  - [Local Development](#local-development)
  - [Production with Docker](#production-with-docker)
  - [Production with Node.js/PM2](#production-with-nodejspm2)
- [Configuration](#configuration)
  - [Key Environment Variables](#key-environment-variables)
- [Docker Configuration](#docker-configuration)
- [Usage Examples](#usage-examples)
  - [Admin API (Peta Console)](#admin-api-peta-console)
  - [Socket.IO (Peta Desk)](#socketio-peta-desk)
  - [OAuth 2.0](#oauth-20)
- [API & Documentation](#api--documentation)
  - [API Surfaces](#api-surfaces)
  - [Reference Docs](#reference-docs)
- [Available Commands](#available-commands)
- [Tech Stack](#tech-stack)
- [Testing](#testing)
  - [Running Tests](#running-tests)
  - [Test Structure](#test-structure)
  - [Testing Best Practices](#testing-best-practices)
  - [Current Test Status](#current-test-status)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## About the Project

### What is Peta Core?

Peta Core sits between MCP clients (for example Claude Desktop, ChatGPT MCP, Cursor, or custom AI agents) and the MCP servers that expose internal tools and data.

From the MCP client’s perspective, it connects to a single MCP server. Behind that stable endpoint, Peta Core:

- Connects to multiple downstream MCP servers.
- Applies authentication and permission checks before any tool call runs.
- Translates and routes requests to the appropriate downstream server.
- Streams responses back to the client using the standard MCP protocol.

Peta Core uses the same MCP protocol in both directions, so you can plug it into existing MCP clients and servers without custom extensions.

### Why Peta Core?

Running agents directly against individual MCP servers causes a few problems:

- Each server must implement its own authentication, rate limiting, logging, and monitoring.
- Tool and resource permissions are often coarse (server‑wide) instead of per user or per client.
- Secrets such as API keys tend to be shared across environments and copied into client configuration.
- There is no consistent way to introduce human approval for sensitive operations.

Peta Core centralizes these concerns into a single gateway:

- All access is expressed as policy in one place.
- Credentials remain on the server side and are injected only when needed.
- Capabilities presented to each client are filtered at runtime based on identity and policy.
- High‑risk operations can require human approval before they run.

### System Components

Peta Core is the core backend service of the Peta MCP stack. In typical deployments it runs together with two companion applications:

- **Peta Core** – this repository; the MCP gateway and runtime.
- **Peta Console** – a web control plane used by administrators to configure policies, manage MCP servers, and inspect audit logs.
- **Peta Desk** – a desktop client that combines an MCP client with a real‑time control surface, so end users can approve operations and manage their own configuration.

This repository contains only the **Core gateway and runtime**.

At a high level Peta Core is responsible for:

- Terminating MCP connections from agents and MCP‑compatible clients.
- Issuing and validating short‑lived Peta service tokens.
- Routing and scaling downstream MCP servers on demand.
- Injecting external credentials from an encrypted vault at execution time.
- Enforcing per‑user, per‑agent, and per‑tool policy decisions.
- Persisting events for reconnection and audit.
- Providing observability hooks for logs and metrics.

---

## Core Features

Peta Core sits between MCP clients and downstream MCP servers and provides:

- **Three‑layer permission model**  
  Server‑level, admin‑level, and per‑user/per‑client filters that control what each agent can see and call.

- **Human‑in‑the‑loop approvals**  
  Policy rules can mark specific tools as approval‑required. When an agent calls such a tool, execution is paused and an approval request is sent to Peta Desk (or another UI) so a human can approve or reject the call.

- **Zero‑trust credential handling**  
  Agents receive only short‑lived Peta service tokens. Real API keys and other secrets stay in an encrypted store and are injected into downstream MCP servers only on the server side when a tool runs.

- **Authentication & identity**  
  JWT‑based identity for humans and agents, plus OAuth 2.0 flows for obtaining access tokens. Supports multi‑tenant deployments where multiple workspaces share a single gateway.

- **Transparent MCP proxying**  
  Acts as an MCP server to clients and an MCP client to downstream servers. Multiple servers can be mounted behind a single endpoint with namespacing such as `serverId::resourceName`.

- **Rate limiting and IP controls**  
  Per‑user and per‑workspace quotas can be enforced, with optional IP allow‑lists to restrict where the gateway can be called from.

- **Event persistence and reconnection**  
  Events are persisted so clients can resume streams using `Last-Event-ID` after network interruptions. A two‑layer cache (in‑memory + PostgreSQL) is used to balance performance and durability.

- **Socket.IO real‑time channel**  
  A Socket.IO channel exposes notifications, presence signals, and a request/response pattern used by Peta Desk for capability configuration and approval flows.

- **Encrypted configuration storage**  
  Downstream server launch configurations and user‑supplied credentials are encrypted before being stored.

- **User‑configurable servers**  
  Users can configure certain MCP servers that require per‑user input (for example, API keys) via Peta Desk without touching the gateway’s global configuration.

- **Observability and audit**  
  Structured logs (for example using Pino) and database‑backed audit records capture who called which tool, with which parameters, and when.


---

## System Architecture

![Architecture Overview](docs/overview.png)

### High-Level Overview

Peta Core implements a gateway pattern and plays two roles at the same time:

1. **MCP Server (to upstream clients)**  
   Exposes a standard MCP interface so agents and MCP‑compatible clients can connect without custom plugins.

2. **MCP Client (to downstream servers)**  
   Manages connections to multiple MCP servers, multiplexing requests and applying policies before forwarding them.

Between those two sides the gateway adds:

- Authentication and session management.
- Permission evaluation (including human‑in‑the‑loop checks).
- Credential injection from encrypted storage.
- Rate limiting and IP filtering.
- Event persistence and reconnection support.
- Logging and audit trails.

From the agent’s perspective there is only one MCP server. Behind that interface Peta Core handles the operational, security, and governance concerns.

### Gateway Responsibilities

Typical responsibilities inside the gateway include:

- Validating Peta service tokens and resolving user/agent identity.
- Applying RBAC/ABAC policies, quotas, and network restrictions.
- Determining whether a request is allowed, blocked, or requires human approval.
- Injecting encrypted credentials into downstream MCP servers at execution time.
- Streaming responses back to clients via MCP and/or Socket.IO.
- Emitting structured logs and audit records for each operation.

---

## Companion Applications

Peta Core is usually deployed together with two companion applications.


### Peta Console (Admin Interface)
<details>
<summary>
Peta Console is a web‑based administration UI for operators and security teams. It communicates with Peta Core through the Admin API (for example, `POST /admin`).
</summary>

#### Key Features

- **User management**
  - Create, query, update, and delete users.
  - Enable or disable accounts.
  - Assign roles and permissions.
  - Configure per‑user rate limits.

- **MCP server management**
  - Register and configure downstream MCP servers.
  - Control which tools, resources, and prompts are exposed from each server.
  - Enable or disable servers per workspace or environment.

- **Permission and policy management**
  - Define per‑user and per‑workspace permissions for tools, resources, and prompts.
  - Mark high‑risk tools as approval‑required.
  - Inspect effective permissions for a given user or client.

- **Monitoring and audit**
  - Browse recent tool calls and their outcomes.
  - Inspect audit logs for compliance and debugging.
  - View basic health indicators for downstream servers.

#### Interaction Model

Peta Console talks to Peta Core using the Admin API:

- A single `/admin` endpoint with action codes for operations (user, server, and policy management).
- Authenticated with admin‑level JWT or OAuth 2.0 credentials.
- Designed to be scriptable; you can call the same API from your own automation.
</details>

### Peta Desk (User Client)

<details>
<summary>
Peta Desk is a desktop application (for example built with Electron) that exposes a user‑facing control surface on top of Peta Core. It connects to the gateway’s Socket.IO and MCP endpoints.
</summary>

#### Key Features

- **Capability configuration**
  - Display the tools, resources, and prompts currently available to the user.
  - Let users further restrict their own capabilities on a per‑client basis.
  - Apply updates in real time when administrators change permissions.

- **Server configuration**
  - Allow users to configure servers that require their own credentials (for example, personal API keys).
  - Unconfigure or revoke previously stored user configuration.
  - Automatically trigger server startup once configuration is complete.

- **Approval workflow**
  - Receive approval requests when an agent triggers a tool that requires human review.
  - Show the parameters the agent intends to send.
  - Let the user approve, reject, or modify the request.

#### Interaction Model

Peta Desk uses two channels:

- **Socket.IO**  
  For capability updates, approval requests, and general notifications.

- **MCP**  
  For the actual tool calls made by the agent.

The same Socket.IO API can be used from other applications if you want to build a custom user or admin UI.
</details>

---

## Permission Control System

The permission system is the core of Peta Core’s role as an operations and permissions layer for agents.

Instead of baking access rules into each MCP server, you express policy in the gateway and let Peta Core filter what each client can see and do. MCP clients only see the subset of tools, resources, and prompts that are allowed for their identity and context, and every tool invocation is evaluated against those same rules.

### Three-Layer Model

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: MCP Server Level (Global Configuration)            │
│ - Enable/disable entire MCP servers                          │
│ - Configure which tools/resources/prompts are available      │
│ - Set default access permissions for all users               │
└─────────────────────────────────────────────────────────────┘
                          ↓ (filters)
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Admin Level (Per-User Permissions)                 │
│ - Configure which servers a specific user can access         │
│ - Set per-user tools/resources/prompts permissions          │
│ - Further restrict capabilities beyond server-level config  │
└─────────────────────────────────────────────────────────────┘
                          ↓ (filters)
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: User Level (Client-Specific Configuration)         │
│ - User configures which clients can access which servers     │
│ - User can disable specific tools/resources/prompts         │
│ - Final layer of restriction (can only restrict, not expand)│
└─────────────────────────────────────────────────────────────┘
                          ↓ (final filter)
┌─────────────────────────────────────────────────────────────┐
│ Upstream MCP Clients (Claude Desktop, Cursor, etc.)          │
│ - Only see filtered tools/resources/prompts lists            │
│ - Cannot access capabilities not in their filtered list      │
└─────────────────────────────────────────────────────────────┘
```

Peta Core supports a three‑layer permission model:

1. **MCP server level (global configuration)**  
   Configured via Peta Console.
   - Enable or disable entire MCP servers.
   - Decide which tools, resources, and prompts are exposed from each server.
   - Set default permissions that apply to all users.

2. **Admin level (per‑user permissions)**  
   Configured via Peta Console.
   - Grant or revoke access to individual servers for specific users or workspaces.
   - Grant or revoke specific tools, resources, and prompts within those servers.
   - Further restrict the default server‑level configuration.

3. **User level (per‑client configuration)**  
   Configured via Peta Desk.
   - Let users choose which MCP clients (for example Claude Desktop or Cursor) can access which servers.
   - Allow users to disable tools, resources, or prompts for their own usage.
   - Users can only narrow permissions; they cannot exceed what administrators have granted.

If any layer disables a capability, it will not appear in capability discovery and direct calls to that capability are rejected.

### How Filtering Works

When an upstream MCP client requests capability lists:

1. **Tools List** (`tools/list`): Gateway returns only tools that pass all three permission layers
2. **Resources List** (`resources/list`): Gateway returns only resources that pass all three permission layers
3. **Prompts List** (`prompts/list`): Gateway returns only prompts that pass all three permission layers

**Result**: Upstream clients only see and can access capabilities they are permitted to use. Any attempt to call a tool or access a resource not in the filtered list will be rejected by the gateway.

### Advanced Tool Call Control

Beyond the three-layer permission system, Peta Core provides additional control mechanisms for tool execution:

#### 1. Client-Side Confirmation

**Configuration**: Set tool `dangerLevel` to `Approval` in server capability configuration.

**Behavior**: When a client attempts to call a tool with `dangerLevel: Approval`, the gateway:
- Pauses the tool call execution
- Sends a confirmation request to Peta Desk via Socket.IO
- Waits for user approval or rejection
- Proceeds with execution only if user confirms

**Use Case**: Tools that modify data or perform sensitive operations.

#### 2. Password-Protected Execution

**Configuration**: Configure stricter control for critical tools (roadmap feature).

**Behavior**: For highly sensitive tools, the gateway can require:
- User to enter a password in Peta Desk
- Additional authentication before tool execution
- Multi-factor confirmation

**Use Case**: Critical operations like deleting data, modifying system configurations, or accessing sensitive resources.

### Permission Merge Logic

The final permission for any capability is calculated as:

```
Final Permission = Server-Level Enabled 
                && Admin-Level User Permission 
                && User-Level Client Preference
```

**Key Rules**:

- Each layer can only restrict, not expand permissions
- If any layer disables a capability, it is unavailable to the client
- User preferences are merged with admin permissions (intersection, not union)
- Real-time updates: Changes at any layer immediately affect active sessions


### Human-in-the-Loop Controls

On top of static permissions, Peta Core supports tool‑level approvals:

- Mark tools as **approval required** based on risk or context.
- Pause execution and route an approval request to Peta Desk via Socket.IO.
- Let humans approve, reject, or request changes before the tool proceeds.
- Optionally require stronger controls (for example additional authentication) for particularly sensitive operations.

This allows agents to run autonomously for routine tasks while keeping humans in control of operations that carry more risk.

---

## Project Structure

A simplified structure of this repository:

```text
.
├─ src/
│  ├─ api/           # HTTP/MCP route handlers and controllers
│  ├─ core/          # Gateway logic, session and permission engine
│  ├─ mcp/           # MCP client/server abstractions
│  ├─ services/      # Domain services (logging, events, Vault, etc.)
│  ├─ db/            # Prisma models and database access
│  └─ config/        # Configuration and environment loading
├─ docs/
│  ├─ api/           # Admin API, Socket.IO, and MCP API docs
│  └─ architecture/  # Diagrams and deeper design notes
├─ prisma/           # Prisma schema and migrations
└─ package.json
```

See the `docs/` directory for deeper architecture and API documentation.

### Data Flow Description

#### 1. Forward Request Flow (Client → Downstream)

```
Client Initiates Request
  ↓
HTTP/HTTPS Server (Express)
  ↓
Middleware Chain (IP Check → Auth → Rate Limit)
  ↓
SessionStore (Get/Create ClientSession)
  ↓
ProxySession (Acts as MCP Server to receive request)
  ↓
RequestIdMapper (Map RequestID: client-id → proxy-id)
  ↓
Resource Namespace Parsing (filesystem::read_file → serverId + name)
  ↓
ServerManager (Get downstream server connection)
  ↓
Downstream MCP Server (ProxySession acts as MCP Client to send request)
  ↓
Response returns along the same path
```

#### 2. Reverse Request Flow (Downstream → Client)

```
Downstream MCP Server Initiates Request (Sampling/Elicitation)
  ↓
ServerManager Receives (with relatedRequestId)
  ↓
GlobalRequestRouter (Lookup RequestContextRegistry)
  ↓
Locate Correct ProxySession
  ↓
RequestIdMapper (Reverse mapping: proxy-id → client-id)
  ↓
Forward to Client (via SSE)
  ↓
Client responds along the same path
```

#### 3. Socket.IO Real-time Communication

```
Electron Client Connects
  ↓
Socket.IO Server (Token Authentication)
  ↓
Join Room (userId-based)
  ↓
Server Push Notifications
  - User Enabled/Disabled
  - Online Session List Updates
  - Capability Configuration Changes
  ↓
Supports Multi-device Synchronization
```

#### 4. Event Persistence and Reconnection

```
MCP Event Generated
  ↓
PersistentEventStore
  ↓
Dual-layer Storage:
  - EventCacheManager (In-memory LRU)
  - PostgreSQL (Persistent)
  ↓
Client Disconnects and Reconnects
  ↓
Request with Last-Event-ID
  ↓
Restore Historical Events from EventStore
  ↓
Continue Session
```


### Core Design Patterns

1. **Multi-Role Proxy Pattern**
   - ProxySession acts as both MCP Server (upstream) and MCP Client (downstream)
   - Transparently forwards MCP protocol without client awareness of the middleware

2. **Singleton Shared Connections**
   - ServerManager as global singleton manages all downstream server connections
   - Multiple client sessions share the same set of downstream connections, avoiding duplicate establishment

3. **Three-Layer RequestID Mapping**
   - Client RequestID → Proxy RequestID → Server RequestID
   - Format: `{sessionId}:{originalId}:{timestamp}`
   - Prevents multi-client ID conflicts

4. **Reverse Request Routing**
   - Via GlobalRequestRouter + RequestContextRegistry
   - Downstream servers route back to correct client session via relatedRequestId

5. **Dual Logging Architecture**
   - Pino: Structured operational logs (real-time monitoring)
   - LogService: Audit logs (database persistence)

6. **Resource Namespace Isolation**
   - Format: `{serverId}::{resourceName}`
   - Examples: `filesystem::read_file`, `database::users`
   - Prevents resource name conflicts between different servers


---

## Quick Start

### Prerequisites

* Node.js **v18+**
* npm
* Docker and Docker Compose (for PostgreSQL and optional Cloudflare DDNS)

### Local Development

Install dependencies:

```bash
npm install
```

Start the full development environment (gateway + local database):

```bash
npm run dev
```

Start only the backend (if you already have PostgreSQL running):

```bash
npm run dev:backend-only
```

Database helper commands:

```bash
npm run db:start   # Start PostgreSQL via Docker
npm run db:init    # Run migrations and generate Prisma client
npm run db:studio  # Open Prisma Studio
npm run db:reset   # Reset database (destructive)
npm run db:stop    # Stop database services
```

Build for production:

```bash
npm run build
```

To skip Cloudflared in development, set:

```bash
SKIP_CLOUDFLARED=true npm run dev
```

### Production with Docker

Peta Core ships with a shell script that prepares a Docker‑based deployment:

```bash
curl -O https://raw.githubusercontent.com/dunialabs/peta-core/main/docs/docker-deploy.sh
chmod +x docker-deploy.sh
./docker-deploy.sh
```

The script will:

1. Validate your Docker environment.
2. Generate random secrets (for example `JWT_SECRET` and a database password).
3. Create a `docker-compose.yml` and `.env` file.
4. Start all services (PostgreSQL, Peta Core, and optional Cloudflared DDNS).
5. Wait for basic health checks.
6. Print connection information and next steps.

You can also adapt the generated files to your own Docker or orchestration setup.

### Production with Node.js/PM2

To run Peta Core directly on Node.js with an existing PostgreSQL database:

```bash
# 1. Clone the repository
git clone https://github.com/dunialabs/peta-core.git
cd peta-core

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env and set required values such as DATABASE_URL and JWT_SECRET

# 4. Build
npm run build

# 5. Start the service
npm start
```

For process management in production you can use PM2 with an `ecosystem.config.js` like the following:

```js
module.exports = {
  apps: [
    {
      name: 'peta-core',
      script: './dist/index.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        BACKEND_PORT: 3002,
      },
      max_memory_restart: '500M',
      autorestart: true,
      watch: false,
    },
  ],
};
```

Then start Peta Core with:

```bash
pm2 start ecosystem.config.js
```

---

## Configuration

All configuration is set via environment variables (for example in a `.env` file).

### Key Environment Variables

**Database**

| Name           | Required | Default | Description                                                                                                      |
| -------------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | ✓        | –       | PostgreSQL connection string, for example `postgresql://user:password@host:5432/peta_mcp_gateway?schema=public`. |

**Server**

| Name            | Required | Default | Description                                               |
| --------------- | -------- | ------- | --------------------------------------------------------- |
| `BACKEND_PORT`  |          | `3002`  | HTTP port that the gateway listens on.                    |
| `ENABLE_HTTPS`  |          | `false` | Enable HTTPS termination in the Node.js process.          |
| `SSL_CERT_PATH` |          | –       | Path to TLS certificate, required if `ENABLE_HTTPS=true`. |
| `SSL_KEY_PATH`  |          | –       | Path to TLS private key, required if `ENABLE_HTTPS=true`. |

**Authentication**

| Name         | Required          | Default | Description                                         |
| ------------ | ----------------- | ------- | --------------------------------------------------- |
| `JWT_SECRET` | ✓ (in production) | –       | Secret used to sign and verify Peta service tokens. |

OAuth 2.0 and multi‑tenant settings are also configured via environment variables; refer to `.env.example` and the API docs for the full list.

**Logging**

| Name         | Required | Default                      | Description                                           |
| ------------ | -------- | ---------------------------- | ----------------------------------------------------- |
| `LOG_LEVEL`  |          | `trace` (dev), `info` (prod) | Log level: `trace`, `debug`, `info`, `warn`, `error`. |
| `LOG_PRETTY` |          | `true` (dev), `false` (prod) | Enable pretty‑printed logs in development.            |

**Cloudflared DDNS (optional)**

| Name               | Required | Default | Description                                         |
| ------------------ | -------- | ------- | --------------------------------------------------- |
| `SKIP_CLOUDFLARED` |          | `false` | Skip Cloudflared setup in development environments. |

For additional environment variables (for example OAuth clients, multi‑tenant configuration, or external services), see `.env.example` and the deployment documentation.

---

## Docker Configuration

The default Docker setup uses the following containers and settings.

### PostgreSQL

* Container name: `peta-mcp-gateway-postgres`
* Port: `5432`
* Database name: `peta_mcp_gateway`
* User/password: `peta` / `peta123` ( ⚠️ change these in production)

### Cloudflared DDNS (optional)

* Container name: `peta-mcp-gateway-cloudflared`
* Configuration directory: `./cloudflared`

These values come from the default Docker compose files and can be adjusted to match your environment.

---

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

The exact action codes and payloads are defined in `docs/api/ADMIN_API.md`.

### Socket.IO (Peta Desk)

Peta Desk uses Socket.IO for real‑time communication with Peta Core.

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

See `docs/api/SOCKET_USAGE.md` for the full event list and payload schemas.

### OAuth 2.0

Peta Core exposes an OAuth 2.0 service for obtaining access tokens that can be used with MCP clients and the Admin API.

**Client Credentials Grant (server‑to‑server)**

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

**Authorization Code + PKCE (user‑interactive)**

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

See `docs/api/API.md` for full OAuth 2.0 details.

---

## API & Documentation

### API Surfaces

Peta Core exposes different APIs for different roles:

* **MCP protocol interface** (`/mcp`)
  Standard MCP endpoints for MCP‑compatible clients such as Claude Desktop, ChatGPT MCP, or Cursor.
  Authentication: bearer token (OAuth access token or Peta service token).
  Transport: HTTP/SSE depending on your MCP host.

* **Admin API** (`/admin`)
  Used by Peta Console and automation scripts to manage users, servers, permissions, and quotas.

* **Socket.IO channel** (`/socket.io`)
  Used by Peta Desk for real‑time notifications, capability configuration, and approval workflows.

* **OAuth 2.0 endpoints** (`/oauth/*`)
  Used by clients to obtain access tokens (client credentials, authorization code with PKCE, and related flows).

### Reference Docs


| Document | Target Users | Description | Link |
|----------|-------------|-------------|------|
| **API.md** | End Users | API overview, authentication, MCP protocol, OAuth 2.0 | [View](./docs/api/API.md) |
| **ADMIN_API.md** | Administrators | Complete admin API protocol (80+ operations) | [View](./docs/api/ADMIN_API.md) |
| **SOCKET_USAGE.md** | Peta Desk Users | Complete Socket.IO real-time communication guide | [View](./docs/api/SOCKET_USAGE.md) |
| **MCP Official Docs** | Developers | Model Context Protocol standard | [View](https://modelcontextprotocol.io/docs/) |

### Quick Links

- **[OAuth 2.0 Authentication](./docs/api/API.md#2-oauth-20-authentication)** - Get access tokens for MCP connections
- **[MCP Protocol](./docs/api/API.md#1-mcp-protocol-interface)** - MCP endpoints and namespaces
- **[Admin API](./docs/api/ADMIN_API.md)** - User, server, permission management (for Peta Console)
- **[Socket.IO](./docs/api/SOCKET_USAGE.md)** - Real-time notifications and request-response (for Peta Desk)
- **[Complete Examples](./docs/api/API.md#complete-examples)** - OAuth + MCP workflow

---

## Available Commands

**Development**

```bash
npm run dev              # Watch and run gateway + dev stack
npm run dev:backend-only # Gateway only (use your own DB)
npm run build            # Compile TypeScript to ./dist
npm run rebuild          # Clean and rebuild
```

**Database**

```bash
npm run db:start    # Start PostgreSQL in Docker
npm run db:init     # Apply migrations and generate the Prisma client
npm run db:studio   # Open Prisma Studio
npm run db:reset    # Reset database (destructive)
npm run db:logs     # View database container logs (if available)
npm run db:restart  # Restart database containers (if available)
npm run db:stop     # Stop database containers
```

See `package.json` for the full list of scripts.

---

## Tech Stack

* **Runtime**: Node.js (v18+) and TypeScript
* **Framework**: Express
* **Database**: PostgreSQL with Prisma ORM
* **Real‑time**: Socket.IO
* **Logging**: Structured logging and database audit logs
* **Containerization**: Docker and Docker Compose

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
   ```typescript
   // Mock ServerManager in tests
   jest.mock('./ServerManager', () => ({
     instance: {
       createServerConnection: jest.fn(),
       // ...
     }
   }));
   ```

2. **Use In-Memory EventStore**:
   ```typescript
   const eventStore = new PersistentEventStore({
     useInMemory: true  // Speeds up tests
   });
   ```

3. **Clean Up Resources**:
   ```typescript
   afterEach(async () => {
     await proxySession.cleanup();
     jest.clearAllMocks();
   });
   ```

4. **Test RequestId Mapping**:
   ```typescript
   it('should map client requestId to proxy requestId', () => {
     const mapper = new RequestIdMapper('session123');
     const proxyId = mapper.mapToProxy('client-req-1');
     expect(proxyId).toMatch(/^session123:client-req-1:\d+$/);
   });
   ```

### Current Test Status

* Unit tests exist for core routing and event components.
* Integration and end‑to‑end tests are being expanded.

Additional test contributions are especially useful for:

* Complete `ProxySession` lifecycle tests.
* `RequestIdMapper` edge‑case coverage.
* `GlobalRequestRouter` routing behavior.
* Concurrency tests for the persistent event store.
* OAuth 2.0 flows.
* Socket.IO connection and notification scenarios.

See [Contributing Guide](./CONTRIBUTING.md) for details.

---

## Troubleshooting

Some quick tips:

* **Docker not running**
  Ensure Docker Desktop or your Docker daemon is running before using `npm run db:start` or the Docker deployment script.

* **Port already in use**
  Change `BACKEND_PORT` or update your Docker/PM2 configuration if port `3002` is already taken.

* **Database connection failed**
  Check `DATABASE_URL`, firewall rules, and confirm that the PostgreSQL container is healthy. `npm run db:logs` (if available) can help diagnose issues.

* **Authentication issues**
  Verify that `JWT_SECRET` and related auth configuration are set consistently across Peta Core and any companion applications.

For more detailed troubleshooting, see the `docs/` folder or open an issue with logs and reproduction steps.

---

## Contributing

We welcome all forms of contribution!

Before submitting a Pull Request, please:

1. Read the [Contributing Guide](./CONTRIBUTING.md)
2. Follow code standards and commit message conventions

**Main Ways to Contribute**:

- Report bugs and suggest features
- Submit code improvements and new features
- Improve documentation
- Help other users solve problems

For details, see [CONTRIBUTING.md](./CONTRIBUTING.md).


## License

This project is licensed under the [Elastic License 2.0 (ELv2)](./LICENSE).

**What We Encourage**  
Subject to the terms of the Elastic License 2.0, you are encouraged to:

- Freely review, test, and verify the safety and reliability of this product
- Modify and adapt the code for your own use cases
- Apply and integrate this project in a wide variety of scenarios
- Contribute improvements, bug fixes, and other enhancements that help evolve the codebase

**Key Restrictions**:

- You may not provide the software to third parties as a hosted or managed service
- You may not remove or circumvent license key functionality
- You may not remove or obscure licensing notices

For detailed terms, see the [LICENSE](./LICENSE) file.

Copyright © 2025 [Dunia Labs, Inc.](https://dunialabs.io)

