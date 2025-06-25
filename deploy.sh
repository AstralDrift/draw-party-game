#!/bin/bash

# 🎨 Draw Party - One-Click Deployment Script
# Deploy your drawing party game to GitHub Pages, Netlify, or Vercel

set -e

echo "🎨 Draw Party Deployment Script"
echo "==============================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo -e "${YELLOW}Initializing git repository...${NC}"
    git init
    git add .
    git commit -m "🎨 Initial Draw Party setup"
    echo ""
fi

echo "Choose your deployment platform:"
echo "1) GitHub Pages (Free, Easy)"
echo "2) Netlify (Free, Drag & Drop)"
echo "3) Vercel (Free, Fast)"
echo "4) Local Server (Testing)"
echo ""

read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        echo -e "${BLUE}🚀 Deploying to GitHub Pages...${NC}"
        echo ""
        
        # Check if GitHub CLI is installed
        if ! command -v gh &> /dev/null; then
            echo -e "${RED}Error: GitHub CLI (gh) is not installed.${NC}"
            echo "Install it from: https://cli.github.com/"
            echo ""
            echo "Alternative manual steps:"
            echo "1. Create a new repository on GitHub"
            echo "2. Push your code: git remote add origin [your-repo-url]"
            echo "3. git push -u origin main"
            echo "4. Enable GitHub Pages in repository settings"
            exit 1
        fi
        
        # Check if user is logged in to GitHub
        if ! gh auth status &> /dev/null; then
            echo -e "${YELLOW}Please login to GitHub first:${NC}"
            echo "gh auth login"
            exit 1
        fi
        
        read -p "Enter repository name (e.g., my-draw-party): " repo_name
        
        if [ -z "$repo_name" ]; then
            repo_name="draw-party-game"
        fi
        
        # Create repository and push
        echo -e "${YELLOW}Creating GitHub repository...${NC}"
        gh repo create "$repo_name" --public --source=. --remote=origin --push
        
        # Enable GitHub Pages
        echo -e "${YELLOW}Enabling GitHub Pages...${NC}"
        gh api repos/:owner/"$repo_name"/pages -X POST -f source='{"branch":"main","path":"/"}'
        
        # Get the URL
        username=$(gh api user --jq .login)
        url="https://$username.github.io/$repo_name"
        
        echo ""
        echo -e "${GREEN}✅ Deployment successful!${NC}"
        echo -e "${GREEN}Your game is live at: $url${NC}"
        echo ""
        echo "Note: It may take a few minutes for GitHub Pages to become available."
        echo "Share your game by sending friends: $url/ABCD (replace ABCD with room code)"
        ;;
        
    2)
        echo -e "${BLUE}🚀 Deploying to Netlify...${NC}"
        echo ""
        
        # Create a zip file
        zip_name="draw-party-$(date +%Y%m%d-%H%M%S).zip"
        echo -e "${YELLOW}Creating deployment package...${NC}"
        zip -r "$zip_name" index.html manifest.json sw.js -x "*.git*" "deploy.sh"
        
        echo ""
        echo -e "${GREEN}✅ Package created: $zip_name${NC}"
        echo ""
        echo "Manual deployment steps:"
        echo "1. Go to https://netlify.com/"
        echo "2. Sign up/login"
        echo "3. Drag and drop $zip_name to deploy"
        echo "4. Your game will be live instantly!"
        echo ""
        echo "Or use Netlify CLI:"
        echo "npm install -g netlify-cli"
        echo "netlify deploy --prod --dir=."
        ;;
        
    3)
        echo -e "${BLUE}🚀 Deploying to Vercel...${NC}"
        echo ""
        
        # Check if Vercel CLI is installed
        if ! command -v vercel &> /dev/null; then
            echo -e "${YELLOW}Installing Vercel CLI...${NC}"
            npm install -g vercel
        fi
        
        echo -e "${YELLOW}Starting Vercel deployment...${NC}"
        echo ""
        echo "When prompted:"
        echo "- Set project name (or press Enter for default)"
        echo "- Link to existing project? N"
        echo "- In which directory is your code located? ./"
        echo "- Want to override settings? N"
        echo ""
        
        vercel --prod
        
        echo ""
        echo -e "${GREEN}✅ Deployment successful!${NC}"
        echo "Your game is now live! Check the URL above."
        ;;
        
    4)
        echo -e "${BLUE}🚀 Starting local server...${NC}"
        echo ""
        
        # Try different local server options
        if command -v python3 &> /dev/null; then
            echo -e "${YELLOW}Starting Python server on port 3000...${NC}"
            echo "Your game will be available at: http://localhost:3000"
            echo "Press Ctrl+C to stop the server"
            echo ""
            python3 -m http.server 3000
        elif command -v python &> /dev/null; then
            echo -e "${YELLOW}Starting Python server on port 3000...${NC}"
            echo "Your game will be available at: http://localhost:3000"
            echo "Press Ctrl+C to stop the server"
            echo ""
            python -m SimpleHTTPServer 3000
        elif command -v npx &> /dev/null; then
            echo -e "${YELLOW}Starting Node.js server on port 3000...${NC}"
            echo "Your game will be available at: http://localhost:3000"
            echo "Press Ctrl+C to stop the server"
            echo ""
            npx serve . -l 3000
        else
            echo -e "${RED}Error: No suitable local server found.${NC}"
            echo "Please install Python or Node.js to run a local server."
            echo ""
            echo "Alternatives:"
            echo "- Python: python3 -m http.server 3000"
            echo "- Node.js: npx serve . -l 3000"
            echo "- PHP: php -S localhost:3000"
        fi
        ;;
        
    *)
        echo -e "${RED}Invalid choice. Please run the script again.${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}🎉 Happy drawing!${NC}"
echo ""
echo "Tips for sharing your game:"
echo "• Send the link via text/WhatsApp: 'Game time! → [your-url]/ABCD'"  
echo "• Show QR code for same-room sharing"
echo "• Works on any device - no apps needed!"
echo ""