# HuntBase Supabase Storage & Dependency Audit Report

**Date:** 2026-10-31  
**Branch:** `staging-build-v1`  
**Prepared by:** HuntBase Migration Team

---

## Executive Summary

This audit identifies **all remaining Supabase dependencies** in the HuntBase codebase, documents the current upload contract, and provides a migration plan for replacing Supabase Storage with a modern alternative. The audit was performed on the `staging-build-v1` branch without modifying any files.

**Key Finding:** Only **one active Supabase Storage operation** remains in the codebase (`src/app/api/admin/upload-asset/route.ts`). Two Supabase client utilities exist but are only used by this single upload endpoint. All database operations have been migrated to Drizzle ORM with Neon PostgreSQL.

---

## 1. All Remaining Supabase References

### 1.1 Supabase Storage Operations

| File | Operation | Purpose |
|------|-----------|---------|
| `src/app/api/admin/upload-asset/route.ts` | `supabase.storage.from('organization-assets').upload()` | Upload club logo/banner images |
| `src/app/api/admin/upload-asset/route.ts` | `supabase.storage.from('organization-assets').getPublicUrl()` | Generate public CDN URLs for uploaded assets |

### 1.2 Supabase Client Utilities (Used only by upload endpoint)

| File | Exports | Usage |
|------|---------|-------|
| `src/lib/supabase/server.ts` | `createClient()` (anon), `createAdminClient()` (service_role) | `createAdminClient()` used by upload endpoint for storage + DB updates |
| `src/lib/supabase/client.ts` | `createClient()` (browser SSR client) | Not used anywhere in current codebase (legacy) |

### 1.3 Supabase Database Operations (in upload endpoint)

| File | Operation | Purpose |
|------|-----------|---------|
| `src/app/api/admin/upload-asset/route.ts` | `supabase.from('organizations').update({ logo_url })` | Update organization logo URL |
| `src/app/api/admin/upload-asset/route.ts` | `supabase.from('organizations').update({ banner_url })` | Update organization banner URL |
| `src/app/api/admin/upload-asset/route.ts` | `supabase.from('theme_configs').update({ banner_url })` | Sync banner to theme config |

### 1.4 Environment Variables Referenced

```env
# Required by Supabase clients
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## 2. Current Upload Contract

### 2.1 API Endpoint
- **Route:** `POST /api/admin/upload-asset`
- **Authentication:** Admin session required (`super_admin` or `club_admin`)
- **Authorization:** `club_admin` can only upload to their own organization

### 2.2 Request Format (multipart/form-data)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | Image file (PNG, JPEG, WebP) |
| `organization_id` | string (UUID) | Yes | Target organization |
| `asset_type` | string | No (default: "logo") | `"logo"` or `"banner"` |

### 2.3 Validation Rules
- **File size:** ≤ 5 MB
- **MIME types:** `image/png`, `image/jpeg`, `image/jpg`, `image/webp`
- **Signature verification:** Magic bytes checked against declared MIME type
- **SVG explicitly rejected** despite bucket config allowing it

### 2.4 Storage Path Convention
```
organization-assets/
  └── {organization_id}/
        └── {asset_type}_{timestamp}.{ext}
```
Example: `organization-assets/a0000000-0000-0000-0000-000000000001/logo_1700000000000.png`

### 2.5 Response Format
```json
{
  "success": true,
  "message": "logo uploaded successfully",
  "publicUrl": "https://<project-ref>.supabase.co/storage/v1/object/public/organization-assets/..."
}
```

### 2.6 Side Effects
1. **Upsert** to Supabase Storage bucket `organization-assets` (public bucket)
2. **Update** `organizations.logo_url` or `organizations.banner_url`
3. **Update** `theme_configs.banner_url` (for banner type)

---

## 3. Asset Categories & Frontend Dependencies

### 3.1 Database Schema Fields
| Table | Column | Type | Used By |
|-------|--------|------|---------|
| `organizations` | `logo_url` | TEXT | Admin dashboard, theme system |
| `organizations` | `banner_url` | TEXT | Admin dashboard, theme system |
| `theme_configs` | `banner_url` | TEXT | Theme engine (syncs with organizations) |

### 3.2 Frontend Usage (Scanned)
- **No frontend components currently render `logo_url` or `banner_url`** — these are stored but not displayed
- Admin dashboard pages (`events`, `qr-codes`, `teams`) have no asset upload UI
- Theme system reads from `theme_configs` but no logo/banner rendering found

### 3.3 Asset Types Supported
| Type | Purpose | Storage Path | DB Fields Updated |
|------|---------|--------------|-------------------|
| `logo` | Club/organization logo | `/{org_id}/logo_{ts}.{ext}` | `organizations.logo_url` |
| `banner` | Event/club banner image | `/{org_id}/banner_{ts}.{ext}` | `organizations.banner_url`, `theme_configs.banner_url` |

**Note:** No clue images, QR code images, or other asset categories use Supabase Storage.

---

## 4. Replacement Provider Recommendation

### 4.1 Requirements Matrix

| Requirement | Current | Priority |
|-------------|---------|----------|
| Public CDN URLs | ✅ Supabase Storage | Must have |
| 5 MB file limit | ✅ Enforced | Must have |
| MIME type validation | ✅ Server-side | Must have |
| Organization isolation (path prefix) | ✅ Path-based | Must have |
| S3-compatible API | ❌ | Nice to have |
| Cost-effective for low volume | ~$0 (included) | High |
| Custom domain/CDN | ❌ | Nice to have |
| No vendor lock-in | ❌ | High |

### 4.2 Provider Comparison

| Feature | **Cloudflare R2** | **Cloudinary** | **Vercel Blob** | **AWS S3 + CloudFront** |
|---------|-------------------|----------------|-----------------|------------------------|
| **S3-Compatible** | ✅ Yes | ❌ No | ❌ No | ✅ Yes |
| **Free Tier** | 10 GB/month | 25 GB bandwidth | 1 GB/month | 5 GB (12 mo) |
| **Cost at Scale** | $0.015/GB | $89+/mo | $0.15/GB | $0.023/GB + CF |
| **Image Transform** | ❌ (Workers) | ✅ Native | ❌ | ❌ (Lambda@Edge) |
| **Custom Domain** | ✅ Free | ✅ Paid plans | ✅ | ✅ |
| **Upload Auth** | Presigned URLs | Signed URLs | Server-only | Presigned URLs |
| **Migration Effort** | Low (S3 SDK) | Medium (SDK) | Low | Medium |
| **Vendor Lock-in** | Low (S3 API) | High | Medium | Low |

### 4.3 Recommendation: **Cloudflare R2**

**Rationale:**
1. **S3-compatible API** — Drop-in replacement using `@aws-sdk/client-s3`, minimal code changes
2. **Cost-effective** — 10 GB/month free, then $0.015/GB (cheapest for image storage)
3. **Zero egress fees** — Unlike AWS S3 + CloudFront
4. **Custom domains free** — Can serve from `assets.huntbase.org` 
5. **No vendor lock-in** — Standard S3 API, portable to any S3 provider
6. **Edge caching** — Cloudflare's global network provides fast delivery
7. **Workers integration** — Can add image transformations later if needed

**Alternative:** Vercel Blob if already on Vercel and want zero-config, but higher cost and vendor lock-in.

---

## 5. Files Requiring Modification

### 5.1 Core Migration Files
| File | Changes Needed |
|------|----------------|
| `src/app/api/admin/upload-asset/route.ts` | Replace Supabase Storage upload with R2 presigned URL or direct upload; replace DB updates with Drizzle ORM |
| `src/lib/supabase/server.ts` | **Delete** after migration (no other consumers) |
| `src/lib/supabase/client.ts` | **Delete** (already unused) |

### 5.2 Configuration Files
| File | Changes Needed |
|------|----------------|
| `.env.template` | Remove `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; add `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` |
| `package.json` | Remove `@supabase/ssr`, `@supabase/supabase-js`; add `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` |

### 5.3 Database (Drizzle) — Already Ready
- `src/db/schema.ts` — `organizations.logo_url`, `organizations.banner_url`, `theme_configs.banner_url` already defined
- No schema changes needed

### 5.4 Documentation
| File | Changes Needed |
|------|----------------|
| `README.md` | Update tech stack table (remove Supabase Storage) |
| `supabase/SETUP_GUIDE.md` | Mark storage section as deprecated |

---

## 6. Migration & Asset URL Compatibility Risks

### 6.1 Existing Asset URLs
- **Format:** `https://<project-ref>.supabase.co/storage/v1/object/public/organization-assets/{org_id}/{asset}_{ts}.{ext}`
- **Risk:** All existing uploaded assets will return 404 after Supabase project deletion or bucket removal
- **Mitigation:** 
  1. **Migrate existing assets** — Script to download from Supabase and re-upload to R2 with same paths
  2. **URL rewriting** — Edge middleware to rewrite old Supabase URLs to new R2 URLs
  3. **Dual-write period** — Write to both during transition (not recommended due to cost)

### 6.2 Organization Isolation
- **Current:** Path prefix `{org_id}/` in bucket + server-side org check
- **R2 Approach:** Same path prefix + presigned URLs scoped to prefix, or separate bucket per org (not needed at scale)

### 6.3 Public Access
- **Current:** Bucket is `public: true` — anyone with URL can access
- **R2:** Bucket can be public or use signed URLs with short TTL for uploads

### 6.4 SVG Support
- **Current bucket config:** Allows `image/svg+xml`
- **Current server validation:** Rejects SVG (only raster formats)
- **Decision:** Keep rejecting SVG for security (XSS risk), or add SVG sanitization if needed

---

## 7. Required Environment Variables (New)

```env
# Cloudflare R2 Configuration
R2_ACCOUNT_ID=                     # Cloudflare account ID (from R2 dashboard)
R2_ACCESS_KEY_ID=                  # R2 API token access key
R2_SECRET_ACCESS_KEY=              # R2 API token secret
R2_BUCKET_NAME=organization-assets # Bucket name (match existing for path compatibility)
R2_PUBLIC_URL=https://assets.huntbase.org  # Custom domain or https://<account>.r2.cloudflarestorage.com

# Remove these after migration:
# NEXT_PUBLIC_SUPABASE_URL=
# NEXT_PUBLIC_SUPABASE_ANON_KEY=
# SUPABASE_SERVICE_ROLE_KEY=
```

**Security Note:** Never commit actual values. Use `.env.local` for development, platform secrets for production.

---

## 8. Additional Supabase Dependencies Found

### 8.1 Supabase Realtime (Database-level, not code)
- **Tables in publication:** `events`, `scans`, `fake_qr_scans`
- **Purpose:** Live leaderboard / monitor dashboard updates
- **Status:** **Active dependency** — requires Supabase project or replacement with:
  - **Option A:** Keep Supabase only for Realtime (minimal cost)
  - **Option B:** Migrate to Pusher / Ably / Socket.io / PartyKit
  - **Option C:** Use Drizzle + polling (already implemented as fallback)

### 8.2 Supabase Auth (Not Used)
- **No Supabase Auth integration** — HuntBase uses custom HMAC session cookies
- **No `supabase.auth` calls** anywhere in codebase

### 8.3 Supabase Edge Functions (Not Used)
- No Edge Functions referenced

---

## 9. Migration Implementation Plan

### Phase 1: Preparation (No Code Changes)
1. Create Cloudflare R2 bucket `organization-assets`
2. Configure custom domain `assets.huntbase.org` → R2 bucket
3. Generate R2 API token with `Object Read & Write` permissions
4. Add environment variables to Vercel/hosting platform

### Phase 2: Upload Endpoint Migration
1. Add `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to dependencies
2. Create `src/lib/storage/r2.ts` with:
   - `getUploadUrl(key, contentType)` — returns presigned PUT URL
   - `getPublicUrl(key)` — constructs public CDN URL
   - `deleteObject(key)` — for cleanup
3. Rewrite `src/app/api/admin/upload-asset/route.ts`:
   - Validate file (same logic)
   - Generate presigned URL for direct browser-to-R2 upload **OR** server-side upload via SDK
   - Update DB via Drizzle ORM (replace Supabase DB calls)
   - Return new R2 public URL

### Phase 3: Cleanup
1. Delete `src/lib/supabase/server.ts` and `src/lib/supabase/client.ts`
2. Remove Supabase packages from `package.json`
3. Run `npm install` and verify build/tests pass
4. Update documentation

### Phase 4: Asset Migration (Optional)
1. One-time script to copy existing Supabase assets to R2 preserving paths
2. Verify all `logo_url`/`banner_url` in DB resolve correctly

---

## 10. Conclusion

| Aspect | Status |
|--------|--------|
| **Supabase Storage operations** | 1 endpoint (`upload-asset`) |
| **Supabase DB operations in upload** | 3 UPDATE calls (replaceable with Drizzle) |
| **Supabase client files** | 2 files (both deletable after migration) |
| **Frontend dependencies on asset URLs** | None currently rendering |
| **Realtime dependency** | Separate concern (database-level) |
| **Recommended replacement** | **Cloudflare R2** (S3-compatible, cost-effective, no lock-in) |
| **Breaking changes risk** | Low — only admin upload flow affected |
| **Existing asset migration** | Required if preserving uploaded logos/banners |

**Next Steps:** Await provider selection approval before implementation. No code changes made during this audit.