import { redirect } from "next/navigation";

export default function RoutersPage() {
  redirect("/users?role=ROUTER");
}

