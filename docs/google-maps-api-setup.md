# Google Maps API Setup Guide

This guide covers how to set up, configure, and manage the Google Maps API key used for the **Location Typeahead Search** feature in the Properties module.

---

## What It Does

The location field on the property form uses the Google Places API to provide real-time location suggestions as agents type. Without a valid API key, the field falls back to a plain text input (no autocomplete suggestions).

---

## Initial Setup

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project selector at the top and select **New Project**
3. Give it a name (e.g., "SyncRM") and click **Create**
4. Make sure the new project is selected

### 2. Enable Required APIs

You need to enable **three** APIs:

1. Go to [APIs & Services > Library](https://console.cloud.google.com/apis/library)
2. Search for and enable each of the following:
   - **Maps JavaScript API** — loads the Google Maps scripts in the browser
   - **Places API** — the legacy Places backend used by the autocomplete service
   - **Places API (New)** — the newer Places backend (recommended to enable for future compatibility)

> **Important:** The autocomplete feature uses the Maps JavaScript API's built-in Places library, which calls the legacy **Places API** backend. Enabling only "Places API (New)" will not work — you must enable the original **Places API** as well.

### 3. Create an API Key

1. Go to [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **+ Create Credentials** > **API Key**
3. Copy the generated key

### 4. Add the Key to Your Environment

**Local development** — add to `.env.local`:
```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_api_key_here
```

**Vercel (production)** — add in the Vercel dashboard:
1. Go to your project > **Settings** > **Environment Variables**
2. Add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` with your key as the value
3. Vercel will warn that `NEXT_PUBLIC_` keys are exposed to the browser — this is expected and safe for Google Maps API keys (see [Security Notes](#security-notes) below)
4. Redeploy for the change to take effect

### 5. Restart / Redeploy

- **Local:** Restart the dev server (`npm run dev`)
- **Vercel:** Trigger a new deployment

---

## Configuring API Key Restrictions

Restrictions control where and how your API key can be used. This is the primary security mechanism for browser-exposed keys.

### Application Restrictions (Recommended)

This limits which websites can use your key:

1. Go to [Credentials](https://console.cloud.google.com/apis/credentials)
2. Click on your API key
3. Under **Application restrictions**, select **Websites**
4. Click **Add** and enter your allowed domains:
   - `https://yourdomain.com/*` (your production domain)
   - `https://*.vercel.app/*` (Vercel preview deployments)
   - `http://localhost:3000/*` (local development)
5. Click **Save**

### API Restrictions

This limits which Google APIs the key can call:

1. On the same key settings page, under **API restrictions**, select **Restrict key**
2. From the dropdown, select these three APIs:
   - **Maps JavaScript API**
   - **Places API**
   - **Places API (New)**
3. Click **Save**

> **Note:** Changes to restrictions can take up to 5 minutes to propagate. If you see errors immediately after making changes, wait and try again.

---

## Changing the API Key

If you need to rotate or replace the API key:

1. **Create a new key** in [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials)
2. Apply the same restrictions as above (Application + API restrictions)
3. **Update the environment variable:**
   - **Local:** Update `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `.env.local`
   - **Vercel:** Update the variable in project Settings > Environment Variables
4. **Restart / redeploy** the application
5. **Delete the old key** in Google Cloud Console once the new key is confirmed working

---

## Troubleshooting

### "ApiTargetBlockedMapError"

**Cause:** The API key restrictions don't include all required APIs.

**Fix:** Go to your API key settings and ensure all three APIs are selected:
- Maps JavaScript API
- Places API
- Places API (New)

Wait 5 minutes after saving, then hard-refresh your browser.

### "RefererNotAllowedMapError"

**Cause:** Your website domain is not in the allowed referrers list.

**Fix:** Go to your API key settings > Application restrictions > Websites, and add your domain (e.g., `https://yourdomain.com/*`). Don't forget `http://localhost:3000/*` for local development.

### "InvalidKeyMapError"

**Cause:** The API key is invalid, deleted, or not from the correct project.

**Fix:** Verify the key exists in your [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials) and that it matches the value in your environment variable. Generate a new key if needed.

### No Autocomplete Suggestions (No Error)

**Cause:** The `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` environment variable is not set or empty.

**Fix:** Add the key to `.env.local` (local) or Vercel environment variables (production) and restart/redeploy. The location field shows a hint ("Tip: Add a Google Maps API key for location suggestions") when no key is configured.

### Changes Take Time to Apply

API restriction changes can take **up to 5 minutes** to propagate across Google's infrastructure. If you just made changes:
1. Wait 5 minutes
2. Hard-refresh your browser (Cmd+Shift+R / Ctrl+Shift+R)
3. Restart the dev server if running locally

---

## Security Notes

- `NEXT_PUBLIC_` environment variables are intentionally exposed to the browser — this is how Next.js handles client-side configuration
- Google Maps API keys are **designed** to be used in browser-side code. Every website using Google Maps exposes their key
- Security comes from **restrictions**, not from hiding the key:
  - **Application restrictions** ensure the key only works from your domain
  - **API restrictions** ensure the key can only call the APIs you specify
- Set up [billing alerts](https://console.cloud.google.com/billing) in Google Cloud to monitor usage and avoid unexpected charges
- Google provides a generous [free tier](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing) for the Places API ($200/month credit covers ~10,000+ autocomplete sessions)

---

## Billing & Usage

- The Places Autocomplete API is billed per **session** (a session starts when the user begins typing and ends when they select a result)
- Google provides **$200/month** in free Maps Platform credits, which covers approximately 10,000–12,500 autocomplete sessions
- Monitor usage at [Google Cloud > APIs & Services > Dashboard](https://console.cloud.google.com/apis/dashboard)
- Set a **budget alert** at [Billing > Budgets & alerts](https://console.cloud.google.com/billing/budgets) to get notified before exceeding the free tier
