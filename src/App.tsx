import { Suspense, lazy, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { useApp, watchSystemTheme } from "./store/useApp";
import { useWorkout } from "./store/useWorkout";
import { BottomNav } from "./components/nav/BottomNav";
import { Toaster } from "./components/ui/Toaster";
import { Button, Skeleton } from "./components/ui/primitives";
import { IconAlert, IconOffline } from "./components/ui/Icon";
import { UpdatePrompt } from "./components/layout/UpdatePrompt";
import { CelebrationLayer } from "./components/workout/CelebrationLayer";
import { AuthGate } from "./components/auth/AuthGate";
import { SyncBanner } from "./components/layout/SyncBanner";
import { dismissBootMark } from "./lib/bootmark";
import { BootFailure, useBootWatchdog } from "./components/layout/BootFailure";
import { getDbStatus } from "./lib/db/database";
import Home from "./routes/Home";
import WorkoutStart from "./routes/WorkoutStart";
import WorkoutActive from "./routes/WorkoutActive";

const Routines = lazy(() => import("./routes/Routines"));
const RoutineEditor = lazy(() => import("./routes/RoutineEditor"));
const Library = lazy(() => import("./routes/Library"));
const ExerciseDetail = lazy(() => import("./routes/ExerciseDetail"));
const WorkoutSummary = lazy(() => import("./routes/WorkoutSummary"));
const Progress = lazy(() => import("./routes/Progress"));
const ExerciseProgress = lazy(() => import("./routes/ExerciseProgress"));
const History = lazy(() => import("./routes/History"));
const SessionDetail = lazy(() => import("./routes/SessionDetail"));
const CalendarPage = lazy(() => import("./routes/CalendarPage"));
const Body = lazy(() => import("./routes/Body"));
const Stats = lazy(() => import("./routes/Stats"));
const PRs = lazy(() => import("./routes/PRs"));
const Milestones = lazy(() => import("./routes/Milestones"));
const Settings = lazy(() => import("./routes/Settings"));
const SearchPage = lazy(() => import("./routes/SearchPage"));
const More = lazy(() => import("./routes/More"));
const Attributions = lazy(() => import("./routes/Attributions"));
const Profile = lazy(() => import("./routes/Profile"));
const EmailVerified = lazy(() => import("./routes/auth/EmailVerified"));

function Fallback() {
  return (
    <div className="mx-auto w-full max-w-lg space-y-3 px-4 pt-20">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/**
 * Deliberately a pixel-for-pixel copy of the #boot-mark block in index.html:
 * same tile, same size, same gap, same label. That element is still fading out
 * while this one fades in, and two marks at different sizes or positions read
 * as a stutter. Matching them makes the handover invisible.
 *
 * If you change one, change the other.
 */
function BootScreen({ slow }: { slow?: boolean } = {}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-[18px] bg-bg">
      <div className="flex h-[78px] w-[78px] items-center justify-center rounded-[23px] bg-brand shadow-glow">
        <svg viewBox="0 0 24 24" width="38" height="38" aria-hidden="true">
          <path
            d="M14.2 1.6 3.9 12.1h4.5L7.8 22.4 18.1 11.9h-4.5Z"
            className="fill-brand-ink"
          />
        </svg>
      </div>
      <p className="text-[11px] font-bold leading-none tracking-[1.9px] text-faint">
        TRAINING OS
      </p>
      {/* A boot that is still going after a few seconds must LOOK different
          from one that just started. This screen is otherwise a pixel copy of
          the splash in index.html — which is what made a hang indistinguishable
          from loading, in production, with no console error. */}
      {slow && (
        <p className="mt-2 max-w-[16rem] text-center text-caption text-faint">
          Esto está tardando más de lo normal…
        </p>
      )}
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  const t = useApp((s) => s.t);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
      <IconAlert size={32} className="text-down" />
      <h1 className="text-lg font-bold">{t("status.dbError")}</h1>
      <p className="max-w-sm text-sm leading-relaxed text-muted">
        {t("status.dbErrorBody")}
      </p>
      <pre className="max-w-full overflow-x-auto rounded-lg border border-line bg-surface px-3 py-2 text-left text-caption text-faint">
        {message}
      </pre>
      <Button variant="primary" onClick={() => location.reload()}>
        {t("common.retry")}
      </Button>
    </div>
  );
}

function OfflineBanner() {
  const online = useApp((s) => s.online);
  const t = useApp((s) => s.t);
  if (online) return null;
  return (
    <div
      className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-warn/15 px-3 py-1.5 text-xs font-semibold text-warn"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.375rem)" }}
    >
      <IconOffline size={14} />
      {t("status.offline")} · {t("status.offlineBody")}
    </div>
  );
}

export function App() {
  const phase = useApp((s) => s.phase);
  const error = useApp((s) => s.error);
  const init = useApp((s) => s.init);
  const setOnline = useApp((s) => s.setOnline);
  const loadSession = useWorkout((s) => s.load);
  const hasSession = useWorkout((s) => !!s.session);

  // Two thresholds: one to say something is slow, one to give up and offer a
  // way out. Neither of them touches data.
  const bootSlow = useBootWatchdog(phase === "booting", 3500);
  const bootStalled = useBootWatchdog(phase === "booting", 12_000);

  useEffect(() => {
    void init().then(() => loadSession());
    const off = watchSystemTheme();
    const on = () => setOnline(true);
    const offl = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", offl);
    return () => {
      off();
      window.removeEventListener("online", on);
      window.removeEventListener("offline", offl);
    };
  }, [init, loadSession, setOnline]);

  // Boot has a hard ceiling. Before this, a database that never opened — the
  // production failure — left the app on a logo forever with no error at all.
  if (phase === "booting") {
    if (bootStalled) {
      dismissBootMark();
      const { status, lastError } = getDbStatus();
      return (
        <BootFailure
          code={status === "blocked" ? "BLOCKED_UPGRADE" : "BOOT_TIMEOUT"}
          detail={lastError}
          onRetry={() => void init()}
        />
      );
    }
    return <BootScreen slow={bootSlow} />;
  }

  // The database failed to open, so the auth gate below will never render and
  // never retire the splash. This screen has to do it itself.
  if (phase === "error") {
    dismissBootMark();
    const { status, lastError } = getDbStatus();
    // A blocked upgrade is a different tab in the way, not a broken database,
    // and it has its own instruction.
    if (status === "blocked" || (error ?? "").includes("BLOCKED")) {
      return (
        <BootFailure
          code="BLOCKED_UPGRADE"
          detail={lastError}
          onRetry={() => void init()}
        />
      );
    }
    return <ErrorScreen message={error ?? "unknown"} />;
  }

  // Outside the auth gate. A verification link is opened in whatever browser
  // the mail app hands over — usually one with no session — and answering a
  // click on "verify my email" with a sign-up screen reads as a failure.
  if (window.location.pathname === "/auth/verificado") {
    // This branch returns before the auth gate, which is what normally retires
    // the splash — so without this the confirmation page sits behind it until
    // the safety timeout fires.
    dismissBootMark();
    return (
      <Suspense fallback={<BootScreen />}>
        <EmailVerified />
      </Suspense>
    );
  }

  return (
    <>
      {/* Outside the auth gate on purpose.
          It lived inside, which meant the gate had to be open before it
          mounted — so the service worker only ever registered for a user who
          was signed in and past the welcome screen. A signed-out user, or one
          stuck at sign-in, had no service worker at all and therefore no
          offline app and no update channel. Registration is not an
          account-level concern. */}
      <UpdatePrompt />
      <AuthGate>
        <ScrollToTop />
        <OfflineBanner />
        <SyncBanner />
        <Suspense fallback={<Fallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/routines" element={<Routines />} />
            <Route path="/routines/:id" element={<RoutineEditor />} />
            <Route path="/library" element={<Library />} />
            <Route path="/library/:id" element={<ExerciseDetail />} />
            <Route path="/workout" element={<WorkoutStart />} />
            <Route path="/workout/active" element={<WorkoutActive />} />
            <Route path="/workout/summary" element={<WorkoutSummary />} />
            <Route path="/progress" element={<Progress />} />
            <Route
              path="/progress/:exerciseId"
              element={<ExerciseProgress />}
            />
            <Route path="/history" element={<History />} />
            <Route path="/history/:id" element={<SessionDetail />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/body" element={<Body />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/prs" element={<PRs />} />
            <Route path="/milestones" element={<Milestones />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/more" element={<More />} />
            <Route path="/attributions" element={<Attributions />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </Suspense>
        <BottomNav hasActiveSession={hasSession} />
        <Toaster />
        <CelebrationLayer />
      </AuthGate>
    </>
  );
}
