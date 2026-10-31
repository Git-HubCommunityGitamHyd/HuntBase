HuntBase Frontend Reuse & Integration Report

Project: HuntBase
Database: Neon PostgreSQL (confirmed)

1. Architecture Decision

HuntBase is moving to Neon PostgreSQL. Existing Supabase references are legacy implementation details, not part of the new architecture.

Do not add new Supabase dependencies.
Frontend features must communicate with the new backend through agreed API endpoints.
Database access, authorization, and business rules must be enforced server-side.
Reuse existing UI components wherever practical. 2. Existing Frontend Areas to Reuse

Inspect the local working tree before making changes. Potentially reusable areas include:

Login and registration
Player hunt experience and clue display
QR scanning
Player progress
Admin event and clue management
Team management
QR-code management
Admin monitoring/dashboard layouts
Shared UI components and styling

This is a reuse shortlist, not a claim that every feature is complete.

3. Legacy Integration to Replace

Adapt existing code that relies on:

Direct Supabase queries in hunt, progress, and admin-monitoring pages.
Supabase configuration and database-specific types.
Authentication tied to the old database schema.
Client-side localStorage as the source of truth for identity or permissions.
Legacy tables, fields, and fallback logic.

Do not rewrite everything at once. Preserve the UI and migrate the integration gradually after the backend contracts are agreed.

4. API Contracts to Coordinate With Teammates

Agree on endpoint paths, request/response shapes, authentication requirements, and error formats for:

Login, registration, and current session/user
Available teams and team membership
Current hunt/clue and clue progression
QR scan submission and results
Hints, timers, and penalties
Player progress and leaderboard
Admin event, clue, team, and QR-code management
Admin monitoring and audit-related views

The frontend calls these APIs; the backend accesses Neon PostgreSQL. The frontend must not query Neon directly.

5. Authentication and Authorization
   The server is the source of truth for identity and permissions.
   UI checks are for usability, not security.
   Validate player IDs, team IDs, and roles server-side.
   Coordinate session behavior and roles with the authentication/RBAC teammate.
   Enforce organization and club data isolation on the server.
6. Recommended Work Sequence
   Preserve the existing UI and working interactions.
   Identify each page's data dependencies and legacy Supabase calls.
   Agree on API contracts with the backend teammates.
   Replace direct database calls with requests to the agreed backend APIs.
   Align loading, empty, success, and error states with API responses.
   Test login, player hunt, QR scanning, progress, and admin flows.
   Verify mobile scanner behavior and maintain Playwright smoke tests where feasible.
7. Integration Checklist
   Neon PostgreSQL is used by the new backend.
   No new Supabase-based implementation is introduced.
   Frontend/backend API contracts are agreed and documented.
   Browser pages do not query the database directly.
   Identity and permissions are verified server-side.
   Existing UI is reused where appropriate.
   Player and admin flows are tested against the new backend.
   Legacy Supabase code is removed when no longer needed, without discarding unrelated local work.
8. Scope and Limitations

This report is based on the previously inspected frontend and repository context. It does not verify every file in the current local working tree. Confirm file paths and behavior before editing, particularly where uncommitted changes exist.

Bottom line: Reuse the frontend, replace legacy Supabase integration, and connect through the new backend APIs backed by Neon PostgreSQL.
