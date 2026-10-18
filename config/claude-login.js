const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { claude } = require('@librechat/api');
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');

/** Best-effort cross-platform browser open; failure is non-fatal. */
function openBrowser(url) {
  const command =
    process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(command, () => {});
}

(async () => {
  await connect();
  createModels(mongoose);

  console.purple('--------------------------------');
  console.purple('Sign in to Claude (subscription)');
  console.purple('--------------------------------');

  const { verifier, challenge } = claude.generatePkce();
  const state = crypto.randomBytes(16).toString('hex');
  const authorizeUrl = claude.buildAuthorizeUrl({ challenge, state });

  console.green('Open this URL in your browser and sign in with your Claude account:');
  console.blue(authorizeUrl);
  console.orange(
    '\nAfter approving, the page shows an authorization code (formatted as `code#state`).',
  );
  openBrowser(authorizeUrl);

  const pasted = await askQuestion('Paste the authorization code here:');
  if (!pasted || !pasted.trim()) {
    console.red('No code provided.');
    silentExit(1);
  }

  const { code, state: pastedState } = claude.parsePastedCode(pasted);

  try {
    const tokens = await claude.exchangeCode({
      code,
      state: pastedState ?? state,
      verifier,
    });
    await claude.saveCredentials(tokens);
    console.green('\nSuccessfully signed in to your Claude subscription!');
    silentExit(0);
  } catch (error) {
    console.red(`\nSign-in failed: ${error.message}`);
    silentExit(1);
  }
})();

process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
  }
  if (!err.message.includes('fetch failed')) {
    process.exit(1);
  }
});
