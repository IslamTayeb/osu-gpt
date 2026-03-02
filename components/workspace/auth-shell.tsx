import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type AuthShellProps = {
  bootstrapping: boolean;
};

export function AuthShell({ bootstrapping }: AuthShellProps) {
  return (
    <main className="auth-shell">
      <section className="auth-stage">
        <div className="auth-card">
          {bootstrapping ? (
            <div className="list">
              <Skeleton style={{ height: "10px", width: "44%" }} />
              <Skeleton style={{ height: "52px", width: "78%" }} />
              <Skeleton style={{ height: "14px", width: "88%" }} />
            </div>
          ) : (
            <>
              <p className="auth-kicker">NEOCLASSICAL MACHINE MUSIC INTERFACE</p>
              <h1 className="auth-title">
                <span>Liked Songs</span>
                <span>To Playable Maps</span>
              </h1>
              <p className="auth-sub">
                Bring in your Spotify liked songs, force title+artist substring matching against Ranked/Loved
                sets, then generate the unmatched tracks in batch.
              </p>
            </>
          )}
        </div>
        <div className="provider-row">
          <Link href="/api/auth/spotify/login" className={cn(buttonVariants({ size: "lg" }))}>
            Connect Spotify
          </Link>
          <Button variant="secondary" size="lg" disabled>
            Apple Music Coming Soon
          </Button>
        </div>
        <div className="auth-foot tiny muted">
          Apple Music entry remains visible and ships when backend auth/import is enabled.
        </div>
      </section>
    </main>
  );
}
