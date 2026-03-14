"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Stethoscope, User, Pill, FlaskConical, ArrowRight, Loader2, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (userId, roleUrl) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("http://localhost:8000/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId })
      });

      if (!res.ok) throw new Error("Authentication failed");

      const data = await res.json();

      // Store mock session if needed
      localStorage.setItem("clinical_session", JSON.stringify(data.user));

      // Navigate to the correct role dashboard
      router.push(`/${roleUrl}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 sm:p-12 selection:bg-blue-100">
      <div className="w-full max-w-lg space-y-10 animate-in fade-in zoom-in-95 duration-500">

        {/* Header Section */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center p-3 bg-blue-100/50 text-blue-600 rounded-2xl mb-2 shadow-sm">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">DataHealth AI</h2>
          <p className="text-gray-500 font-medium">Select your role to access the clinical system</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm border border-red-100 text-center font-medium shadow-sm animate-in slide-in-from-top-2">
            {error}
          </div>
        )}

        {/* Roles Grid */}
        <div className="grid gap-4 sm:grid-cols-1">
          {/* Doctor Card */}
          <button
            onClick={() => handleLogin("DOC-001", "doctor")}
            disabled={loading}
            className="group flex items-center justify-between w-full p-5 rounded-2xl bg-white border border-slate-200 hover:border-blue-300 shadow-sm hover:shadow-md transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none text-left"
          >
            <div className="flex items-center gap-5">
              <div className="p-3.5 bg-blue-50 text-blue-600 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <Stethoscope className="w-6 h-6" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-lg">Doctor Portal</p>
                <p className="text-sm text-gray-500 mt-0.5">Dual-chat & Consultation</p>
              </div>
            </div>
            {loading ? <Loader2 className="w-5 h-5 text-gray-400 animate-spin" /> : <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all duration-300" />}
          </button>

          {/* Patient Card */}
          <button
            onClick={() => handleLogin("PAT-992", "patient")}
            disabled={loading}
            className="group flex items-center justify-between w-full p-5 rounded-2xl bg-white border border-slate-200 hover:border-emerald-300 shadow-sm hover:shadow-md transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none text-left"
          >
            <div className="flex items-center gap-5">
              <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <User className="w-6 h-6" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-lg">Patient Portal</p>
                <p className="text-sm text-gray-500 mt-0.5">Timeline & Prescriptions</p>
              </div>
            </div>
            {loading ? <Loader2 className="w-5 h-5 text-gray-400 animate-spin" /> : <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-emerald-500 transform group-hover:translate-x-1 transition-all duration-300" />}
          </button>

          {/* Pharmacy Card */}
          <button
            onClick={() => handleLogin("PHARM-01", "pharmacy")}
            disabled={loading}
            className="group flex items-center justify-between w-full p-5 rounded-2xl bg-white border border-slate-200 hover:border-purple-300 shadow-sm hover:shadow-md transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none text-left"
          >
            <div className="flex items-center gap-5">
              <div className="p-3.5 bg-purple-50 text-purple-600 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <Pill className="w-6 h-6" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-lg">Pharmacy Portal</p>
                <p className="text-sm text-gray-500 mt-0.5">Dispense & Queue</p>
              </div>
            </div>
            {loading ? <Loader2 className="w-5 h-5 text-gray-400 animate-spin" /> : <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-purple-500 transform group-hover:translate-x-1 transition-all duration-300" />}
          </button>

          {/* Laboratory Card */}
          <button
            onClick={() => handleLogin("LAB-01", "laboratory")}
            disabled={loading}
            className="group flex items-center justify-between w-full p-5 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 shadow-sm hover:shadow-md transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none text-left"
          >
            <div className="flex items-center gap-5">
              <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <FlaskConical className="w-6 h-6" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-lg">Laboratory Portal</p>
                <p className="text-sm text-gray-500 mt-0.5">Upload & Analyze Reports</p>
              </div>
            </div>
            {loading ? <Loader2 className="w-5 h-5 text-gray-400 animate-spin" /> : <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 transform group-hover:translate-x-1 transition-all duration-300" />}
          </button>
        </div>

        <p className="text-center text-xs text-slate-400 font-medium pt-4">
          Secure Multi-Tenant Healthcare Environment
        </p>

      </div>
    </div>
  );
}
