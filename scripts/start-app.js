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

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import chalk from 'chalk';
import ora from 'ora';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    console.log(chalk.yellow('⚠️  Warning: .env.example not found'));
    console.log(chalk.gray('💡 Creating minimal .env file...'));
    // Create minimal .env with DATABASE_URL
    const minimalEnv = 'DATABASE_URL="postgresql://peta:peta123@localhost:5433/peta_mcp_gateway?schema=public"\n';
    fs.writeFileSync(envPath, minimalEnv, 'utf8');
    console.log(chalk.green('✅ Created minimal .env file\n'));
    return;
  }

  // Copy .env.example to .env
  try {
    fs.copyFileSync(envExamplePath, envPath);
    console.log(chalk.blue('📝 .env file not found, created from .env.example'));
    console.log(chalk.yellow('💡 Please review and update .env with your configuration\n'));
  } catch (error) {
    console.log(chalk.red(`❌ Failed to create .env file: ${error.message}`));
    process.exit(1);
  }
}

// Ensure .env file exists before loading
ensureEnvFile();

// Load environment variables from .env file
const dotenvPath = path.join(process.cwd(), '.env');
if (fs.existsSync(dotenvPath)) {
  const dotenv = await import('dotenv');
  dotenv.config({ path: dotenvPath });
}

// Determine environment
const NODE_ENV = process.env.NODE_ENV || 'development';
const isDevelopment = NODE_ENV === 'development';

/**
 * Read version from package.json
 */
function getVersion() {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version || '1.0.0';
  } catch (error) {
    return '1.0.0';
  }
}

/**
 * Print startup banner
 */
function printBanner() {
  const VERSION = getVersion();
  const envLabel = NODE_ENV.toUpperCase();

  const banner = `
${chalk.cyan('┌─')} ${chalk.bold.white('peta-core')} ${chalk.dim(`v${VERSION}`)} ${chalk.cyan('────────────────────────────────────────────────────────────┐')}
${chalk.cyan('│')}                                                                               ${chalk.cyan('│')}
${chalk.cyan('│')}   ${chalk.magenta('██████╗ ███████╗████████╗ █████╗')}                                            ${chalk.cyan('│')}
${chalk.cyan('│')}   ${chalk.magenta('██╔══██╗██╔════╝╚══██╔══╝██╔══██╗')}    ${chalk.white('Zero-Trust Gateway for AI Agents')}       ${chalk.cyan('│')}
${chalk.cyan('│')}   ${chalk.magenta('██████╔╝█████╗     ██║   ███████║')}                                           ${chalk.cyan('│')}
${chalk.cyan('│')}   ${chalk.magenta('██╔═══╝ ██╔══╝     ██║   ██╔══██║')}    ${chalk.blue.underline('https://peta.io')}                        ${chalk.cyan('│')}
${chalk.cyan('│')}   ${chalk.magenta('██║     ███████╗   ██║   ██║  ██║')}    ${chalk.dim('Docs:')} ${chalk.blue.underline('https://docs.peta.io')}             ${chalk.cyan('│')}
${chalk.cyan('│')}   ${chalk.magenta('╚═╝     ╚══════╝   ╚═╝   ╚═╝  ╚═╝')}    ${chalk.dim('GitHub:')} ${chalk.blue.underline('github.com/dunialabs/peta-core')} ${chalk.cyan('│')}
${chalk.cyan('│')}                                                                               ${chalk.cyan('│')}
${chalk.cyan('│')}   ${chalk.dim('Dunia Labs, Inc.')}                         ${chalk.dim(`[${envLabel.padEnd(11)}]`)} ${chalk.gray('Press Ctrl+C to stop')} ${chalk.cyan('│')}
${chalk.cyan('└───────────────────────────────────────────────────────────────────────────────┘')}
`;

  console.log(banner);
}

/**
 * Utility logging functions
 */
function logSuccess(message) {
  console.log(`  ${chalk.green('✓')} ${message}`);
}

function logInfo(message) {
  console.log(`  ${chalk.cyan('→')} ${message}`);
}

function logError(message) {
  console.log(`  ${chalk.red('✗')} ${message}`);
}

function createSpinner(text) {
  return ora({
    text: chalk.white(text),
    spinner: 'dots',
    color: 'cyan',
  });
}

/**
 * Execute command with spinner
 */
function executeWithSpinner(command, args, spinnerText, successMessage, options = {}) {
  return new Promise((resolve, reject) => {
    const spinner = createSpinner(spinnerText);
    spinner.start();

    const child = spawn(command, args, {
      stdio: 'pipe',
      cwd: process.cwd(),
      ...options
    });

    let stdout = '';
    let stderr = '';

    if (child.stdout) {
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }

    child.on('close', (code) => {
      spinner.stop();
      if (code === 0) {
        logSuccess(successMessage);
        resolve({ stdout, stderr, code });
      } else {
        logError(successMessage.replace('successfully', 'failed').replace('built', 'build failed'));
        if (stderr) {
          console.error(chalk.red(stderr));
        }
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      spinner.stop();
      logError(`Failed to execute ${command}`);
      reject(error);
    });
  });
}

/**
 * Main startup function
 */
async function startApplication() {
  printBanner();

  try {
    // Step 1: Database initialization (smart auto-start + migrations)
    await executeWithSpinner(
      'npm',
      ['run', 'db:init'],
      'Initializing database...',
      'Database initialized'
    );
    console.log(); // Add spacing

    // Step 2: TypeScript compilation (development only)
    if (isDevelopment) {
      await executeWithSpinner(
        'npm',
        ['run', 'build'],
        'Building backend...',
        'Backend built successfully'
      );
      console.log();
    } else {
      // Production: Check if dist/ exists
      const distPath = path.join(process.cwd(), 'dist');
      if (!fs.existsSync(distPath)) {
        logError('dist/ directory not found');
        logInfo('Run: npm run build');
        process.exit(1);
      }
      logSuccess('Using pre-compiled code from dist/');
      console.log();
    }

    // Step 3: Port allocation (development only)
    let backendPort = parseInt(process.env.BACKEND_PORT || '3002');

    if (isDevelopment) {
      try {
        const portManager = await import('./port-manager.js');
        const ports = await portManager.allocatePorts();
        backendPort = ports.backendPort;
        logInfo(`Port allocation: Backend will use port ${backendPort}`);
        console.log();
      } catch (error) {
        logInfo('Port allocation failed, using default port');
        console.log();
      }
    }

    // Step 4: Start the application
    const spinner = createSpinner('Starting services...');
    spinner.start();

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
        stdio: ['inherit', 'pipe', 'pipe'],
        env: env,
        cwd: process.cwd()
      });
    } else {
      // Production: Run compiled code directly
      child = spawn('node', ['dist/index.js'], {
        stdio: ['inherit', 'pipe', 'pipe'],
        env: env,
        cwd: process.cwd()
      });
    }

    // Monitor output to detect successful startup
    let startupDetected = false;

    if (child.stdout) {
      child.stdout.on('data', (data) => {
        const output = data.toString();

        // Look for server startup indicators
        if (!startupDetected && (
          output.includes('Server ready') ||
          output.includes('listening on') ||
          output.includes(`http://localhost:${backendPort}`) ||
          output.includes(`PORT ${backendPort}`)
        )) {
          startupDetected = true;
          spinner.stop();
          logSuccess(`Services ready on :${backendPort}`);
          logInfo(`Dashboard: ${chalk.blue.underline(`http://localhost:${backendPort}`)}`);
          console.log();
          console.log(chalk.green.bold('  🚀 peta-core is ready!'));
          console.log();
        }

        // Print output after spinner stops
        if (startupDetected) {
          process.stdout.write(output);
        }
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (data) => {
        if (startupDetected) {
          process.stderr.write(data);
        }
      });
    }

    // Fallback: stop spinner after 10 seconds if no startup detected
    setTimeout(() => {
      if (!startupDetected) {
        spinner.stop();
        logInfo('Services starting...');
        console.log();

        // Start forwarding all output
        startupDetected = true;
      }
    }, 10000);

    // Step 5: Graceful shutdown handling
    let isShuttingDown = false;

    process.on('SIGINT', async () => {
      if (isShuttingDown) {
        logInfo('Shutdown already in progress, ignoring signal');
        return;
      }

      isShuttingDown = true;
      console.log(); // New line after Ctrl+C
      logInfo('Shutting down services...');
      child.kill('SIGINT');
      // Wait for child process to exit naturally via 'close' event
    });

    process.on('SIGTERM', async () => {
      if (isShuttingDown) {
        return;
      }

      isShuttingDown = true;
      console.log();
      logInfo('Shutting down services...');
      child.kill('SIGTERM');
    });

    child.on('close', (code) => {
      console.log();
      logInfo(`Services stopped with code ${code}`);
      process.exit(code);
    });

    child.on('error', (error) => {
      spinner.stop();
      logError(`Failed to start services: ${error.message}`);
      process.exit(1);
    });

  } catch (error) {
    logError(`Startup failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Execute startup
startApplication();
