import { pageStaff } from "@/components/operations";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await pageStaff("lab");
  return children;
}
