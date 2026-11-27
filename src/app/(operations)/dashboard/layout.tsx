import { Operations } from "@/components/operations";
export const dynamic = "force-dynamic";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <Operations area="dashboard">{children}</Operations>;
}
