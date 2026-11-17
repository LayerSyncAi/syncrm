"use client";

import { motion } from "framer-motion";
import { useReducedMotion } from "./motion";
import { ThemedPhoneStage } from "./phone/phone-stage";

export function HeroPhoto() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={reduce ? { duration: 0.2, scale: { duration: 0 } } : { duration: 1.4, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
      // Landscape phones and small tablets: never taller than the screen.
      className="l-stage l-stage-panel l-fade-edges relative overflow-hidden sm:rounded-[32px] max-lg:landscape:mx-auto max-lg:landscape:max-w-[calc(92svh*1.58)]"
    >
      <ThemedPhoneStage
        photo="hero"
        screens={["hub"]}
        crop={{ x: [0.08, 0.92], y: [0.0, 0.94] }}
        mobileCrop={{ x: [0.33, 0.67], y: [0.08, 0.83] }}
        priority
        sizes="(max-width: 767px) 230vw, 1320px"
        label="The SyncEstate Hub on a phone: a good-morning summary, five things that need attention across SyncStay, SyncWorth and SyncFinance, and a tile for each module."
      />
    </motion.div>
  );
}

/** The hero hands again, cropped to the phone, under the final call to action. */
export function CtaPhone() {
  return (
    <div className="l-fade-bottom mx-auto w-full max-w-[520px] max-lg:landscape:max-w-[calc(80svh*1.16)]">
      <ThemedPhoneStage
        photo="hero"
        screens={["hub"]}
        crop={{ x: [0.33, 0.67], y: [0.1, 0.62] }}
        sizes="520px"
        label="The SyncEstate Hub on a phone."
      />
    </div>
  );
}
