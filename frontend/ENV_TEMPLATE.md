# Frontend Environment Variables

These environment variables need to be set in Vercel's project settings or in a local `.env.local` file.

## Required Variables

### Clerk Authentication

Get these from your [Clerk Dashboard](https://dashboard.clerk.com) -> API Keys:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
CLERK_SECRET_KEY=your_clerk_secret_key_here
```

### Backend API URL

```bash
# Local development
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001

# Production (your deployed backend URL)
# NEXT_PUBLIC_API_BASE_URL=https://api.gradebuddy.yourdomain.com
```

## Example Complete .env.local

```bash
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
CLERK_SECRET_KEY=your_clerk_secret_key_here

# Backend API
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001
```

## Vercel Configuration

When deploying to Vercel, add these environment variables in:
**Project Settings → Environment Variables**

| Variable | Value | Environment |
|----------|-------|-------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_xxx` | Production |
| `CLERK_SECRET_KEY` | `sk_live_xxx` | Production |
| `NEXT_PUBLIC_API_BASE_URL` | `https://api.gradebuddy.com` | Production |

### Clerk Redirect URLs

In your Clerk Dashboard, add these to **Allowed redirect URLs**:

**Development:**
- `http://localhost:3000`
- `http://localhost:3001`

**Production:**
- `https://your-app.vercel.app`
- `https://gradebuddy.yourdomain.com`

## Notes

- `NEXT_PUBLIC_` prefix makes variables available in the browser
- `CLERK_SECRET_KEY` is server-side only (no `NEXT_PUBLIC_` prefix)
- Remember to update Clerk's allowed origins when you get your Vercel URL
