import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "IET-DSMNRU | Faculty of Engineering & Technology",
    template: "%s | IET-DSMNRU",
  },
  description: "The official website of the Institute of Engineering & Technology at Dr. Shakuntala Misra National Rehabilitation University, Lucknow.",
  openGraph: {
    type: "website",
    title: "IET-DSMNRU | Faculty of Engineering & Technology",
    description: "Inclusive, accessible and industry-oriented engineering education at DSMNRU.",
    siteName: "IET-DSMNRU",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
