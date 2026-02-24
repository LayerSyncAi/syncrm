/** Common IANA timezones grouped by region */
export const TIMEZONES = [
  { value: "Pacific/Midway", label: "(UTC-11:00) Midway Island" },
  { value: "Pacific/Honolulu", label: "(UTC-10:00) Hawaii" },
  { value: "America/Anchorage", label: "(UTC-09:00) Alaska" },
  { value: "America/Los_Angeles", label: "(UTC-08:00) Pacific Time (US)" },
  { value: "America/Denver", label: "(UTC-07:00) Mountain Time (US)" },
  { value: "America/Chicago", label: "(UTC-06:00) Central Time (US)" },
  { value: "America/New_York", label: "(UTC-05:00) Eastern Time (US)" },
  { value: "America/Caracas", label: "(UTC-04:30) Caracas" },
  { value: "America/Halifax", label: "(UTC-04:00) Atlantic Time (Canada)" },
  { value: "America/Sao_Paulo", label: "(UTC-03:00) Sao Paulo" },
  { value: "Atlantic/South_Georgia", label: "(UTC-02:00) Mid-Atlantic" },
  { value: "Atlantic/Azores", label: "(UTC-01:00) Azores" },
  { value: "UTC", label: "(UTC+00:00) UTC" },
  { value: "Europe/London", label: "(UTC+00:00) London" },
  { value: "Europe/Paris", label: "(UTC+01:00) Paris, Berlin" },
  { value: "Africa/Lagos", label: "(UTC+01:00) West Africa" },
  { value: "Africa/Cairo", label: "(UTC+02:00) Cairo" },
  { value: "Africa/Johannesburg", label: "(UTC+02:00) Johannesburg" },
  { value: "Africa/Harare", label: "(UTC+02:00) Harare" },
  { value: "Europe/Moscow", label: "(UTC+03:00) Moscow" },
  { value: "Africa/Nairobi", label: "(UTC+03:00) East Africa" },
  { value: "Asia/Dubai", label: "(UTC+04:00) Dubai" },
  { value: "Asia/Kabul", label: "(UTC+04:30) Kabul" },
  { value: "Asia/Karachi", label: "(UTC+05:00) Karachi" },
  { value: "Asia/Kolkata", label: "(UTC+05:30) Mumbai, Kolkata" },
  { value: "Asia/Kathmandu", label: "(UTC+05:45) Kathmandu" },
  { value: "Asia/Dhaka", label: "(UTC+06:00) Dhaka" },
  { value: "Asia/Bangkok", label: "(UTC+07:00) Bangkok" },
  { value: "Asia/Shanghai", label: "(UTC+08:00) Beijing, Shanghai" },
  { value: "Asia/Singapore", label: "(UTC+08:00) Singapore" },
  { value: "Asia/Tokyo", label: "(UTC+09:00) Tokyo" },
  { value: "Australia/Sydney", label: "(UTC+10:00) Sydney" },
  { value: "Pacific/Noumea", label: "(UTC+11:00) Noumea" },
  { value: "Pacific/Auckland", label: "(UTC+12:00) Auckland" },
] as const;

/** Try to detect the user's local IANA timezone from the browser */
export function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}
