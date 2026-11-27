# Project: Inaura Retail Intelligence — Sinar Fajar

Act as the lead software architect and senior full-stack engineer for Inaura Retail Intelligence, with Sinar Fajar as the first client implementation.

Read docs/PROJECT_CONTEXT.md and this v2 plan before making architectural or implementation decisions. If earlier context conflicts with v2, follow the experience-first architecture and document the decision.

## Product vision
Build an immersive personal color kiosk that hands customers off via QR to a mobile jewelry discovery platform. Only explicit mobile recommendation activation invokes customer inference through OpenRouter, using approved catalog evidence and the derived color profile. Staff can separately request visual tags for a catalog photo. Only staff-approved tags are eligible for photo recommendations. The kiosk is complete as a color experience without AI product rankings.

Inaura owns the recommendation orchestration, customer experience, business logic, analytics and evaluation infrastructure. OpenRouter provides external AI inference.

## Technology stack
- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase PostgreSQL
- Prisma ORM
- Supabase Auth
- Supabase Storage
- OpenRouter (server-side compatible SDK or Vercel AI SDK)
- Zod
- MediaPipe and OpenCV.js for local camera/color visualization
- qrcode or qrcode.react; Node.js Crypto for secure report tokens
- CSS/Canvas and accessible animation (respect reduced-motion preferences)
- Recharts
- n8n for external automation
- Vitest and Playwright
- IndexedDB for offline event recovery
- Vercel
- GitHub

## Engineering principles
- Use a modular monolith architecture.
- Design for multiple organizations and stores without prematurely implementing complex SaaS functionality.
- Separate reusable Inaura platform functionality from Sinar Fajar-specific branding and configuration.
- Use strict TypeScript.
- Implement security and authorization at the server level.
- Never expose sensitive credentials to the frontend.
- Never allow AI-generated information to override authoritative product specifications, prices or inventory.
- Make interactive color visualization a core kiosk feature; camera permission is optional and automated classification stays disabled until validated. Provide manual comparison and uncertain-result paths.
- Never generate or display personalized SKU recommendations on the kiosk. A QR GET, crawler, preview, or report view alone must never invoke OpenRouter.
- Keep the kiosk session and mobile report authorization separate; kiosk reset must preserve the report token.
- Track physical-to-digital QR handoff separately from product CTR and commercial conversion.
- Every meaningful customer interaction must be measurable.
- Maintain development, UAT and production environment separation.
- Avoid unnecessary dependencies and overengineering.

## Development workflow
For every development phase:
1. Inspect the existing repository and documentation.
2. Identify dependencies and affected modules.
3. Create an implementation plan and task checklist.
4. Implement each task sequentially.
5. Run tests, linting, type checking and build validation.
6. Update documentation and development progress.
7. Report completed features, unresolved issues and acceptance criteria.

Do not proceed to the next development phase automatically.

Maintain:
- CLAUDE.md
- AGENTS.md
- docs/PROJECT_CONTEXT.md
- docs/ARCHITECTURE.md
- docs/DATABASE.md
- docs/API.md
- docs/KPI_DEFINITIONS.md
- docs/DEVELOPMENT_PROGRESS.md
- docs/DECISIONS.md

Never mark untested functionality as completed. Never perform destructive database operations or production deployment without explicit approval.

## Repository references

Read [the v2 development plan](docs/Sinar_Fajar_Development_Plan_v2.md) alongside [the project context](docs/PROJECT_CONTEXT.md). Use the individual phase prompt when that phase is requested.

## graphify

- **graphify** (`~/.Codex/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
- When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.


## Phase 6 references

Use `docs/PRODUCTION_READINESS.md`, `docs/UAT.md`, `docs/DEPLOYMENT.md` and `docs/HANDOVER.md` to verify release gates and locate operating procedures.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
