"use client";
import clsx from "clsx";
import { Loader2, Zap } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Card({ children, className, title, icon, action, tone }: { children: ReactNode; className?: string; title?: ReactNode; icon?: ReactNode; action?: ReactNode; tone?: "tw" | "bad" | "warn" | "ok" }) {
  return (
    <section
      className={clsx(
        "rounded-xl border bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
        tone === "tw" ? "border-tw/40" : tone === "bad" ? "border-bad/40" : tone === "warn" ? "border-warn/40" : tone === "ok" ? "border-ok/40" : "border-line",
        className,
      )}
    >
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-fg">
            {icon}
            {title}
          </h3>
          {action}
        </header>
      )}
      <div className={clsx(title ? "p-4" : "")}>{children}</div>
    </section>
  );
}

const badgeTones = {
  neutral: "bg-surface-2 text-muted border-line",
  brand: "bg-brand-soft text-brand border-brand/20",
  tw: "bg-tw-soft text-tw border-tw/25",
  ok: "bg-ok-soft text-ok border-ok/25",
  warn: "bg-warn-soft text-warn border-warn/25",
  bad: "bg-bad-soft text-bad border-bad/25",
};
export type Tone = keyof typeof badgeTones;

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap", badgeTones[tone], className)}>{children}</span>;
}

export function Button({ variant = "secondary", size = "md", loading, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "tw"; size?: "sm" | "md"; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        variant === "primary" && "bg-brand text-white hover:opacity-90",
        variant === "tw" && "bg-tw text-white hover:opacity-90",
        variant === "secondary" && "border border-line bg-surface text-fg hover:bg-surface-2",
        variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-fg",
        variant === "danger" && "bg-bad text-white hover:opacity-90",
        className,
      )}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
}

export function TwMark({ className, label = "Triggerware" }: { className?: string; label?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 font-semibold text-tw", className)}>
      <Zap className="size-3.5 fill-current" />
      {label}
    </span>
  );
}

export function Sql({ sql, className, compact }: { sql: string; className?: string; compact?: boolean }) {
  const parts = sql.split(/(\b(?:SELECT|FROM|WHERE|AND|OR|GROUP BY|ORDER BY|HAVING|LIMIT|JOIN|LEFT JOIN|ON|AS|COUNT|SUM|AVG|MAX|MIN|DESC|ASC|IN|NOT|NULL|IS|TIMESTAMP|DATE|DISTINCT|CASE|WHEN|THEN|ELSE|END)\b|'[^']*')/gi);
  return (
    <pre className={clsx("overflow-x-auto rounded-lg bg-code-bg font-mono text-code-fg scroll-thin", compact ? "px-2.5 py-1.5 text-[11px] leading-relaxed" : "px-3 py-2.5 text-xs leading-relaxed", className)}>
      <code className="whitespace-pre-wrap break-words">
        {parts.map((p, i) =>
          /^'/.test(p) ? <span key={i} className="text-emerald-300">{p}</span> : /^[A-Z ]+$/i.test(p) && p.trim() && /^(SELECT|FROM|WHERE|AND|OR|GROUP BY|ORDER BY|HAVING|LIMIT|JOIN|LEFT JOIN|ON|AS|COUNT|SUM|AVG|MAX|MIN|DESC|ASC|IN|NOT|NULL|IS|TIMESTAMP|DATE|DISTINCT|CASE|WHEN|THEN|ELSE|END)$/i.test(p.trim()) ? <span key={i} className="text-sky-300">{p}</span> : <span key={i}>{p}</span>,
        )}
      </code>
    </pre>
  );
}

export function Empty({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-8 text-center">
      {icon && <div className="mb-1 text-faint">{icon}</div>}
      <p className="text-sm font-medium text-muted">{title}</p>
      {hint && <p className="max-w-xs text-xs text-faint">{hint}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton h-3", className)} />;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export const fmtMoney = (n: unknown) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
