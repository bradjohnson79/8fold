import { LoginForm } from "../LoginForm";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const error = sp?.error === "invalid";
  const next = typeof sp?.next === "string" ? sp.next : "/";
  return <LoginForm error={error} next={next} />;
}
