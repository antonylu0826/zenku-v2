import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ZenkuTool } from '../types';

const GUIDE_PATH = join(process.cwd(), 'docs', 'external-integration-guide.md');

function loadGuide(): string {
  try {
    return readFileSync(GUIDE_PATH, 'utf-8');
  } catch {
    return 'Integration guide not found. Expected at docs/external-integration-guide.md';
  }
}

export const guideTool: ZenkuTool = {
  definition: {
    name: 'get_integration_guide',
    description: `Returns the Zenku External Integration Guide — a reference for any external system (n8n, Zapier, Make, AI agents, etc.) that needs to communicate bidirectionally with Zenku.

Read this guide when you need to know:
- Which API endpoints to use (/api/ext/ vs /api/data/, and why they differ)
- How to authenticate with an API key (Bearer token format and scopes)
- The exact webhook payload Zenku sends on after_insert/after_update rules
- How to write data back to Zenku (PATCH endpoint or webhook callback)
- Common errors and fixes (Docker hostname, n8n expression mode, auth conflicts)
- Step-by-step integration walkthrough using n8n as the example`,
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  execute: () => {
    const content = loadGuide();
    return {
      success: true,
      message: 'Integration guide loaded.',
      data: { content },
    };
  },
};
