import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  label: string;
  side?: "right" | "left" | "center" | "top";
  children: ReactNode;
  className?: string;
}

/** Accessible modal/drawer: Esc to close, focus trap-lite, scroll lock, focus restore. */
export function Overlay({ open, onClose, label, side = "right", children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>("input,button,[href]")?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); document.body.style.overflow = ""; document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [open, onClose]);

  if (!open) return null;
  const pos = {
    right: "right-0 top-0 h-full w-full max-w-md animate-in slide-in-from-right",
    left: "left-0 top-0 h-full w-full max-w-sm animate-in slide-in-from-left",
    top: "inset-x-0 top-0 animate-in slide-in-from-top",
    center: "left-1/2 top-1/2 max-h-[92vh] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto animate-in fade-in zoom-in-95",
  }[side];
  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-ink/60 animate-in fade-in" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} className={cn("absolute bg-background shadow-2xl duration-300", pos, className)}>
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 z-10 grid size-10 place-items-center rounded-full bg-background/90 hover:bg-accent">
          <X className="size-5" />
        </button>
        {children}
      </div>
    </div>
  );
}
