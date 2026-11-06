"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import type { Report } from "../../types";
import SignOutButton from "../SignOutButton";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type FieldName =
  | "revenue"
  | "revenueTarget"
  | "coversServed"
  | "voids"
  | "comps"
  | "incidentNotes";
type FormState = Record<FieldName, string>;
type FormErrors = Partial<Record<FieldName, string>>;

const EMPTY_FORM: FormState = {
  revenue: "",
  revenueTarget: "",
  coversServed: "",
  voids: "",
  comps: "",
  incidentNotes: "",
};

// Numeric inputs, rendered from this list
const FIELDS: {
  name: Exclude<FieldName, "incidentNotes">;
  label: string;
  step: string;
  placeholder: string;
}[] = [
  {
    name: "revenue",
    label: "Revenue ($)",
    step: "0.01",
    placeholder: "e.g. 5000",
  },
  {
    name: "revenueTarget",
    label: "Revenue Target ($)",
    step: "0.01",
    placeholder: "e.g. 5000",
  },
  {
    name: "coversServed",
    label: "Covers Served",
    step: "1",
    placeholder: "e.g. 120",
  },
  { name: "voids", label: "Voids ($)", step: "0.01", placeholder: "e.g. 150" },
  { name: "comps", label: "Comps ($)", step: "0.01", placeholder: "e.g. 75" },
];

// One set of rules, used on blur and on submit. The server re-checks all of them.
const validate = (name: FieldName, form: FormState): string | undefined => {
  const raw = form[name];
  if (name === "incidentNotes")
    return raw.length > 500 ? "Must be under 500 characters" : undefined;
  if (raw === "") return "Required";
  const n = Number(raw);
  if (Number.isNaN(n) || n < 0) return "Must be a positive number";
  if (name === "revenueTarget" && n <= 0) return "Must be greater than 0";
  if (name === "coversServed" && (!Number.isInteger(n) || n <= 0))
    return "Must be a whole number above 0";
  if (
    (name === "voids" || name === "comps") &&
    form.revenue !== "" &&
    n > Number(form.revenue)
  )
    return "Cannot exceed revenue";
  return undefined;
};

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
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const getToken = async () =>
    (await fetchAuthSession()).tokens?.idToken?.toString();

  // useCallback gives fetchReports a stable identity across renders, so it can be
  // listed as an effect dependency without the effect re-running every render.
  // The empty [] is safe: it only uses state setters (stable), module-level
  // API_URL, and fetchAuthSession.
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

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationId) return;

    const newErrors: FormErrors = {};
    (Object.keys(EMPTY_FORM) as FieldName[]).forEach((name) => {
      const err = validate(name, form);
      if (err) newErrors[name] = err;
    });
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_URL}/reports`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locationId, // the server overrides this with the token's value for managers
          reportDate: localDate(),
          revenue: Number(form.revenue),
          revenueTarget: Number(form.revenueTarget),
          coversServed: Number(form.coversServed),
          voids: Number(form.voids),
          comps: Number(form.comps),
          incidentNotes: form.incidentNotes,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage({
          type: "error",
          text: data.message || "Failed to submit report",
        });
        return;
      }
      setForm(EMPTY_FORM);
      setErrors({});
      setShowForm(false);
      setMessage({ type: "success", text: "Report submitted successfully!" });
      await fetchReports(locationId);
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const onBlur = (name: FieldName) =>
    setErrors((prev) => ({ ...prev, [name]: validate(name, form) }));

  if (status === "loading")
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );

  if (status === "denied")
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600 text-center px-4">
        Your account isn&apos;t assigned to a location yet. Ask the owner to set
        it up.
      </div>
    );

  const inputClass = (name: FieldName) =>
    `w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      errors[name] ? "border-red-500" : "border-gray-300"
    }`;

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
                setMessage(null);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              {showForm ? "Cancel" : "Submit Report"}
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

        {showForm && (
          <form
            onSubmit={submitReport}
            noValidate
            className="bg-white rounded-lg shadow p-6 mb-6"
          >
            <h2 className="text-xl font-semibold mb-4">
              Tonight&apos;s Report: {today}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {FIELDS.map((f) => (
                <div key={f.name}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {f.label} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step={f.step}
                    value={form[f.name]}
                    onChange={(e) =>
                      setForm({ ...form, [f.name]: e.target.value })
                    }
                    onBlur={() => onBlur(f.name)}
                    className={inputClass(f.name)}
                    placeholder={f.placeholder}
                  />
                  {errors[f.name] && (
                    <p className="text-red-500 text-xs mt-1">
                      {errors[f.name]}
                    </p>
                  )}
                </div>
              ))}

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
                  onBlur={() => onBlur("incidentNotes")}
                  className={inputClass("incidentNotes")}
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
