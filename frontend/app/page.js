"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Stethoscope, User, Pill, FlaskConical, ArrowRight, Loader2 } from "lucide-react";

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
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white mb-2">VeriTrust Health</h2>
          <p className="text-neutral-400">Select your role to access the clinical system</p>
        </div>

        {error && (
          <div className="bg-red-900/50 text-red-400 p-3 rounded-lg text-sm border border-red-800 text-center">
            {error}
          </div>
        )}

        <div className="grid gap-4">
          <button
            onClick={() => handleLogin("DOC-001", "doctor")}
            disabled={loading}
            className="flex items-center justify-between w-full p-4 rounded-xl bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 hover:border-neutral-700 transition-all group disabled:opacity-50"
          >
            <div className="flex items-center gap-4 text-neutral-200">
              <div className="p-2 bg-blue-900/30 text-blue-400 rounded-lg">
                <Stethoscope className="w-6 h-6" />
              </div>
              <div className="text-left">
                <p className="font-semibold">Doctor Portal</p>
                <p className="text-xs text-neutral-500">Dual-chat & Consultation</p>
              </div>
            </div>
            {loading ? <Loader2 className="w-5 h-5 text-neutral-500 animate-spin" /> : <ArrowRight className="w-5 h-5 text-neutral-500 group-hover:text-neutral-300 transform group-hover:translate-x-1 transition-all" />}
          </button>

          <button
            onClick={() => handleLogin("PAT-992", "patient")}
            disabled={loading}
            className="flex items-center justify-between w-full p-4 rounded-xl bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 hover:border-neutral-700 transition-all group disabled:opacity-50"
          >
            <div className="flex items-center gap-4 text-neutral-200">
              <div className="p-2 bg-emerald-900/30 text-emerald-400 rounded-lg">
                <User className="w-6 h-6" />
              </div>
              <div className="text-left">
                <p className="font-semibold">Patient Portal</p>
                <p className="text-xs text-neutral-500">Timeline & Prescriptions</p>
              </div>
            </div>
            {loading ? <Loader2 className="w-5 h-5 text-neutral-500 animate-spin" /> : <ArrowRight className="w-5 h-5 text-neutral-500 group-hover:text-neutral-300 transform group-hover:translate-x-1 transition-all" />}
          </button>

          <button
            onClick={() => handleLogin("PHARM-01", "pharmacy")}
            disabled={loading}
            className="flex items-center justify-between w-full p-4 rounded-xl bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 hover:border-neutral-700 transition-all group disabled:opacity-50"
          >
            <div className="flex items-center gap-4 text-neutral-200">
              <div className="p-2 bg-purple-900/30 text-purple-400 rounded-lg">
                <Pill className="w-6 h-6" />
              </div>
              <div className="text-left">
                <p className="font-semibold">Pharmacy Portal</p>
                <p className="text-xs text-neutral-500">Dispense & Queue</p>
              </div>
            </div>
            {loading ? <Loader2 className="w-5 h-5 text-neutral-500 animate-spin" /> : <ArrowRight className="w-5 h-5 text-neutral-500 group-hover:text-neutral-300 transform group-hover:translate-x-1 transition-all" />}
          </button>

          <button
            onClick={() => handleLogin("LAB-01", "laboratory")}
            disabled={loading}
            className="flex items-center justify-between w-full p-4 rounded-xl bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 hover:border-neutral-700 transition-all group disabled:opacity-50"
          >
            <div className="flex items-center gap-4 text-neutral-200">
              <div className="p-2 bg-indigo-900/30 text-indigo-400 rounded-lg">
                <FlaskConical className="w-6 h-6" />
              </div>
              <div className="text-left">
                <p className="font-semibold">Laboratory Portal</p>
                <p className="text-xs text-neutral-500">Upload & Analyze Reports</p>
              </div>
            </div>
            {loading ? <Loader2 className="w-5 h-5 text-neutral-500 animate-spin" /> : <ArrowRight className="w-5 h-5 text-neutral-500 group-hover:text-neutral-300 transform group-hover:translate-x-1 transition-all" />}
          </button>
        </div>
      </div>
    </div>
  );
}