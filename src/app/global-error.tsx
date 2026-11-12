"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: catches failures in the root layout itself, where the
 * normal error.tsx cannot render. Keeps the message human instead of the
 * default "Application error" screen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[studymaster] Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0b0b16",
          color: "#f4f1ff",
          fontFamily: "system-ui, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 440, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something wobbled</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#b9b4d0", marginBottom: 20 }}>
            StudyMaster hit an unexpected error. Your saved work is safe — reload the page to
            carry on.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: 0,
              borderRadius: 12,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              background: "#a7f3d0",
              color: "#08130f",
            }}
          >
            Reload StudyMaster
          </button>
        </div>
      </body>
    </html>
  );
}
