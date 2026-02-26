"use client";

import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

// #40-43: Comparison table animation variants
const tableContainerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.1 } },
};

const columnVariants = {
  hidden: { opacity: 0, y: -12 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
};

const rowVariants = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
};

const pricePerSqmVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24, delay: 0.3 } },
};

interface PropertyComparisonProps {
  open: boolean;
  onClose: () => void;
  propertyIds: Id<"properties">[];
  leadId?: Id<"leads">;
}

function ComparisonRow({
  label,
  values,
  highlight = false,
}: {
  label: string;
  values: (string | number | null | undefined)[];
  highlight?: boolean;
}) {
  // Find best value for highlighting (assumes first value should be used for comparison in most cases)
  const formattedValues = values.map((v) => v ?? "-");

  return (
    <tr className={highlight ? "bg-primary/5" : ""}>
      <td className="py-2 px-3 text-xs font-medium text-text-muted border-r border-border">
        {label}
      </td>
      {formattedValues.map((value, index) => (
        <td key={index} className="py-2 px-3 text-sm text-center border-r border-border last:border-r-0">
          {value}
        </td>
      ))}
    </tr>
  );
}

function PriceComparisonRow({
  values,
  currencies,
}: {
  values: number[];
  currencies: string[];
}) {
  const minPrice = Math.min(...values);
  const maxPrice = Math.max(...values);

  return (
    <tr className="bg-primary/5">
      <td className="py-2 px-3 text-xs font-medium text-text-muted border-r border-border">
        Price
      </td>
      {values.map((value, index) => {
        const formatted = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: currencies[index] || "USD",
          maximumFractionDigits: 0,
        }).format(value);

        const isLowest = value === minPrice && values.length > 1;
        const isHighest = value === maxPrice && values.length > 1;

        return (
          <td key={index} className="py-2 px-3 text-sm text-center border-r border-border last:border-r-0">
            <span className={isLowest ? "text-green-600 font-medium" : isHighest ? "text-amber-600" : ""}>
              {formatted}
            </span>
            {isLowest && <Badge className="ml-1 text-[10px] bg-green-100 text-green-700">Lowest</Badge>}
          </td>
        );
      })}
    </tr>
  );
}

function AreaComparisonRow({
  values,
}: {
  values: (number | undefined)[];
}) {
  const validValues = values.filter((v): v is number => v !== undefined);
  const maxArea = validValues.length > 0 ? Math.max(...validValues) : 0;

  return (
    <tr>
      <td className="py-2 px-3 text-xs font-medium text-text-muted border-r border-border">
        Area
      </td>
      {values.map((value, index) => {
        const isLargest = value === maxArea && validValues.length > 1;

        return (
          <td key={index} className="py-2 px-3 text-sm text-center border-r border-border last:border-r-0">
            {value ? (
              <span className={isLargest ? "text-green-600 font-medium" : ""}>
                {value} sqm
                {isLargest && <Badge className="ml-1 text-[10px] bg-green-100 text-green-700">Largest</Badge>}
              </span>
            ) : (
              "-"
            )}
          </td>
        );
      })}
    </tr>
  );
}

export function PropertyComparison({
  open,
  onClose,
  propertyIds,
  leadId,
}: PropertyComparisonProps) {
  const comparisonData = useQuery(
    api.matches.getPropertiesForComparison,
    propertyIds.length > 0 ? { propertyIds } : "skip"
  );

  const matchScores = useQuery(
    api.matches.suggestPropertiesForLead,
    leadId && propertyIds.length > 0
      ? { leadId, limit: 20, minScore: 0, excludeAttached: false }
      : "skip"
  );

  if (!open) return null;

  const properties = comparisonData?.properties ?? [];

  // Get match scores for each property if we have a lead
  const scoreMap = new Map<string, number>();
  if (matchScores?.suggestions) {
    for (const suggestion of matchScores.suggestions) {
      scoreMap.set(suggestion.property._id, suggestion.totalScore);
    }
  }

  return (
    <Modal
      open={open}
      title="Property Comparison"
      description={`Comparing ${properties.length} properties`}
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      }
    >
      {comparisonData === undefined ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : properties.length === 0 ? (
        <p className="text-text-muted text-center py-8">No properties to compare.</p>
      ) : (
        // #40: Table entrance with column stagger
        <motion.div
          className="overflow-x-auto"
          variants={tableContainerVariants}
          initial="hidden"
          animate="show"
        >
          <table className="w-full border-collapse">
            <thead>
              <motion.tr className="border-b border-border" variants={rowVariants}>
                <th className="py-2 px-3 text-left text-xs font-semibold text-text-muted w-28 border-r border-border">
                  Feature
                </th>
                {/* #41: Column header stagger entrance */}
                {properties.map((property) => (
                  <motion.th
                    key={property._id}
                    variants={columnVariants}
                    className="py-2 px-3 text-center text-xs font-semibold border-r border-border last:border-r-0 min-w-[150px]"
                  >
                    <div className="space-y-1">
                      <p className="truncate max-w-[140px]" title={property.title}>
                        {property.title}
                      </p>
                      {property.images.length > 0 && (
                        <img
                          src={property.images[0]}
                          alt={property.title}
                          className="w-full h-20 object-cover rounded-md"
                        />
                      )}
                    </div>
                  </motion.th>
                ))}
              </motion.tr>
            </thead>
            {/* #42: Row cascade entrance */}
            <motion.tbody className="divide-y divide-border" variants={tableContainerVariants} initial="hidden" animate="show">
              {/* Match Score Row (if lead context available) */}
              {leadId && (
                <tr className="bg-primary/10">
                  <td className="py-2 px-3 text-xs font-medium text-text-muted border-r border-border">
                    Match Score
                  </td>
                  {properties.map((property) => {
                    const score = scoreMap.get(property._id);
                    return (
                      <td key={property._id} className="py-2 px-3 text-center border-r border-border last:border-r-0">
                        {score !== undefined ? (
                          <Badge
                            className={
                              score >= 80
                                ? "bg-green-100 text-green-700"
                                : score >= 60
                                ? "bg-blue-100 text-blue-700"
                                : score >= 40
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700"
                            }
                          >
                            {score}%
                          </Badge>
                        ) : (
                          "-"
                        )}
                      </td>
                    );
                  })}
                </tr>
              )}

              <PriceComparisonRow
                values={properties.map((p) => p.price)}
                currencies={properties.map((p) => p.currency)}
              />

              <ComparisonRow
                label="Type"
                values={properties.map((p) => p.type.charAt(0).toUpperCase() + p.type.slice(1))}
              />

              <ComparisonRow
                label="Listing"
                values={properties.map((p) => (p.listingType === "sale" ? "For Sale" : "For Rent"))}
                highlight
              />

              <ComparisonRow
                label="Location"
                values={properties.map((p) => p.location)}
              />

              <AreaComparisonRow values={properties.map((p) => p.area)} />

              <ComparisonRow
                label="Bedrooms"
                values={properties.map((p) => p.bedrooms)}
              />

              <ComparisonRow
                label="Bathrooms"
                values={properties.map((p) => p.bathrooms)}
              />

              <ComparisonRow
                label="Status"
                values={properties.map((p) =>
                  p.status === "available" ? "Available" :
                  p.status === "under_offer" ? "Under Offer" :
                  p.status.charAt(0).toUpperCase() + p.status.slice(1)
                )}
                highlight
              />

              {/* Description row */}
              <motion.tr variants={rowVariants}>
                <td className="py-2 px-3 text-xs font-medium text-text-muted border-r border-border align-top">
                  Description
                </td>
                {properties.map((property) => (
                  <td
                    key={property._id}
                    className="py-2 px-3 text-xs text-text-muted border-r border-border last:border-r-0"
                  >
                    <p className="line-clamp-4">{property.description || "-"}</p>
                  </td>
                ))}
              </motion.tr>
            </motion.tbody>
          </table>

          {/* #43: Price per sqm entrance */}
          {properties.some((p) => p.area && p.area > 0) && (
            <motion.div
              variants={pricePerSqmVariants}
              initial="hidden"
              animate="show"
              className="mt-4 p-3 bg-card-bg/50 rounded-lg border border-border"
            >
              <p className="text-xs font-semibold text-text-muted mb-2">Price per sqm</p>
              <div className="flex flex-wrap gap-4">
                {properties.map((property) => {
                  const pricePerSqm = property.area ? property.price / property.area : null;
                  return (
                    <div key={property._id} className="text-sm">
                      <span className="text-text-muted">{property.title.slice(0, 20)}...</span>:{" "}
                      <span className="font-medium">
                        {pricePerSqm
                          ? new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: property.currency || "USD",
                              maximumFractionDigits: 0,
                            }).format(pricePerSqm)
                          : "-"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </Modal>
  );
}
