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
import type * as authRepair from "../authRepair.js";
import type * as branding from "../branding.js";
import type * as commissionLib from "../commissionLib.js";
import type * as commissions from "../commissions.js";
import type * as contacts from "../contacts.js";
import type * as copilotChats from "../copilotChats.js";
import type * as crons from "../crons.js";
import type * as dev_access from "../dev/access.js";
import type * as dev_dashboard from "../dev/dashboard.js";
import type * as dev_inventory from "../dev/inventory.js";
import type * as dev_lib from "../dev/lib.js";
import type * as dev_migrations from "../dev/migrations.js";
import type * as dev_sales from "../dev/sales.js";
import type * as documents from "../documents.js";
import type * as email from "../email.js";
import type * as emailLayout from "../emailLayout.js";
import type * as finance_commissions from "../finance/commissions.js";
import type * as finance_core from "../finance/core.js";
import type * as finance_documents from "../finance/documents.js";
import type * as finance_emails from "../finance/emails.js";
import type * as finance_importer from "../finance/importer.js";
import type * as finance_invoices from "../finance/invoices.js";
import type * as finance_lib from "../finance/lib.js";
import type * as finance_migrations from "../finance/migrations.js";
import type * as finance_money from "../finance/money.js";
import type * as finance_payouts from "../finance/payouts.js";
import type * as finance_pdfMail from "../finance/pdfMail.js";
import type * as finance_posting from "../finance/posting.js";
import type * as finance_reports from "../finance/reports.js";
import type * as finance_settings from "../finance/settings.js";
import type * as finance_trust from "../finance/trust.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as hub from "../hub.js";
import type * as leadEditLib from "../leadEditLib.js";
import type * as leadExport from "../leadExport.js";
import type * as leadImport from "../leadImport.js";
import type * as leadMerge from "../leadMerge.js";
import type * as leadScoring from "../leadScoring.js";
import type * as leads from "../leads.js";
import type * as legal from "../legal.js";
import type * as lib_activityTypes from "../lib/activityTypes.js";
import type * as lib_areaSeed from "../lib/areaSeed.js";
import type * as lib_authReconcile from "../lib/authReconcile.js";
import type * as lib_calendar from "../lib/calendar.js";
import type * as lib_contactRoles from "../lib/contactRoles.js";
import type * as lib_leadSources from "../lib/leadSources.js";
import type * as lib_locations from "../lib/locations.js";
import type * as lib_moduleAccess from "../lib/moduleAccess.js";
import type * as lib_modules from "../lib/modules.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_secretBox from "../lib/secretBox.js";
import type * as locations from "../locations.js";
import type * as logs from "../logs.js";
import type * as marketing from "../marketing.js";
import type * as matches from "../matches.js";
import type * as migrations from "../migrations.js";
import type * as notifications from "../notifications.js";
import type * as notify_campaigns from "../notify/campaigns.js";
import type * as notify_lib from "../notify/lib.js";
import type * as notify_send from "../notify/send.js";
import type * as notify_settings from "../notify/settings.js";
import type * as organizations from "../organizations.js";
import type * as owners from "../owners.js";
import type * as passwordReset from "../passwordReset.js";
import type * as platform from "../platform.js";
import type * as platformLib from "../platformLib.js";
import type * as portal_access from "../portal/access.js";
import type * as portal_accounts from "../portal/accounts.js";
import type * as portal_context from "../portal/context.js";
import type * as portal_landlord from "../portal/landlord.js";
import type * as portal_tenant from "../portal/tenant.js";
import type * as properties from "../properties.js";
import type * as propertyAccessLib from "../propertyAccessLib.js";
import type * as propertyBook from "../propertyBook.js";
import type * as propertyBook_discovery from "../propertyBook/discovery.js";
import type * as propertyBook_parser from "../propertyBook/parser.js";
import type * as propertyBook_refresh from "../propertyBook/refresh.js";
import type * as propertyBook_scraper from "../propertyBook/scraper.js";
import type * as propertyShares from "../propertyShares.js";
import type * as push from "../push.js";
import type * as pushSender from "../pushSender.js";
import type * as rateLimit from "../rateLimit.js";
import type * as reportingLib from "../reportingLib.js";
import type * as reports from "../reports.js";
import type * as schemas_dev from "../schemas/dev.js";
import type * as schemas_finance from "../schemas/finance.js";
import type * as schemas_notify from "../schemas/notify.js";
import type * as schemas_stay from "../schemas/stay.js";
import type * as schemas_worth from "../schemas/worth.js";
import type * as search from "../search.js";
import type * as sms from "../sms.js";
import type * as stages from "../stages.js";
import type * as stay_access from "../stay/access.js";
import type * as stay_arrears from "../stay/arrears.js";
import type * as stay_dashboard from "../stay/dashboard.js";
import type * as stay_deposits from "../stay/deposits.js";
import type * as stay_documents from "../stay/documents.js";
import type * as stay_emails from "../stay/emails.js";
import type * as stay_expenses from "../stay/expenses.js";
import type * as stay_importer from "../stay/importer.js";
import type * as stay_inspections from "../stay/inspections.js";
import type * as stay_jobs from "../stay/jobs.js";
import type * as stay_leases from "../stay/leases.js";
import type * as stay_ledger from "../stay/ledger.js";
import type * as stay_maintenance from "../stay/maintenance.js";
import type * as stay_money from "../stay/money.js";
import type * as stay_payments from "../stay/payments.js";
import type * as stay_people from "../stay/people.js";
import type * as stay_properties from "../stay/properties.js";
import type * as stay_reports from "../stay/reports.js";
import type * as stay_settings from "../stay/settings.js";
import type * as stay_shared from "../stay/shared.js";
import type * as stay_statements from "../stay/statements.js";
import type * as stay_validators from "../stay/validators.js";
import type * as storage from "../storage.js";
import type * as syncmedia from "../syncmedia.js";
import type * as users from "../users.js";
import type * as viewingFormLib from "../viewingFormLib.js";
import type * as viewingForms from "../viewingForms.js";
import type * as worth_access from "../worth/access.js";
import type * as worth_alerts from "../worth/alerts.js";
import type * as worth_comparables from "../worth/comparables.js";
import type * as worth_dashboard from "../worth/dashboard.js";
import type * as worth_documents from "../worth/documents.js";
import type * as worth_emails from "../worth/emails.js";
import type * as worth_inspections from "../worth/inspections.js";
import type * as worth_jobs from "../worth/jobs.js";
import type * as worth_lib from "../worth/lib.js";
import type * as worth_reports from "../worth/reports.js";
import type * as worth_settings from "../worth/settings.js";
import type * as worth_valuation from "../worth/valuation.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activities: typeof activities;
  activityReminders: typeof activityReminders;
  auth: typeof auth;
  authRepair: typeof authRepair;
  branding: typeof branding;
  commissionLib: typeof commissionLib;
  commissions: typeof commissions;
  contacts: typeof contacts;
  copilotChats: typeof copilotChats;
  crons: typeof crons;
  "dev/access": typeof dev_access;
  "dev/dashboard": typeof dev_dashboard;
  "dev/inventory": typeof dev_inventory;
  "dev/lib": typeof dev_lib;
  "dev/migrations": typeof dev_migrations;
  "dev/sales": typeof dev_sales;
  documents: typeof documents;
  email: typeof email;
  emailLayout: typeof emailLayout;
  "finance/commissions": typeof finance_commissions;
  "finance/core": typeof finance_core;
  "finance/documents": typeof finance_documents;
  "finance/emails": typeof finance_emails;
  "finance/importer": typeof finance_importer;
  "finance/invoices": typeof finance_invoices;
  "finance/lib": typeof finance_lib;
  "finance/migrations": typeof finance_migrations;
  "finance/money": typeof finance_money;
  "finance/payouts": typeof finance_payouts;
  "finance/pdfMail": typeof finance_pdfMail;
  "finance/posting": typeof finance_posting;
  "finance/reports": typeof finance_reports;
  "finance/settings": typeof finance_settings;
  "finance/trust": typeof finance_trust;
  helpers: typeof helpers;
  http: typeof http;
  hub: typeof hub;
  leadEditLib: typeof leadEditLib;
  leadExport: typeof leadExport;
  leadImport: typeof leadImport;
  leadMerge: typeof leadMerge;
  leadScoring: typeof leadScoring;
  leads: typeof leads;
  legal: typeof legal;
  "lib/activityTypes": typeof lib_activityTypes;
  "lib/areaSeed": typeof lib_areaSeed;
  "lib/authReconcile": typeof lib_authReconcile;
  "lib/calendar": typeof lib_calendar;
  "lib/contactRoles": typeof lib_contactRoles;
  "lib/leadSources": typeof lib_leadSources;
  "lib/locations": typeof lib_locations;
  "lib/moduleAccess": typeof lib_moduleAccess;
  "lib/modules": typeof lib_modules;
  "lib/notify": typeof lib_notify;
  "lib/secretBox": typeof lib_secretBox;
  locations: typeof locations;
  logs: typeof logs;
  marketing: typeof marketing;
  matches: typeof matches;
  migrations: typeof migrations;
  notifications: typeof notifications;
  "notify/campaigns": typeof notify_campaigns;
  "notify/lib": typeof notify_lib;
  "notify/send": typeof notify_send;
  "notify/settings": typeof notify_settings;
  organizations: typeof organizations;
  owners: typeof owners;
  passwordReset: typeof passwordReset;
  platform: typeof platform;
  platformLib: typeof platformLib;
  "portal/access": typeof portal_access;
  "portal/accounts": typeof portal_accounts;
  "portal/context": typeof portal_context;
  "portal/landlord": typeof portal_landlord;
  "portal/tenant": typeof portal_tenant;
  properties: typeof properties;
  propertyAccessLib: typeof propertyAccessLib;
  propertyBook: typeof propertyBook;
  "propertyBook/discovery": typeof propertyBook_discovery;
  "propertyBook/parser": typeof propertyBook_parser;
  "propertyBook/refresh": typeof propertyBook_refresh;
  "propertyBook/scraper": typeof propertyBook_scraper;
  propertyShares: typeof propertyShares;
  push: typeof push;
  pushSender: typeof pushSender;
  rateLimit: typeof rateLimit;
  reportingLib: typeof reportingLib;
  reports: typeof reports;
  "schemas/dev": typeof schemas_dev;
  "schemas/finance": typeof schemas_finance;
  "schemas/notify": typeof schemas_notify;
  "schemas/stay": typeof schemas_stay;
  "schemas/worth": typeof schemas_worth;
  search: typeof search;
  sms: typeof sms;
  stages: typeof stages;
  "stay/access": typeof stay_access;
  "stay/arrears": typeof stay_arrears;
  "stay/dashboard": typeof stay_dashboard;
  "stay/deposits": typeof stay_deposits;
  "stay/documents": typeof stay_documents;
  "stay/emails": typeof stay_emails;
  "stay/expenses": typeof stay_expenses;
  "stay/importer": typeof stay_importer;
  "stay/inspections": typeof stay_inspections;
  "stay/jobs": typeof stay_jobs;
  "stay/leases": typeof stay_leases;
  "stay/ledger": typeof stay_ledger;
  "stay/maintenance": typeof stay_maintenance;
  "stay/money": typeof stay_money;
  "stay/payments": typeof stay_payments;
  "stay/people": typeof stay_people;
  "stay/properties": typeof stay_properties;
  "stay/reports": typeof stay_reports;
  "stay/settings": typeof stay_settings;
  "stay/shared": typeof stay_shared;
  "stay/statements": typeof stay_statements;
  "stay/validators": typeof stay_validators;
  storage: typeof storage;
  syncmedia: typeof syncmedia;
  users: typeof users;
  viewingFormLib: typeof viewingFormLib;
  viewingForms: typeof viewingForms;
  "worth/access": typeof worth_access;
  "worth/alerts": typeof worth_alerts;
  "worth/comparables": typeof worth_comparables;
  "worth/dashboard": typeof worth_dashboard;
  "worth/documents": typeof worth_documents;
  "worth/emails": typeof worth_emails;
  "worth/inspections": typeof worth_inspections;
  "worth/jobs": typeof worth_jobs;
  "worth/lib": typeof worth_lib;
  "worth/reports": typeof worth_reports;
  "worth/settings": typeof worth_settings;
  "worth/valuation": typeof worth_valuation;
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
