#!/bin/bash
# Quick deployment script for warehouse-network with AI assistant

set -e

echo "🚀 Deploying Warehouse Network with AI Assistant"
echo ""

# Check if deployment method is specified
if [ -z "$1" ]; then
    echo "Usage: ./deploy.sh [docker|vercel|gcloud]"
    echo ""
    echo "Options:"
    echo "  docker  - Build and run with Docker"
    echo "  vercel  - Deploy to Vercel"
    echo "  gcloud  - Deploy to Google Cloud Run"
    exit 1
fi

METHOD=$1

case $METHOD in
    docker)
        echo "🐳 Building Docker image..."
        cd apps/web
        docker build -t warehouse-network:latest .
        
        echo ""
        echo "✅ Docker image built successfully!"
        echo ""
        echo "To run locally:"
        echo "  docker run -p 3000:3000 --env-file .env warehouse-network:latest"
        echo ""
        echo "To push to a registry:"
        echo "  docker tag warehouse-network:latest your-registry/warehouse-network:latest"
        echo "  docker push your-registry/warehouse-network:latest"
        ;;
        
    vercel)
        echo "▲ Deploying to Vercel..."
        
        # Check if vercel CLI is installed
        if ! command -v vercel &> /dev/null; then
            echo "❌ Vercel CLI not found. Installing..."
            npm i -g vercel
        fi
        
        cd apps/web
        echo ""
        echo "🔧 Before deploying, make sure to:"
        echo "1. Set these environment variables in Vercel dashboard:"
        echo "   - DATABASE_URL"
        echo "   - NEXTAUTH_SECRET"
        echo "   - NEXTAUTH_URL"
        echo ""
        echo "Press Enter to continue..."
        read
        
        vercel --prod
        ;;
        
    gcloud)
        echo "☁️ Deploying to Google Cloud Run..."
        
        # Check if gcloud is installed
        if ! command -v gcloud &> /dev/null; then
            echo "❌ Google Cloud SDK not found."
            echo "Please install: https://cloud.google.com/sdk/docs/install"
            exit 1
        fi
        
        cd apps/web
        
        echo ""
        echo "📝 Using project: aindustries-warehouse"
        echo "📍 Region: us-central1"
        echo ""
        
        # Create .gcloudignore if it doesn't exist
        if [ ! -f .gcloudignore ]; then
            echo "Creating .gcloudignore..."
            cat > .gcloudignore << EOF
.git
.gitignore
node_modules/
.next/cache/
.env.local
*.log
EOF
        fi
        
        # Deploy
        gcloud run deploy warehouse-frontend \
            --source . \
            --region us-central1 \
            --allow-unauthenticated \
            --memory=1Gi \
            --cpu=2 \
            --max-instances=10 \
            --set-env-vars="NODE_ENV=production,SKIP_ENV_VALIDATION=true" \
            --project aindustries-warehouse
            
        echo ""
        echo "✅ Deployment complete!"
        echo ""
        echo "🔧 Don't forget to:"
        echo "1. Set environment variables in Cloud Run console"
        echo "2. Run database migrations"
        echo "3. Test the AI chat widget"
        ;;
        
    *)
        echo "❌ Unknown deployment method: $METHOD"
        echo "Use: docker, vercel, or gcloud"
        exit 1
        ;;
esac

echo ""
echo "🤖 AI Assistant Features Deployed:"
echo "✓ Natural language warehouse search"
echo "✓ Lead scoring (0-100)"
echo "✓ Listing creation wizard"
echo "✓ Pricing calculator"
echo "✓ Chat widget on homepage"
echo ""
echo "📚 For more details, see DEPLOYMENT_GUIDE.md"