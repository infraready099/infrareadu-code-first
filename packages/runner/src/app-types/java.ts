import type { AppTypeHandler } from "./index";

export const javaHandler: AppTypeHandler = {
  id:                "java",
  label:             "Java / Spring Boot",
  deploymentTarget:  "ecs",
  defaultPort:       8080,
  defaultCpu:        512,
  defaultMemory:     1024,

  detectFromFiles(files) {
    const names = files.map(f => f.toLowerCase());
    const has = (s: string) => names.some(n => n.includes(s));
    let score = 0;
    if (has("pom.xml") || has("build.gradle") || has("settings.gradle")) score += 70;
    if (has("application.properties") || has("application.yml")) score += 20;
    if (has(".java")) score += 10;
    return score;
  },

  generateDockerfile() {
    return `# Stage 1 — Build
FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /app
COPY . .
# Works for both Maven and Gradle
RUN if [ -f "mvnw" ]; then \\
      chmod +x mvnw && ./mvnw -DskipTests --batch-mode package; \\
    elif [ -f "gradlew" ]; then \\
      chmod +x gradlew && ./gradlew -x test bootJar; \\
    elif [ -f "pom.xml" ]; then \\
      mvn -DskipTests --batch-mode package; \\
    else \\
      gradle -x test bootJar; \\
    fi

# Stage 2 — Run
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar 2>/dev/null || \\
  COPY --from=build /app/build/libs/*.jar app.jar
EXPOSE \${PORT:-8080}
ENTRYPOINT ["java", \\
  "-XX:MaxRAMPercentage=75", \\
  "-XX:+UseContainerSupport", \\
  "-jar", "app.jar"]
`;
  },
};
