import type { HotsiteModuleType } from '@beloauto/types';
import { fetchManifest } from '@/lib/api/tenant';
import { Footer } from '@/components/hotsite/Footer';
import { HeroModule } from '@/components/hotsite/HeroModule';
import { isValidModuleData } from '@/lib/hotsite/module-schemas';

type ModuleComponent = React.ComponentType<{ data: Record<string, unknown>; slug: string }>;

// Each module story (M12-S04 to S06) registers its component here.
// HeroModule is typed as { data: HeroModuleData; slug: string } — cast only at this boundary.
const MODULE_MAP: Partial<Record<HotsiteModuleType, ModuleComponent>> = {
  // HeroModule is typed as { data: HeroModuleData; slug: string } — double cast isolates the
  // type erasure to this single registry boundary; the component's own props stay fully typed.
  HERO: HeroModule as unknown as ModuleComponent,
};

interface HotsitePageProps {
  params: Promise<{ slug: string }>;
}

export default async function HotsitePage({ params }: HotsitePageProps) {
  const { slug } = await params;
  const manifest = await fetchManifest(slug);

  return (
    <main>
      {manifest.layout
        .filter((m) => m.enabled)
        .map((m, index) => {
          const Component = MODULE_MAP[m.type];
          // Skip modules with no registered component or with data that fails its schema —
          // a single malformed module must not take down the whole hotsite page.
          if (!Component || !isValidModuleData(m.type, m.data)) {
            return null;
          }
          return <Component key={`${m.type}-${index}`} data={m.data} slug={slug} />;
        })}
      <Footer slug={slug} />
    </main>
  );
}
