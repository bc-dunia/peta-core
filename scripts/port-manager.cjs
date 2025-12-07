#!/usr/bin/env node

const net = require('net');

/**
 * Check if port is available
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.listen(port, () => {
      server.once('close', () => {
        resolve(true);
      });
      server.close();
    });

    server.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Find available port
 */
async function findAvailablePort(startPort = 3002, maxPort = 3020, excludePorts = []) {
  for (let port = startPort; port <= maxPort; port++) {
    if (!excludePorts.includes(port) && await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available ports found between ${startPort}-${maxPort} excluding ${excludePorts.join(', ')}`);
}

/**
 * Allocate available port for backend
 */
async function allocatePorts() {
  console.log('🔍 Checking for available ports...');

  try {
    // First check if BACKEND_PORT is configured in .env
    const configuredPort = process.env.BACKEND_PORT
      ? parseInt(process.env.BACKEND_PORT)
      : null;

    let backendPort = configuredPort || 3002;

    if (!(await isPortAvailable(backendPort))) {
      if (configuredPort) {
        console.log(`⚠️  Configured port ${configuredPort} is in use!`);
        console.log(`💡 Tip: Change BACKEND_PORT in .env or free up the port`);
      }
      console.log(`⚠️  Finding alternative port...`);
      backendPort = await findAvailablePort(3002, 3020);
      console.log(`🚀 Backend will use port ${backendPort}`);
    } else {
      const portSource = configuredPort ? 'configured' : 'default';
      console.log(`✅ Backend will use ${portSource} port ${backendPort}`);
    }

    // Set environment variable
    process.env.BACKEND_PORT = String(backendPort);

    console.log(`📋 Port allocation complete:`);
    console.log(`   Backend:  http://localhost:${backendPort}`);

    return { backendPort };

  } catch (error) {
    console.error('❌ Failed to allocate ports:', error.message);
    process.exit(1);
  }
}


// If this script is executed directly
if (require.main === module) {
  allocatePorts().then(ports => {
    console.log('Port allocated:', ports);
  }).catch(console.error);
}

module.exports = {
  isPortAvailable,
  findAvailablePort,
  allocatePorts
};
