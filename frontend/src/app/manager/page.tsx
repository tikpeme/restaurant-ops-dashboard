"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import type { Report } from "../../types";
import SignOutButton from "../SignOutButton";
import ReportForm, { formFromReport } from "../ReportForm";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Local calendar date. toISOString() is UTC, which is already "tomorrow" in the evening in Detroit.
const localDate = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .split("T")[0];
};

export default function ManagerPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready" | "denied">(
    "loading",
  );
  // Comes from the verified token (custom:locationId), never hardcoded
  const [locationId, setLocationId] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [today, setToday] = useState("");
  // null = form closed, "new" = creating, otherwise the report being edited
  const [formMode, setFormMode] = useState<null | "new" | Report>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  // Wall-clock time in seconds, refreshed whenever reports load.
  // Kept in state so render stays pure.
  const [nowSeconds, setNowSeconds] = useState(0);

  const getToken = async () =>
    (await fetchAuthSession()).tokens?.idToken?.toString();

  // Stable identity so it can be an effect dependency (see useCallback notes earlier)
  const fetchReports = useCallback(async (loc: string) => {
    try {
      const token = (await fetchAuthSession()).tokens?.idToken?.toString();
      const response = await fetch(`${API_URL}/reports/${loc}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Failed to load reports");
      setReports(data.reports || []);
      setNowSeconds(Math.floor(Date.now() / 1000));
    } catch (e) {
      setMessage({ type: "error", text: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        await getCurrentUser();
      } catch {
        router.push("/");
        return;
      }
      const claims = (await fetchAuthSession()).tokens?.idToken?.payload ?? {};
      const groups = (claims["cognito:groups"] as string[] | undefined) ?? [];
      const loc = claims["custom:locationId"] as string | undefined;

      // Owners and investors belong on the dashboard
      if (groups.includes("Owners") || groups.includes("Investors")) {
        router.push("/dashboard");
        return;
      }
      if (!groups.includes("Managers") || !loc) {
        setStatus("denied");
        return;
      }
      setLocationId(loc);
      setToday(localDate());
      await fetchReports(loc);
      setStatus("ready");
    };
    init();
  }, [router, fetchReports]);

  const isEditable = (r: Report) =>
    r.editableUntil !== undefined && r.editableUntil > nowSeconds;

  const handleSubmit = async (values: {
    revenue: number;
    revenueTarget: number;
    coversServed: number;
    voids: number;
    comps: number;
    incidentNotes: string;
  }) => {
    if (!locationId || !formMode) return;
    const editing = formMode !== "new";

    setSubmitting(true);
    setMessage(null);
    try {
      const url = editing
        ? `${API_URL}/reports/${locationId}/${formMode.reportDate}`
        : `${API_URL}/reports`;
      const response = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: {
          Authorization: `Bearer ${await getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          editing ? values : { ...values, locationId, reportDate: localDate() },
        ),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage({
          type: "error",
          text: data.message || "Failed to save report",
        });
        return;
      }
      setFormMode(null);
      setMessage({
        type: "success",
        text: editing
          ? "Report updated successfully!"
          : "Report submitted successfully!",
      });
      await fetchReports(locationId);
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading")
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );

  if (status === "denied")
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-600 text-center px-4">
        <p>
          Your account isn&apos;t assigned to a location yet. Ask the owner to
          set it up.
        </p>
        <SignOutButton />
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Manager Dashboard
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-600 font-medium">{locationId}</span>
            <button
              onClick={() => {
                setFormMode(formMode === null ? "new" : null);
                setMessage(null);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              {formMode === null ? "Submit Report" : "Cancel"}
            </button>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 px-4">
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {formMode !== null && (
          <ReportForm
            // key forces a fresh form (and fresh initial values) when switching reports
            key={formMode === "new" ? "new" : formMode.reportId}
            title={
              formMode === "new"
                ? `Tonight's Report: ${today}`
                : `Edit Report: ${formMode.reportDate}`
            }
            submitLabel={formMode === "new" ? "Submit Report" : "Save Changes"}
            initialValues={
              formMode === "new" ? undefined : formFromReport(formMode)
            }
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        )}

        {reports.length === 0 ? (
          <div className="text-center text-gray-500 mt-20">
            No reports found for {locationId}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reports.map((report) => (
              <div
                key={report.reportId}
                className="bg-white rounded-lg shadow p-6"
              >
                <div className="flex justify-between items-start">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {report.reportDate}
                  </h2>
                  {isEditable(report) && (
                    <button
                      onClick={() => {
                        setFormMode(report);
                        setMessage(null);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                  )}
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Revenue</span>
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
