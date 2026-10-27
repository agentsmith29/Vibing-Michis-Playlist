const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * Sign Android release builds with our own key when the Gradle properties
 * MICHI_UPLOAD_STORE_FILE / _STORE_PASSWORD / _KEY_ALIAS / _KEY_PASSWORD are set
 * (CI passes them as ORG_GRADLE_PROJECT_* variables). Without them the build keeps
 * the template's debug signing, so local builds still work.
 */
function addReleaseSigning(gradle) {
  if (gradle.includes("MICHI_UPLOAD_STORE_FILE")) return gradle;

  // 1. Point buildTypes.release at the release signing config (if configured).
  const buildTypes = gradle.indexOf("buildTypes {");
  const releaseType = gradle.indexOf("release {", buildTypes);
  const debugSigning = gradle.indexOf("signingConfig signingConfigs.debug", releaseType);
  if (buildTypes < 0 || releaseType < 0 || debugSigning < 0) {
    throw new Error("withReleaseSigning: unexpected android/app/build.gradle layout");
  }
  gradle =
    gradle.slice(0, debugSigning) +
    "signingConfig project.hasProperty('MICHI_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug" +
    gradle.slice(debugSigning + "signingConfig signingConfigs.debug".length);

  // 2. Declare that signing config.
  return gradle.replace(
    "signingConfigs {",
    `signingConfigs {
        release {
            if (project.hasProperty('MICHI_UPLOAD_STORE_FILE')) {
                storeFile file(MICHI_UPLOAD_STORE_FILE)
                storePassword MICHI_UPLOAD_STORE_PASSWORD
                keyAlias MICHI_UPLOAD_KEY_ALIAS
                keyPassword MICHI_UPLOAD_KEY_PASSWORD
            }
        }`,
  );
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = addReleaseSigning(cfg.modResults.contents);
    return cfg;
  });
};
