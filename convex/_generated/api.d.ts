/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activities from "../activities.js";
import type * as activityReminders from "../activityReminders.js";
import type * as auth from "../auth.js";
import type * as commissions from "../commissions.js";
import type * as contacts from "../contacts.js";
import type * as crons from "../crons.js";
import type * as documents from "../documents.js";
import type * as email from "../email.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as leadExport from "../leadExport.js";
import type * as leadImport from "../leadImport.js";
import type * as leadMerge from "../leadMerge.js";
import type * as leadScoring from "../leadScoring.js";
import type * as leads from "../leads.js";
import type * as locations from "../locations.js";
import type * as matches from "../matches.js";
import type * as organizations from "../organizations.js";
import type * as passwordReset from "../passwordReset.js";
import type * as properties from "../properties.js";
import type * as propertyShares from "../propertyShares.js";
import type * as stages from "../stages.js";
import type * as storage from "../storage.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activities: typeof activities;
  activityReminders: typeof activityReminders;
  auth: typeof auth;
  commissions: typeof commissions;
  contacts: typeof contacts;
  crons: typeof crons;
  documents: typeof documents;
  email: typeof email;
  helpers: typeof helpers;
  http: typeof http;
  leadExport: typeof leadExport;
  leadImport: typeof leadImport;
  leadMerge: typeof leadMerge;
  leadScoring: typeof leadScoring;
  leads: typeof leads;
  locations: typeof locations;
  matches: typeof matches;
  organizations: typeof organizations;
  passwordReset: typeof passwordReset;
  properties: typeof properties;
  propertyShares: typeof propertyShares;
  stages: typeof stages;
  storage: typeof storage;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
