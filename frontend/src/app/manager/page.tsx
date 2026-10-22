"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Validation rules for each field
interface FormErrors {
  revenue?: string;
  revenueTarget?: string;
  coversServed?: string;
  voids?: string;
  comps?: string;
  incidentNotes?: string;
}

export default function ManagerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<any[]>([]);
  // locationId hardcoded for now — will be read from Cognito token in production
  const [locationId] = useState<string>("location-1");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    revenue: "",
    revenueTarget: "",
    coversServed: "",
    voids: "",
    comps: "",
    incidentNotes: "",
  });
  // Field-level validation errors
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  // Success/error message after submission
  const [submitMessage, setSubmitMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Validates all fields and returns true if form is valid
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Revenue — required, must be positive number
    if (!form.revenue) {
      newErrors.revenue = "Revenue is required";
    } else if (isNaN(Number(form.revenue)) || Number(form.revenue) < 0) {
      newErrors.revenue = "Revenue must be a positive number";
    }

    // Revenue target — required, must be positive number
    if (!form.revenueTarget) {
      newErrors.revenueTarget = "Revenue target is required";
    } else if (
      isNaN(Number(form.revenueTarget)) ||
      Number(form.revenueTarget) <= 0
    ) {
      newErrors.revenueTarget = "Revenue target must be greater than 0";
    }

    // Covers served — required, must be whole number
    if (!form.coversServed) {
      newErrors.coversServed = "Covers served is required";
    } else if (
      !Number.isInteger(Number(form.coversServed)) ||
      Number(form.coversServed) < 0
    ) {
      newErrors.coversServed = "Covers served must be a whole number";
    }

    // Voids — required, cannot exceed revenue
    if (!form.voids) {
      newErrors.voids = "Voids amount is required";
    } else if (isNaN(Number(form.voids)) || Number(form.voids) < 0) {
      newErrors.voids = "Voids must be a positive number";
    } else if (Number(form.voids) > Number(form.revenue)) {
      newErrors.voids = "Voids cannot exceed total revenue";
    }

    // Comps — required, cannot exceed revenue
    if (!form.comps) {
      newErrors.comps = "Comps amount is required";
    } else if (isNaN(Number(form.comps)) || Number(form.comps) < 0) {
      newErrors.comps = "Comps must be a positive number";
    } else if (Number(form.comps) > Number(form.revenue)) {
      newErrors.comps = "Comps cannot exceed total revenue";
    }

    // Incident notes — optional but max 500 chars
    if (form.incidentNotes && form.incidentNotes.length > 500) {
      newErrors.incidentNotes = "Notes must be under 500 characters";
    }

    setErrors(newErrors);
    // Form is valid if no errors
    return Object.keys(newErrors).length === 0;
  };

  // Validate a single field on blur for immediate feedback
  const validateField = (name: string, value: string) => {
    const newErrors = { ...errors };

    switch (name) {
      case "revenue":
        if (!value) newErrors.revenue = "Revenue is required";
        else if (isNaN(Number(value)) || Number(value) < 0)
          newErrors.revenue = "Must be a positive number";
        else delete newErrors.revenue;
        break;
      case "revenueTarget":
        if (!value) newErrors.revenueTarget = "Revenue target is required";
        else if (isNaN(Number(value)) || Number(value) <= 0)
          newErrors.revenueTarget = "Must be greater than 0";
        else delete newErrors.revenueTarget;
        break;
      case "coversServed":
        if (!value) newErrors.coversServed = "Covers served is required";
        else if (!Number.isInteger(Number(value)) || Number(value) < 0)
          newErrors.coversServed = "Must be a whole number";
        else delete newErrors.coversServed;
        break;
      case "voids":
        if (!value) newErrors.voids = "Voids is required";
        else if (isNaN(Number(value)) || Number(value) < 0)
          newErrors.voids = "Must be a positive number";
        else delete newErrors.voids;
        break;
      case "comps":
        if (!value) newErrors.comps = "Comps is required";
        else if (isNaN(Number(value)) || Number(value) < 0)
          newErrors.comps = "Must be a positive number";
        else delete newErrors.comps;
        break;
      case "incidentNotes":
        if (value.length > 500)
          newErrors.incidentNotes = "Must be under 500 characters";
        else delete newErrors.incidentNotes;
        break;
    }

    setErrors(newErrors);
  };

  const fetchReports = async () => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      const response = await fetch(`${API_URL}/reports/${locationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      setReports(data.reports || []);
    } catch (error) {
      console.error("Error fetching reports:", error);
    } finally {
      setLoading(false);
    }
  };

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault();

    // Run full validation before submitting
    if (!validateForm()) return;

    setSubmitting(true);
    setSubmitMessage(null);

    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      const response = await fetch(`${API_URL}/reports`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locationId,
          reportDate: new Date().toISOString().split("T")[0],
          revenue: Number(form.revenue),
          revenueTarget: Number(form.revenueTarget),
          coversServed: Number(form.coversServed),
          voids: Number(form.voids),
          comps: Number(form.comps),
          incidentNotes: form.incidentNotes,
        }),
      });

      if (response.ok) {
        setForm({
          revenue: "",
          revenueTarget: "",
          coversServed: "",
          voids: "",
          comps: "",
          incidentNotes: "",
        });
        setErrors({});
        setShowForm(false);
        setSubmitMessage({
          type: "success",
          text: "Report submitted successfully!",
        });
        fetchReports();
      } else {
        const data = await response.json();
        setSubmitMessage({
          type: "error",
          text: data.message || "Failed to submit report",
        });
      }
    } catch (error) {
      setSubmitMessage({
        type: "error",
        text: "Network error — please try again",
      });
    } finally {
      setSubmitting(false);
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
          <h1 className="text-3xl font-bold text-gray-900">
            Manager Dashboard
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-600 font-medium">{locationId}</span>
            <button
              onClick={() => {
                setShowForm(!showForm);
                setErrors({});
                setSubmitMessage(null);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              {showForm ? "Cancel" : "Submit Report"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 px-4">
        {/* Success/error message after submission */}
        {submitMessage && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              submitMessage.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {submitMessage.text}
          </div>
        )}

        {/* Report submission form */}
        {showForm && (
          <form
            onSubmit={submitReport}
            className="bg-white rounded-lg shadow p-6 mb-6"
            noValidate
          >
            <h2 className="text-xl font-semibold mb-4">
              Tonight's Report — {new Date().toISOString().split("T")[0]}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Revenue */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Revenue ($) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.revenue}
                  onChange={(e) =>
                    setForm({ ...form, revenue: e.target.value })
                  }
                  onBlur={(e) => validateField("revenue", e.target.value)}
                  className={`w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.revenue ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="e.g. 5000"
                />
                {errors.revenue && (
                  <p className="text-red-500 text-xs mt-1">{errors.revenue}</p>
                )}
              </div>

              {/* Revenue Target */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Revenue Target ($) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.revenueTarget}
                  onChange={(e) =>
                    setForm({ ...form, revenueTarget: e.target.value })
                  }
                  onBlur={(e) => validateField("revenueTarget", e.target.value)}
                  className={`w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.revenueTarget ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="e.g. 5000"
                />
                {errors.revenueTarget && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.revenueTarget}
                  </p>
                )}
              </div>

              {/* Covers Served */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Covers Served <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.coversServed}
                  onChange={(e) =>
                    setForm({ ...form, coversServed: e.target.value })
                  }
                  onBlur={(e) => validateField("coversServed", e.target.value)}
                  className={`w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.coversServed ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="e.g. 120"
                />
                {errors.coversServed && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.coversServed}
                  </p>
                )}
              </div>

              {/* Voids */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Voids ($) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.voids}
                  onChange={(e) => setForm({ ...form, voids: e.target.value })}
                  onBlur={(e) => validateField("voids", e.target.value)}
                  className={`w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.voids ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="e.g. 150"
                />
                {errors.voids && (
                  <p className="text-red-500 text-xs mt-1">{errors.voids}</p>
                )}
              </div>

              {/* Comps */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Comps ($) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.comps}
                  onChange={(e) => setForm({ ...form, comps: e.target.value })}
                  onBlur={(e) => validateField("comps", e.target.value)}
                  className={`w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.comps ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="e.g. 75"
                />
                {errors.comps && (
                  <p className="text-red-500 text-xs mt-1">{errors.comps}</p>
                )}
              </div>

              {/* Incident Notes */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Incident Notes{" "}
                  <span className="text-gray-400 text-xs">(optional)</span>
                </label>
                <textarea
                  value={form.incidentNotes}
                  onChange={(e) =>
                    setForm({ ...form, incidentNotes: e.target.value })
                  }
                  onBlur={(e) => validateField("incidentNotes", e.target.value)}
                  className={`w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.incidentNotes ? "border-red-500" : "border-gray-300"
                  }`}
                  rows={3}
                  placeholder="Any incidents, staff issues, or notable events..."
                />
                <div className="flex justify-between mt-1">
                  {errors.incidentNotes ? (
                    <p className="text-red-500 text-xs">
                      {errors.incidentNotes}
                    </p>
                  ) : (
                    <span />
                  )}
                  {/* Character counter */}
                  <span
                    className={`text-xs ${
                      form.incidentNotes.length > 450
                        ? "text-red-500"
                        : "text-gray-400"
                    }`}
                  >
                    {form.incidentNotes.length}/500
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-4">
              <button
                type="submit"
                disabled={submitting}
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Submitting..." : "Submit Report"}
              </button>
              <p className="text-xs text-gray-400">
                <span className="text-red-500">*</span> Required fields
              </p>
            </div>
          </form>
        )}

        {/* Past reports for this location */}
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
                <h2 className="text-lg font-semibold text-gray-900">
                  {report.reportDate}
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
