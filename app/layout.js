import "./globals.css";

export const metadata = {
  title: "CA Housing & Population Data",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}