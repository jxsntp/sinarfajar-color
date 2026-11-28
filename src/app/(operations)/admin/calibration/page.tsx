import { cookies } from "next/headers";
import Link from "next/link";
import { pageStaff } from "@/components/operations";
import { enrolledKiosk } from "@/domains/devices/service";
import { CalibrationStudio } from "./calibration-studio";

export default async function Calibration() {
  const scope = await pageStaff("admin");
  const kiosk = await enrolledKiosk(scope, (await cookies()).get("inaura_device")?.value);
  return (
    <>
      <Link className="text-button" href="/admin">Back to administration</Link>
      <h2>Station camera calibration</h2>
      <p>
        Run this on the kiosk itself, with the station lighting on. Fill the guide with a ColorChecker Classic chart,
        brown patch at top left, then measure. The result is a <code>COLOR_STATIONS</code> entry for the deployment
        settings. Nothing is saved here. Repeat the check every day and after any camera, lighting or setting change.
      </p>
      <CalibrationStudio kiosk={kiosk} />
    </>
  );
}
