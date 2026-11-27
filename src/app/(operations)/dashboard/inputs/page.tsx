import Link from "next/link";
import { notFound } from "next/navigation";
import { pageStaff } from "@/components/operations";
import { analyticsChoices, canSeeFinance } from "@/domains/analytics/report";
import { InputForms } from "./input-forms";
export default async function ApprovedInputs() {
  const staff = await pageStaff("dashboard");
  if (!canSeeFinance(staff)) notFound();
  const options = await analyticsChoices(staff);
  return (
    <>
      <Link className="text-button" href="/dashboard">
        Management dashboard
      </Link>
      <h2>Approved inputs and financial evaluation</h2>
      {options.stores.length ? (
        <InputForms stores={options.stores} campaigns={options.campaigns} />
      ) : (
        <p>No authorized store is available.</p>
      )}
    </>
  );
}
