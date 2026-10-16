"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<any[]>([]);
  const [date, setDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const fetchReports = async () => {
    try {
      const session = await fetchAuthSession();
      console.log("Session:", session);
      console.log("Token:", session.tokens?.idToken?.toString());
      console.log("API URL:", API_URL);

      const token = session.tokens?.idToken?.toString();

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
      setLoading(false);
    }
  };
  useEffect(() => {
    getCurrentUser()
      .then(() => fetchReports())
      .catch(() => router.push("/"));
  }, [router]);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Owner Dashboard</h1>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded px-3 py-2"
          />
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 px-4">
        {reports.length === 0 ? (
          <div className="text-center text-gray-500 mt-20">
            No reports found for {date}
          </div>
        ) : (
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
