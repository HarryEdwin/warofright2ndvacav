import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "War of Right Community",
  description: "War of Right Community 活动指南、军衔、规则、成就与连队信息。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
