import { APP_NAME } from "@/lib/config";

export function Wordmark({ className = "text-lg" }: { className?: string }) {
  return (
    <span className={`font-semibold lowercase tracking-tight ${className}`}>
      {APP_NAME}
      <span className="text-accent">.</span>
    </span>
  );
}
