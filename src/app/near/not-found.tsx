import { Button } from "@/components/ui/button";
import { NEAR_PLAY_PATH, NEAR_TOKEN_PATH } from "@/features/near/paths";

/** The NEAR host's 404, inside the NEAR layout, so a wrong link never shows a kova.surf page. */
export default function NearNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-col items-start gap-4 px-4 py-20 sm:px-6">
      <p className="font-mono text-[12px] tracking-wide text-text-muted">404</p>
      <h1 className="font-display text-[28px] font-bold text-text-primary">This page is not on the table.</h1>
      <p className="text-[15px] leading-6 text-text-secondary">The link may be old, or the table or clan it points to does not exist on this contract.</p>
      <div className="flex flex-wrap gap-2">
        <Button href={NEAR_PLAY_PATH}>Play the House</Button>
        <Button href={NEAR_TOKEN_PATH} variant="secondary">
          See CHIP&apos;s supply
        </Button>
      </div>
    </main>
  );
}
