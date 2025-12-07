#!/usr/bin/env node

/**
 * Unified Application Startup Script
 *
 * This script handles both development and production environment startups
 * based on NODE_ENV environment variable.
 *
 * Features:
 * - Smart database detection and auto-start
 * - Database initialization and migrations
 * - TypeScript compilation (dev only)
 * - Automatic port allocation (dev) or fixed ports (prod)
 * - Cloudflared tunnel support (both environments)
 * - Graceful shutdown handling
 */

const { spawn, spawnSync, exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

/**
 * Ensure .env file exists, copy from .env.example if needed
 */
function ensureEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  const envExamplePath = path.join(process.cwd(), '.env.example');

  // If .env exists, do nothing
  if (fs.existsSync(envPath)) {
    return;
  }

  // If .env.example doesn't exist, warn and create minimal .env
  if (!fs.existsSync(envExamplePath)) {
    console.log('\x1b[33m⚠️  Warning: .env.example not found\x1b[0m');
    console.log('\x1b[90m💡 Creating minimal .env file...\x1b[0m');
    // Create minimal .env with DATABASE_URL
    const minimalEnv = 'DATABASE_URL="postgresql://peta:peta123@localhost:5433/peta_mcp_gateway?schema=public"\n';
    fs.writeFileSync(envPath, minimalEnv, 'utf8');
    console.log('\x1b[32m✅ Created minimal .env file\x1b[0m\n');
    return;
  }

  // Copy .env.example to .env
  try {
    fs.copyFileSync(envExamplePath, envPath);
    console.log('\x1b[34m📝 .env file not found, created from .env.example\x1b[0m');
    console.log('\x1b[33m💡 Please review and update .env with your configuration\x1b[0m\n');
  } catch (error) {
    console.log(`\x1b[31m❌ Failed to create .env file: ${error.message}\x1b[0m`);
    process.exit(1);
  }
}

// Ensure .env file exists before loading
ensureEnvFile();

// Load environment variables from .env file
const dotenvPath = path.join(process.cwd(), '.env');
if (fs.existsSync(dotenvPath)) {
  require('dotenv').config({ path: dotenvPath });
}

const execAsync = promisify(exec);

// Determine environment
const NODE_ENV = process.env.NODE_ENV || 'development';
const isDevelopment = NODE_ENV === 'development';
const isProduction = NODE_ENV === 'production';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  orange: '\x1b[38;5;208m',
  gray: '\x1b[90m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

/**
 * Print startup banner
 */
function printBanner() {
  // Automatically disable in CI environment (to avoid polluting logs)
  if (process.env.CI === 'true' || process.env.DISABLE_BANNER === 'true') {
    log(`\n🚀 Starting Peta MCP Gateway [${NODE_ENV.toUpperCase()}]\n`, colors.bright);
    return;
  }

  const banner = `
          \x1b[34m██████╗        \x1b[33m███████╗       \x1b[36m████████╗         \x1b[32m█████╗\x1b[32m
          \x1b[34m██╔══██╗       \x1b[33m██╔════╝       \x1b[36m╚══██╔══╝        \x1b[32m██╔══██╗\x1b[32m
          \x1b[34m██████╔╝       \x1b[33m█████╗            \x1b[36m██║           \x1b[32m███████║\x1b[32m
          \x1b[34m██╔═══╝        \x1b[33m██╔══╝            \x1b[36m██║           \x1b[32m██╔══██║\x1b[32m
          \x1b[34m██║            \x1b[33m███████╗          \x1b[36m██║           \x1b[32m██║  ██║\x1b[32m
          \x1b[34m╚═╝            \x1b[33m╚══════╝          \x1b[36m╚═╝           \x1b[32m╚═╝  ╚═╝\x1b[32m
            \x1b[33mMCP Gateway - Intelligent Proxy for Model Context\x1b[10m

              \x1b[32m🚀 Starting Peta MCP Gateway\x1b[0m \x1b[90m[${NODE_ENV.toUpperCase()}]\x1b[0m
`;
  console.log(banner);
}

/**
 * Main startup function
 */
async function startApplication() {
  printBanner();

  try {
    // Step 1: Database initialization (smart auto-start + migrations)
    // Note: Cloudflared setup is now handled by CloudflaredService in src/index.ts
    log('🔄 Initializing database...', colors.blue);
    const dbInitResult = spawnSync('npm', ['run', 'db:init'], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    if (dbInitResult.status !== 0) {
      log('❌ Failed to initialize database', colors.red);
      process.exit(1);
    }
    log('✅ Database initialized\n', colors.green);

    // Step 3: TypeScript compilation (development only)
    if (isDevelopment) {
      log('🔨 Building backend...', colors.blue);
      const buildResult = spawnSync('npm', ['run', 'build'], {
        stdio: 'inherit',
        cwd: process.cwd()
      });

      if (buildResult.status !== 0) {
        log('❌ Failed to build backend', colors.red);
        process.exit(1);
      }
      log('✅ Backend built successfully\n', colors.green);
    } else {
      // Production: Check if dist/ exists
      const distPath = path.join(process.cwd(), 'dist');
      if (!fs.existsSync(distPath)) {
        log('❌ dist/ directory not found', colors.red);
        log('💡 Run: npm run build', colors.yellow);
        process.exit(1);
      }
      log('✅ Using pre-compiled code from dist/\n', colors.green);
    }

    // Step 4: Port allocation (development only)
    let backendPort = parseInt(process.env.BACKEND_PORT || '3002');

    if (isDevelopment) {
      try {
        const { allocatePorts } = require('./port-manager.cjs');
        const ports = await allocatePorts();
        backendPort = ports.backendPort;
        log(`📋 Port allocation: Backend will use port ${backendPort}\n`, colors.blue);
      } catch (error) {
        log('⚠️  Port allocation failed, using default port', colors.yellow);
      }
    }

    // Step 5: Start the application
    log('📦 Starting services...\n', colors.blue);

    const env = {
      ...process.env,
      BACKEND_PORT: backendPort,
      BACKEND_HTTPS_PORT: backendPort,
      NODE_ENV: NODE_ENV
    };

    let child;

    if (isDevelopment) {
      // Development: Use concurrently with tsx for hot reload
      const concurrentlyArgs = [
        '--kill-others-on-fail',
        '--raw', // Remove [0] [1] prefixes to make logs cleaner
        'npm run db:start',
        `BACKEND_PORT=${backendPort} BACKEND_HTTPS_PORT=${backendPort} NODE_ENV=${NODE_ENV} npm run dev:backend-only`
      ];

      child = spawn('npx', ['concurrently', ...concurrentlyArgs], {
        stdio: 'inherit',
        env: env,
        cwd: process.cwd()
      });
    } else {
      // Production: Run compiled code directly
      child = spawn('node', ['dist/index.js'], {
        stdio: 'inherit',
        env: env,
        cwd: process.cwd()
      });
    }

    // Note: Cloudflared auto-start is now handled by CloudflaredService in src/index.ts
    // The service will automatically check database configuration and start cloudflared if needed

    // Step 6: Graceful shutdown handling
    // Note: Cloudflared stop is now handled by CloudflaredService in src/index.ts shutdown process
    let isShuttingDown = false;

    process.on('SIGINT', async () => {
      if (isShuttingDown) {
        log('⚠️ Shutdown already in progress, ignoring signal', colors.yellow);
        return;
      }

      isShuttingDown = true;
      log('\n🛑 Shutting down services...', colors.yellow);
      child.kill('SIGINT');
      // Wait for child process to exit naturally via 'close' event
    });

    process.on('SIGTERM', async () => {
      if (isShuttingDown) {
        return;
      }

      isShuttingDown = true;
      log('\n🛑 Shutting down services...', colors.yellow);
      child.kill('SIGTERM');
    });

    child.on('close', (code) => {
      log(`\n✨ Services stopped with code ${code}`, colors.gray);
      process.exit(code);
    });

    child.on('error', (error) => {
      log(`❌ Failed to start services: ${error.message}`, colors.red);
      process.exit(1);
    });

  } catch (error) {
    log(`❌ Startup failed: ${error.message}`, colors.red);
    console.error(error);
    process.exit(1);
  }
}

// Execute startup
startApplication();
