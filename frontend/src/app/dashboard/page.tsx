"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import type { Report } from "../../types";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Local calendar date. toISOString() is UTC, which is already "tomorrow" in the
// evening in Detroit, and the manager page submits with the local date.
const localDate = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .split("T")[0];
};

export default function DashboardPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready" | "denied">(
    "loading",
  );
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);
  // What the user picked. null means "today", resolved in the browser inside the effect.
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  // The date actually loaded, used for the picker and the empty-state message
  const [shownDate, setShownDate] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        await getCurrentUser();
      } catch {
        router.push("/");
        return;
      }
      const session = await fetchAuthSession();
      const groups =
        (session.tokens?.idToken?.payload["cognito:groups"] as
          | string[]
          | undefined) ?? [];

      // Managers belong on their own page. Users in no group have no access.
      if (groups.includes("Managers") && !groups.includes("Owners")) {
        router.push("/manager");
        return;
      }
      if (!groups.includes("Owners") && !groups.includes("Investors")) {
        setStatus("denied");
        return;
      }

      const activeDate = pickedDate ?? localDate();
      try {
        const token = session.tokens?.idToken?.toString();
        const response = await fetch(`${API_URL}/reports?date=${activeDate}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.message || "Failed to load reports");
        setReports(data.reports || []);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
      setShownDate(activeDate);
      setStatus("ready");
    };
    load();
  }, [pickedDate, router]);

  if (status === "loading")
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );

  if (status === "denied")
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600">
        Your account has no access yet. Ask the owner to assign you a role.
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Owner Dashboard</h1>
          {/* Picking a date changes pickedDate, which re-runs the load effect */}
          <input
            type="date"
            value={pickedDate ?? shownDate}
            onChange={(e) => setPickedDate(e.target.value)}
            className="border rounded px-3 py-2"
          />
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 px-4">
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-800 border border-red-200">
            {error}
          </div>
        )}

        {reports.length === 0 ? (
          <div className="text-center text-gray-500 mt-20">
            No reports found for {shownDate}
          </div>
        ) : (
          // Responsive grid: 1 col mobile, 2 tablet, 3 desktop
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reports.map((report) => (
              <div
                key={report.reportId}
                className="bg-white rounded-lg shadow p-6"
              >
                <h2 className="text-lg font-semibold text-gray-900">
                  {report.locationId}
                </h2>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Revenue</span>
                    {/* Red if below target, green if at or above */}
                    <span
                      className={
                        report.revenue < report.revenueTarget
                          ? "text-red-600 font-semibold"
                          : "text-green-600 font-semibold"
                      }
                    >
                      ${report.revenue}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Target</span>
                    <span className="text-gray-900">
                      ${report.revenueTarget}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Covers</span>
                    <span className="text-gray-900">{report.coversServed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Avg Spend</span>
                    <span className="text-gray-900">
                      ${report.avgSpendPerCover?.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Voids</span>
                    <span className="text-red-500">${report.voids}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Comps</span>
                    <span className="text-red-500">${report.comps}</span>
                  </div>
                  {report.incidentNotes && (
                    <div className="mt-2 pt-2 border-t">
                      <span className="text-gray-500 text-sm">Notes: </span>
                      <span className="text-gray-700 text-sm">
                        {report.incidentNotes}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
