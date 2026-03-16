import type { AppTypeHandler } from "./index";

/**
 * Mobile app handler — supports Expo (managed + bare), React Native (bare workflow), and Flutter.
 *
 * DeploymentTarget "mobile" routes to AWS CodeBuild rather than ECS or S3.
 * CPU and memory are 0 because CodeBuild manages its own compute sizing.
 *
 * Detection priority: this handler is registered BEFORE nodejs/react-spa because
 * mobile repos also contain package.json and could false-positive to those handlers.
 */
export const mobileHandler: AppTypeHandler = {
  id:               "mobile",
  label:            "Mobile App (Expo / React Native / Flutter)",
  deploymentTarget: "mobile",
  defaultPort:      0,  // no server — CodeBuild handles compute
  defaultCpu:       0,
  defaultMemory:    0,

  detectFromFiles(files: string[]): number {
    const names = files.map(f => f.toLowerCase());
    const has    = (s: string) => names.some(n => n === s || n.endsWith(`/${s}`));
    const hasDir = (prefix: string) => names.some(n => n.startsWith(`${prefix}/`));

    // ── Flutter ─────────────────────────────────────────────────────────────
    // pubspec.yaml at root + lib/main.dart is definitive Flutter
    if (has("pubspec.yaml") && has("lib/main.dart")) return 90;

    // ── Expo managed / bare ─────────────────────────────────────────────────
    // app.json, app.config.js, or app.config.ts containing expo config is the
    // strongest signal. We check file presence; content check is a Phase 2 todo.
    if (has("app.json") || has("app.config.js") || has("app.config.ts")) {
      // If there is also a package.json we are even more confident it's JS-based Expo
      if (has("package.json")) return 95;
      return 80;
    }

    // ── React Native bare workflow ───────────────────────────────────────────
    // Bare RN repos have android/ and ios/ directories alongside package.json
    if (has("package.json") && hasDir("android") && hasDir("ios")) return 85;

    return 0;
  },

  /**
   * Generates the CodeBuild buildspec.yml content as a string.
   * The runner writes this to the customer's repo so CodeBuild can execute it.
   *
   * Framework-specific variants are returned based on the mobileConfig on the
   * parent handler instance — callers should set mobileConfig before calling this.
   */
  generateBuildspec(this: AppTypeHandler): string {
    const cfg = this.mobileConfig;
    const framework = cfg?.framework ?? "expo";

    if (framework === "expo") {
      return buildspecExpo(cfg?.platform ?? "both");
    }

    if (framework === "flutter") {
      return buildspecFlutter(cfg?.platform ?? "android");
    }

    // react-native bare workflow
    return buildspecReactNativeBare(cfg?.platform ?? "android");
  },
};

// ─── Buildspec generators ─────────────────────────────────────────────────────

function buildspecExpo(platform: "ios" | "android" | "both"): string {
  return `version: 0.2
# InfraReady — Expo EAS Build pipeline
# Triggered on every push to the configured branch via CodeBuild webhook.
# Secrets are fetched from Secrets Manager; no long-lived credentials in plaintext.

env:
  variables:
    BUILD_PLATFORM: "${platform}"
  secrets-manager:
    EXPO_TOKEN: $EXPO_TOKEN_SECRET_ARN

phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - npm install -g eas-cli
      - npm ci

  pre_build:
    commands:
      - echo "Authenticating with Expo..."
      - eas whoami
      - |
        if [ -n "$APPLE_CERT_SECRET_ARN" ]; then
          echo "Fetching Apple distribution certificate..."
          aws secretsmanager get-secret-value \\
            --secret-id "$APPLE_CERT_SECRET_ARN" \\
            --query SecretString \\
            --output text | base64 -d > /tmp/cert.p12
        fi

  build:
    commands:
      - echo "Submitting EAS build for platform: $BUILD_PLATFORM"
      - eas build --platform $BUILD_PLATFORM --non-interactive --no-wait

  post_build:
    commands:
      - echo "Build submitted to EAS Build service"
      - echo "Monitor at https://expo.dev/accounts/[your-account]/projects/[slug]/builds"
`;
}

function buildspecFlutter(platform: "ios" | "android" | "both"): string {
  // CodeBuild Linux containers can only build Android; iOS requires macOS.
  // We document this constraint in the buildspec comment and default to android.
  const effectivePlatform = platform === "ios" ? "ios" : "android";

  return `version: 0.2
# InfraReady — Flutter Build pipeline
# NOTE: iOS builds require a macOS CodeBuild environment (environment_type = LINUX_EC2 won't work).
# This buildspec targets Android. For iOS, set environment_type = MAC_ARM in the codebuild module.

phases:
  install:
    runtime-versions:
      java: corretto21
    commands:
      - curl -sSL https://storage.googleapis.com/flutter/releases/stable/linux/flutter_linux_3.19.6-stable.tar.xz | tar -xJ -C $HOME
      - export PATH="$PATH:$HOME/flutter/bin"
      - flutter doctor -v

  pre_build:
    commands:
      - export PATH="$PATH:$HOME/flutter/bin"
      - flutter pub get
      - |
        if [ "${effectivePlatform}" = "android" ] && [ -n "$ANDROID_KEYSTORE_SECRET_ARN" ]; then
          echo "Fetching Android keystore..."
          aws secretsmanager get-secret-value \\
            --secret-id "$ANDROID_KEYSTORE_SECRET_ARN" \\
            --query SecretString \\
            --output text | base64 -d > android/app/release.jks
          KEYSTORE_PASSWORD=$(aws secretsmanager get-secret-value \\
            --secret-id "$ANDROID_KEYSTORE_PASSWORD_SECRET_ARN" \\
            --query SecretString --output text)
          export KEYSTORE_PASSWORD
        fi

  build:
    commands:
      - export PATH="$PATH:$HOME/flutter/bin"
      - flutter build apk --release

  post_build:
    commands:
      - echo "APK build complete"

artifacts:
  files:
    - build/app/outputs/flutter-apk/app-release.apk
  base-directory: .
`;
}

function buildspecReactNativeBare(platform: "ios" | "android" | "both"): string {
  return `version: 0.2
# InfraReady — React Native (bare workflow) Android Build pipeline
# NOTE: iOS builds require a macOS CodeBuild environment.
# This buildspec targets the Android release APK/AAB.

phases:
  install:
    runtime-versions:
      nodejs: 20
      java: corretto21
    commands:
      - npm ci

  pre_build:
    commands:
      - |
        if [ -n "$ANDROID_KEYSTORE_SECRET_ARN" ]; then
          echo "Fetching Android keystore from Secrets Manager..."
          aws secretsmanager get-secret-value \\
            --secret-id "$ANDROID_KEYSTORE_SECRET_ARN" \\
            --query SecretString \\
            --output text | base64 -d > android/app/release.keystore
          ANDROID_KEYSTORE_PASSWORD=$(aws secretsmanager get-secret-value \\
            --secret-id "$ANDROID_KEYSTORE_PASSWORD_SECRET_ARN" \\
            --query SecretString --output text)
          export ANDROID_KEYSTORE_PASSWORD
        fi

  build:
    commands:
      - cd android && ./gradlew bundleRelease --no-daemon
      - echo "AAB build complete"

  post_build:
    commands:
      - echo "Android AAB ready for Play Store upload"

artifacts:
  files:
    - android/app/build/outputs/bundle/release/app-release.aab
  base-directory: .
`;
}
