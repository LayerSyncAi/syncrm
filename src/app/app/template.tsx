"use client";

// Recommendation #6: Page transition crossfade
// Next.js template.tsx re-mounts on every route change within /app/*,
// giving each page a smooth fade-up entrance animation.

import { motion } from "framer-motion";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
