import type { AppTypeHandler } from "./index";

export const pythonHandler: AppTypeHandler = {
  id:                "python",
  label:             "Python (FastAPI / Django / Flask)",
  deploymentTarget:  "ecs",
  defaultPort:       8000,
  defaultCpu:        256,
  defaultMemory:     512,

  detectFromFiles(files) {
    const names = files.map(f => f.toLowerCase());
    const has = (s: string) => names.some(n => n.includes(s));
    let score = 0;
    if (has("requirements.txt") || has("pyproject.toml") || has("pipfile")) score += 50;
    if (has("main.py") || has("app.py") || has("manage.py") || has("asgi.py")) score += 30;
    return score;
  },

  generateDockerfile() {
    return `FROM python:3.12-slim AS base
WORKDIR /app

# Install dependencies separately for better layer caching
COPY requirements*.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Health check — InfraReady ALB pings /health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:\${PORT:-8000}/health')"

EXPOSE \${PORT:-8000}

# Auto-detect framework and use appropriate server
# FastAPI/ASGI: uvicorn main:app
# Django: gunicorn config.wsgi:application
# Flask: gunicorn app:app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`;
  },
};
