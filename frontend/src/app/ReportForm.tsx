"use client";

import { useState } from "react";
import type { Report } from "../types";

type FieldName =
  | "revenue"
  | "revenueTarget"
  | "coversServed"
  | "voids"
  | "comps"
  | "incidentNotes";
export type FormState = Record<FieldName, string>;
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

// Convert an existing report into form strings, for editing
export const formFromReport = (r: Report): FormState => ({
  revenue: String(r.revenue),
  revenueTarget: String(r.revenueTarget),
  coversServed: String(r.coversServed),
  voids: String(r.voids),
  comps: String(r.comps),
  incidentNotes: r.incidentNotes ?? "",
});

interface ReportFormProps {
  title: string;
  submitLabel: string;
  initialValues?: FormState;
  submitting: boolean;
  // Receives validated numbers. The parent decides POST vs PUT.
  onSubmit: (values: {
    revenue: number;
    revenueTarget: number;
    coversServed: number;
    voids: number;
    comps: number;
    incidentNotes: string;
  }) => void;
}

export default function ReportForm({
  title,
  submitLabel,
  initialValues = EMPTY_FORM,
  submitting,
  onSubmit,
}: ReportFormProps) {
  const [form, setForm] = useState<FormState>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: FormErrors = {};
    (Object.keys(EMPTY_FORM) as FieldName[]).forEach((name) => {
      const err = validate(name, form);
      if (err) newErrors[name] = err;
    });
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    onSubmit({
      revenue: Number(form.revenue),
      revenueTarget: Number(form.revenueTarget),
      coversServed: Number(form.coversServed),
      voids: Number(form.voids),
      comps: Number(form.comps),
      incidentNotes: form.incidentNotes,
    });
  };

  const onBlur = (name: FieldName) =>
    setErrors((prev) => ({ ...prev, [name]: validate(name, form) }));

  const inputClass = (name: FieldName) =>
    `w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      errors[name] ? "border-red-500" : "border-gray-300"
    }`;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="bg-white rounded-lg shadow p-6 mb-6"
    >
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
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
              onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
              onBlur={() => onBlur(f.name)}
              className={inputClass(f.name)}
              placeholder={f.placeholder}
            />
            {errors[f.name] && (
              <p className="text-red-500 text-xs mt-1">{errors[f.name]}</p>
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
              <p className="text-red-500 text-xs">{errors.incidentNotes}</p>
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
          {submitting ? "Saving..." : submitLabel}
        </button>
        <p className="text-xs text-gray-400">
          <span className="text-red-500">*</span> Required fields
        </p>
      </div>
    </form>
  );
}
