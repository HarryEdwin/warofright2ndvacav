import { redirect } from "next/navigation";

export const metadata = {
  title: "War of Right Community",
  description: "War of Right Community 活动指南、军衔、规则、成就与连队信息。",
};

export default function Home() {
  redirect("/index.html");
}
