import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { GraduationCap, KeyRound, LogOut, Menu, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth/use-auth';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { BOTTOM_NAV_ROLES, mobileNavItemsFor, navItemsFor } from './nav-config';
import { useMediaQuery } from './use-media-query';

const CENTER_NAME = 'Trung tâm Ngoại ngữ ABC';

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <nav aria-label="Menu chính" className="flex flex-col gap-1 p-3">
      {navItemsFor(user.role).map((item) => (
        <NavLink
          key={`${item.to}:${item.label}`}
          to={item.to}
          end={item.to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              isActive && 'bg-accent text-accent-foreground',
            )
          }
        >
          <item.icon className="h-4 w-4 shrink-0" aria-hidden />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function BottomNav() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <nav
      aria-label="Menu dưới"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card pb-[env(safe-area-inset-bottom)]"
    >
      {mobileNavItemsFor(user.role).map((item) => (
        <NavLink
          key={`${item.to}:${item.label}`}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            cn(
              'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium text-muted-foreground',
              isActive && 'text-primary',
            )
          }
        >
          <item.icon className="h-5 w-5" aria-hidden />
          <span className="truncate">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function AccountMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Tài khoản của tôi">
          <UserRound className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="truncate">{user.fullName}</div>
          <div className="truncate text-xs font-normal text-muted-foreground">{user.username}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/change-password">
            <KeyRound className="mr-2 h-4 w-4" />
            Đổi mật khẩu
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut className="mr-2 h-4 w-4" />
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell() {
  const { user } = useAuth();
  const location = useLocation();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isNarrow = useMediaQuery('(max-width: 1023px)');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const bottomNav = isMobile && !!user && BOTTOM_NAV_ROLES.includes(user.role);
  const drawer = !bottomNav && isNarrow;

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card px-3 md:px-4">
        {drawer && (
          <Button variant="ghost" size="icon" aria-label="Mở menu" onClick={() => setDrawerOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <Link to="/" className="flex items-center gap-2 font-semibold text-primary">
          <GraduationCap className="h-5 w-5" aria-hidden />
          <span className="truncate">{CENTER_NAME}</span>
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell />
          <AccountMenu />
        </div>
      </header>

      <div className="flex">
        {!bottomNav && !drawer && (
          <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r bg-card lg:block">
            <SidebarNav />
          </aside>
        )}
        {drawer && (
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="px-4 pt-4">{CENTER_NAME}</SheetTitle>
              <SheetDescription className="sr-only">Menu điều hướng</SheetDescription>
              <SidebarNav onNavigate={() => setDrawerOpen(false)} />
            </SheetContent>
          </Sheet>
        )}
        <main className={cn('min-w-0 flex-1 p-4 md:p-6', bottomNav && 'pb-24')}>
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      {bottomNav && <BottomNav />}
    </div>
  );
}
