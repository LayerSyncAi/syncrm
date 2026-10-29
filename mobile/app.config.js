// Extends app.json. Android push goes through Firebase Cloud Messaging, so
// Android builds need the Firebase project's google-services.json. EAS builds
// read it from the GOOGLE_SERVICES_JSON file variable; a local build uses
// ./google-services.json when present. Without either, the build still works
// but Android phones cannot get a push token.
const fs = require("fs");

module.exports = ({ config }) => {
  const file =
    process.env.GOOGLE_SERVICES_JSON ||
    (fs.existsSync("./google-services.json") ? "./google-services.json" : undefined);
  return file ? { ...config, android: { ...config.android, googleServicesFile: file } } : config;
};
