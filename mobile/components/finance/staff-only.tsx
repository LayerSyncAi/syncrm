/** For a deep link into a screen that is for accounts staff only. */
import { EmptyState, Screen } from "../ui";

export function StaffOnly() {
  return (
    <Screen>
      <EmptyState icon="lock-closed-outline" title="For accounts staff" message="This part of SyncFinance is for directors and accounts staff. You can see your landlords' balances and statements." />
    </Screen>
  );
}
