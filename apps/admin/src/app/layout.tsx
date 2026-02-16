import "./globals.css";

export const metadata = {
  title: "8Fold Admin",
  description: "8Fold Control Plane",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
