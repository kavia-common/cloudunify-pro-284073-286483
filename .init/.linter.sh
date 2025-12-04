#!/bin/bash
cd /home/kavia/workspace/code-generation/cloudunify-pro-284073-286483/Backend
npm run lint
LINT_EXIT_CODE=$?
if [ $LINT_EXIT_CODE -ne 0 ]; then
  exit 1
fi

