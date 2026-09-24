import { Clock, Crown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { MiniPriceChart } from "@/components/markets/mini-price-chart";
import { AssetAvatar } from "@/components/markets/asset-avatar";
import { PlayerAvatar } from "@/components/social/player-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * The login screen explains the product with a real Kova table composition
 * (blueprint 44.7): two players, PnL, market, stake and timer.
 *
 * It is a static, labelled product preview - never presented as a live match -
 * so it renders identically without any API and cannot show fake live values.
 */
const PREVIEW_SPARK = [100, 101.5, 100.8, 103, 102.2, 104.9, 104, 106.5, 105.9, 108.2, 107.1, 109.4];

export function AuthProductPreview({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="rounded-card border border-border-subtle bg-surface-1/90 p-4 backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {compact ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-dot" aria-hidden="true" />
                Product preview
              </span>
            ) : (
              <>
                <Badge tone="success">Trade</Badge>
                <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-dot" aria-hidden="true" />
                  Product preview
                </span>
              </>
            )}
          </div>
          <span className="inline-flex items-center gap-1 text-[13px] font-medium text-text-primary">
            Meme Majors
            <ChevronRight size={14} className="text-text-muted" aria-hidden="true" />
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <PlayerAvatar username="traderanon" size={compact ? "md" : "lg"} />
            <div>
              <p className="text-[13px] text-text-primary">traderanon</p>
              <p className={cn("num font-semibold text-success", compact ? "text-[16px]" : "text-[22px]")}>+112.3%</p>
            </div>
          </div>
          <span className="text-[13px] font-medium text-text-muted">VS</span>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[13px] text-text-primary">degenzen</p>
              <p className={cn("num font-semibold text-danger", compact ? "text-[16px]" : "text-[22px]")}>-43.1%</p>
            </div>
            <PlayerAvatar username="degenzen" size={compact ? "md" : "lg"} />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
          <div className="flex items-center gap-2.5">
            <AssetAvatar symbol="NVDA" size="sm" />
            <div>
              <p className="text-[13px] font-medium text-text-primary">NVDA</p>
              <p className="num text-[12px] text-text-secondary">
                $875.21 <span className="text-success">+8.7%</span>
              </p>
            </div>
          </div>
          <MiniPriceChart points={PREVIEW_SPARK} direction="up" width={compact ? 64 : 120} height={32} />
          <div className="text-right">
            <p className="num text-[13px] font-semibold text-text-primary">50 ANSEM</p>
            <p className="flex items-center justify-end gap-1 text-[12px] text-text-secondary">
              <Clock size={12} aria-hidden="true" /> 15m left
            </p>
          </div>
        </div>
      </div>

      {compact ? null : (
        <div className="flex items-center gap-4 rounded-card border border-border-subtle bg-surface-1/90 px-4 py-3 backdrop-blur-sm">
          <Crown size={28} className="shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-[13px] leading-5">
            <p className="text-text-primary">
              traderanon is up <span className="num font-semibold text-success">+112.3%</span>
            </p>
            <p className="text-text-secondary">Can degenzen make a comeback?</p>
          </div>
          <Button href="/app" variant="outline" size="sm" iconRight={<ChevronRight size={14} />}>
            Watch Live
          </Button>
        </div>
      )}
    </div>
  );
}

export function BrowseFirstLink({ label = "Browse markets without signing in", className }: { label?: string; className?: string }) {
  return (
    <Link
      href="/markets"
      className={cn("inline-flex items-center gap-2 text-[14px] font-medium text-[#b79bff] transition-colors hover:text-[#d0bdff]", className)}
    >
      <span className="underline underline-offset-4 decoration-[#b79bff]/40">{label}</span>
      <ChevronRight size={16} aria-hidden="true" />
    </Link>
  );
}
