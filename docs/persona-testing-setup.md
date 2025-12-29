# Persona Testing Setup for Warehouse Network

## Overview
The warehouse network includes persona-based testing to validate user journeys across different user types.

## Changes Made
1. Modified `monitoring/scripts/persona-validator.js` to support environment variable for BASE_URL
2. Created `scripts/run-local-persona-tests.sh` for easy local testing
3. Temporarily disabled Claude packages in docker-compose.yml due to TypeScript build errors

## Running Persona Tests

### Against Local Instance
```bash
# Run with environment variable
BASE_URL=http://localhost:3000 node monitoring/scripts/persona-validator.js

# Or use the helper script
./scripts/run-local-persona-tests.sh
```

### Against Deployed Instance
```bash
BASE_URL=https://warehouse-frontend-467296114824.us-central1.run.app node monitoring/scripts/persona-validator.js
```

## Test Personas
1. **Anonymous Visitor** - Tests homepage, search, and listings
2. **Business Owner** - Tests login, dashboard, search, and booking
3. **Property Owner** - Tests login, admin dashboard, listings management, and bookings

## Current Status
- The deployed instance only has the homepage route working (/)
- All other routes return 404 errors
- Local testing shows better results when application is properly configured

## Docker Setup
The main application can be run using:
```bash
docker-compose up -d postgres redis app
```

Note: Claude packages have TypeScript compilation errors that need to be fixed before they can be included in the Docker setup.