import { Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/auth/use-auth';
import type { TabSlot } from './tab-slots';

/**
 * Detail page frame: header slot + role-filtered tabs from a registry. The active tab lives
 * in `?tab=` so it survives reloads and can be deep-linked.
 */
export function TabbedDetail({
  title,
  header,
  tabs,
}: {
  title: string;
  header?: React.ReactNode;
  tabs: TabSlot[];
}) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const visible = tabs.filter((t) => user && t.roles.includes(user.role));
  if (visible.length === 0) return null;
  const active = visible.find((t) => t.key === params.get('tab'))?.key ?? visible[0].key;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {header}
      </div>
      <Tabs
        value={active}
        onValueChange={(key) => setParams({ tab: key }, { replace: true })}
      >
        <TabsList className="h-auto flex-wrap justify-start">
          {visible.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {visible.map((t) => (
          <TabsContent key={t.key} value={t.key} className="mt-4">
            <Suspense fallback={<Skeleton className="h-40 w-full" />}>
              <t.component />
            </Suspense>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
