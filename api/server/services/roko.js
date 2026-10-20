const { RokoClient } = require('@librechat/api');

/**
 * The single client to the leedeo-filestore service. LibreChat is a pure client —
 * it owns sessions, not filestores. Configure with:
 *   ROKO_SERVER_URL  (default http://localhost:3100)
 *   ROKO_API_KEY     (opaque bearer bound to a service account on the server)
 */
const ROKO_BASE_URL = process.env.ROKO_SERVER_URL || 'http://localhost:3100';
const rokoClient = new RokoClient(ROKO_BASE_URL, process.env.ROKO_API_KEY || '');

module.exports = { rokoClient, ROKO_BASE_URL };
