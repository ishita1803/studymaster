import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF, DOCX and OCR libraries use Node-only internals (including native
  // canvas bindings); keep them out of the server bundle so uploads work in
  // production and on Vercel.
  serverExternalPackages: ["unpdf", "mammoth", "tesseract.js", "@napi-rs/canvas"],
  // Hide the floating Next.js dev overlay badge; runtime errors still surface
  // in the console and the DevTools overlay.
  devIndicators: false,
  // Ship the local Tesseract language data with every server function so
  // offline handwriting OCR works after deployment.
  outputFileTracingIncludes: {
    "/*": ["./tessdata/**/*"],
  },
  experimental: {
    serverActions: {
      // Uploads are capped at 20 MB in the UI and server extractor; leave
      // headroom for multipart overhead so the action never returns a 413.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
