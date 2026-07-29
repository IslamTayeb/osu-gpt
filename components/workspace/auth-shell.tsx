import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function AuthShell({ bootstrapping }: { bootstrapping: boolean }) {
  return (
    <main className="center-card">
      {bootstrapping ? (
        <div className="section">
          <Skeleton style={{ height: "12px", width: "40%" }} />
          <Skeleton style={{ height: "36px", width: "75%" }} />
          <Skeleton style={{ height: "14px", width: "90%" }} />
        </div>
      ) : (
        <div className="section">
          <h1 className="section__title">osu-gpt</h1>
          <p>Turn your Spotify liked songs into playable osu! beatmaps.</p>
          <p className="muted">
            Import your library and generate playable maps on
            the GPU cluster.
          </p>
          <Link href="/api/auth/spotify/login" className={buttonVariants()}>
            Connect Spotify
          </Link>
        </div>
      )}
    </main>
  );
}
