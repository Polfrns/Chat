const { NextcloudService, NextcloudWebDAV } = require('@librechat/api');
const store = require('./store');

/** The service and WebDAV client live in `@librechat/api`; this binds them to the Mongoose store. */
function getNextcloudService() {
  return new NextcloudService(new NextcloudWebDAV(process.env.NEXTCLOUD_URL), store);
}

module.exports = { getNextcloudService };
