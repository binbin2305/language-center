import { useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import timeGridPlugin from '@fullcalendar/timegrid';
import viLocale from '@fullcalendar/core/locales/vi';
import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core';
import { formatInTimeZone } from 'date-fns-tz';
import { addVnDays, VN_TZ, type SessionDto } from '@lc/shared';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useSessions } from '../hooks';

export interface SessionFilters {
  classId?: string;
  teacherId?: string;
  roomId?: string;
}

const PALETTE = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#dc2626', '#4f46e5', '#65a30d'];
const CANCELLED_COLOR = '#9ca3af';

const colorOf = (classId: string) => {
  let h = 0;
  for (const ch of classId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

/** Wall-clock Vietnam time without offset: the calendar runs in "local" mode and shows it as-is. */
const vnWallClock = (iso: string) => formatInTimeZone(new Date(iso), VN_TZ, "yyyy-MM-dd'T'HH:mm:ss");

const toEvent = (s: SessionDto): EventInput => {
  const cancelled = s.status === 'CANCELLED';
  return {
    id: s.id,
    title: [s.classCode, s.roomName, s.teacherName].filter(Boolean).join(' · ') || 'Buổi học',
    start: vnWallClock(s.startAt),
    end: vnWallClock(s.endAt),
    backgroundColor: cancelled ? CANCELLED_COLOR : colorOf(s.classId),
    borderColor: cancelled ? CANCELLED_COLOR : colorOf(s.classId),
    classNames: cancelled ? ['line-through', 'opacity-70'] : [],
  };
};

const isMobile = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

export interface ScheduleCalendarProps {
  filters?: SessionFilters;
  /** `YYYY-MM-DD` to open on (default: today). */
  initialDate?: string;
  onSelectSession: (session: SessionDto) => void;
}

export function ScheduleCalendar({ filters, initialDate, onSelectSession }: ScheduleCalendarProps) {
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [initialView] = useState(() => (isMobile() ? 'listWeek' : 'timeGridWeek'));
  const query = useSessions(range ? { ...range, ...filters } : null);
  const sessions = useMemo(() => query.data ?? [], [query.data]);
  const events = useMemo(() => sessions.map(toEvent), [sessions]);

  const onDatesSet = (arg: DatesSetArg) => {
    // The date part of startStr/endStr is the calendar day as displayed, independent of the browser zone.
    const from = arg.startStr.slice(0, 10);
    const to = addVnDays(arg.endStr.slice(0, 10), -1);
    setRange((r) => (r?.from === from && r.to === to ? r : { from, to }));
  };
  const onEventClick = (arg: EventClickArg) => {
    const found = sessions.find((s) => s.id === arg.event.id);
    if (found) onSelectSession(found);
  };

  return (
    <div className="space-y-3">
      <div aria-busy={query.isFetching} className="rounded-md border bg-card p-2 text-sm [&_.fc-event]:cursor-pointer">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          locale={viLocale}
          initialView={initialView}
          initialDate={initialDate}
          firstDay={1}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
          }}
          buttonText={{ today: 'Hôm nay', month: 'Tháng', week: 'Tuần', day: 'Ngày', list: 'Danh sách' }}
          height="auto"
          allDaySlot={false}
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          nowIndicator
          events={events}
          datesSet={onDatesSet}
          eventClick={onEventClick}
        />
      </div>
      {query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : null}
      {query.isLoading ? <Skeleton className="h-8 w-full" /> : null}
      {query.isSuccess && sessions.length === 0 ? <EmptyState title="Chưa có lịch học" description="Không có buổi học nào trong khoảng thời gian này." /> : null}
    </div>
  );
}
