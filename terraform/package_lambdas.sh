#!/bin/bash
# Run this script before terraform apply to package Lambda functions

echo "📦 Packaging Lambda functions..."

# Package ai_handler
cd lambda/ai_handler
zip -r ../../lambda/ai_handler.zip index.js
cd ../..
echo "✅ ai_handler.zip created"

# Package sync_kb
cd lambda/sync_kb
zip -r ../../lambda/sync_kb.zip index.js
cd ../..
echo "✅ sync_kb.zip created"

echo ""
echo "🚀 Ready to deploy! Run:"
echo "   terraform init"
echo "   terraform plan"
echo "   terraform apply"
