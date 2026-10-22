"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";

// API URL from environment variables — never hardcoded
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function DashboardPage() {
  const router = useRouter();

  // loading — prevents rendering before auth check completes
  const [loading, setLoading] = useState(true);
  // reports — array of location report objects from the API
  const [reports, setReports] = useState<any[]>([]);
  // date — currently selected date for the dashboard view, defaults to today
  // Arrow function used to avoid Next.js prerender warning with new Date()
  const [date, setDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );

  const fetchReports = async () => {
    try {
      // Get the current Cognito session to extract the JWT token
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      console.log("Session:", session);
      console.log("Token:", token);
      console.log("API URL:", API_URL);

      // Pass JWT in Authorization header — API Gateway verifies against Cognito
      // before forwarding to Lambda
      const response = await fetch(`${API_URL}/reports?date=${date}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      setReports(data.reports || []);
    } catch (error) {
      console.error("Error fetching reports:", error);
    } finally {
      // Always stop loading whether fetch succeeded or failed
      setLoading(false);
    }
  };

  useEffect(() => {
    // Route guard — redirect to login if not authenticated
    // Also fetches reports if user is logged in
    getCurrentUser()
      .then(() => fetchReports())
      .catch(() => router.push("/"));
  }, [router]);

  // Show loading state while auth check and initial fetch are in progress
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto py-6 px-4">
        {reports.length === 0 ? (
          <div className="text-center text-gray-500 mt-20">
            No reports found for {date}
          </div>
        ) : (
          // Responsive grid — 1 col mobile, 2 tablet, 3 desktop
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
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
