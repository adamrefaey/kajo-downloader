#!/usr/bin/env bash
# setup-dev.sh — one-time local development environment setup
# Run from the repo root: bash scripts/setup-dev.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'
info()  { echo -e "${GREEN}[setup]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# ── 1. Node.js version ───────────────────────────────────────────────────────
info "Checking Node.js version..."
if ! command -v node &>/dev/null; then
    error "Node.js not found. Install Node.js >=24 from https://nodejs.org or via nvm/volta."
fi
NODE_MAJOR=$(node -e 'process.stdout.write(String(process.version.match(/^v(\d+)/)[1]))')
if [[ "$NODE_MAJOR" -lt 24 ]]; then
    error "Node.js ${NODE_MAJOR} found; >=24 required. Upgrade: nvm install 24 && nvm use 24"
fi
info "Node.js $(node --version) ✓"

# ── 2. pnpm ───────────────────────────────────────────────────────────────────
info "Checking pnpm..."
if ! command -v pnpm &>/dev/null; then
    warn "pnpm not found. Installing via corepack..."
    corepack enable
    corepack prepare pnpm@10.33.0 --activate
fi
PNPM_MAJOR=$(pnpm --version | cut -d. -f1)
if [[ "$PNPM_MAJOR" -lt 10 ]]; then
    warn "pnpm $(pnpm --version) found; >=10 recommended. Run: corepack prepare pnpm@latest --activate"
fi
info "pnpm $(pnpm --version) ✓"

# ── 3. .env file ──────────────────────────────────────────────────────────────
info "Checking .env file..."
example="$REPO_ROOT/.env.example"
target="$REPO_ROOT/.env"
if [[ -f "$example" && ! -f "$target" ]]; then
    cp "$example" "$target"
    warn "Copied .env.example → .env — fill in any required values."
elif [[ -f "$target" ]]; then
    info ".env already exists ✓"
fi

# ── 4. Install dependencies ───────────────────────────────────────────────────
info "Installing dependencies (pnpm install)..."
pnpm install
info "Dependencies installed ✓"

# ── 5. Initial build ──────────────────────────────────────────────────────────
info "Running initial build to verify setup..."
if pnpm run build 2>&1 | tail -5; then
    info "Build succeeded ✓"
else
    warn "Build had issues — check output above. You may need to fill in .env values first."
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
info "Setup complete! Next steps:"
echo "  • Fill in .env if any values are required"
echo "  • Tests:       pnpm run test:coverage"
echo "  • Dev server:  pnpm run dev  (Electron app)"
echo "  • See CLAUDE.md for full documentation"
