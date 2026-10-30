/**
 * A lead's temperature from its score, shared by the website and the phone
 * app. Same bands as the leads score filter: hot 70+, warm 40 to 69, cold below.
 */
export type Temperature = "hot" | "warm" | "cold";

export function temperatureOf(score: number | null | undefined): Temperature | null {
  if (score === null || score === undefined) return null;
  return score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
}

export const TEMPERATURE_LABELS: Record<Temperature, string> = { hot: "Hot", warm: "Warm", cold: "Cold" };
