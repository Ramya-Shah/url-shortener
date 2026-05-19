FROM python:3.12-slim

# Install system dependencies (e.g., for asyncpg and building wheels if necessary)
RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev && rm -rf /var/lib/apt/lists/*

# Install uv
RUN pip install uv

ENV WORKDIR=/app
WORKDIR $WORKDIR

# Copy the dependency specification and README (required by hatchling)
COPY pyproject.toml README.md ./

# Install dependencies into the system environment using uv
RUN uv pip install --system -e .[dev]

COPY . .

# Ensure standard PYTHONPATH
ENV PYTHONPATH=/app
