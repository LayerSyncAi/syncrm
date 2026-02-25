"use client";

import React, {
  Dispatch,
  SetStateAction,
  SyntheticEvent,
  useState,
  useRef,
  useEffect,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { format } from "date-fns";
import { ArrowLeft, ArrowRight, Pencil, Clock, X } from "lucide-react";
import { DateObj, useDayzed } from "dayzed";

/* ─── public props ─── */
export interface FlipCalendarProps {
  /** Currently selected date (null = nothing selected) */
  value?: Date | null;
  /** Called when the user picks or clears a date */
  onChange?: (date: Date | null) => void;
  /** Show hour / minute selectors beneath the date grid */
  showTime?: boolean;
  /** Placeholder shown when no date is selected */
  placeholder?: string;
}

/* ─── main export ─── */
export function FlipCalendar({
  value = null,
  onChange,
  showTime = false,
  placeholder = "Pick a date",
}: FlipCalendarProps) {
  const [index, setIndex] = useState(0);
  const [date, setDate] = useState<Date | null>(value);
  const [visible, setVisible] = useState(false);
  const [hours, setHours] = useState<number>(value ? value.getHours() : 9);
  const [minutes, setMinutes] = useState<number>(
    value ? value.getMinutes() : 0
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external value changes
  useEffect(() => {
    setDate(value);
    if (value) {
      setHours(value.getHours());
      setMinutes(value.getMinutes());
    }
  }, [value]);

  // Close picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setVisible(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* Emit the combined date+time to parent */
  const emit = (d: Date | null, h?: number, m?: number) => {
    if (!d) {
      onChange?.(null);
      return;
    }
    const out = new Date(d);
    if (showTime) {
      out.setHours(h ?? hours, m ?? minutes, 0, 0);
    }
    onChange?.(out);
  };

  const handleSelectDate = (selectedDate: DateObj) => {
    setDate(selectedDate.date);
    setIndex((pv) => pv + 1);
    emit(selectedDate.date);
  };

  const handleHoursChange = (h: number) => {
    setHours(h);
    emit(date, h, minutes);
  };

  const handleMinutesChange = (m: number) => {
    setMinutes(m);
    emit(date, hours, m);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDate(null);
    setVisible(false);
    onChange?.(null);
  };

  return (
    <div ref={containerRef} className="relative text-text">
      <div className="inline-flex items-start gap-3">
        {/* ── left: display card + summary ── */}
        <div className="flex flex-col items-start">
          <CalendarDisplay
            index={index}
            date={date}
            visible={visible}
            setVisible={setVisible}
            placeholder={placeholder}
            onClear={handleClear}
            showTime={showTime}
            hours={hours}
            minutes={minutes}
          />

          {/* ── selected date/time summary ── */}
          {date && (
            <div className="mt-2 w-52 rounded-[8px] border border-border-strong bg-surface-2 px-3 py-1.5 text-xs text-text-muted">
              {showTime
                ? format(
                    new Date(
                      date.getFullYear(),
                      date.getMonth(),
                      date.getDate(),
                      hours,
                      minutes
                    ),
                    "EEE, MMM do yyyy 'at' HH:mm"
                  )
                : format(date, "EEE, MMM do yyyy")}
            </div>
          )}
        </div>

        {/* ── right: picker panel ── */}
        <AnimatePresence>
          {visible && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="w-fit rounded-[10px] border border-border-strong bg-card-bg p-3 shadow-lg"
            >
              <DatePicker
                selected={date ?? new Date()}
                onDateSelected={handleSelectDate}
              />

              {showTime && (
                <TimePicker
                  hours={hours}
                  minutes={minutes}
                  onHoursChange={handleHoursChange}
                  onMinutesChange={handleMinutesChange}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─── calendar display (flip card) ─── */

interface CalendarDisplayProps {
  index: number;
  date: Date | null;
  visible: boolean;
  setVisible: Dispatch<SetStateAction<boolean>>;
  placeholder: string;
  onClear: (e: React.MouseEvent) => void;
  showTime: boolean;
  hours: number;
  minutes: number;
}

const CalendarDisplay = ({
  index,
  date,
  visible,
  setVisible,
  placeholder,
  onClear,
  showTime,
  hours,
  minutes,
}: CalendarDisplayProps) => {
  if (!date) {
    return (
      <button
        type="button"
        onClick={() => setVisible((pv) => !pv)}
        className="flex h-10 w-full min-w-[210px] items-center justify-between rounded-[10px] border border-border-strong bg-transparent px-3 text-sm text-text-dim transition duration-150 hover:border-primary/60 focus:ring-4 focus:ring-[rgba(59,130,246,0.18)]"
      >
        <span>{placeholder}</span>
        <Pencil className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <div className="w-fit overflow-hidden rounded-[10px] border-2 border-primary bg-primary">
      <div className="flex items-center justify-between gap-2 px-2 py-0.5">
        <span className="text-center text-sm font-medium uppercase text-white">
          {format(date, "LLLL")}
        </span>
        <div className="flex items-center gap-1">
          {showTime && (
            <span className="mr-1 flex items-center gap-1 text-xs text-white/80">
              <Clock className="h-3 w-3" />
              {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}
            </span>
          )}
          <button
            type="button"
            onClick={onClear}
            className="text-white/70 transition-colors hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setVisible((pv) => !pv)}
            className="text-white transition-colors hover:text-white/70"
          >
            {visible ? <ArrowLeft className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div className="relative z-0 h-28 w-52 shrink-0">
        <AnimatePresence mode="sync">
          <motion.div
            style={{
              clipPath: "polygon(0 0, 100% 0, 100% 50%, 0 50%)",
              zIndex: -index,
              backfaceVisibility: "hidden",
            }}
            key={index}
            transition={{ duration: 0.75, ease: "easeInOut" }}
            initial={{ rotateX: "0deg" }}
            animate={{ rotateX: "0deg" }}
            exit={{ rotateX: "-180deg" }}
            className="absolute inset-0"
          >
            <div className="grid h-full w-full place-content-center rounded-lg bg-card-bg text-5xl font-semibold text-text">
              {format(date, "do")}
            </div>
          </motion.div>
          <motion.div
            style={{
              clipPath: "polygon(0 50%, 100% 50%, 100% 100%, 0 100%)",
              zIndex: index,
              backfaceVisibility: "hidden",
            }}
            key={(index + 1) * 2}
            initial={{ rotateX: "180deg" }}
            animate={{ rotateX: "0deg" }}
            exit={{ rotateX: "0deg" }}
            transition={{ duration: 0.75, ease: "easeInOut" }}
            className="absolute inset-0"
          >
            <div className="relative grid h-full w-full place-content-center rounded-lg bg-card-bg text-5xl font-semibold text-text">
              {format(date, "do")}
              <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-xs text-text-muted">
                {format(date, "yyyy")}
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

/* ─── date grid picker ─── */

interface DatePickerProps {
  selected: Date;
  onDateSelected: (
    selectedDate: DateObj,
    event: SyntheticEvent<Element, Event>
  ) => void;
}

const DatePicker = (props: DatePickerProps) => {
  const { calendars, getBackProps, getForwardProps, getDateProps } =
    useDayzed(props);

  const calendar = calendars[0];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <button
          type="button"
          {...getBackProps({ calendars })}
          className="rounded p-1 text-text-muted transition-colors hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="font-medium text-text">
          {MONTH_NAMES[calendar.month]} {calendar.year}
        </span>
        <button
          type="button"
          {...getForwardProps({ calendars })}
          className="rounded p-1 text-text-muted transition-colors hover:text-text"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <div key={`${calendar.month}${calendar.year}`} className="w-52">
        <div className="mb-2 flex">
          {WEEKDAY_NAMES.map((weekday) => (
            <div
              key={`${calendar.month}${calendar.year}${weekday}`}
              className="block w-[calc(100%_/_7)] text-center text-xs text-text-muted"
            >
              {weekday}
            </div>
          ))}
        </div>
        {calendar.weeks.map((week, weekIndex) =>
          week.map((dateObj, idx) => {
            const key = `${calendar.month}${calendar.year}${weekIndex}${idx}`;
            if (!dateObj) {
              return (
                <div key={key} className="inline-block w-[calc(100%_/_7)]" />
              );
            }
            const { date, selected } = dateObj;
            return (
              <button
                type="button"
                className={`inline-block w-[calc(100%_/_7)] rounded py-0.5 text-sm transition-colors ${
                  selected
                    ? "bg-primary text-white"
                    : "bg-transparent text-text hover:bg-primary/10"
                }`}
                key={key}
                {...getDateProps({ dateObj })}
              >
                {date.getDate()}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

/* ─── time picker ─── */

interface TimePickerProps {
  hours: number;
  minutes: number;
  onHoursChange: (h: number) => void;
  onMinutesChange: (m: number) => void;
}

const TimePicker = ({
  hours,
  minutes,
  onHoursChange,
  onMinutesChange,
}: TimePickerProps) => {
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-text-muted" />
        <select
          value={hours}
          onChange={(e) => onHoursChange(Number(e.target.value))}
          className="h-8 rounded-[8px] border border-border-strong bg-transparent px-2 text-sm text-text outline-none focus:ring-2 focus:ring-primary/30"
        >
          {Array.from({ length: 24 }, (_, i) => (
            <option key={i} value={i}>
              {String(i).padStart(2, "0")}
            </option>
          ))}
        </select>
        <span className="text-text-muted">:</span>
        <select
          value={minutes}
          onChange={(e) => onMinutesChange(Number(e.target.value))}
          className="h-8 rounded-[8px] border border-border-strong bg-transparent px-2 text-sm text-text outline-none focus:ring-2 focus:ring-primary/30"
        >
          {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, "0")}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

/* ─── constants ─── */

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
