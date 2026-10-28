/** The "More" tab of a module: every screen that is not a tab, as a list. */
import { useRouter, type Href } from "expo-router";
import { ListItem, Screen, Section, type IconName } from "./ui";

export type MoreItem = { label: string; href: string; icon: IconName; subtitle?: string; adminOnly?: boolean };

export function MoreMenu({ sections, isAdmin }: { sections: Array<{ title: string; items: MoreItem[] }>; isAdmin: boolean }) {
  const router = useRouter();
  return (
    <Screen>
      {sections.map((s) => {
        const items = s.items.filter((i) => !i.adminOnly || isAdmin);
        if (!items.length) return null;
        return (
          <Section key={s.title} title={s.title}>
            {items.map((i) => (
              <ListItem key={i.href} icon={i.icon} title={i.label} subtitle={i.subtitle} onPress={() => router.push(i.href as Href)} />
            ))}
          </Section>
        );
      })}
    </Screen>
  );
}
