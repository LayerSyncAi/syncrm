/** A SyncEstate product icon, drawn from the same paths as the website's. */
import Svg, { Path } from "react-native-svg";
import { PRODUCT_ICON_PATHS, type ProductIconKey } from "@/lib/product-icon-paths";

export type { ProductIconKey };

export function ProductIcon({ name, size = 22, color }: { name: ProductIconKey; size?: number; color: string }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PRODUCT_ICON_PATHS[name].map((d, i) => (
        <Path key={i} d={d} />
      ))}
    </Svg>
  );
}
