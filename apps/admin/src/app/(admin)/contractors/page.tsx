import { redirect } from "next/navigation";

export default function ContractorsPage() {
  redirect("/users?role=CONTRACTOR");
}

