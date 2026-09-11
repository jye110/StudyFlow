import { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard,
  BookOpen,
  ListTodo,
  CalendarDays,
  CalendarCheck2,
  ChartNoAxesCombined,
  LogOut,
  Plus,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Pencil,
  Trash2,
  Search,
  Menu,
  X,
  Check,
} from "lucide-react";
import { api, bootstrap } from "./api";
import {
  Logo,
  Field,
  ErrorMessage,
  Empty,
  Status,
  formatDate,
  formatTime,
  formatMinutes,
} from "./components";
import { Editor, ConfirmDelete, AIPanel } from "./forms";
import { Schedule } from "./Schedule";
import { ChangePassword } from "./ChangePassword";
import { StudyHistory } from "./StudyHistory";
import { SessionCheckIns } from "./SessionCheckIns";
import { assignmentStudyTotals } from "./assignment-study-totals";
import { useCurrentTime } from "./session-status";

const navigation = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["courses", "Courses", BookOpen],
  ["assignments", "Assignments", ListTodo],
  ["schedule", "Schedule", CalendarDays],
  ["progress", "Progress", ChartNoAxesCombined],
];
const readRoute = () =>
  navigation.some(([key]) => key === location.hash.slice(1))
    ? location.hash.slice(1)
    : "dashboard";

function Auth({ onAuth }) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(null),
    [values, setValues] = useState({ name: "", email: "", password: "" });
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await bootstrap();
      const data = await api(`/auth/${register ? "register" : "login"}`, {
        method: "POST",
        body: register
          ? values
          : { email: values.email, password: values.password },
      });
      location.hash = "dashboard";
      onAuth(data.user);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <Logo />
        <div className="auth-message">
          <span className="eyebrow">A LITTLE STRUCTURE. MORE HEADSPACE.</span>
          <h1>
            Make room
            <br />
            for your best work.
          </h1>
          <p>
            One place for your coursework, a realistic study plan, and the
            progress you make along the way.
          </p>
          <div className="auth-preview">
            <div>
              <CalendarCheck2 />
              <strong>Your next study session</strong>
              <span>30 min</span>
            </div>
            <p>One assignment. A few focused steps.</p>
            <div className="preview-line">
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
        </div>
        <span className="auth-foot">StudyFlow · Group 5</span>
      </section>
      <section className="auth-form">
        <div className="auth-mobile-brand">
          <Logo />
        </div>
        <div className="auth-form-inner">
          <span className="eyebrow">YOUR STUDY SPACE</span>
          <h2>{register ? "Start a fresh chapter." : "Welcome back."}</h2>
          <p className="muted">
            {register
              ? "Create your account and make a plan that works for you."
              : "Sign in to pick up where you left off."}
          </p>
          <form onSubmit={submit} noValidate>
            <ErrorMessage error={error} />
            {register && (
              <Field
                label="Your name"
                name="name"
                autoComplete="name"
                value={values.name}
                error={error?.fields?.name}
                onChange={(e) => setValues({ ...values, name: e.target.value })}
              />
            )}
            <Field
              label="Email address"
              name="email"
              type="email"
              autoComplete="email"
              value={values.email}
              error={error?.fields?.email}
              onChange={(e) => setValues({ ...values, email: e.target.value })}
            />
            <Field
              label="Password"
              name="password"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              value={values.password}
              error={error?.fields?.password}
              hint={register ? "Use 10–128 characters." : undefined}
              onChange={(e) =>
                setValues({ ...values, password: e.target.value })
              }
            />
            <button className="button primary full" disabled={busy}>
              {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-switch">
            {register ? "Already have an account?" : "New to StudyFlow?"}{" "}
            <button
              className="text-button"
              onClick={() => {
                setRegister(!register);
                setError(null);
              }}
            >
              {register ? "Sign in" : "Create an account"}
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}

function AssignmentRow({
  assignment: a,
  onEdit,
  onAI,
  onComplete,
  onDelete,
  compact = false,
  studyTotals,
}) {
  return (
    <div className={`assignment-row ${compact ? "compact" : ""}`}>
      <button
        className={`complete-button ${a.status === "Completed" ? "checked" : ""}`}
        title={
          a.status === "Completed" ? "Reopen assignment" : "Complete assignment"
        }
        aria-label={`${a.status === "Completed" ? "Reopen" : "Complete"} ${a.title}`}
        onClick={() => onComplete(a)}
      >
        {a.status === "Completed" && <Check size={15} />}
      </button>
      <div className="assignment-info">
        <button className="title-button" onClick={() => onEdit(a)}>
          {a.title}
        </button>
        <div className="assignment-meta">
          <span className="course-dot" style={{ background: a.course.color }} />
          <span>{a.course.code || a.course.name}</span>
          <span className="meta-divider">·</span>
          <span>
            {formatDate(a.due_at)}
            {!compact && `, ${formatTime(a.due_at)}`}
          </span>
          <span className="meta-divider">·</span>
          <span>{compact && studyTotals
            ? `${formatMinutes(studyTotals.remaining)} remaining`
            : `${formatMinutes(a.estimated_minutes)} estimated`}</span>
        </div>
        {studyTotals && !compact && (
          <dl className="assignment-study-totals" aria-label={`Study time for ${a.title}`}>
            <div className="study-total-remaining">
              <dt>Remaining study</dt>
              <dd>{formatMinutes(studyTotals.remaining)}</dd>
            </div>
            <div className="study-total-unscheduled">
              <dt>Not scheduled</dt>
              <dd>{formatMinutes(studyTotals.unscheduled)}</dd>
            </div>
            <div className="study-total-awaiting">
              <dt>Awaiting confirmation</dt>
              <dd>{formatMinutes(studyTotals.awaiting)}</dd>
            </div>
          </dl>
        )}
        {studyTotals?.remaining === 0 && a.status !== "Completed" && (
          <div className="assignment-completion-prompt">
            <span>Study time reached · Confirm completion</span>
            <button type="button" onClick={() => onComplete(a)}>
              Mark complete
            </button>
          </div>
        )}
      </div>
      <div className="row-state">
        <span className={`priority ${a.priority.toLowerCase()}`}>
          {a.priority}
        </span>
        <Status value={a.status} overdue={a.overdue} />
      </div>
      {!compact && (
        <div className="row-actions">
          <button
            className="icon-button"
            title="Task breakdown"
            aria-label={`Task breakdown for ${a.title}`}
            onClick={() => onAI(a)}
          >
            <Sparkles size={17} />
          </button>
          <button
            className="icon-button"
            title="Edit assignment"
            aria-label={`Edit ${a.title}`}
            onClick={() => onEdit(a)}
          >
            <Pencil size={16} />
          </button>
          <button
            className="icon-button destructive"
            title="Delete assignment"
            aria-label={`Delete ${a.title}`}
            onClick={() => onDelete(a)}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function Stats({ summary }) {
  const items = [
    [ListTodo, summary.total - summary.completed, "Open assignments", "blue"],
    [
      Clock,
      formatMinutes(summary.planned_minutes),
      "Planned study time",
      "purple",
    ],
    [CheckCircle2, summary.completed, "Completed assignments", "green"],
    [AlertCircle, summary.overdue_count, "Overdue assignments", "orange"],
  ];
  return (
    <div className="stats">
      {items.map(([Icon, value, label, color]) => (
        <section key={label} className="stat">
          <span className={`stat-icon ${color}`}>
            <Icon size={21} />
          </span>
          <div>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        </section>
      ))}
    </div>
  );
}

function Dashboard({ summary, schedule, rows, add, navigate }) {
  const attention = [...summary.overdue, ...summary.upcoming].slice(0, 5);
  const instant = useCurrentTime();
  const studyTotals = assignmentStudyTotals(attention, schedule, instant);
  const unscheduledMinutes = schedule.unallocated.reduce(
    (sum, assignment) => sum + assignment.minutes,
    0,
  );
  const percent = summary.total
    ? Math.round((summary.completed / summary.total) * 100)
    : 0;
  return (
    <>
      <Stats summary={summary} />
      <SessionCheckIns sessions={schedule.sessions} navigate={navigate} />
      <div className="dashboard-grid">
        <section className="panel next-work">
          <header className="panel-heading">
            <div>
              <h2>Up next</h2>
              <p>Keep your next deadline in sight.</p>
            </div>
            <button
              className="text-button"
              onClick={() => navigate("assignments")}
            >
              View all <ArrowRight size={15} />
            </button>
          </header>
          {attention.length ? (
            attention.map((a) => (
              <AssignmentRow key={a.id} assignment={a} studyTotals={studyTotals.get(a.id)} {...rows} compact />
            ))
          ) : (
            <Empty
              title="A clear starting point"
              text="Add your next assignment and we'll help you make time for it."
              action={add}
              actionLabel="Add assignment"
            />
          )}
        </section>
        <section className="focus-card">
          <div className="focus-top">
            <span className="eyebrow">MAKE TIME TO FOCUS</span>
            <CalendarDays size={22} />
          </div>
          <h2>
            A little planning.
            <br />A clearer week.
          </h2>
          <p>
            <strong>{formatMinutes(unscheduledMinutes)}</strong> of study time
            left to schedule.
          </p>
          <button className="button mint" onClick={() => navigate("schedule")}>
            Plan my study time <ArrowRight size={17} />
          </button>
          <div className="focus-foot">
            <span className="tiny-line" />
            Rule-based planning. You stay in control.
          </div>
        </section>
        <section className="panel">
          <header className="panel-heading">
            <div>
              <h2>On your schedule</h2>
              <p>Your next focused steps.</p>
            </div>
            <button
              className="text-button"
              onClick={() => navigate("schedule")}
            >
              Open schedule <ArrowRight size={15} />
            </button>
          </header>
          {summary.sessions.length ? (
            <div className="session-preview">
              {summary.sessions.slice(0, 3).map((s) => (
                <div className="preview-session" key={s.id}>
                  <div className="session-date">
                    <strong>{new Date(s.starts_at).getDate()}</strong>
                    <span>
                      {formatDate(s.starts_at, {
                        month: "short",
                        day: undefined,
                      })}
                    </span>
                  </div>
                  <span
                    className="session-color"
                    style={{ background: s.course.color }}
                  />
                  <div>
                    <h3>{s.assignment_title}</h3>
                    <p>
                      {formatTime(s.starts_at)} · {formatMinutes(s.minutes)} ·{" "}
                      {s.course.code || s.course.name}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Your schedule is ready for a plan"
              text="Add coursework, then generate your study sessions."
              icon={CalendarDays}
            />
          )}
        </section>
        <section className="panel progress-card">
          <header className="panel-heading">
            <h2>Your momentum</h2>
            <ChartNoAxesCombined size={19} />
          </header>
          <div
            className="donut"
            style={{ "--progress": `${percent}%` }}
            role="img"
            aria-label={`${percent}% of assignments completed`}
          >
            <div>
              <strong>{percent}%</strong>
              <span>complete</span>
            </div>
          </div>
          <p>
            <strong>
              {summary.completed} of {summary.total}
            </strong>{" "}
            assignments completed
          </p>
          <button className="text-button" onClick={() => navigate("progress")}>
            See your progress <ArrowRight size={15} />
          </button>
        </section>
      </div>
    </>
  );
}

function Courses({ courses, assignments, edit, remove, add, navigate }) {
  if (!courses.length)
    return (
      <section className="panel">
        <Empty
          title="Start with your courses"
          text="Give your assignments a home. Add your first course to get started."
          action={add}
          actionLabel="Add course"
        />
      </section>
    );
  return (
    <div className="course-grid">
      {courses.map((course) => {
        const work = assignments.filter((a) => a.course_id === course.id);
        const done = work.filter((a) => a.status === "Completed").length;
        return (
          <article
            className="panel course-card"
            key={course.id}
            style={{ "--course": course.color }}
          >
            <div className="course-card-top">
              <span className="course-book">
                <BookOpen size={24} />
              </span>
              <div className="row-actions">
                <button
                  className="icon-button"
                  aria-label={`Edit ${course.name}`}
                  onClick={() => edit(course)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button destructive"
                  aria-label={`Delete ${course.name}`}
                  onClick={() => remove(course)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <span className="eyebrow">{course.code || "COURSE"}</span>
            <h2>{course.name}</h2>
            <p className="muted">
              {work.length} assignments · {work.length - done} open
            </p>
            <div className="progress-track">
              <i
                style={{
                  width: `${work.length ? (done / work.length) * 100 : 0}%`,
                  background: course.color,
                }}
              />
            </div>
            <div className="course-card-bottom">
              <span>
                {done} of {work.length} complete
              </span>
              <button
                className="text-button"
                onClick={() => navigate(course.id)}
              >
                View assignments <ArrowRight size={14} />
              </button>
            </div>
          </article>
        );
      })}
      <button className="add-course-card" onClick={add}>
        <Plus size={27} />
        <strong>Add a course</strong>
        <span>Make space for your next subject.</span>
      </button>
    </div>
  );
}

function Assignments({
  assignments,
  schedule,
  courses,
  rows,
  add,
  courseFilter,
  setCourseFilter,
}) {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("All statuses");
  const instant = useCurrentTime();
  const studyTotals = assignmentStudyTotals(assignments, schedule, instant);
  const filtered = assignments.filter(
    (a) =>
      (!courseFilter || a.course_id === Number(courseFilter)) &&
      (status === "All statuses" ||
        (status === "Overdue" ? a.overdue : a.status === status)) &&
      `${a.title} ${a.course.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <section className="panel">
      <div className="filters">
        <div className="search-field">
          <label htmlFor="search">Search assignments</label>
          <div>
            <Search size={18} />
            <input
              id="search"
              value={search}
              placeholder="Find an assignment…"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <Field
          name="course-filter"
          label="Course"
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
        >
          <option value="">All courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code || c.name}
            </option>
          ))}
        </Field>
        <Field
          name="status-filter"
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {[
            "All statuses",
            "Not Started",
            "In Progress",
            "Completed",
            "Overdue",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Field>
      </div>
      <div className="list-caption">
        <span>
          {filtered.length}{" "}
          {filtered.length === 1 ? "assignment" : "assignments"}
        </span>
        <span>Sorted by due date</span>
      </div>
      {assignments.length > 0 && (
        <p className="assignment-study-hint">
          Remaining study is the estimate minus confirmed study; completed assignments show zero.
          Scheduled and unconfirmed sessions still count as remaining until confirmed completed.
        </p>
      )}
      {filtered.length ? (
        filtered.map((a) => (
          <AssignmentRow key={a.id} assignment={a} studyTotals={studyTotals.get(a.id)} {...rows} />
        ))
      ) : (
        <Empty
          title={
            assignments.length
              ? "No matching assignments"
              : "What are you working on?"
          }
          text={
            assignments.length
              ? "Try another search or filter."
              : "Add an assignment, its deadline, and an estimate of the time you need."
          }
          action={assignments.length ? undefined : add}
          actionLabel="Add assignment"
        />
      )}
    </section>
  );
}

function Progress({ summary, schedule }) {
  const percent = summary.total
    ? Math.round((summary.completed / summary.total) * 100)
    : 0;
  return (
    <>
      <Stats summary={summary} />
      <p className="confirmed-study-time">
        <strong>{formatMinutes(summary.confirmed_study_minutes || 0)}</strong> of study confirmed completed.
        Assignment completion is tracked separately below.
      </p>
      <StudyHistory sessions={schedule.sessions} />
      <div className="progress-layout">
        <section className="panel">
          <header className="panel-heading">
            <div>
              <h2>Progress by course</h2>
              <p>Every completed assignment moves you forward.</p>
            </div>
          </header>
          {summary.courses.length ? (
            <div className="course-progress-list">
              {summary.courses.map((c) => (
                <div key={c.id}>
                  <div className="course-progress-title">
                    <span
                      className="course-dot"
                      style={{ background: c.color }}
                    />
                    <strong>{c.name}</strong>
                    <span>
                      {c.completed}/{c.total}
                    </span>
                  </div>
                  <div className="progress-track">
                    <i
                      style={{
                        width: `${c.total ? (c.completed / c.total) * 100 : 0}%`,
                        background: c.color,
                      }}
                    />
                  </div>
                  <p>
                    {formatMinutes(c.completed_minutes)} of{" "}
                    {formatMinutes(c.estimated_minutes)} estimated work
                    completed
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Your progress starts here"
              text="Add a course and assignments to track your work."
            />
          )}
        </section>
        <section className="panel progress-card">
          <header className="panel-heading">
            <h2>Overall completion</h2>
          </header>
          <div
            className="donut large"
            style={{ "--progress": `${percent}%` }}
            role="img"
            aria-label={`${percent}% completed`}
          >
            <div>
              <strong>{percent}%</strong>
              <span>complete</span>
            </div>
          </div>
          <div className="progress-legend">
            <p>
              <i className="legend-complete" />
              Completed<strong>{summary.completed}</strong>
            </p>
            <p>
              <i className="legend-progress" />
              In progress<strong>{summary.in_progress}</strong>
            </p>
            <p>
              <i className="legend-pending" />
              Not started
              <strong>
                {summary.total - summary.completed - summary.in_progress}
              </strong>
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

export default function App() {
  const [narrow, setNarrow] = useState(
    () => window.matchMedia("(max-width:650px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width:650px)");
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [user, setUser] = useState(null),
    [initializing, setInitializing] = useState(true),
    [initialError, setInitialError] = useState(null);
  const [route, setRoute] = useState(readRoute),
    [data, setData] = useState(null),
    [error, setError] = useState(null);
  const [modal, setModal] = useState(null),
    [adjustment, setAdjustment] = useState(null),
    [toast, setToast] = useState(""),
    [mobileMenu, setMobileMenu] = useState(false),
    [courseFilter, setCourseFilter] = useState("");
  useEffect(() => {
    let active = true;
    bootstrap()
      .then((value) => {
        if (active) setUser(value);
      })
      .catch((e) => {
        if (active) setInitialError(e);
      })
      .finally(() => {
        if (active) setInitializing(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const handler = () => {
      setRoute(readRoute());
      setMobileMenu(false);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    const handler = () => {
      setUser(null);
      setData(null);
      setAdjustment(null);
      setModal(null);
    };
    window.addEventListener("session-expired", handler);
    return () => window.removeEventListener("session-expired", handler);
  }, []);
  const reload = useCallback(async () => {
    const [courses, assignments, schedule, summary] = await Promise.all(
      ["/courses", "/assignments", "/schedule", "/summary"].map((path) =>
        api(path),
      ),
    );
    setData({ courses, assignments, schedule, summary });
    setError(null);
  }, []);
  useEffect(() => {
    if (user) reload().catch(setError);
  }, [user, reload]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    document.title = `${navigation.find(([key]) => key === route)?.[1] || "Study planner"} · StudyFlow`;
  }, [route]);
  function navigate(destination) {
    location.hash = destination;
    setRoute(destination);
    setMobileMenu(false);
  }
  const edit = (kind, record = null) =>
    setModal({ type: "edit", kind, record });
  function addAssignment() {
    if (!data?.courses.length) {
      setToast("Add a course first, then add your assignment.");
      edit("course");
    } else edit("assignment");
  }
  async function saved(message, plan = null) {
    setAdjustment(plan);
    setModal(null);
    setToast(message);
    try {
      await reload();
    } catch (e) {
      setError(e);
    }
  }
  async function changeStatus(a) {
    try {
      await api(`/assignments/${a.id}`, {
        method: "PATCH",
        body: {
          status: a.status === "Completed" ? "Not Started" : "Completed",
        },
      });
      await saved(
        a.status === "Completed"
          ? "Assignment reopened. Regenerate your plan to include it."
          : "Assignment completed. Future sessions removed.",
      );
    } catch (e) {
      setError(e);
    }
  }
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST", body: {} });
      setUser(null);
      setAdjustment(null);
      setData(null);
      setModal(null);
    } catch (e) {
      setError(e);
    }
  }
  if (initializing)
    return (
      <div className="app-loading">
        <Logo />
        <p>Opening your study space…</p>
      </div>
    );
  if (initialError)
    return (
      <div className="app-loading">
        <Logo />
        <ErrorMessage error={initialError} />
        <button className="button" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  if (!user) return <Auth onAuth={setUser} />;
  const rows = {
    onEdit: (a) => edit("assignment", a),
    onAI: (a) => setModal({ type: "ai", record: a }),
    onComplete: changeStatus,
    onDelete: (a) =>
      setModal({ type: "delete", kind: "assignment", record: a }),
  };
  const title =
    route === "dashboard"
      ? `Let's make today count, ${user.name.split(" ")[0]}.`
      : navigation.find(([key]) => key === route)[1];
  const subtitles = {
    dashboard: "Your coursework, with a little more clarity.",
    courses: "A home for every subject you’re exploring.",
    assignments: "Know what’s due. Decide what’s next.",
    schedule: "Make a little space for focused work.",
    progress: "See how far you’ve come.",
  };
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      {mobileMenu && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside
        inert={narrow && !mobileMenu}
        className={`sidebar ${mobileMenu ? "open" : ""}`}
      >
        <Logo />
        <span className="nav-caption">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {navigation.map(([key, label, Icon]) => (
            <a
              href={`#${key}`}
              aria-label={label}
              onClick={() => setMobileMenu(false)}
              key={key}
              className={route === key ? "active" : ""}
              aria-current={route === key ? "page" : undefined}
            >
              <Icon size={20} />
              <span>{label}</span>
              {key === "assignments" && !!data?.summary.total && (
                <small>{data.summary.total - data.summary.completed}</small>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-icon">
              <BookOpen size={21} />
            </span>
            <strong>One step at a time.</strong>
            <p>Small study sessions add up.</p>
          </div>
          <div className="user-profile">
            <span className="avatar">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{user.name}</strong>
              <button className="change-password-link" onClick={() => { setMobileMenu(false); setModal({ type: "password" }); }}>
                Change password
              </button>
            </div>
            <button
              className="icon-button"
              onClick={logout}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={19} />
            </button>
          </div>
        </div>
      </aside>
      <div className={`workspace ${route === "schedule" ? "schedule-workspace" : ""}`}>
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={23} />
            </button>
            <span>My workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{navigation.find(([key]) => key === route)[1]}</strong>
          </div>
          <span className="topbar-date">
            <CalendarDays size={16} />
            {new Date().toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </header>
        <main id="main-content" tabIndex={-1}>
          <header className="page-heading">
            <div>
              <span className="eyebrow">
                {route === "dashboard"
                  ? "A FRESH PERSPECTIVE"
                  : "YOUR STUDY SPACE"}
              </span>
              <h1>{title}</h1>
              <p>{subtitles[route]}</p>
            </div>
            {route !== "schedule" && route !== "progress" && (
              <button
                className="button primary"
                disabled={!data}
                onClick={
                  route === "courses" ? () => edit("course") : addAssignment
                }
              >
                <Plus size={19} />
                {route === "courses" ? "Add course" : "Add assignment"}
              </button>
            )}
          </header>
          <ErrorMessage error={error} />
          {error && (
            <button className="button" onClick={() => reload().catch(setError)}>
              Reload data
            </button>
          )}
          {!data ? (
            <div className="empty">
              <p>Loading your workspace…</p>
            </div>
          ) : (
            <>
              {route === "dashboard" && (
                <Dashboard
                  summary={data.summary}
                  schedule={data.schedule}
                  rows={rows}
                  add={addAssignment}
                  navigate={navigate}
                />
              )}
              {route === "courses" && (
                <Courses
                  courses={data.courses}
                  assignments={data.assignments}
                  edit={(c) => edit("course", c)}
                  remove={(c) =>
                    setModal({ type: "delete", kind: "course", record: c })
                  }
                  add={() => edit("course")}
                  navigate={(id) => {
                    setCourseFilter(String(id));
                    navigate("assignments");
                  }}
                />
              )}
              {route === "assignments" && (
                <Assignments
                  assignments={data.assignments}
                  schedule={data.schedule}
                  courses={data.courses}
                  rows={rows}
                  add={addAssignment}
                  courseFilter={courseFilter}
                  setCourseFilter={setCourseFilter}
                />
              )}
              {route === "schedule" && (
                <Schedule
                  schedule={data.schedule}
                  edit={(s) => edit("session", s)}
                  adjustment={adjustment}
                  onGenerated={async () => {
                    await reload();
                    setAdjustment(null);
                  }}
                  notify={setToast}
                />
              )}
              {route === "progress" && <Progress summary={data.summary} schedule={data.schedule} />}
            </>
          )}
          <footer className="workspace-footer">
            <span>StudyFlow</span>
            <span>Less juggling. More learning.</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal?.type === "password" && (
        <ChangePassword onClose={() => setModal(null)} onSaved={() => {
          setModal(null);
          setToast("Password changed. Other devices have been signed out.");
        }} />
      )}
      {modal?.type === "edit" && (
        <Editor
          key={`${modal.kind}-${modal.record?.id || "new"}`}
          kind={modal.kind}
          record={modal.record}
          courses={data.courses}
          planSettings={data.schedule.settings}
          schedule={data.schedule}
          sessionAssignment={modal.kind === "session"
            ? data.assignments.find((assignment) => assignment.id === modal.record.assignment_id)
            : undefined}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}
      {modal?.type === "delete" && (
        <ConfirmDelete
          item={modal}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}
      {modal?.type === "ai" && (
        <AIPanel
          assignment={modal.record}
          onEdit={() => setModal({ type: "edit", kind: "assignment", record: modal.record })}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}
