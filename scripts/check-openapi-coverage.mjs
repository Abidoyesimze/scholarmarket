#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Routes that are intentionally undocumented
const ALLOWLIST = [
  'GET /api/health',
  'POST /api/workflows/reconcile',
  'POST /api/indexer',
  'POST /api/transactions/history',
];

// Read all route.js files
function getRoutes() {
  const routes = new Set();
  const apiDir = path.join(projectRoot, 'src', 'app', 'api');

  function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else if (file === 'route.js') {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const relativePath = path.relative(apiDir, fullPath);
        const routePath = '/' + relativePath.replace('/route.js', '').replace(/\[([^\]]+)\]/g, '{$1}');

        // Extract exported HTTP methods
        const httpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'];
        for (const method of httpMethods) {
          const pattern = new RegExp(`export\\s+(const\\s+)?${method}\\s*=`, 'm');
          if (pattern.test(content)) {
            routes.add(`${method} /api${routePath}`);
          }
        }
      }
    }
  }

  walkDir(apiDir);
  return Array.from(routes).sort();
}

// Parse YAML paths without external library
function getDocumentedPaths() {
  const specPath = path.join(projectRoot, 'docs', 'openapi.yaml');
  const content = fs.readFileSync(specPath, 'utf-8');
  const paths = [];

  // Extract path lines and their methods
  const pathRegex = /^paths:\s*$/m;
  if (!pathRegex.test(content)) return paths;

  const pathsStart = content.indexOf('paths:');
  const pathsSection = content.substring(pathsStart);

  // Find each path (lines starting with /)
  const pathLineRegex = /^  (\/[^\s:]+):\s*$/gm;
  let pathMatch;

  while ((pathMatch = pathLineRegex.exec(pathsSection)) !== null) {
    const pathName = pathMatch[1];
    const pathStart = pathMatch.index + pathMatch[0].length;
    const restOfPaths = pathsSection.substring(pathStart);

    // Find methods under this path (get:, post:, etc)
    const methodRegex = /^    (get|post|put|delete|patch|head):\s*$/m;
    const methodMatch = methodRegex.exec(restOfPaths);

    if (methodMatch) {
      // Extract all methods for this path
      const methodLineRegex = /^    (get|post|put|delete|patch|head):/gm;
      const untilNextPath = restOfPaths.split(/^  \/[^\s:]+:/m)[0];

      let m;
      while ((m = methodLineRegex.exec(untilNextPath)) !== null) {
        paths.push(`${m[1].toUpperCase()} ${pathName}`);
      }
    }
  }

  return paths.sort();
}

// Main check
function main() {
  const routes = getRoutes();
  const documented = new Set(getDocumentedPaths());

  let hasErrors = false;
  const missing = [];

  for (const route of routes) {
    if (!documented.has(route) && !ALLOWLIST.includes(route)) {
      missing.push(route);
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error('❌ OpenAPI coverage check failed!');
    console.error(`\nMissing ${missing.length} route(s) in docs/openapi.yaml:\n`);
    missing.forEach(route => console.error(`  ${route}`));
    console.error('\nAdd these routes to docs/openapi.yaml or add to ALLOWLIST in this script.');
    process.exit(1);
  } else {
    console.log('✅ All routes are documented in OpenAPI spec');
    process.exit(0);
  }
}

main();
