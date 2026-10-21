import { useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Image with a branded fallback if the remote URL fails. */
export function SmartImage({ className, alt, ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div role="img" aria-label={alt} className={cn("grid place-items-center bg-card text-muted-foreground", className)}>
        <span className="display text-3xl opacity-40">AELITEZ</span>
      </div>
    );
  return <img alt={alt} onError={() => setFailed(true)} className={className} {...rest} />;
}
