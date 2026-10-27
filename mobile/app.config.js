/**
 * Dynamic additions to app.json. CI passes the release version and a build number
 * (every store/sideload build needs a higher one than the last).
 */
module.exports = ({ config }) => {
  const version = process.env.APP_VERSION || config.version;
  const buildNumber = Number(process.env.APP_BUILD_NUMBER || 1);
  return {
    ...config,
    version,
    ios: { ...config.ios, buildNumber: String(buildNumber) },
    android: { ...config.android, versionCode: buildNumber },
    plugins: [...(config.plugins ?? []), "./plugins/withReleaseSigning"],
  };
};
