#!/bin/bash

# Script to run persona-based tests locally

echo "🚀 Starting local persona validation tests..."

# Check if the app is running on port 3000
if ! curl -s http://localhost:3000 > /dev/null; then
    echo "❌ Error: No application running on localhost:3000"
    echo "Please ensure the warehouse application is running locally"
    exit 1
fi

# Run the persona validator against local instance
BASE_URL=http://localhost:3000 node monitoring/scripts/persona-validator.js

echo "✅ Persona validation complete"