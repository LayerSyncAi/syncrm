"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import * as cheerio from "cheerio";
import {
  capString,
  extractRefCodeFromUrl,
  listingTypeFromUrl,
  mapPbType,
  parseArea,
  parseIntSafe,
  parsePrice,
  PropertyType,
  ListingType,
  uniqueStrings,
} from "./parser";

const PB_BASE = "https://www.propertybook.co.zw";
const USER_AGENT = "SyncRM-Importer/1.0 (+https://syncrm.app)";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_DESCRIPTION_LEN = 8000;
const MAX_IMAGES_PER_LISTING = 10;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const AGENCY_PAGE_DELAY_MS = 500;
const LISTING_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(url: string, attempt = 0): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`not_found:${url}`);
      }
      if (res.status >= 500 && attempt === 0) {
        await sleep(1500);
        return fetchHtml(url, attempt + 1);
      }
      throw new Error(`http_${res.status}:${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export type ParsedAgency = {
  slug: string;
  name: string;
  logoUrl?: string;
  forSaleCount?: number;
  forRentCount?: number;
};

export type ParsedListing = {
  pbRefCode: string;
  pbSourceUrl: string;
  pbAgencySlug: string;
  title: string;
  listingType: ListingType;
  propertyType: PropertyType;
  price: number;
  currency: string;
  location: string;
  area: number;
  bedrooms?: number;
  bathrooms?: number;
  description: string;
  imageUrls: string[];
  status: "available";
};

function parseAgencyIndexPage(html: string): ParsedAgency[] {
  const $ = cheerio.load(html);
  const out: ParsedAgency[] = [];
  $("div.propertyListings > div.listingItem").each((_, el) => {
    const $el = $(el);
    const href = $el.find("a.btn-agency").attr("href") || "";
    const slug = href.split("/listed-agencies/")[1]?.replace(/\/+$/, "");
    if (!slug) return;
    const name =
      $el.find("div.agencyName.agencyList").text().trim() ||
      $el.find("img.agencyLogo").attr("alt") ||
      slug;
    const logoUrl = $el.find("img.agencyLogo").attr("src") || undefined;
    const rentalText = $el.find("a.btn-outline-info").text();
    const salesText = $el.find("a.btn-outline-success").text();
    const forRentCount = parseIntSafe(rentalText);
    const forSaleCount = parseIntSafe(salesText);
    out.push({ slug, name, logoUrl, forSaleCount, forRentCount });
  });
  return out;
}

function parseSitemapAgencies(xml: string): ParsedAgency[] {
  const out: ParsedAgency[] = [];
  const seen = new Set<string>();
  const re = /<loc>\s*([^<]+?\/listed-agencies\/[^<\s/]+?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const url = m[1];
    const slug = url.split("/listed-agencies/")[1]?.replace(/\/+$/, "");
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const name = slug
      .split("-")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ");
    out.push({ slug, name });
  }
  return out;
}

function parseListingLinks(html: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];
  $('a[href*="/listings/for-sale/"], a[href*="/listings/to-rent/"]').each(
    (_, el) => {
      const href = $(el).attr("href");
      if (href) links.push(href);
    }
  );
  return uniqueStrings(links);
}

function parseFeatures($: cheerio.CheerioAPI): Record<string, string> {
  const features: Record<string, string> = {};
  $("div.property-features .col-12.feature").each((_, el) => {
    const $el = $(el);
    const value = $el.find("span.value").first().text().trim();
    const label = $el
      .find("span")
      .filter((__, s) => !$(s).hasClass("value"))
      .first()
      .text()
      .trim();
    if (label) {
      features[label.toLowerCase()] = value || "yes";
    }
  });
  return features;
}

function extractInlineJsField(html: string, field: string): string | null {
  const re = new RegExp(`${field}\\s*:\\s*(?:"([^"]*)"|'([^']*)'|(-?\\d+(?:\\.\\d+)?))`, "i");
  const m = re.exec(html);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? null;
}

function parseListingDetail(html: string, url: string): ParsedListing {
  const $ = cheerio.load(html);
  const listingType = listingTypeFromUrl(url);
  if (!listingType) {
    throw new Error(`unknown_listing_type:${url}`);
  }
  const pbRefCode =
    $("span.ref-code").first().text().trim().toUpperCase() ||
    extractRefCodeFromUrl(url) ||
    "";
  if (!pbRefCode) {
    throw new Error(`missing_ref_code:${url}`);
  }

  const title = $("h1.property-header").first().text().trim() || pbRefCode;
  const priceRaw = $("h4.propertyPrice").first().text().trim();
  const parsedPrice =
    parsePrice(priceRaw) ||
    (() => {
      const inlinePrice = extractInlineJsField(html, "price");
      const inlineCurrency = extractInlineJsField(html, "currency") || "USD";
      if (inlinePrice) {
        const n = Number(inlinePrice);
        if (Number.isFinite(n) && n > 0) return { currency: inlineCurrency, price: n };
      }
      return null;
    })();
  if (!parsedPrice) {
    throw new Error(`missing_price:${url}`);
  }

  const locationParts: string[] = [];
  $("div.propertyTitle > span").each((_, el) => {
    const txt = $(el).text().trim();
    if (txt) locationParts.push(txt);
  });
  const location = uniqueStrings(locationParts).join(", ") || "Unknown";

  const features = parseFeatures($);
  const bedrooms =
    parseIntSafe(features["bedrooms"]) ??
    parseIntSafe(extractInlineJsField(html, "bedrooms") || undefined);
  const bathrooms =
    parseIntSafe(features["bathrooms"]) ??
    parseIntSafe(extractInlineJsField(html, "bathrooms") || undefined);
  const landSize = extractInlineJsField(html, "land_size") || undefined;
  const area = parseArea(landSize ?? undefined, features);

  const description = capString(
    $("div.propertyDescription").text().replace(/\s+\n/g, "\n").trim(),
    MAX_DESCRIPTION_LEN
  );

  const imageUrls: string[] = [];
  $("ul#propertySlideShowMobile li").each((_, el) => {
    const $el = $(el);
    const src = $el.find("img").attr("src") || $el.attr("data-thumb");
    if (src && /^https?:\/\//i.test(src)) imageUrls.push(src);
  });
  const dedupedImages = uniqueStrings(imageUrls).slice(0, MAX_IMAGES_PER_LISTING);

  const pbAgencySlug = (() => {
    const hint = extractInlineJsField(html, "agency_slug");
    if (hint) return hint;
    const href = $('a[href*="/listed-agencies/"]').attr("href") || "";
    return href.split("/listed-agencies/")[1]?.replace(/\/+$/, "") || "";
  })();

  const propertyType = mapPbType(title, extractInlineJsField(html, "type_id") || undefined);

  return {
    pbRefCode,
    pbSourceUrl: url,
    pbAgencySlug,
    title,
    listingType,
    propertyType,
    price: parsedPrice.price,
    currency: parsedPrice.currency,
    location,
    area,
    bedrooms,
    bathrooms,
    description,
    imageUrls: dedupedImages,
    status: "available",
  };
}

export const listAgencies = internalAction({
  args: { query: v.optional(v.string()) },
  handler: async (_ctx, { query }): Promise<ParsedAgency[]> => {
    let agencies: ParsedAgency[] = [];
    try {
      const xml = await fetchHtml(`${PB_BASE}/sitemap_others.xml`);
      agencies = parseSitemapAgencies(xml);
    } catch {
      const html = await fetchHtml(`${PB_BASE}/listed-agencies`);
      agencies = parseAgencyIndexPage(html);
    }

    if (agencies.length === 0) {
      const html = await fetchHtml(`${PB_BASE}/listed-agencies`);
      agencies = parseAgencyIndexPage(html);
    }

    const needle = (query || "").trim().toLowerCase();
    const filtered = needle
      ? agencies.filter(
          (a) =>
            a.name.toLowerCase().includes(needle) ||
            a.slug.toLowerCase().includes(needle)
        )
      : agencies;

    if (filtered.length <= 60) {
      try {
        const html = await fetchHtml(`${PB_BASE}/listed-agencies`);
        const enriched = parseAgencyIndexPage(html);
        const byslug = new Map(enriched.map((a) => [a.slug, a]));
        return filtered.map((a) => ({ ...a, ...(byslug.get(a.slug) || {}) }));
      } catch {
        return filtered;
      }
    }

    return filtered.slice(0, 200);
  },
});

export const fetchAgencyListings = internalAction({
  args: {
    slug: v.string(),
    maxListings: v.optional(v.number()),
  },
  handler: async (
    _ctx,
    { slug, maxListings }
  ): Promise<{
    agency: { slug: string; name: string };
    listings: ParsedListing[];
    errors: Array<{ url: string; message: string }>;
  }> => {
    const cap = Math.max(1, Math.min(100, maxListings ?? 50));
    const errors: Array<{ url: string; message: string }> = [];
    const collected: string[] = [];

    for (let page = 1; page <= 15; page++) {
      const url = `${PB_BASE}/listed-agencies/${slug}${page === 1 ? "" : `?page=${page}`}`;
      let html: string;
      try {
        html = await fetchHtml(url);
      } catch (e: unknown) {
        errors.push({ url, message: (e as Error).message });
        break;
      }
      const links = parseListingLinks(html);
      let added = 0;
      for (const l of links) {
        if (collected.includes(l)) continue;
        collected.push(l);
        added++;
        if (collected.length >= cap) break;
      }
      if (collected.length >= cap) break;
      if (added === 0) break;
      await sleep(AGENCY_PAGE_DELAY_MS);
    }

    const $root = cheerio.load(
      await safeFetchOrEmpty(`${PB_BASE}/listed-agencies/${slug}`)
    );
    const agencyName =
      $root("h1").first().text().trim() ||
      slug
        .split("-")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" ");

    const listings: ParsedListing[] = [];
    for (const url of collected.slice(0, cap)) {
      try {
        const html = await fetchHtml(url);
        const parsed = parseListingDetail(html, url);
        if (!parsed.pbAgencySlug) parsed.pbAgencySlug = slug;
        listings.push(parsed);
      } catch (e: unknown) {
        const msg = (e as Error).message || "unknown";
        errors.push({ url, message: msg });
      }
      await sleep(LISTING_DELAY_MS);
    }

    return { agency: { slug, name: agencyName }, listings, errors };
  },
});

async function safeFetchOrEmpty(url: string): Promise<string> {
  try {
    return await fetchHtml(url);
  } catch {
    return "";
  }
}

export const fetchListingByUrl = internalAction({
  args: { url: v.string() },
  handler: async (_ctx, { url }): Promise<ParsedListing> => {
    const html = await fetchHtml(url);
    return parseListingDetail(html, url);
  },
});

export const downloadImage = internalAction({
  args: { url: v.string() },
  handler: async (ctx, { url }): Promise<string> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "image/*,*/*;q=0.8",
          Referer: PB_BASE + "/",
        },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`image_http_${res.status}:${url}`);
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.toLowerCase().startsWith("image/")) {
        throw new Error(`image_bad_type:${contentType}:${url}`);
      }
      const contentLength = Number(res.headers.get("content-length") || 0);
      if (contentLength && contentLength > MAX_IMAGE_BYTES) {
        throw new Error(`image_too_large:${contentLength}:${url}`);
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_IMAGE_BYTES) {
        throw new Error(`image_too_large:${buf.byteLength}:${url}`);
      }
      const blob = new Blob([buf], { type: contentType });
      const storageId = await ctx.storage.store(blob);
      return storageId;
    } finally {
      clearTimeout(timer);
    }
  },
});
