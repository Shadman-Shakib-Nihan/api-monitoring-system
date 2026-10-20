import { ActivityIcon } from "lucide-react";
import BackendStatus from "./components/BackendStatus";
import DashboardPage from "./pages/DashboardPage";

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600">
              <ActivityIcon className="h-5 w-5 text-white" />
            </span>
            <div>
              <h1 className="text-base font-semibold leading-tight text-slate-900">
                API Monitoring Dashboard
              </h1>
              <p className="text-xs text-slate-500">
                Intelligent alerting for monitored APIs
              </p>
            </div>
          </div>
          <BackendStatus />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <DashboardPage />
      </main>
    </div>
  );
}
