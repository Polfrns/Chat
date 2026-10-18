const path = require('path');
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { claude } = require('@librechat/api');
const { silentExit } = require('./helpers');
const connect = require('./connect');

(async () => {
  await connect();
  createModels(mongoose);

  console.purple('---------------------------------');
  console.purple('Sign out of Claude (subscription)');
  console.purple('---------------------------------');

  try {
    await claude.clearCredentials();
    console.green('Removed stored Claude credentials.');
    silentExit(0);
  } catch (error) {
    console.red(`Failed to remove Claude credentials: ${error.message}`);
    silentExit(1);
  }
})();

process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
    process.exit(1);
  }
});
