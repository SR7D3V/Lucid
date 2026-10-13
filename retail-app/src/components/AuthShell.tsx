import type { ReactNode } from 'react';

/** Shared layout for the sign-in and password pages: campaign film beside the form panel. */
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-split">
      <div className="auth-visual" aria-hidden="true">
        <video autoPlay loop muted playsInline preload="metadata">
          <source src="/hero-background.mp4" type="video/mp4" />
        </video>
        <span className="auth-wordmark">LUCID</span>
      </div>
      <div className="auth-panel">{children}</div>
    </main>
  );
}
