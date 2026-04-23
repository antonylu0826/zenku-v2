import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ZenkuTool } from '../types';

const GUIDE_PATH = join(process.cwd(), 'docs', 'agent-integration-guide.md');

function loadGuide(): string {
  try {
    return readFileSync(GUIDE_PATH, 'utf-8');
  } catch {
    return 'Integration guide not found. Expected at docs/agent-integration-guide.md';
  }
}

export const guideTool: ZenkuTool = {
  definition: {
    name: 'get_integration_guide',
    description: `Returns the Zenku Agent Integration Guide — a comprehensive reference for AI agents integrating Zenku with n8n, Zapier, or other automation tools.

Read this guide when you need to know:
- Which API endpoints to use (/api/ext/ vs /api/data/)
- How to authenticate with an API key (Bearer token format)
- The exact webhook payload Zenku sends on after_insert rules
- How to write data back to Zenku from n8n (PATCH or webhook callback)
- Common errors and fixes (Docker hostname, n8n expression mode, auth conflicts)
- Step-by-step integration walkthrough`,
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
