import React, { useEffect, useState, useCallback } from "react";
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  Clock,
  AlertCircle,
  Phone,
  Calendar,
  DollarSign,
  Plus,
  Trash2,
  Settings,
  Save,
  X,
  Edit2,
  Users,
  KeyRound,
  Eye,
  EyeOff,
  Search,
  Home,
  Package,
  Dumbbell,
  Apple,
  ChevronDown,
  ChevronUp,
  User,
  Download,
  FileSpreadsheet,
  List,
  UtensilsCrossed,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  appointmentsAPI,
  availabilityAPI,
  servicesAPI,
  adminServicesAPI,
  authAPI,
  settingsAPI,
  workoutAPI,
  exportAPI,
  purchasesAPI,
  paymentAPI,
} from "../services/api";
import { useSettings } from "../context/SettingsContext";
import { format } from "date-fns";
import "./AdminPage.css";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const CATS = [
  "Strength",
  "Cardio",
  "Flexibility",
  "Combat",
  "Wellness",
  "Nutrition",
  "Other",
];
const CAT_IMAGES = {
  Strength:
    "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=70",
  Cardio:
    "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&q=70",
  Flexibility:
    "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400&q=70",
  Combat:
    "https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=400&q=70",
  Wellness:
    "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&q=70",
  Nutrition:
    "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400&q=70",
  Other:
    "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400&q=70",
};
const EMPTY_SVC = {
  name: "",
  description: "",
  price: "",
  duration: "",
  category: "Strength",
  imageUrl: "",
  sections: [],
  trainingType: "pt",
  priceLive: "",
  priceOnline: "",
  isCustom: false,
};
const EMPTY_BUNDLE = {
  name: "",
  description: "",
  sessions: "",
  price: "",
  validDays: 30,
  serviceId: "",
};
const EMPTY_SECTION = { heading: "", items: [] };
const EMPTY_ITEM = { title: "", description: "" };
const STATUS_CFG = {
  pending: { label: "Pending", color: "#F59E0B", bg: "#FFFBEB" },
  confirmed: { label: "Confirmed", color: "#10B981", bg: "#ECFDF5" },
  rejected: { label: "Rejected", color: "#EF4444", bg: "#FEF2F2" },
  cancelled: { label: "Cancelled", color: "#6B7280", bg: "#F9FAFB" },
};

/* ── Helper: password input with show/hide ── */
function PwInput({ value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <div
      style={{ position: "relative", display: "flex", alignItems: "center" }}
    >
      <input
        type={show ? "text" : "password"}
        placeholder="Min 8 chars, 1 uppercase, 1 number"
        value={value}
        onChange={onChange}
        style={{
          width: "100%",
          padding: "11px 44px 11px 14px",
          borderRadius: "10px",
          border: "2px solid var(--secondary)",
          fontFamily: "var(--font-body)",
          fontSize: "0.9rem",
        }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        style={{
          position: "absolute",
          right: "12px",
          background: "none",
          color: "var(--grey)",
          display: "flex",
          padding: "4px",
        }}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

/* ── WorkoutPlanEditor ── */
function WorkoutPlanEditor({ plan, services, onSave, onCancel }) {
  const [form, setForm] = useState(
    plan
      ? {
          title: plan.title,
          description: plan.description,
          serviceId: plan.service?._id || plan.service || "",
          weeklyPlan: plan.weeklyPlan.length
            ? plan.weeklyPlan
            : defaultWeekly(),
        }
      : {
          title: "My Training Plan",
          description: "",
          serviceId: "",
          weeklyPlan: defaultWeekly(),
        },
  );
  const [saving, setSaving] = useState(false);

  function defaultWeekly() {
    return DAYS.map((d) => ({
      dayName: d,
      focus: "",
      exercises: [],
      notes: "",
    }));
  }

  const setField = (k) => (e) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));
  const setDay = (idx, k, v) =>
    setForm((p) => {
      const w = [...p.weeklyPlan];
      w[idx] = { ...w[idx], [k]: v };
      return { ...p, weeklyPlan: w };
    });
  const addExercise = (dayIdx) => {
    setForm((p) => {
      const w = [...p.weeklyPlan];
      w[dayIdx] = {
        ...w[dayIdx],
        exercises: [
          ...w[dayIdx].exercises,
          {
            name: "",
            sets: 3,
            reps: "10",
            weight: "",
            restSeconds: 60,
            notes: "",
            videoUrl: "",
            order: w[dayIdx].exercises.length,
          },
        ],
      };
      return { ...p, weeklyPlan: w };
    });
  };
  const setEx = (dayIdx, exIdx, k, v) => {
    setForm((p) => {
      const w = [...p.weeklyPlan];
      const exs = [...w[dayIdx].exercises];
      exs[exIdx] = { ...exs[exIdx], [k]: v };
      w[dayIdx] = { ...w[dayIdx], exercises: exs };
      return { ...p, weeklyPlan: w };
    });
  };
  const removeEx = (dayIdx, exIdx) => {
    setForm((p) => {
      const w = [...p.weeklyPlan];
      w[dayIdx] = {
        ...w[dayIdx],
        exercises: w[dayIdx].exercises.filter((_, i) => i !== exIdx),
      };
      return { ...p, weeklyPlan: w };
    });
  };

  const handleSave = async () => {
    if (!form.title) {
      toast.error("Plan needs a title");
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="plan-editor">
      <div className="pe-header">
        <h3>{plan ? "Edit Plan" : "New Workout Plan"}</h3>
        <button className="btn btn-outline btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div className="form-row-2">
        <div className="form-group">
          <label>Plan Title *</label>
          <input
            value={form.title}
            onChange={setField("title")}
            placeholder="e.g. 12-Week Strength Program"
          />
        </div>
        <div className="form-group">
          <label>Linked Service (optional)</label>
          <select value={form.serviceId} onChange={setField("serviceId")}>
            <option value="">-- All / General --</option>
            {services.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea
          value={form.description}
          onChange={setField("description")}
          rows={2}
          placeholder="Overview of this plan..."
        />
      </div>

      <h4 className="pe-section-title">📅 Weekly Schedule</h4>
      <div className="weekly-plan">
        {form.weeklyPlan.map((day, dIdx) => (
          <DayEditor
            key={dIdx}
            day={day}
            dayIdx={dIdx}
            onDayChange={setDay}
            onAddEx={addExercise}
            onSetEx={setEx}
            onRemoveEx={removeEx}
          />
        ))}
      </div>
      <button
        className="btn btn-primary"
        onClick={handleSave}
        disabled={saving}
        style={{ marginTop: "16px" }}
      >
        {saving ? (
          <>
            <div className="spinner" /> Saving...
          </>
        ) : (
          <>
            <Save size={15} /> Save Plan
          </>
        )}
      </button>
    </div>
  );
}

function DayEditor({ day, dayIdx, onDayChange, onAddEx, onSetEx, onRemoveEx }) {
  const [open, setOpen] = useState(dayIdx < 2);
  return (
    <div className="day-editor">
      <button className="day-toggle" onClick={() => setOpen((o) => !o)}>
        <div className="dt-left">
          <span className="dt-name">{day.dayName}</span>
          {day.focus && <span className="dt-focus">{day.focus}</span>}
          <span className="dt-count">
            {day.exercises.length} exercise
            {day.exercises.length !== 1 ? "s" : ""}
          </span>
        </div>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="day-body">
          <div className="form-row-2" style={{ marginBottom: "12px" }}>
            <div className="form-group">
              <label>Focus</label>
              <input
                value={day.focus}
                onChange={(e) => onDayChange(dayIdx, "focus", e.target.value)}
                placeholder="e.g. Chest & Triceps"
              />
            </div>
            <div className="form-group">
              <label>Day Notes</label>
              <input
                value={day.notes}
                onChange={(e) => onDayChange(dayIdx, "notes", e.target.value)}
                placeholder="e.g. Rest day — light stretching"
              />
            </div>
          </div>
          {day.exercises.map((ex, eIdx) => (
            <div key={eIdx} className="exercise-row">
              <div className="ex-num">{eIdx + 1}</div>
              <div className="ex-fields">
                <input
                  placeholder="Exercise name *"
                  value={ex.name}
                  onChange={(e) =>
                    onSetEx(dayIdx, eIdx, "name", e.target.value)
                  }
                  className="ex-name-input"
                />
                <div className="ex-row-3">
                  <div className="form-group">
                    <label>Sets</label>
                    <input
                      type="number"
                      min="1"
                      value={ex.sets}
                      onChange={(e) =>
                        onSetEx(dayIdx, eIdx, "sets", e.target.value)
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Reps</label>
                    <input
                      placeholder="10 or 8-12"
                      value={ex.reps}
                      onChange={(e) =>
                        onSetEx(dayIdx, eIdx, "reps", e.target.value)
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Weight</label>
                    <input
                      placeholder="50kg / BW"
                      value={ex.weight}
                      onChange={(e) =>
                        onSetEx(dayIdx, eIdx, "weight", e.target.value)
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Rest (s)</label>
                    <input
                      type="number"
                      value={ex.restSeconds}
                      onChange={(e) =>
                        onSetEx(dayIdx, eIdx, "restSeconds", e.target.value)
                      }
                    />
                  </div>
                </div>
                <input
                  placeholder="Notes (optional)"
                  value={ex.notes}
                  onChange={(e) =>
                    onSetEx(dayIdx, eIdx, "notes", e.target.value)
                  }
                  style={{ marginTop: "6px" }}
                />
                <input
                  placeholder="Video URL (optional)"
                  value={ex.videoUrl}
                  onChange={(e) =>
                    onSetEx(dayIdx, eIdx, "videoUrl", e.target.value)
                  }
                  style={{ marginTop: "6px" }}
                />
              </div>
              <button
                className="ex-remove-btn"
                onClick={() => onRemoveEx(dayIdx, eIdx)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button className="add-ex-btn" onClick={() => onAddEx(dayIdx)}>
            <Plus size={14} /> Add Exercise
          </button>
        </div>
      )}
    </div>
  );
}

/* ── NutritionEditor ── */
function NutritionEditor({ plan, onSave, onCancel }) {
  const EMPTY_MEAL = {
    name: "",
    foods: "",
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
  };
  const [form, setForm] = useState(
    plan
      ? {
          title: plan.title || "My Nutrition Plan",
          goal: plan.goal || "",
          dailyCalories: plan.dailyCalories || "",
          dailyProtein: plan.dailyProtein || "",
          dailyCarbs: plan.dailyCarbs || "",
          dailyFat: plan.dailyFat || "",
          guidelines: plan.guidelines || "",
          supplements: plan.supplements || "",
          meals: plan.meals.length
            ? plan.meals.map((m) => ({
                ...m,
                calories: m.calories || "",
                protein: m.protein || "",
                carbs: m.carbs || "",
                fat: m.fat || "",
              }))
            : [{ ...EMPTY_MEAL }],
        }
      : {
          title: "My Nutrition Plan",
          goal: "",
          dailyCalories: "",
          dailyProtein: "",
          dailyCarbs: "",
          dailyFat: "",
          guidelines: "",
          supplements: "",
          meals: [{ ...EMPTY_MEAL }],
        },
  );
  const [saving, setSaving] = useState(false);

  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const setMeal = (i, k, v) =>
    setForm((p) => {
      const m = [...p.meals];
      m[i] = { ...m[i], [k]: v };
      return { ...p, meals: m };
    });
  const addMeal = () =>
    setForm((p) => ({ ...p, meals: [...p.meals, { ...EMPTY_MEAL }] }));
  const removeMeal = (i) =>
    setForm((p) => ({ ...p, meals: p.meals.filter((_, j) => j !== i) }));

  const handleSave = async () => {
    setSaving(true);
    const payload = { ...form };
    ["dailyCalories", "dailyProtein", "dailyCarbs", "dailyFat"].forEach((k) => {
      payload[k] = form[k] === "" ? null : Number(form[k]);
    });
    payload.meals = form.meals.map((m) => ({
      ...m,
      calories: m.calories === "" ? null : Number(m.calories),
      protein: m.protein === "" ? null : Number(m.protein),
      carbs: m.carbs === "" ? null : Number(m.carbs),
      fat: m.fat === "" ? null : Number(m.fat),
    }));
    try {
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="plan-editor">
      <div className="pe-header">
        <h3>🥗 Nutrition Plan</h3>
        <button className="btn btn-outline btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div className="form-row-2">
        <div className="form-group">
          <label>Plan Title</label>
          <input value={form.title} onChange={setF("title")} />
        </div>
        <div className="form-group">
          <label>Goal</label>
          <input
            placeholder="e.g. Fat loss, Muscle gain"
            value={form.goal}
            onChange={setF("goal")}
          />
        </div>
      </div>
      <h4 className="pe-section-title">Daily Targets</h4>
      <div className="form-row-2">
        <div className="form-group">
          <label>Calories (kcal)</label>
          <input
            type="number"
            placeholder="2200"
            value={form.dailyCalories}
            onChange={setF("dailyCalories")}
          />
        </div>
        <div className="form-group">
          <label>Protein (g)</label>
          <input
            type="number"
            placeholder="180"
            value={form.dailyProtein}
            onChange={setF("dailyProtein")}
          />
        </div>
        <div className="form-group">
          <label>Carbs (g)</label>
          <input
            type="number"
            placeholder="250"
            value={form.dailyCarbs}
            onChange={setF("dailyCarbs")}
          />
        </div>
        <div className="form-group">
          <label>Fat (g)</label>
          <input
            type="number"
            placeholder="70"
            value={form.dailyFat}
            onChange={setF("dailyFat")}
          />
        </div>
      </div>
      <h4 className="pe-section-title">Meals</h4>
      {form.meals.map((meal, i) => (
        <div key={i} className="meal-row">
          <div className="meal-row-header">
            <span className="meal-num">Meal {i + 1}</span>
            {form.meals.length > 1 && (
              <button className="ex-remove-btn" onClick={() => removeMeal(i)}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label>Meal Name</label>
              <input
                placeholder="e.g. Breakfast"
                value={meal.name}
                onChange={(e) => setMeal(i, "name", e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Foods</label>
              <input
                placeholder="e.g. Oats, eggs, banana"
                value={meal.foods}
                onChange={(e) => setMeal(i, "foods", e.target.value)}
              />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label>Calories</label>
              <input
                type="number"
                placeholder="500"
                value={meal.calories}
                onChange={(e) => setMeal(i, "calories", e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Protein (g)</label>
              <input
                type="number"
                placeholder="40"
                value={meal.protein}
                onChange={(e) => setMeal(i, "protein", e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Carbs (g)</label>
              <input
                type="number"
                placeholder="60"
                value={meal.carbs}
                onChange={(e) => setMeal(i, "carbs", e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Fat (g)</label>
              <input
                type="number"
                placeholder="15"
                value={meal.fat}
                onChange={(e) => setMeal(i, "fat", e.target.value)}
              />
            </div>
          </div>
        </div>
      ))}
      <button className="add-ex-btn" onClick={addMeal}>
        <Plus size={14} /> Add Meal
      </button>
      <h4 className="pe-section-title">Guidelines & Supplements</h4>
      <div className="form-group">
        <label>General Guidelines</label>
        <textarea
          value={form.guidelines}
          onChange={setF("guidelines")}
          rows={3}
          placeholder="Hydration, meal timing, foods to avoid..."
        />
      </div>
      <div className="form-group">
        <label>Supplements</label>
        <textarea
          value={form.supplements}
          onChange={setF("supplements")}
          rows={2}
          placeholder="Whey protein, creatine, multivitamins..."
        />
      </div>
      <button
        className="btn btn-primary"
        onClick={handleSave}
        disabled={saving}
        style={{ marginTop: "8px" }}
      >
        {saving ? (
          <>
            <div className="spinner" /> Saving...
          </>
        ) : (
          <>
            <Save size={15} /> Save Nutrition Plan
          </>
        )}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════
   MAIN ADMIN PAGE
══════════════════════════════════════════ */
export default function AdminPage() {
  const { settings: globalSettings, reload: reloadSettings } = useSettings();

  // Tab state
  const [tab, setTab] = useState("appointments");

  // Data
  const [appointments, setAppointments] = useState([]);
  const [revenue, setRevenue] = useState(null);
  const [services, setServices] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [workingHours, setWorkingHours] = useState([]);
  const [dateOverrides, setDateOverrides] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);

  // Appointment actions
  const [filter, setFilter] = useState("pending");
  const [actioning, setActioning] = useState(null);
  const [noteModal, setNoteModal] = useState(null);
  const [noteText, setNoteText] = useState("");

  // Phone booking
  const [phoneForm, setPhoneForm] = useState({
    customerName: "",
    customerPhone: "",
    serviceId: "",
    date: "",
    time: "",
    notes: "",
  });
  const [phoneSlots, setPhoneSlots] = useState([]);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneSubmit, setPhoneSubmit] = useState(false);

  // Services
  const [svcModal, setSvcModal] = useState(false);
  const [editingSvc, setEditingSvc] = useState(null);
  const [svcForm, setSvcForm] = useState(EMPTY_SVC);
  const [sales, setSales] = useState([]);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [calSelDay, setCalSelDay] = useState(null); // 'YYYY-MM-DD' or null
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesSearch, setSalesSearch] = useState("");
  const [salesSeenAt, setSalesSeenAt] = useState(0);
  const [svcLoading, setSvcLoading] = useState(false);

  // Bundles
  const [bundleModal, setBundleModal] = useState(false);
  const [editingBundle, setEditingBundle] = useState(null);
  const [bundleForm, setBundleForm] = useState(EMPTY_BUNDLE);
  const [bundleLoading, setBundleLoading] = useState(false);

  // Schedule
  const [editingDay, setEditingDay] = useState(null);
  const [whEdit, setWhEdit] = useState({});
  const [overrideForm, setOverrideForm] = useState({
    date: "",
    isOpen: true,
    openTime: "06:00",
    closeTime: "21:00",
    slotDuration: 60,
    reason: "",
  });

  // Users
  const [userSearch, setUserSearch] = useState("");
  const [resetModal, setResetModal] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // Workout Plans (per user)
  const [selUserId, setSelUserId] = useState("");
  const [selUserName, setSelUserName] = useState("");
  const [userPlans, setUserPlans] = useState([]);
  const [userNutrition, setUserNutrition] = useState(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [showNutEditor, setShowNutEditor] = useState(false);
  const [workoutUsersSearch, setWorkoutUsersSearch] = useState("");

  // Settings
  const [settingsForm, setSettingsForm] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  /* ── Load all ── */
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [apptRes, revRes, svcRes, bundleRes, whRes, ovRes] =
        await Promise.all([
          appointmentsAPI.getAll(),
          appointmentsAPI.getRevenue(),
          servicesAPI.getAll(),
          appointmentsAPI.getBundles(),
          availabilityAPI.getWorkingHours(),
          availabilityAPI.getDateOverrides(),
        ]);
      setAppointments(apptRes.data.data);
      setRevenue(revRes.data.data);
      setServices(svcRes.data.data);
      setBundles(bundleRes.data.data);
      setWorkingHours(whRes.data.data);
      setDateOverrides(ovRes.data.data);
    } catch (err) {
      toast.error(
        "Failed to load: " + (err.response?.data?.message || err.message),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const r = await authAPI.getAllUsers();
      setUsers(r.data.data);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);
  useEffect(() => {
    if ((tab === "users" || tab === "workout") && users.length === 0)
      loadUsers();
  }, [tab]);
  const [nutriPending, setNutriPending] = useState([]);
  const [customPending, setCustomPending] = useState([]);
  const [eligibleUserIds, setEligibleUserIds] = useState(new Set());
  useEffect(() => {
    // Fetched once on mount (not gated to the workout tab) so the nav badge
    // is accurate before the admin ever opens the tab.
    workoutAPI
      .nutritionPending()
      .then((r) => setNutriPending(r.data.data || []))
      .catch(() => {});
    workoutAPI
      .customPending()
      .then((r) => setCustomPending(r.data.data || []))
      .catch(() => {});
    workoutAPI
      .eligibleUsers()
      .then((r) => setEligibleUserIds(new Set((r.data.data || []).map(String))))
      .catch(() => {});
  }, []);
  const nutriPendingIds = new Set(nutriPending.map((u) => String(u._id)));
  const customPendingIds = new Set(customPending.map((u) => String(u._id)));

  // Renewal reminders — 30-day access windows expiring soon / already in grace.
  const [renewals, setRenewals] = useState({ upcoming: [], grace: [] });
  const loadRenewals = useCallback(() => {
    purchasesAPI
      .renewals()
      .then((r) => setRenewals(r.data.data || { upcoming: [], grace: [] }))
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadRenewals();
  }, [loadRenewals]);
  const markReminded = async (entry) => {
    try {
      await purchasesAPI.markReminded(entry.kind, entry._id);
      setRenewals((p) => ({
        ...p,
        upcoming: p.upcoming.filter((e) => e._id !== entry._id),
      }));
    } catch {
      toast.error("Failed to mark as reminded");
    }
  };

  // Per-user activity log (Users tab)
  const [activityOpenId, setActivityOpenId] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLog, setActivityLog] = useState([]);
  const toggleActivity = async (userId) => {
    if (activityOpenId === userId) {
      setActivityOpenId(null);
      return;
    }
    setActivityOpenId(userId);
    setActivityLoading(true);
    try {
      const r = await authAPI.getUserActivity(userId);
      setActivityLog(r.data.data || []);
    } catch {
      toast.error("Failed to load activity");
      setActivityLog([]);
    } finally {
      setActivityLoading(false);
    }
  };
  useEffect(() => {
    if (tab !== "sales") return;
    // Remember when the admin LAST opened this tab, so anything sold since
    // then gets a NEW badge — then update the marker to now.
    const prev = Number(localStorage.getItem("salesLastSeen") || 0);
    setSalesSeenAt(prev);
    localStorage.setItem("salesLastSeen", String(Date.now()));
    setSalesLoading(true);
    purchasesAPI
      .all()
      .then((r) => setSales(r.data.data || []))
      .catch(() => toast.error("Failed to load sales"))
      .finally(() => setSalesLoading(false));
  }, [tab]);

  const handleRefund = async (pc) => {
    const rejectedCount =
      pc.kind === "booking"
        ? (pc.sessions || []).filter((s) => s.status === "rejected").length
        : 0;
    const confirmMsg =
      rejectedCount > 0
        ? `Refund $${pc.amount} to ${pc.user?.name}? ${rejectedCount} of ${pc.sessions.length} session(s) in this booking were already rejected — only the unrejected session(s) will be refunded. This cannot be undone.`
        : `Refund $${pc.amount} to ${pc.user?.name}? This cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;
    try {
      if (pc.kind === "booking") {
        // Refund each still-unrejected appointment in the order individually
        // (same CyberSource transaction covers the group). Rejected sessions
        // were already auto-refunded on rejection, so re-refunding them would
        // just fail — skip them, and don't let one failure abort the rest.
        const idsToRefund = (pc.appointmentIds || []).filter(
          (_, idx) => pc.sessions?.[idx]?.status !== "rejected",
        );
        const results = await Promise.allSettled(
          idsToRefund.map((id) => paymentAPI.refund(id)),
        );
        if (
          idsToRefund.length > 0 &&
          results.every((r) => r.status === "rejected")
        )
          throw new Error("Refund failed");
      } else {
        await paymentAPI.refundPurchase(pc._id);
      }
      toast.success("Refund initiated");
      setSales((prev) =>
        prev.map((s) =>
          s._id === pc._id ? { ...s, paymentStatus: "refunded" } : s,
        ),
      );
    } catch (err) {
      toast.error(err.response?.data?.message || "Refund failed");
    }
  };

  const salesFiltered = sales.filter((pc) => {
    if (!salesSearch.trim()) return true;
    const q = salesSearch.toLowerCase();
    return (
      (pc.user?.name || "").toLowerCase().includes(q) ||
      (pc.user?.email || "").toLowerCase().includes(q) ||
      (pc.user?.phone || "").includes(q) ||
      (pc.service?.name || "").toLowerCase().includes(q)
    );
  });
  useEffect(() => {
    if (tab === "settings" && !settingsForm)
      setSettingsForm({ ...globalSettings });
  }, [tab, globalSettings]);
  useEffect(() => {
    if (!phoneForm.date) return;
    setPhoneLoading(true);
    availabilityAPI
      .getSlots(phoneForm.date)
      .then((r) => setPhoneSlots(r.data.slots || []))
      .catch(() => setPhoneSlots([]))
      .finally(() => setPhoneLoading(false));
  }, [phoneForm.date]);

  /* ── Workout tab: load user's plans ── */
  const loadUserPlans = useCallback(async (uid) => {
    setPlansLoading(true);
    try {
      const [plansRes, nutRes] = await Promise.all([
        workoutAPI.getUserPlans(uid),
        workoutAPI.getUserNutrition(uid),
      ]);
      setUserPlans(plansRes.data.data);
      setUserNutrition(nutRes.data.data);
    } catch {
      toast.error("Failed to load plans");
    } finally {
      setPlansLoading(false);
    }
  }, []);

  const selectUser = (u) => {
    setSelUserId(u._id);
    setSelUserName(u.name);
    setUserPlans([]);
    setUserNutrition(null);
    setShowPlanEditor(false);
    setShowNutEditor(false);
    setEditingPlan(null);
    loadUserPlans(u._id);
  };

  /* ── Appointment Actions ── */
  const openNote = (id, action) => {
    setNoteModal({ id, action });
    setNoteText("");
  };
  const execAction = async () => {
    if (!noteModal) return;
    const { id, action } = noteModal;
    setActioning(id);
    setNoteModal(null);
    try {
      if (action === "confirm") {
        await appointmentsAPI.confirm(id, noteText);
        setAppointments((p) =>
          p.map((a) =>
            a._id === id
              ? { ...a, status: "confirmed", adminNote: noteText }
              : a,
          ),
        );
        toast.success("✅ Session confirmed!");
      } else {
        await appointmentsAPI.reject(id, noteText);
        setAppointments((p) =>
          p.map((a) =>
            a._id === id
              ? { ...a, status: "rejected", adminNote: noteText }
              : a,
          ),
        );
        toast.success("Session rejected.");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed");
    } finally {
      setActioning(null);
    }
  };
  const markPaid = async (appt) => {
    const amt = window.prompt(
      `Amount paid (default $${appt.service?.price}):`,
      appt.paidAmount || appt.service?.price,
    );
    if (amt === null) return;
    if (isNaN(Number(amt))) {
      toast.error("Enter a valid number");
      return;
    }
    try {
      await appointmentsAPI.markPaid(appt._id, { paidAmount: Number(amt) });
      setAppointments((p) =>
        p.map((a) =>
          a._id === appt._id
            ? { ...a, isPaid: true, paidAmount: Number(amt) }
            : a,
        ),
      );
      toast.success("💰 Marked as paid!");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed");
    }
  };

  /* ── Phone booking ── */
  const submitPhone = async (e) => {
    e.preventDefault();
    const { customerName, customerPhone, serviceId, date, time } = phoneForm;
    if (!customerName || !customerPhone || !serviceId || !date || !time) {
      toast.error("All fields required");
      return;
    }
    setPhoneSubmit(true);
    try {
      await appointmentsAPI.phoneBooking(phoneForm);
      setPhoneForm({
        customerName: "",
        customerPhone: "",
        serviceId: "",
        date: "",
        time: "",
        notes: "",
      });
      setPhoneSlots([]);
      toast.success("📞 Phone booking created!");
      setTab("appointments");
      setFilter("confirmed");
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed");
    } finally {
      setPhoneSubmit(false);
    }
  };

  /* ── Services ── */
  const submitSvc = async (e) => {
    e.preventDefault();
    const { name, description, price, duration, category, imageUrl } = svcForm;
    if (!name || !description || !price || !duration) {
      toast.error("All fields required");
      return;
    }
    setSvcLoading(true);
    try {
      const payload = {
        name,
        description,
        price: Number(price),
        duration: Number(duration),
        category,
        imageUrl: imageUrl || "",
        sections: svcForm.sections || [],
        trainingType: svcForm.trainingType || "pt",
        priceLive:
          svcForm.trainingType === "pt" && svcForm.priceLive !== ""
            ? Number(svcForm.priceLive)
            : null,
        priceOnline:
          svcForm.trainingType === "pt" && svcForm.priceOnline !== ""
            ? Number(svcForm.priceOnline)
            : null,
        isCustom: svcForm.trainingType === "self",
      };
      if (editingSvc) {
        const r = await adminServicesAPI.update(editingSvc._id, payload);
        setServices((p) =>
          p.map((s) => (s._id === editingSvc._id ? r.data.data : s)),
        );
        toast.success("Service updated ✅");
      } else {
        const r = await adminServicesAPI.create(payload);
        setServices((p) => [...p, r.data.data]);
        toast.success("Service created ✅");
      }
      setSvcModal(false);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed");
    } finally {
      setSvcLoading(false);
    }
  };
  const removeSvc = async (id, name) => {
    if (!window.confirm(`Remove "${name}"?`)) return;
    try {
      await adminServicesAPI.remove(id);
      setServices((p) => p.filter((s) => s._id !== id));
      toast.success("Removed ✅");
    } catch {
      toast.error("Failed");
    }
  };

  /* ── Bundles ── */
  const submitBundle = async (e) => {
    e.preventDefault();
    const { name, sessions, price, validDays, description, serviceId } =
      bundleForm;
    if (!name || !sessions || !price) {
      toast.error("Name, sessions and price required");
      return;
    }
    setBundleLoading(true);
    try {
      const payload = {
        name,
        description,
        sessions: Number(sessions),
        price: Number(price),
        validDays: Number(validDays) || 30,
        service: serviceId || null,
      };
      if (editingBundle) {
        const r = await appointmentsAPI.updateBundle(
          editingBundle._id,
          payload,
        );
        setBundles((p) =>
          p.map((b) => (b._id === editingBundle._id ? r.data.data : b)),
        );
        toast.success("Bundle updated ✅");
      } else {
        const r = await appointmentsAPI.createBundle(payload);
        setBundles((p) => [...p, r.data.data]);
        toast.success("Bundle created ✅");
      }
      setBundleModal(false);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed");
    } finally {
      setBundleLoading(false);
    }
  };
  const removeBundle = async (id) => {
    if (!window.confirm("Delete this bundle?")) return;
    try {
      await appointmentsAPI.deleteBundle(id);
      setBundles((p) => p.filter((b) => b._id !== id));
      toast.success("Deleted ✅");
    } catch {
      toast.error("Failed");
    }
  };

  /* ── Schedule ── */
  const saveWH = async () => {
    try {
      const r = await availabilityAPI.updateWorkingHours(editingDay, whEdit);
      setWorkingHours((p) =>
        p.map((w) => (w.dayOfWeek === editingDay ? r.data.data : w)),
      );
      setEditingDay(null);
      toast.success("Schedule updated ✅");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed");
    }
  };
  const saveOverride = async (e) => {
    e.preventDefault();
    if (!overrideForm.date) {
      toast.error("Pick a date");
      return;
    }
    try {
      const r = await availabilityAPI.setDateOverride({
        ...overrideForm,
        isOpen: overrideForm.isOpen === true || overrideForm.isOpen === "true",
      });
      setDateOverrides((p) => {
        const idx = p.findIndex((o) => o.date === overrideForm.date);
        return idx >= 0
          ? p.map((o, i) => (i === idx ? r.data.data : o))
          : [...p, r.data.data].sort((a, b) => a.date.localeCompare(b.date));
      });
      toast.success(r.data.message);
      setOverrideForm({
        date: "",
        isOpen: true,
        openTime: "06:00",
        closeTime: "21:00",
        slotDuration: 60,
        reason: "",
      });
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed");
    }
  };
  const removeOverride = async (id) => {
    if (!window.confirm("Remove override?")) return;
    try {
      await availabilityAPI.removeDateOverride(id);
      setDateOverrides((p) => p.filter((o) => o._id !== id));
      toast.success("Removed ✅");
    } catch {
      toast.error("Failed");
    }
  };

  /* ── Users / Password reset ── */
  const submitReset = async () => {
    if (!newPassword || newPassword.length < 8) {
      toast.error("Password must be 8+ chars");
      return;
    }
    setResetLoading(true);
    try {
      await authAPI.resetUserPassword(resetModal.userId, { newPassword });
      toast.success(`Password reset for ${resetModal.userName}`);
      setResetModal(null);
      setNewPassword("");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed");
    } finally {
      setResetLoading(false);
    }
  };

  const handleToggleActive = async (id, name, currentlyActive) => {
    const action = currentlyActive === false ? "activate" : "deactivate";
    if (
      !window.confirm(
        `${action.charAt(0).toUpperCase() + action.slice(1)} ${name}?`,
      )
    )
      return;
    try {
      const r = await authAPI.toggleUserActive(id);
      setUsers((p) =>
        p.map((u) =>
          u._id === id ? { ...u, isActive: r.data.data.isActive } : u,
        ),
      );
      toast.success(r.data.message);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed");
    }
  };

  const handleDeleteUser = async (id, name) => {
    if (!window.confirm(`Permanently delete "${name}"? This cannot be undone.`))
      return;
    try {
      await authAPI.deleteUser(id);
      setUsers((p) => p.filter((u) => u._id !== id));
      toast.success(`${name} deleted`);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed");
    }
  };

  /* ── Workout plan actions ── */
  const handleSavePlan = async (formData) => {
    try {
      if (editingPlan) {
        const r = await workoutAPI.updatePlan(editingPlan._id, formData);
        setUserPlans((p) =>
          p.map((pl) => (pl._id === editingPlan._id ? r.data.data : pl)),
        );
        toast.success("Plan updated ✅");
      } else {
        const r = await workoutAPI.createPlan({
          ...formData,
          userId: selUserId,
        });
        setUserPlans((p) => [...p, r.data.data]);
        toast.success("Plan created ✅");
      }
      setShowPlanEditor(false);
      setEditingPlan(null);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed");
      throw err;
    }
  };
  const handleDeletePlan = async (id) => {
    if (!window.confirm("Remove this plan?")) return;
    try {
      await workoutAPI.deletePlan(id);
      setUserPlans((p) => p.filter((pl) => pl._id !== id));
      toast.success("Plan removed ✅");
    } catch {
      toast.error("Failed");
    }
  };
  const handleSaveNutrition = async (payload) => {
    try {
      const r = await workoutAPI.upsertNutrition(selUserId, payload);
      setUserNutrition(r.data.data);
      toast.success("Nutrition plan saved ✅");
      setShowNutEditor(false);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed");
      throw err;
    }
  };

  /* ── Settings ── */
  const downloadCSV = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAppointments = async () => {
    try {
      toast.loading("Preparing export...");
      const r = await exportAPI.appointments();
      toast.dismiss();
      downloadCSV(
        r.data,
        `appointments_${new Date().toISOString().split("T")[0]}.xlsx`,
      );
      toast.success("Appointments exported ✅");
    } catch {
      toast.dismiss();
      toast.error("Export failed");
    }
  };

  const handleExportUsers = async () => {
    try {
      toast.loading("Preparing export...");
      const r = await exportAPI.users();
      toast.dismiss();
      downloadCSV(
        r.data,
        `users_${new Date().toISOString().split("T")[0]}.xlsx`,
      );
      toast.success("Users exported ✅");
    } catch {
      toast.dismiss();
      toast.error("Export failed");
    }
  };

  const submitSettings = async (e) => {
    e.preventDefault();
    setSettingsSaving(true);
    try {
      await settingsAPI.update(settingsForm);
      reloadSettings();
      toast.success("Settings saved ✅");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed");
    } finally {
      setSettingsSaving(false);
    }
  };

  /* ── Derived ── */
  const filtered =
    filter === "all"
      ? appointments
      : appointments.filter((a) => a.status === filter);
  const counts = {
    all: appointments.length,
    pending: appointments.filter((a) => a.status === "pending").length,
    confirmed: appointments.filter((a) => a.status === "confirmed").length,
    rejected: appointments.filter((a) => a.status === "rejected").length,
    cancelled: appointments.filter((a) => a.status === "cancelled").length,
  };

  // Cluster multi-date bookings (same order/bundle) into one group per
  // customer so the appointments list doesn't show N unrelated flat cards —
  // each date still renders as its own row with its own actions inside.
  const groupedFiltered = (() => {
    const groups = {},
      order = [];
    for (const a of filtered) {
      const key = a.cyberSourceOrderId || a.bundleGroupId || a._id;
      if (!groups[key]) {
        groups[key] = [];
        order.push(key);
      }
      groups[key].push(a);
    }
    // Newest purchase/action first, regardless of status or session date.
    return order
      .map((key) => groups[key])
      .sort(
        (g1, g2) =>
          Math.max(...g2.map((a) => new Date(a.createdAt).getTime())) -
          Math.max(...g1.map((a) => new Date(a.createdAt).getTime())),
      );
  })();
  const filtUsers = userSearch.trim()
    ? users.filter(
        (u) =>
          u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
          u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
          u.phone.toLowerCase().includes(userSearch.toLowerCase()),
      )
    : users;
  // Only customers who bought a custom program/nutrition (or already have a
  // plan built) show up here — everyone else never bought anything relevant.
  const wkEligibleUsers = users.filter(
    (u) => u.role !== "admin" && eligibleUserIds.has(String(u._id)),
  );
  const wkFiltUsers = workoutUsersSearch.trim()
    ? wkEligibleUsers.filter(
        (u) =>
          u.name.toLowerCase().includes(workoutUsersSearch.toLowerCase()) ||
          u.email.toLowerCase().includes(workoutUsersSearch.toLowerCase()),
      )
    : wkEligibleUsers;

  const TABS = [
    { key: "appointments", label: "📋 Appointments" },
    { key: "phone", label: "📞 Phone Booking" },
    { key: "services", label: "💪 Programs" },
    { key: "bundles", label: "📦 Bundles" },
    { key: "schedule", label: "🗓️ Schedule" },
    { key: "workout", label: "🏋️ Custom program & Nutrition plan" },
    { key: "users", label: "👥 Users" },
    { key: "sales", label: "🛒 Program Sales" },
    { key: "renewals", label: "🔔 Renewals" },
    { key: "settings", label: "⚙️ Settings" },
  ];

  /* ══ RENDER ══════════════════════════════════════════════════════ */
  return (
    <div className="admin-page">
      {/* Header */}
      <div className="admin-header">
        <div className="admin-header-orb" />
        <div className="admin-header-left">
          <h1>Admin Dashboard 💪</h1>
          <p>FitPro Training Management</p>
        </div>
        <button
          className="admin-refresh-btn"
          onClick={loadAll}
          disabled={loading}
        >
          <RefreshCw
            size={15}
            style={{ animation: loading ? "spin 1s linear infinite" : "none" }}
          />{" "}
          Refresh
        </button>
      </div>

      {/* Revenue strip */}
      {revenue && (
        <div className="revenue-strip">
          <div className="rev-card">
            <DollarSign size={18} />
            <div>
              <strong>${revenue.totalRevenue}</strong>
              <span>Total Revenue</span>
            </div>
          </div>
          <div className="rev-card green">
            <CheckCircle size={18} />
            <div>
              <strong>{revenue.paidCount}</strong>
              <span>Paid</span>
            </div>
          </div>
          <div className="rev-card orange">
            <AlertCircle size={18} />
            <div>
              <strong>{revenue.unpaidCount}</strong>
              <span>Unpaid</span>
            </div>
          </div>
          <div className="rev-card blue">
            <Calendar size={18} />
            <div>
              <strong>{revenue.todayAppts}</strong>
              <span>Today</span>
            </div>
          </div>
          <div className="rev-card accent">
            <DollarSign size={18} />
            <div>
              <strong>${revenue.todayRevenue}</strong>
              <span>Today $</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab nav */}
      <div className="admin-tabs-nav">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`admin-tab-nav-btn ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.key === "appointments" && counts.pending > 0 && (
              <span className="nav-badge">{counts.pending}</span>
            )}
            {t.key === "workout" &&
              customPending.length + nutriPending.length > 0 && (
                <span className="nav-badge">
                  {customPending.length + nutriPending.length}
                </span>
              )}
            {t.key === "renewals" &&
              renewals.upcoming.length + renewals.grace.length > 0 && (
                <span className="nav-badge">
                  {renewals.upcoming.length + renewals.grace.length}
                </span>
              )}
          </button>
        ))}
      </div>

      <div className="admin-body">
        {loading ? (
          <div className="admin-loading">
            <div className="spinner spinner-dark" />
            <p>Loading...</p>
          </div>
        ) : (
          <>
            {/* ── APPOINTMENTS ── */}
            {tab === "appointments" && (
              <>
                {/* ── Month calendar: blue = days with sold sessions; click a day for details ── */}
                {(() => {
                  const pad = (n) => String(n).padStart(2, "0");
                  const { y, m } = calMonth;
                  const first = new Date(y, m, 1);
                  const daysInMonth = new Date(y, m + 1, 0).getDate();
                  const startWd = first.getDay();
                  const dateStr = (d) => `${y}-${pad(m + 1)}-${pad(d)}`;
                  const apptsByDate = {};
                  for (const a of appointments) {
                    (apptsByDate[a.date] = apptsByDate[a.date] || []).push(a);
                  }
                  const monthName = first.toLocaleString("en", {
                    month: "long",
                    year: "numeric",
                  });
                  const cells = [];
                  for (let i = 0; i < startWd; i++) cells.push(null);
                  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
                  const dayAppts = calSelDay
                    ? apptsByDate[calSelDay] || []
                    : [];
                  return (
                    <div className="form-panel" style={{ marginBottom: 18 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 10,
                        }}
                      >
                        <h3 style={{ margin: 0 }}>📅 Sessions Calendar</h3>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                          }}
                        >
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => {
                              setCalSelDay(null);
                              setCalMonth((p) =>
                                p.m === 0
                                  ? { y: p.y - 1, m: 11 }
                                  : { y: p.y, m: p.m - 1 },
                              );
                            }}
                          >
                            ‹
                          </button>
                          <strong
                            style={{ minWidth: 150, textAlign: "center" }}
                          >
                            {monthName}
                          </strong>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => {
                              setCalSelDay(null);
                              setCalMonth((p) =>
                                p.m === 11
                                  ? { y: p.y + 1, m: 0 }
                                  : { y: p.y, m: p.m + 1 },
                              );
                            }}
                          >
                            ›
                          </button>
                        </div>
                      </div>
                      <div
                        style={{ display: "flex", gap: 16, flexWrap: "wrap" }}
                      >
                        <div style={{ flex: "1 1 320px", maxWidth: 460 }}>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(7,1fr)",
                              gap: 4,
                              fontSize: ".72rem",
                              opacity: 0.6,
                              textAlign: "center",
                              marginBottom: 4,
                            }}
                          >
                            {[
                              "Sun",
                              "Mon",
                              "Tue",
                              "Wed",
                              "Thu",
                              "Fri",
                              "Sat",
                            ].map((w) => (
                              <span key={w}>{w}</span>
                            ))}
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(7,1fr)",
                              gap: 4,
                            }}
                          >
                            {cells.map((d, i) => {
                              if (d === null) return <span key={`e${i}`} />;
                              const ds = dateStr(d);
                              const has = (apptsByDate[ds] || []).length;
                              const sel = calSelDay === ds;
                              return (
                                <button
                                  key={ds}
                                  onClick={() => setCalSelDay(sel ? null : ds)}
                                  style={{
                                    aspectRatio: "1",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: 8,
                                    cursor: has ? "pointer" : "default",
                                    background: sel
                                      ? "#1d4ed8"
                                      : has
                                        ? "#3b82f6"
                                        : "#fff",
                                    color: sel || has ? "#fff" : "#374151",
                                    fontWeight: has ? 700 : 400,
                                    position: "relative",
                                    fontSize: ".85rem",
                                  }}
                                >
                                  {d}
                                  {has > 0 && (
                                    <span
                                      style={{
                                        position: "absolute",
                                        bottom: 2,
                                        right: 4,
                                        fontSize: ".62rem",
                                      }}
                                    >
                                      {has}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          <p
                            style={{
                              fontSize: ".74rem",
                              opacity: 0.6,
                              marginTop: 6,
                            }}
                          >
                            🔵 Blue days have sold sessions — click one to see
                            its details.
                          </p>
                        </div>
                        <div style={{ flex: "1 1 300px" }}>
                          {calSelDay ? (
                            dayAppts.length === 0 ? (
                              <p style={{ opacity: 0.7 }}>
                                No sessions on {calSelDay}.
                              </p>
                            ) : (
                              <>
                                <h4 style={{ margin: "0 0 8px" }}>
                                  {calSelDay} — {dayAppts.length} session
                                  {dayAppts.length > 1 ? "s" : ""}
                                </h4>
                                {dayAppts
                                  .sort((a, b) => a.time.localeCompare(b.time))
                                  .map((a) => {
                                    const cst =
                                      STATUS_CFG[a.status] ||
                                      STATUS_CFG.pending;
                                    const nm = a.isPhoneBooking
                                      ? a.customerName
                                      : a.user?.name;
                                    return (
                                      <div
                                        key={a._id}
                                        style={{
                                          border: "1px solid #e5e7eb",
                                          borderLeft: `4px solid ${cst.color}`,
                                          borderRadius: 8,
                                          padding: "8px 10px",
                                          marginBottom: 8,
                                          fontSize: ".85rem",
                                        }}
                                      >
                                        <strong>🕐 {a.time}</strong> ·{" "}
                                        {a.service?.name || "Training Session"}{" "}
                                        {a.mode
                                          ? a.mode === "online"
                                            ? "💻"
                                            : "🏟️"
                                          : ""}
                                        <div>
                                          👤 {nm} {a.isPhoneBooking && "📞"} ·{" "}
                                          <span style={{ color: cst.color }}>
                                            {cst.label}
                                          </span>
                                        </div>
                                        <div>
                                          💰 ${a.paidAmount || a.service?.price}{" "}
                                          {a.paymentStatus === "refunded"
                                            ? "💸 refunded"
                                            : a.isPaid
                                              ? "✅ paid"
                                              : "⏳"}{" "}
                                          {a.nutritionAddon && (
                                            <span>
                                              · 🥗 +${a.nutritionPrice}
                                            </span>
                                          )}
                                        </div>
                                        {a.paymentStatus === "refunded" ? (
                                          <div
                                            style={{
                                              marginTop: 4,
                                              fontSize: ".72rem",
                                              fontWeight: 600,
                                              color: "#7c3aed",
                                            }}
                                          >
                                            ✅ Refunded
                                          </div>
                                        ) : (
                                          a.isPaid &&
                                          a.paymentStatus === "paid" && (
                                            <button
                                              className="btn btn-outline btn-sm"
                                              style={{
                                                marginTop: 4,
                                                fontSize: ".72rem",
                                                padding: "2px 8px",
                                                color: "#dc2626",
                                                borderColor: "#dc2626",
                                              }}
                                              onClick={async () => {
                                                if (
                                                  !window.confirm(
                                                    `Refund $${a.paidAmount || a.service?.price} for this session?`,
                                                  )
                                                )
                                                  return;
                                                try {
                                                  await paymentAPI.refund(
                                                    a._id,
                                                  );
                                                  toast.success(
                                                    "Refund initiated",
                                                  );
                                                  loadAll();
                                                } catch (err) {
                                                  toast.error(
                                                    err.response?.data
                                                      ?.message ||
                                                      "Refund failed",
                                                  );
                                                }
                                              }}
                                            >
                                              💸 Refund this session
                                            </button>
                                          )
                                        )}
                                        {a.notes && (
                                          <div style={{ opacity: 0.7 }}>
                                            📝 {a.notes}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                              </>
                            )
                          ) : (
                            <p style={{ opacity: 0.6, marginTop: 24 }}>
                              ← Click a blue day to see its sessions here.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                <div className="admin-filter-row">
                  <div className="admin-filter-tabs">
                    {[
                      "pending",
                      "all",
                      "confirmed",
                      "rejected",
                      "cancelled",
                    ].map((f) => (
                      <button
                        key={f}
                        className={`filter-tab ${filter === f ? "active" : ""}`}
                        onClick={() => setFilter(f)}
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}{" "}
                        {counts[f] > 0 && (
                          <span className="ftab-count">{counts[f]}</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <button
                    className="btn btn-outline btn-sm export-btn"
                    onClick={handleExportAppointments}
                  >
                    <Download size={14} /> Export CSV
                  </button>
                </div>
                {filtered.length === 0 ? (
                  <div className="admin-empty">
                    <AlertCircle size={36} />
                    <p>No {filter !== "all" ? filter : ""} sessions.</p>
                  </div>
                ) : (
                  <div className="admin-list">
                    {groupedFiltered.map((group, gi) => {
                      const first = group[0];
                      const name = first.isPhoneBooking
                        ? first.customerName
                        : first.user?.name;
                      const phone = first.isPhoneBooking
                        ? first.customerPhone
                        : first.user?.phone;
                      const email = first.isPhoneBooking
                        ? "(phone booking)"
                        : first.user?.email;
                      const anyPending = group.some(
                        (a) => a.status === "pending",
                      );

                      const apptBody = (appt) => {
                        const st =
                          STATUS_CFG[appt.status] || STATUS_CFG.pending;
                        return (
                          <div className="ac-body">
                            <div className="ac-top">
                              <span
                                className="badge"
                                style={{ background: st.bg, color: st.color }}
                              >
                                {st.label}
                              </span>
                              {appt.isPaid ? (
                                <span className="paid-badge">
                                  {appt.paymentMethod === "online"
                                    ? "💳"
                                    : "💰"}{" "}
                                  ${appt.paidAmount}
                                  {appt.paymentMethod === "online" && (
                                    <span className="online-pay-tag">
                                      Online
                                    </span>
                                  )}
                                </span>
                              ) : (
                                appt.status === "confirmed" && (
                                  <span className="unpaid-badge">Unpaid</span>
                                )
                              )}
                            </div>
                            <div className="ac-details">
                              <div className="ac-chip">
                                💪 {appt.service?.name || "Training Session"}
                              </div>
                              <div className="ac-chip">
                                <Calendar size={12} />
                                {appt.date}
                              </div>
                              <div className="ac-chip">
                                <Clock size={12} />
                                {appt.time}
                              </div>
                              <div className="ac-chip">
                                💰 ${appt.paidAmount || appt.service?.price}
                              </div>
                              {appt.paymentStatus &&
                                appt.paymentStatus !== "unpaid" && (
                                  <div
                                    className="ac-chip"
                                    style={{ textTransform: "capitalize" }}
                                  >
                                    {appt.paymentStatus === "paid"
                                      ? "✅"
                                      : appt.paymentStatus === "failed"
                                        ? "❌"
                                        : appt.paymentStatus === "refunded"
                                          ? "💸"
                                          : "⏳"}{" "}
                                    {appt.paymentStatus === "refunded"
                                      ? `refunded $${appt.paidAmount || appt.service?.price}`
                                      : appt.paymentStatus}
                                  </div>
                                )}
                              {appt.paidAt && (
                                <div
                                  className="ac-chip"
                                  style={{ color: "var(--success)" }}
                                >
                                  🕐 Paid:{" "}
                                  {new Date(appt.paidAt).toLocaleString(
                                    "en-GB",
                                    {
                                      day: "2-digit",
                                      month: "short",
                                      year: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )}
                                </div>
                              )}
                              {appt.cyberSourceTransId && (
                                <div
                                  className="ac-chip"
                                  style={{ fontSize: "0.65rem" }}
                                >
                                  TXN: {appt.cyberSourceTransId.slice(0, 16)}…
                                </div>
                              )}
                              {appt.isBundle && (
                                <div className="ac-chip">
                                  <Package size={12} /> Bundle
                                </div>
                              )}
                              {appt.bundleId && (
                                <div className="ac-chip">
                                  📦 {appt.bundleId.name}
                                </div>
                              )}
                            </div>
                            {appt.notes && (
                              <div className="ac-note-cust">
                                📝 {appt.notes}
                              </div>
                            )}
                            {appt.adminNote && (
                              <div className="ac-note-admin">
                                💬 {appt.adminNote}
                              </div>
                            )}
                            <div className="ac-actions">
                              {appt.status === "pending" && (
                                <>
                                  <button
                                    className="ac-btn-confirm"
                                    disabled={actioning === appt._id}
                                    onClick={() =>
                                      openNote(appt._id, "confirm")
                                    }
                                  >
                                    <CheckCircle size={13} /> Confirm
                                  </button>
                                  <button
                                    className="ac-btn-reject"
                                    disabled={actioning === appt._id}
                                    onClick={() => openNote(appt._id, "reject")}
                                  >
                                    <XCircle size={13} /> Reject
                                  </button>
                                </>
                              )}
                              {appt.status === "confirmed" && !appt.isPaid && (
                                <button
                                  className="ac-btn-pay"
                                  onClick={() => markPaid(appt)}
                                >
                                  <DollarSign size={13} /> Mark Paid
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      };

                      // Single-date booking — unchanged card, exactly as before.
                      if (group.length === 1) {
                        const st =
                          STATUS_CFG[first.status] || STATUS_CFG.pending;
                        return (
                          <div
                            key={first._id}
                            className={`admin-card fade-up ${first.status === "pending" ? "is-pending" : ""}`}
                            style={{ animationDelay: `${gi * 0.04}s` }}
                          >
                            <div
                              className="ac-status-bar"
                              style={{ background: st.color }}
                            />
                            <div
                              className="ac-top"
                              style={{ padding: "12px 14px 0" }}
                            >
                              <div className="ac-customer">
                                <div className="ac-avatar">
                                  {name?.charAt(0) || "?"}
                                </div>
                                <div>
                                  <strong>
                                    {name}{" "}
                                    {first.isPhoneBooking && (
                                      <span className="phone-tag">📞</span>
                                    )}
                                  </strong>
                                  <span>{email}</span>
                                  <span>📞 {phone}</span>
                                </div>
                              </div>
                            </div>
                            {apptBody(first)}
                          </div>
                        );
                      }

                      // Multi-date booking — one clustered card per order,
                      // customer info shown once, each date as its own sub-row.
                      return (
                        <div
                          key={group.map((a) => a._id).join("-")}
                          className={`admin-card fade-up ${anyPending ? "is-pending" : ""}`}
                          style={{ animationDelay: `${gi * 0.04}s` }}
                        >
                          <div
                            className="ac-status-bar"
                            style={{ background: "#3b82f6" }}
                          />
                          <div className="ac-body">
                            <div className="ac-top">
                              <div className="ac-customer">
                                <div className="ac-avatar">
                                  {name?.charAt(0) || "?"}
                                </div>
                                <div>
                                  <strong>
                                    {name}{" "}
                                    {first.isPhoneBooking && (
                                      <span className="phone-tag">📞</span>
                                    )}
                                  </strong>
                                  <span>{email}</span>
                                  <span>📞 {phone}</span>
                                </div>
                              </div>
                              <div className="ac-top-right">
                                <span
                                  className="badge"
                                  style={{
                                    background: "#dbeafe",
                                    color: "#1d4ed8",
                                  }}
                                >
                                  <Package size={12} /> {group.length}-date
                                  booking
                                </span>
                              </div>
                            </div>
                            <div className="ac-subrows">
                              {group
                                .slice()
                                .sort(
                                  (a, b) =>
                                    a.date.localeCompare(b.date) ||
                                    a.time.localeCompare(b.time),
                                )
                                .map((appt) => (
                                  <div
                                    key={appt._id}
                                    style={{
                                      border: "1px solid #e5e7eb",
                                      borderRadius: 8,
                                      marginTop: 8,
                                    }}
                                  >
                                    {apptBody(appt)}
                                  </div>
                                ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* ── PHONE BOOKING ── */}
            {tab === "phone" && (
              <div className="form-panel">
                <h2>📞 Phone Booking</h2>
                <p className="panel-sub">
                  Create a confirmed booking for a client who called.
                </p>
                <form onSubmit={submitPhone} className="panel-form">
                  <div className="form-row-2">
                    <div className="form-group">
                      <label>Client Name *</label>
                      <input
                        value={phoneForm.customerName}
                        onChange={(e) =>
                          setPhoneForm((p) => ({
                            ...p,
                            customerName: e.target.value,
                          }))
                        }
                        placeholder="Full name"
                      />
                    </div>
                    <div className="form-group">
                      <label>Phone *</label>
                      <input
                        value={phoneForm.customerPhone}
                        onChange={(e) =>
                          setPhoneForm((p) => ({
                            ...p,
                            customerPhone: e.target.value,
                          }))
                        }
                        placeholder="+1 234 567 890"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Service *</label>
                    <select
                      value={phoneForm.serviceId}
                      onChange={(e) =>
                        setPhoneForm((p) => ({
                          ...p,
                          serviceId: e.target.value,
                        }))
                      }
                    >
                      <option value="">-- Select a service --</option>
                      {services.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name} — ${s.price} ({s.duration}min)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-row-2">
                    <div className="form-group">
                      <label>Date *</label>
                      <input
                        type="date"
                        value={phoneForm.date}
                        min={new Date().toISOString().split("T")[0]}
                        onChange={(e) =>
                          setPhoneForm((p) => ({
                            ...p,
                            date: e.target.value,
                            time: "",
                          }))
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Time *</label>
                      {!phoneForm.date ? (
                        <p className="form-hint">Pick a date first</p>
                      ) : phoneLoading ? (
                        <div
                          className="spinner spinner-dark"
                          style={{ margin: "8px 0" }}
                        />
                      ) : phoneSlots.length === 0 ? (
                        <p
                          className="form-hint"
                          style={{ color: "var(--error)" }}
                        >
                          No slots available
                        </p>
                      ) : (
                        <div className="slot-grid-sm">
                          {phoneSlots.map((s) => (
                            <button
                              key={s.time}
                              type="button"
                              className={`slot-sm ${!s.available ? "taken" : ""} ${phoneForm.time === s.time ? "selected" : ""}`}
                              onClick={() =>
                                s.available &&
                                setPhoneForm((p) => ({ ...p, time: s.time }))
                              }
                              disabled={!s.available}
                            >
                              {s.time}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Notes</label>
                    <textarea
                      value={phoneForm.notes}
                      onChange={(e) =>
                        setPhoneForm((p) => ({ ...p, notes: e.target.value }))
                      }
                      rows={2}
                      placeholder="Any notes..."
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={phoneSubmit}
                  >
                    {phoneSubmit ? (
                      <div className="spinner" />
                    ) : (
                      <>
                        <Phone size={15} /> Create & Confirm
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* ── SERVICES ── */}
            {tab === "services" && (
              <div className="form-panel">
                <div className="panel-header-row">
                  <div>
                    <h2>💪 Manage Programs</h2>
                    <p className="panel-sub">
                      Add, edit or remove training programs.
                    </p>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setEditingSvc(null);
                      setSvcForm(EMPTY_SVC);
                      setSvcModal(true);
                    }}
                  >
                    <Plus size={14} /> Add Program
                  </button>
                </div>
                {services.length === 0 ? (
                  <div className="admin-empty">
                    <p>No services yet.</p>
                  </div>
                ) : (
                  <div className="services-mgmt-list">
                    {services.map((svc) => (
                      <div key={svc._id} className="svc-mgmt-row">
                        <div className="svc-mgmt-photo">
                          <img
                            src={
                              svc.imageUrl ||
                              CAT_IMAGES[svc.category] ||
                              CAT_IMAGES.Other
                            }
                            alt={svc.name}
                          />
                        </div>
                        <div className="svc-mgmt-info">
                          <strong>{svc.name}</strong>
                          <span>
                            {svc.category} · {svc.duration} min ·{" "}
                            <b style={{ color: "var(--primary)" }}>
                              ${svc.price}
                            </b>
                          </span>
                          <p>{svc.description}</p>
                        </div>
                        <div className="svc-mgmt-actions">
                          <button
                            className="svc-edit-btn"
                            onClick={() => {
                              setEditingSvc(svc);
                              setSvcForm({
                                name: svc.name,
                                description: svc.description,
                                price: svc.price,
                                duration: svc.duration,
                                category: svc.category,
                                imageUrl: svc.imageUrl || "",
                                sections: svc.sections || [],
                                trainingType: svc.trainingType || "pt",
                                priceLive: svc.priceLive ?? "",
                                priceOnline: svc.priceOnline ?? "",
                                isCustom: Boolean(svc.isCustom),
                              });
                              setSvcModal(true);
                            }}
                          >
                            <Edit2 size={13} /> Edit
                          </button>
                          <button
                            className="svc-del-btn"
                            onClick={() => removeSvc(svc._id, svc.name)}
                          >
                            <Trash2 size={13} /> Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── BUNDLES ── */}
            {tab === "bundles" && (
              <div className="form-panel">
                <div className="panel-header-row">
                  <div>
                    <h2>📦 Session Bundles</h2>
                    <p className="panel-sub">
                      Create flat-price packages clients can apply when booking
                      multiple sessions.
                    </p>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setEditingBundle(null);
                      setBundleForm(EMPTY_BUNDLE);
                      setBundleModal(true);
                    }}
                  >
                    <Plus size={14} /> Add Bundle
                  </button>
                </div>
                {bundles.length === 0 ? (
                  <div className="admin-empty">
                    <Package size={36} />
                    <p>No bundles yet. Add your first package!</p>
                  </div>
                ) : (
                  <div className="bundle-mgmt-list">
                    {bundles.map((b) => (
                      <div key={b._id} className="bundle-mgmt-row">
                        <div className="bm-icon">
                          <Package size={24} />
                        </div>
                        <div className="bm-info">
                          <strong>{b.name}</strong>
                          <span>
                            {b.sessions} sessions · {b.validDays} days validity
                          </span>
                          {b.service && (
                            <span>
                              For: {b.service.name || "specific service"}
                            </span>
                          )}
                          {b.description && <p>{b.description}</p>}
                        </div>
                        <div className="bm-price">
                          ${b.price}
                          <small>flat</small>
                        </div>
                        <div className="svc-mgmt-actions">
                          <button
                            className="svc-edit-btn"
                            onClick={() => {
                              setEditingBundle(b);
                              setBundleForm({
                                name: b.name,
                                description: b.description,
                                sessions: b.sessions,
                                price: b.price,
                                validDays: b.validDays,
                                serviceId: b.service?._id || b.service || "",
                              });
                              setBundleModal(true);
                            }}
                          >
                            <Edit2 size={13} /> Edit
                          </button>
                          <button
                            className="svc-del-btn"
                            onClick={() => removeBundle(b._id)}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── SCHEDULE ── */}
            {tab === "schedule" && (
              <div className="form-panel">
                <h2>🗓️ Weekly Schedule</h2>
                <p className="panel-sub">
                  Set default hours and override specific dates.
                </p>
                <div className="wh-list">
                  {workingHours.map((wh) => (
                    <div key={wh.dayOfWeek} className="wh-row">
                      {editingDay === wh.dayOfWeek ? (
                        <div className="wh-edit-box">
                          <strong>{DAYS[wh.dayOfWeek]}</strong>
                          <label className="wh-toggle-label">
                            <input
                              type="checkbox"
                              checked={whEdit.isOpen || false}
                              onChange={(e) =>
                                setWhEdit((p) => ({
                                  ...p,
                                  isOpen: e.target.checked,
                                }))
                              }
                            />{" "}
                            {whEdit.isOpen ? "Open" : "Closed"}
                          </label>
                          {whEdit.isOpen && (
                            <div className="wh-time-row">
                              <span>From</span>
                              <input
                                type="time"
                                value={whEdit.openTime || "06:00"}
                                onChange={(e) =>
                                  setWhEdit((p) => ({
                                    ...p,
                                    openTime: e.target.value,
                                  }))
                                }
                              />
                              <span>To</span>
                              <input
                                type="time"
                                value={whEdit.closeTime || "21:00"}
                                onChange={(e) =>
                                  setWhEdit((p) => ({
                                    ...p,
                                    closeTime: e.target.value,
                                  }))
                                }
                              />
                              <span>Slot</span>
                              <select
                                value={whEdit.slotDuration || 60}
                                onChange={(e) =>
                                  setWhEdit((p) => ({
                                    ...p,
                                    slotDuration: Number(e.target.value),
                                  }))
                                }
                              >
                                <option value={30}>30 min</option>
                                <option value={45}>45 min</option>
                                <option value={60}>60 min</option>
                                <option value={90}>90 min</option>
                              </select>
                            </div>
                          )}
                          <div className="wh-edit-btns">
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={saveWH}
                            >
                              <Save size={13} /> Save
                            </button>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => setEditingDay(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="wh-row-inner">
                          <div className="wh-info">
                            <strong>{DAYS[wh.dayOfWeek]}</strong>
                            {wh.isOpen ? (
                              <span className="wh-open">
                                {wh.openTime} – {wh.closeTime} ·{" "}
                                {wh.slotDuration} min slots
                              </span>
                            ) : (
                              <span className="wh-closed">Closed</span>
                            )}
                          </div>
                          <button
                            className="btn-edit-day"
                            onClick={() => {
                              setEditingDay(wh.dayOfWeek);
                              setWhEdit({ ...wh });
                            }}
                          >
                            <Settings size={13} /> Edit
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <h3
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1.3rem",
                    margin: "28px 0 8px",
                  }}
                >
                  Date Overrides
                </h3>
                <p className="panel-sub">
                  Override specific dates regardless of weekly schedule.
                </p>
                <form onSubmit={saveOverride} className="panel-form">
                  <div className="form-row-2">
                    <div className="form-group">
                      <label>Date *</label>
                      <input
                        type="date"
                        value={overrideForm.date}
                        onChange={(e) =>
                          setOverrideForm((p) => ({
                            ...p,
                            date: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Status</label>
                      <select
                        value={String(overrideForm.isOpen)}
                        onChange={(e) =>
                          setOverrideForm((p) => ({
                            ...p,
                            isOpen: e.target.value === "true",
                          }))
                        }
                      >
                        <option value="true">Open</option>
                        <option value="false">Closed</option>
                      </select>
                    </div>
                  </div>
                  {overrideForm.isOpen && (
                    <div className="form-row-2">
                      <div className="form-group">
                        <label>Open Time</label>
                        <input
                          type="time"
                          value={overrideForm.openTime}
                          onChange={(e) =>
                            setOverrideForm((p) => ({
                              ...p,
                              openTime: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label>Close Time</label>
                        <input
                          type="time"
                          value={overrideForm.closeTime}
                          onChange={(e) =>
                            setOverrideForm((p) => ({
                              ...p,
                              closeTime: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  )}
                  <div className="form-group">
                    <label>Reason</label>
                    <input
                      value={overrideForm.reason}
                      onChange={(e) =>
                        setOverrideForm((p) => ({
                          ...p,
                          reason: e.target.value,
                        }))
                      }
                      placeholder="e.g. Public holiday"
                    />
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm">
                    <Plus size={14} /> Set Override
                  </button>
                </form>
                {dateOverrides.length > 0 && (
                  <div className="override-list" style={{ marginTop: "16px" }}>
                    {dateOverrides.map((ov) => (
                      <div key={ov._id} className="override-row">
                        <div>
                          <strong>{ov.date}</strong>
                          <span
                            style={{
                              color: ov.isOpen
                                ? "var(--success)"
                                : "var(--error)",
                              fontWeight: 600,
                              marginLeft: "8px",
                            }}
                          >
                            {ov.isOpen ? "OPEN" : "CLOSED"}
                          </span>
                          {ov.reason && (
                            <span
                              style={{
                                color: "var(--grey)",
                                fontSize: "0.8rem",
                                marginLeft: "8px",
                              }}
                            >
                              — {ov.reason}
                            </span>
                          )}
                          {ov.isOpen && (
                            <div
                              style={{
                                fontSize: "0.78rem",
                                color: "var(--grey)",
                              }}
                            >
                              {ov.openTime}–{ov.closeTime} · {ov.slotDuration}
                              min
                            </div>
                          )}
                        </div>
                        <button
                          className="btn btn-outline btn-sm"
                          style={{
                            color: "var(--error)",
                            borderColor: "var(--error)",
                          }}
                          onClick={() => removeOverride(ov._id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── WORKOUT PLANS ── */}
            {tab === "workout" && (
              <div className="workout-admin">
                {/* User selector */}
                <div className="workout-user-panel">
                  {customPending.length > 0 && (
                    <div
                      style={{
                        background: "#faf5ff",
                        border: "1px solid #e9d5ff",
                        borderRadius: 10,
                        padding: "10px 12px",
                        marginBottom: 12,
                      }}
                    >
                      <strong style={{ fontSize: ".88rem" }}>
                        🎯 Custom programs to build ({customPending.length})
                      </strong>
                      <p
                        style={{
                          fontSize: ".76rem",
                          opacity: 0.8,
                          margin: "4px 0 6px",
                        }}
                      >
                        These clients <strong>paid</strong> for a custom program
                        and are waiting for you to build their plan:
                      </p>
                      {customPending.map((u) => (
                        <div
                          key={u._id}
                          style={{ fontSize: ".82rem", padding: "2px 0" }}
                        >
                          • {u.name}{" "}
                          <span style={{ opacity: 0.6 }}>({u.email})</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {nutriPending.length > 0 && (
                    <div
                      style={{
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        borderRadius: 10,
                        padding: "10px 12px",
                        marginBottom: 12,
                      }}
                    >
                      <strong style={{ fontSize: ".88rem" }}>
                        🥗 Nutrition plans to build ({nutriPending.length})
                      </strong>
                      <p
                        style={{
                          fontSize: ".76rem",
                          opacity: 0.8,
                          margin: "4px 0 6px",
                        }}
                      >
                        These clients <strong>paid</strong> for a nutrition plan
                        and are waiting for you to build it:
                      </p>
                      {nutriPending.map((u) => (
                        <div
                          key={u._id}
                          style={{ fontSize: ".82rem", padding: "2px 0" }}
                        >
                          • {u.name}{" "}
                          <span style={{ opacity: 0.6 }}>({u.email})</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <h3>Select a Client</h3>
                  <div
                    className="user-search-wrap"
                    style={{ marginBottom: "12px" }}
                  >
                    <Search size={15} />
                    <input
                      placeholder="Search clients..."
                      value={workoutUsersSearch}
                      onChange={(e) => setWorkoutUsersSearch(e.target.value)}
                    />
                  </div>
                  {usersLoading ? (
                    <div className="admin-loading">
                      <div className="spinner spinner-dark" />
                    </div>
                  ) : (
                    <div className="client-list">
                      {wkFiltUsers.map((u) => (
                        <button
                          key={u._id}
                          className={`client-btn ${selUserId === u._id ? "active" : ""}`}
                          onClick={() => selectUser(u)}
                        >
                          <div className="cb-avatar">{u.name.charAt(0)}</div>
                          <div className="cb-info">
                            <strong>
                              {u.name}{" "}
                              {customPendingIds.has(String(u._id)) && (
                                <span
                                  title="Paid for a custom program — build it!"
                                  style={{
                                    fontSize: ".72rem",
                                    background: "#f3e8ff",
                                    color: "#6b21a8",
                                    borderRadius: 6,
                                    padding: "1px 5px",
                                  }}
                                >
                                  🎯 build custom program
                                </span>
                              )}{" "}
                              {nutriPendingIds.has(String(u._id)) && (
                                <span
                                  title="Paid for a nutrition plan — build it!"
                                  style={{
                                    fontSize: ".72rem",
                                    background: "#dcfce7",
                                    color: "#166534",
                                    borderRadius: 6,
                                    padding: "1px 5px",
                                  }}
                                >
                                  🥗 build nutrition
                                </span>
                              )}
                            </strong>
                            <span>{u.email}</span>
                          </div>
                          {selUserId === u._id && (
                            <CheckCircle size={16} color="var(--primary)" />
                          )}
                        </button>
                      ))}
                      {wkFiltUsers.length === 0 && (
                        <p style={{ color: "var(--grey)", padding: "12px" }}>
                          No clients found.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Plans + Nutrition for selected user */}
                {selUserId && (
                  <div className="workout-content-panel">
                    <div className="wcp-header">
                      <h3>
                        Plans for{" "}
                        <span style={{ color: "var(--primary)" }}>
                          {selUserName}
                        </span>
                      </h3>
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        {!showPlanEditor && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              setEditingPlan(null);
                              setShowPlanEditor(true);
                              setShowNutEditor(false);
                            }}
                          >
                            <Plus size={14} /> New Plan
                          </button>
                        )}
                        {!showNutEditor && (
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => {
                              setShowNutEditor(true);
                              setShowPlanEditor(false);
                            }}
                          >
                            <Apple size={14} /> {userNutrition ? "Edit" : "Add"}{" "}
                            Nutrition
                          </button>
                        )}
                      </div>
                    </div>

                    {plansLoading ? (
                      <div className="admin-loading">
                        <div className="spinner spinner-dark" />
                      </div>
                    ) : (
                      <>
                        {showPlanEditor && (
                          <WorkoutPlanEditor
                            plan={editingPlan}
                            services={services}
                            onSave={handleSavePlan}
                            onCancel={() => {
                              setShowPlanEditor(false);
                              setEditingPlan(null);
                            }}
                          />
                        )}
                        {showNutEditor && (
                          <NutritionEditor
                            plan={userNutrition}
                            onSave={handleSaveNutrition}
                            onCancel={() => setShowNutEditor(false)}
                          />
                        )}
                        {!showPlanEditor && !showNutEditor && (
                          <>
                            {/* Existing plans */}
                            {userPlans.length === 0 ? (
                              <div
                                className="admin-empty"
                                style={{ padding: "32px" }}
                              >
                                <Dumbbell size={32} />
                                <p>No workout plans yet.</p>
                              </div>
                            ) : (
                              <div className="user-plans-list">
                                {userPlans.map((plan) => (
                                  <div
                                    key={plan._id}
                                    className="user-plan-card"
                                  >
                                    <div className="upc-header">
                                      <div>
                                        <strong>{plan.title}</strong>
                                        {plan.service && (
                                          <span className="upc-svc-tag">
                                            {plan.service.name}
                                          </span>
                                        )}
                                        <p>{plan.description}</p>
                                      </div>
                                      <div
                                        style={{
                                          display: "flex",
                                          gap: "6px",
                                          flexShrink: 0,
                                        }}
                                      >
                                        <button
                                          className="svc-edit-btn"
                                          onClick={() => {
                                            setEditingPlan(plan);
                                            setShowPlanEditor(true);
                                            setShowNutEditor(false);
                                          }}
                                        >
                                          <Edit2 size={13} /> Edit
                                        </button>
                                        <button
                                          className="svc-del-btn"
                                          onClick={() =>
                                            handleDeletePlan(plan._id)
                                          }
                                        >
                                          <Trash2 size={13} /> Remove
                                        </button>
                                      </div>
                                    </div>
                                    <div className="upc-days">
                                      {plan.weeklyPlan
                                        ?.filter((d) => d.exercises.length > 0)
                                        .map((d, i) => (
                                          <div key={i} className="upc-day-tag">
                                            <span>{d.dayName}</span>
                                            <span>
                                              {d.exercises.length} ex.
                                            </span>
                                            {d.focus && (
                                              <span className="upc-focus">
                                                {d.focus}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {/* Nutrition summary */}
                            {userNutrition && (
                              <div className="nut-summary-card">
                                <div className="nsc-header">
                                  <Apple size={18} />{" "}
                                  <strong>{userNutrition.title}</strong>
                                </div>
                                {userNutrition.goal && (
                                  <p className="nsc-goal">
                                    Goal: {userNutrition.goal}
                                  </p>
                                )}
                                <div className="nsc-macros">
                                  {userNutrition.dailyCalories && (
                                    <div className="nsc-macro">
                                      <strong>
                                        {userNutrition.dailyCalories}
                                      </strong>
                                      <span>kcal</span>
                                    </div>
                                  )}
                                  {userNutrition.dailyProtein && (
                                    <div className="nsc-macro protein">
                                      <strong>
                                        {userNutrition.dailyProtein}g
                                      </strong>
                                      <span>Protein</span>
                                    </div>
                                  )}
                                  {userNutrition.dailyCarbs && (
                                    <div className="nsc-macro carbs">
                                      <strong>
                                        {userNutrition.dailyCarbs}g
                                      </strong>
                                      <span>Carbs</span>
                                    </div>
                                  )}
                                  {userNutrition.dailyFat && (
                                    <div className="nsc-macro fat">
                                      <strong>{userNutrition.dailyFat}g</strong>
                                      <span>Fat</span>
                                    </div>
                                  )}
                                </div>
                                <p
                                  style={{
                                    fontSize: "0.8rem",
                                    color: "var(--grey)",
                                    marginTop: "8px",
                                  }}
                                >
                                  {userNutrition.meals.length} meals configured
                                </p>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
                {!selUserId && (
                  <div className="admin-empty" style={{ padding: "60px" }}>
                    <User size={40} />
                    <p>Select a client from the left to manage their plans.</p>
                  </div>
                )}
              </div>
            )}

            {/* ── USERS ── */}
            {tab === "sales" && (
              <div className="form-panel">
                <div className="panel-header-row">
                  <div>
                    <h2>🛒 Program Sales</h2>
                    <p className="panel-sub">
                      Program purchases — newest first. Sales since your last
                      visit are marked NEW.
                    </p>
                  </div>
                </div>
                <div
                  className="user-search-wrap"
                  style={{ marginBottom: "12px", maxWidth: 380 }}
                >
                  <Search size={15} />
                  <input
                    placeholder="Search by customer, email, phone or program..."
                    value={salesSearch}
                    onChange={(e) => setSalesSearch(e.target.value)}
                  />
                </div>
                {salesLoading ? (
                  <div className="admin-loading">
                    <div className="spinner spinner-dark" />
                  </div>
                ) : salesFiltered.length === 0 ? (
                  <div className="admin-empty">
                    <p>
                      {salesSearch
                        ? "No sales match your search."
                        : "No program sales yet."}
                    </p>
                  </div>
                ) : (
                  <div className="users-list">
                    {salesFiltered.map((pc, i) => (
                      <div
                        key={pc._id}
                        className="user-row fade-up"
                        style={{ animationDelay: `${i * 0.03}s` }}
                      >
                        <div className="user-avatar">
                          {(pc.user?.name || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="user-info">
                          <div className="user-name-row">
                            <strong>
                              {pc.service?.name ||
                                (pc.kind === "booking"
                                  ? "Training Session"
                                  : "Program")}
                            </strong>
                            {new Date(pc.paidAt || pc.createdAt).getTime() >
                              salesSeenAt && (
                              <span
                                className="user-admin-badge"
                                style={{ background: "#dc2626" }}
                              >
                                ✨ NEW
                              </span>
                            )}
                            {pc.service?.isCustom && (
                              <span
                                className="user-admin-badge"
                                style={{ background: "#7c3aed" }}
                              >
                                🎯 custom — build plan
                              </span>
                            )}
                            <span
                              className={`user-admin-badge`}
                              style={{
                                background:
                                  pc.paymentStatus === "paid"
                                    ? "#16a34a"
                                    : pc.paymentStatus === "refunded"
                                      ? "#7c3aed"
                                      : "#d97706",
                              }}
                            >
                              {pc.paymentStatus === "refunded"
                                ? `refunded $${pc.amount}`
                                : pc.paymentStatus}
                            </span>
                          </div>
                          <span>
                            👤 {pc.user?.name} · 📧 {pc.user?.email} · 📞{" "}
                            {pc.user?.phone}
                            {pc.user?.phone && (
                              <a
                                href={`https://wa.me/${String(pc.user.phone).replace(/[^0-9]/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  marginLeft: 6,
                                  fontSize: ".72rem",
                                  background: "#dcfce7",
                                  color: "#166534",
                                  borderRadius: 6,
                                  padding: "1px 6px",
                                  textDecoration: "none",
                                }}
                              >
                                💬 WhatsApp
                              </a>
                            )}
                          </span>
                          <span>
                            💰 ${pc.amount}
                            {pc.kind === "booking" && (
                              <span
                                style={{
                                  background: "#e0f2fe",
                                  color: "#075985",
                                  borderRadius: 6,
                                  padding: "1px 6px",
                                  fontSize: ".72rem",
                                  marginLeft: 6,
                                }}
                              >
                                📋 {pc.sessions?.length || 0} session
                                {(pc.sessions?.length || 0) !== 1 ? "s" : ""}
                              </span>
                            )}
                            {pc.wantsNutrition && (
                              <span
                                style={{
                                  background: "#dcfce7",
                                  color: "#166534",
                                  borderRadius: 6,
                                  padding: "1px 6px",
                                  fontSize: ".72rem",
                                  marginLeft: 6,
                                }}
                              >
                                🥗 + nutrition (${pc.nutritionPrice})
                              </span>
                            )}{" "}
                            {pc.paidAt
                              ? `· paid ${format(new Date(pc.paidAt), "MMM d, yyyy HH:mm")}`
                              : ""}
                          </span>
                          {pc.kind === "booking" && pc.sessions?.length > 0 && (
                            <span
                              style={{
                                fontSize: ".78rem",
                                opacity: 0.8,
                                background: "#f0f9ff",
                                borderRadius: 6,
                                padding: "3px 8px",
                                display: "inline-block",
                                marginTop: 2,
                              }}
                            >
                              🗓️{" "}
                              {pc.sessions.map((s, idx) => (
                                <span
                                  key={idx}
                                  style={
                                    s.status === "rejected"
                                      ? {
                                          textDecoration: "line-through",
                                          color: "#dc2626",
                                        }
                                      : undefined
                                  }
                                >
                                  {idx > 0 ? " · " : ""}
                                  {s.date} {s.time}{" "}
                                  {s.mode === "online" ? "💻" : "🏟️"}
                                  {s.status === "rejected" ? " ❌" : ""}
                                </span>
                              ))}
                            </span>
                          )}
                          {pc.kind === "booking" &&
                            pc.sessions?.some(
                              (s) => s.status === "rejected",
                            ) && (
                              <span
                                style={{
                                  fontSize: ".76rem",
                                  color: "#b91c1c",
                                  background: "#fef2f2",
                                  borderRadius: 6,
                                  padding: "3px 8px",
                                  display: "inline-block",
                                  marginTop: 2,
                                }}
                              >
                                ⚠️ This one is rejected — if you refund all,
                                only the unrejected session(s) will be
                                refunded.
                              </span>
                            )}
                          {pc.intake && (
                            <span
                              style={{
                                fontSize: ".78rem",
                                opacity: 0.85,
                                background: "#faf5ff",
                                borderRadius: 6,
                                padding: "3px 8px",
                                display: "inline-block",
                                marginTop: 2,
                              }}
                            >
                              📝{" "}
                              {pc.intake.daysPerWeek
                                ? `${pc.intake.daysPerWeek} days/wk · `
                                : ""}
                              {pc.intake.weightKg
                                ? `${pc.intake.weightKg}kg · `
                                : ""}
                              {pc.intake.heightCm
                                ? `${pc.intake.heightCm}cm · `
                                : ""}
                              {pc.intake.age ? `${pc.intake.age}y · ` : ""}
                              {pc.intake.goal || ""}
                              {pc.intake.notes ? ` — "${pc.intake.notes}"` : ""}
                            </span>
                          )}
                          <span className="user-joined">
                            Created{" "}
                            {format(
                              new Date(pc.createdAt),
                              "MMM d, yyyy HH:mm",
                            )}
                          </span>
                          {pc.paymentStatus === "paid" &&
                            pc.cyberSourceTransId &&
                            !(
                              pc.kind === "booking" &&
                              pc.sessions?.length > 0 &&
                              pc.sessions.every((s) => s.status === "rejected")
                            ) && (
                              <button
                                className="btn btn-outline btn-sm"
                                style={{
                                  marginTop: 6,
                                  color: "#dc2626",
                                  borderColor: "#dc2626",
                                }}
                                onClick={() => handleRefund(pc)}
                              >
                                💸 Refund
                              </button>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "users" && (
              <div className="form-panel">
                <div className="panel-header-row">
                  <div>
                    <h2>👥 Users</h2>
                    <p className="panel-sub">
                      Manage, activate/deactivate or remove clients.
                    </p>
                  </div>
                  <div
                    style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}
                  >
                    <button
                      className="btn btn-outline btn-sm export-btn"
                      onClick={handleExportUsers}
                    >
                      <Download size={14} /> Export CSV
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={loadUsers}
                      disabled={usersLoading}
                    >
                      <RefreshCw size={14} /> Refresh
                    </button>
                  </div>
                </div>
                {users.length > 0 && (
                  <div className="user-search-wrap">
                    <Search size={15} />
                    <input
                      placeholder="Search name, email or phone..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                    />
                    {userSearch && (
                      <button
                        className="user-search-clear"
                        onClick={() => setUserSearch("")}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                )}
                {usersLoading ? (
                  <div className="admin-loading">
                    <div className="spinner spinner-dark" />
                  </div>
                ) : filtUsers.length === 0 ? (
                  <div className="admin-empty">
                    <Users size={36} />
                    <p>No users found.</p>
                  </div>
                ) : (
                  <div className="users-list">
                    {filtUsers.map((u, i) => (
                      <div
                        key={u._id}
                        className={`user-row fade-up ${u.role === "admin" ? "user-admin" : ""} ${u.isActive === false ? "user-inactive" : ""}`}
                        style={{
                          animationDelay: `${i * 0.04}s`,
                          flexWrap: "wrap",
                        }}
                      >
                        <div
                          className={`user-avatar ${u.isActive === false ? "ua-inactive" : ""}`}
                        >
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="user-info">
                          <div className="user-name-row">
                            <strong>{u.name}</strong>
                            {u.role === "admin" && (
                              <span className="user-admin-badge">Admin</span>
                            )}
                            {u.isActive === false && (
                              <span className="user-inactive-badge">
                                Deactivated
                              </span>
                            )}
                          </div>
                          <span>📧 {u.email}</span>
                          <span>📞 {u.phone}</span>
                          <span className="user-joined">
                            Joined{" "}
                            {format(new Date(u.createdAt), "MMM d, yyyy")}
                          </span>
                        </div>
                        <div className="user-actions">
                          {u.phone && (
                            <a
                              className="user-reset-btn"
                              href={`https://wa.me/${String(u.phone).replace(/[^0-9]/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Contact via WhatsApp"
                              style={{
                                textDecoration: "none",
                                background: "#dcfce7",
                                color: "#166534",
                              }}
                            >
                              💬<span>WhatsApp</span>
                            </a>
                          )}
                          <button
                            className="user-reset-btn"
                            title="View activity log"
                            onClick={() => toggleActivity(u._id)}
                          >
                            <List size={13} />
                            <span>
                              {activityOpenId === u._id
                                ? "Hide Activity"
                                : "View Activity"}
                            </span>
                          </button>
                          {u.role !== "admin" && (
                            <>
                              <button
                                className="user-reset-btn"
                                title="Reset Password"
                                onClick={() => {
                                  setResetModal({
                                    userId: u._id,
                                    userName: u.name,
                                  });
                                  setNewPassword("");
                                }}
                              >
                                <KeyRound size={13} />
                                <span>Reset PW</span>
                              </button>
                              <button
                                className={`user-toggle-btn ${u.isActive === false ? "activate" : "deactivate"}`}
                                title={
                                  u.isActive === false
                                    ? "Activate user"
                                    : "Deactivate user"
                                }
                                onClick={() =>
                                  handleToggleActive(u._id, u.name, u.isActive)
                                }
                              >
                                {u.isActive === false ? (
                                  <>
                                    <CheckCircle size={13} />
                                    <span>Activate</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle size={13} />
                                    <span>Deactivate</span>
                                  </>
                                )}
                              </button>
                              <button
                                className="user-delete-btn"
                                title="Permanently delete"
                                onClick={() => handleDeleteUser(u._id, u.name)}
                              >
                                <Trash2 size={13} />
                                <span>Delete</span>
                              </button>
                            </>
                          )}
                        </div>
                        {activityOpenId === u._id && (
                          <div
                            style={{
                              flexBasis: "100%",
                              marginTop: 10,
                              background: "#f9fafb",
                              border: "1px solid #e5e7eb",
                              borderRadius: 8,
                              padding: "10px 12px",
                            }}
                          >
                            {activityLoading ? (
                              <div
                                className="spinner spinner-dark"
                                style={{ margin: "6px auto" }}
                              />
                            ) : activityLog.length === 0 ? (
                              <p
                                style={{
                                  fontSize: ".8rem",
                                  opacity: 0.7,
                                  margin: 0,
                                }}
                              >
                                No activity recorded yet.
                              </p>
                            ) : (
                              <div
                                style={{ maxHeight: 260, overflowY: "auto" }}
                              >
                                {activityLog.map((ev) => (
                                  <div
                                    key={ev._id}
                                    style={{
                                      fontSize: ".8rem",
                                      padding: "4px 0",
                                      borderBottom: "1px solid #eee",
                                    }}
                                  >
                                    <span style={{ opacity: 0.6 }}>
                                      {format(
                                        new Date(ev.createdAt),
                                        "MMM d, yyyy HH:mm",
                                      )}
                                    </span>
                                    {" · "}
                                    <strong
                                      style={{ textTransform: "capitalize" }}
                                    >
                                      {ev.type.replace(/_/g, " ")}
                                    </strong>
                                    {ev.message && <> — {ev.message}</>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── RENEWALS ── */}
            {tab === "renewals" && (
              <div className="form-panel">
                <div className="panel-header-row">
                  <div>
                    <h2>🔔 Renewals</h2>
                    <p className="panel-sub">
                      30-day access windows expiring soon, or already in the
                      1-day grace period.
                    </p>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={loadRenewals}
                  >
                    <RefreshCw size={14} /> Refresh
                  </button>
                </div>

                {renewals.grace.length > 0 && (
                  <div
                    style={{
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: 10,
                      padding: "10px 12px",
                      marginBottom: 16,
                    }}
                  >
                    <strong style={{ fontSize: ".88rem" }}>
                      ⏰ In grace period — last day! ({renewals.grace.length})
                    </strong>
                    <p
                      style={{
                        fontSize: ".76rem",
                        opacity: 0.8,
                        margin: "4px 0 8px",
                      }}
                    >
                      These clients' access already lapsed and expires for good
                      tomorrow unless they renew:
                    </p>
                    {renewals.grace.map((e) => (
                      <div
                        key={e._id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                          fontSize: ".82rem",
                          padding: "4px 0",
                        }}
                      >
                        <span>
                          • {e.user?.name}{" "}
                          <span style={{ opacity: 0.6 }}>
                            ({e.user?.email})
                          </span>{" "}
                          — {e.service?.name || "Program"}
                        </span>
                        {e.user?.phone && (
                          <a
                            href={`https://wa.me/${String(e.user.phone).replace(/[^0-9]/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: ".72rem",
                              background: "#dcfce7",
                              color: "#166534",
                              borderRadius: 6,
                              padding: "1px 6px",
                              textDecoration: "none",
                              whiteSpace: "nowrap",
                            }}
                          >
                            💬 WhatsApp
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {renewals.upcoming.length === 0 &&
                renewals.grace.length === 0 ? (
                  <div className="admin-empty">
                    <AlertCircle size={36} />
                    <p>No renewals due soon.</p>
                  </div>
                ) : (
                  renewals.upcoming.length > 0 && (
                    <div
                      style={{
                        background: "#fffbeb",
                        border: "1px solid #fde68a",
                        borderRadius: 10,
                        padding: "10px 12px",
                      }}
                    >
                      <strong style={{ fontSize: ".88rem" }}>
                        📅 Expiring within 2 days ({renewals.upcoming.length})
                      </strong>
                      <p
                        style={{
                          fontSize: ".76rem",
                          opacity: 0.8,
                          margin: "4px 0 8px",
                        }}
                      >
                        Give these clients a nudge to renew before access
                        lapses:
                      </p>
                      {renewals.upcoming.map((e) => (
                        <div
                          key={e._id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 8,
                            fontSize: ".82rem",
                            padding: "4px 0",
                          }}
                        >
                          <span>
                            • {e.user?.name}{" "}
                            <span style={{ opacity: 0.6 }}>
                              ({e.user?.email})
                            </span>{" "}
                            — {e.service?.name || "Program"} · expires{" "}
                            {format(new Date(e.expiresAt), "MMM d, HH:mm")}
                          </span>
                          <span
                            style={{ display: "flex", gap: 6, flexShrink: 0 }}
                          >
                            {e.user?.phone && (
                              <a
                                href={`https://wa.me/${String(e.user.phone).replace(/[^0-9]/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: ".72rem",
                                  background: "#dcfce7",
                                  color: "#166534",
                                  borderRadius: 6,
                                  padding: "1px 6px",
                                  textDecoration: "none",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                💬 WhatsApp
                              </a>
                            )}
                            <button
                              className="btn btn-outline btn-sm"
                              style={{ fontSize: ".72rem", padding: "1px 8px" }}
                              onClick={() => markReminded(e)}
                            >
                              Mark reminded
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}

            {/* ── SETTINGS ── */}
            {tab === "settings" && (
              <div style={{ maxWidth: "760px", margin: "0 auto" }}>
                {!settingsForm ? (
                  <div className="admin-loading">
                    <div className="spinner spinner-dark" />
                  </div>
                ) : (
                  <form onSubmit={submitSettings}>
                    {/* Business */}
                    <div className="card" style={{ marginBottom: "16px" }}>
                      <h4 className="settings-section-title">
                        🏋️ Business Info
                      </h4>
                      <div className="form-row-2">
                        <div className="form-group">
                          <label>Business Name</label>
                          <input
                            value={settingsForm.shopName || ""}
                            onChange={(e) =>
                              setSettingsForm((p) => ({
                                ...p,
                                shopName: e.target.value,
                              }))
                            }
                            placeholder="FitPro Training"
                          />
                        </div>
                        <div className="form-group">
                          <label>🥗 Nutrition Plan Add-on Price ($)</label>
                          <input
                            type="number"
                            min="0"
                            value={settingsForm.nutritionPrice ?? ""}
                            onChange={(e) =>
                              setSettingsForm((p) => ({
                                ...p,
                                nutritionPrice: e.target.value,
                              }))
                            }
                            placeholder="e.g. 25"
                          />
                          <small style={{ opacity: 0.65, fontSize: ".75rem" }}>
                            Charged when a customer adds a nutrition plan at
                            checkout (programs & bookings)
                          </small>
                        </div>
                        <div className="form-group">
                          <label>🏟️ Live Appointment Price ($)</label>
                          <input
                            type="number"
                            min="0"
                            value={settingsForm.sessionPriceLive ?? ""}
                            onChange={(e) =>
                              setSettingsForm((p) => ({
                                ...p,
                                sessionPriceLive: e.target.value,
                              }))
                            }
                            placeholder="e.g. 60"
                          />
                          <small style={{ opacity: 0.65, fontSize: ".75rem" }}>
                            Price for a generic live appointment booked from the
                            Appointments page
                          </small>
                        </div>
                        <div className="form-group">
                          <label>💻 Online Appointment Price ($)</label>
                          <input
                            type="number"
                            min="0"
                            value={settingsForm.sessionPriceOnline ?? ""}
                            onChange={(e) =>
                              setSettingsForm((p) => ({
                                ...p,
                                sessionPriceOnline: e.target.value,
                              }))
                            }
                            placeholder="e.g. 40"
                          />
                          <small style={{ opacity: 0.65, fontSize: ".75rem" }}>
                            Price for a generic online appointment booked from
                            the Appointments page
                          </small>
                        </div>
                        <div className="form-group">
                          <label>Tagline</label>
                          <input
                            value={settingsForm.tagline || ""}
                            onChange={(e) =>
                              setSettingsForm((p) => ({
                                ...p,
                                tagline: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div className="form-row-2">
                        <div className="form-group">
                          <label>Address</label>
                          <input
                            value={settingsForm.address || ""}
                            onChange={(e) =>
                              setSettingsForm((p) => ({
                                ...p,
                                address: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="form-group">
                          <label>Google Maps URL</label>
                          <input
                            value={settingsForm.googleMapsUrl || ""}
                            onChange={(e) =>
                              setSettingsForm((p) => ({
                                ...p,
                                googleMapsUrl: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Email</label>
                        <input
                          type="email"
                          value={settingsForm.email || ""}
                          onChange={(e) =>
                            setSettingsForm((p) => ({
                              ...p,
                              email: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                    {/* Home Page */}
                    <div className="card" style={{ marginBottom: "16px" }}>
                      <h4 className="settings-section-title">
                        <Home size={16} /> Home Page
                      </h4>
                      <div className="form-group">
                        <label>Hero Title</label>
                        <input
                          value={settingsForm.heroTitle || ""}
                          onChange={(e) =>
                            setSettingsForm((p) => ({
                              ...p,
                              heroTitle: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label>Hero Subtitle</label>
                        <textarea
                          rows={3}
                          value={settingsForm.heroSubtitle || ""}
                          onChange={(e) =>
                            setSettingsForm((p) => ({
                              ...p,
                              heroSubtitle: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <p
                        style={{
                          fontSize: "0.8rem",
                          fontWeight: "700",
                          color: "var(--grey)",
                          marginBottom: "10px",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        Stats
                      </p>
                      {[1, 2, 3, 4].map((n) => (
                        <div key={n} className="form-row-2">
                          <div className="form-group">
                            <label>Stat {n} Value</label>
                            <input
                              value={settingsForm[`stat${n}Value`] || ""}
                              onChange={(e) =>
                                setSettingsForm((p) => ({
                                  ...p,
                                  [`stat${n}Value`]: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="form-group">
                            <label>Stat {n} Label</label>
                            <input
                              value={settingsForm[`stat${n}Label`] || ""}
                              onChange={(e) =>
                                setSettingsForm((p) => ({
                                  ...p,
                                  [`stat${n}Label`]: e.target.value,
                                }))
                              }
                            />
                          </div>
                        </div>
                      ))}
                      <p
                        style={{
                          fontSize: "0.8rem",
                          fontWeight: "700",
                          color: "var(--grey)",
                          margin: "12px 0 10px",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        Features
                      </p>
                      {[1, 2, 3, 4].map((n) => (
                        <div key={n} className="form-row-2">
                          <div className="form-group">
                            <label>Feature {n} Title</label>
                            <input
                              value={settingsForm[`feature${n}Title`] || ""}
                              onChange={(e) =>
                                setSettingsForm((p) => ({
                                  ...p,
                                  [`feature${n}Title`]: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="form-group">
                            <label>Feature {n} Desc</label>
                            <input
                              value={settingsForm[`feature${n}Desc`] || ""}
                              onChange={(e) =>
                                setSettingsForm((p) => ({
                                  ...p,
                                  [`feature${n}Desc`]: e.target.value,
                                }))
                              }
                            />
                          </div>
                        </div>
                      ))}
                      <div className="form-group">
                        <label>CTA Title</label>
                        <input
                          value={settingsForm.ctaTitle || ""}
                          onChange={(e) =>
                            setSettingsForm((p) => ({
                              ...p,
                              ctaTitle: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label>CTA Subtitle</label>
                        <textarea
                          rows={2}
                          value={settingsForm.ctaSubtitle || ""}
                          onChange={(e) =>
                            setSettingsForm((p) => ({
                              ...p,
                              ctaSubtitle: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                    {/* Hours */}
                    <div className="card" style={{ marginBottom: "16px" }}>
                      <h4 className="settings-section-title">
                        🕐 Footer Hours
                      </h4>
                      <div className="form-group">
                        <label>Weekdays</label>
                        <input
                          value={settingsForm.hoursWeekdays || ""}
                          onChange={(e) =>
                            setSettingsForm((p) => ({
                              ...p,
                              hoursWeekdays: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label>Saturday</label>
                        <input
                          value={settingsForm.hoursSaturday || ""}
                          onChange={(e) =>
                            setSettingsForm((p) => ({
                              ...p,
                              hoursSaturday: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label>Sunday</label>
                        <input
                          value={settingsForm.hoursSunday || ""}
                          onChange={(e) =>
                            setSettingsForm((p) => ({
                              ...p,
                              hoursSunday: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                    {/* Social */}
                    <div className="card" style={{ marginBottom: "20px" }}>
                      <h4 className="settings-section-title">
                        📱 Contact & Social
                      </h4>
                      <div className="form-row-2">
                        <div className="form-group">
                          <label>📞 Phone</label>
                          <input
                            value={settingsForm.phone || ""}
                            onChange={(e) =>
                              setSettingsForm((p) => ({
                                ...p,
                                phone: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="form-group">
                          <label>💬 WhatsApp</label>
                          <input
                            value={settingsForm.whatsapp || ""}
                            onChange={(e) =>
                              setSettingsForm((p) => ({
                                ...p,
                                whatsapp: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div className="form-row-2">
                        <div className="form-group">
                          <label>📘 Facebook</label>
                          <input
                            value={settingsForm.facebook || ""}
                            onChange={(e) =>
                              setSettingsForm((p) => ({
                                ...p,
                                facebook: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="form-group">
                          <label>📸 Instagram</label>
                          <input
                            value={settingsForm.instagram || ""}
                            onChange={(e) =>
                              setSettingsForm((p) => ({
                                ...p,
                                instagram: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div className="form-group" style={{ maxWidth: "50%" }}>
                        <label>🎵 TikTok</label>
                        <input
                          value={settingsForm.tiktok || ""}
                          onChange={(e) =>
                            setSettingsForm((p) => ({
                              ...p,
                              tiktok: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={settingsSaving}
                    >
                      {settingsSaving ? (
                        <>
                          <div className="spinner" /> Saving...
                        </>
                      ) : (
                        "💾 Save All Settings"
                      )}
                    </button>
                  </form>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Note Modal ── */}
      {noteModal && (
        <div className="modal-overlay" onClick={() => setNoteModal(null)}>
          <div
            className="modal-box fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-top-bar">
              <h3>
                {noteModal.action === "confirm" ? "✅ Confirm" : "❌ Reject"}{" "}
                Session
              </h3>
              <button
                className="modal-close-btn"
                onClick={() => setNoteModal(null)}
              >
                <X size={18} />
              </button>
            </div>
            <p>Optional note for the client.</p>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              placeholder={
                noteModal.action === "confirm"
                  ? "e.g. See you tomorrow!"
                  : "e.g. Please rebook."
              }
            />
            <div className="modal-actions">
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setNoteModal(null)}
              >
                Cancel
              </button>
              <button
                className={`btn btn-sm ${noteModal.action === "confirm" ? "btn-confirm-final" : "btn-reject-final"}`}
                onClick={execAction}
              >
                {noteModal.action === "confirm" ? (
                  <>
                    <CheckCircle size={13} /> Confirm
                  </>
                ) : (
                  <>
                    <XCircle size={13} /> Reject
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Service Modal ── */}
      {svcModal && (
        <div className="modal-overlay" onClick={() => setSvcModal(false)}>
          <div
            className="modal-box service-modal fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-top-bar">
              <h3>{editingSvc ? "Edit" : "Add"} Service</h3>
              <button
                className="modal-close-btn"
                onClick={() => setSvcModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitSvc}>
              <div className="form-group">
                <label>Name *</label>
                <input
                  value={svcForm.name}
                  onChange={(e) =>
                    setSvcForm((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="e.g. Weight Training"
                />
              </div>
              <div className="form-group">
                <label>Description *</label>
                <textarea
                  value={svcForm.description}
                  onChange={(e) =>
                    setSvcForm((p) => ({ ...p, description: e.target.value }))
                  }
                  rows={2}
                  placeholder="What clients will get..."
                />
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label>
                    {svcForm.trainingType === "self"
                      ? "Program Price ($) *"
                      : "Base Price ($) *"}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={svcForm.price}
                    onChange={(e) =>
                      setSvcForm((p) => ({ ...p, price: e.target.value }))
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Duration (min) *</label>
                  <input
                    type="number"
                    min="1"
                    value={svcForm.duration}
                    onChange={(e) =>
                      setSvcForm((p) => ({ ...p, duration: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Training Type *</label>
                <select
                  value={svcForm.trainingType || "pt"}
                  onChange={(e) =>
                    setSvcForm((p) => ({ ...p, trainingType: e.target.value }))
                  }
                >
                  <option value="pt">
                    📋 Predefined Program — booked as calendar sessions (live or
                    online); content unlocks in My Programs after payment
                  </option>
                  <option value="self">
                    🎯 Custom Program — intake questionnaire + one-time
                    purchase; you build the plan per user in Workout Plans (My
                    Plans)
                  </option>
                </select>
              </div>
              {(svcForm.trainingType || "pt") === "pt" && (
                <div className="form-row">
                  <div className="form-group">
                    <label>
                      Live Session Price ($){" "}
                      <small>(optional — falls back to base)</small>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={svcForm.priceLive}
                      placeholder="e.g. 80"
                      onChange={(e) =>
                        setSvcForm((p) => ({ ...p, priceLive: e.target.value }))
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>
                      Online Session Price ($){" "}
                      <small>(optional — falls back to base)</small>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={svcForm.priceOnline}
                      placeholder="e.g. 50"
                      onChange={(e) =>
                        setSvcForm((p) => ({
                          ...p,
                          priceOnline: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              )}
              {(svcForm.trainingType || "pt") === "self" && (
                <p
                  style={{
                    fontSize: ".82rem",
                    opacity: 0.75,
                    margin: "4px 0 10px",
                  }}
                >
                  🎯 Custom Program: the buyer answers an intake questionnaire
                  (days/week, weight, goal…), pays once, then{" "}
                  <strong>
                    you build their personalized plan in Workout Plans
                  </strong>{" "}
                  — it appears in their My&nbsp;Plans. Sections you add here
                  stay visible to you only (a private template).
                </p>
              )}
              <div className="form-group">
                <label>Category *</label>
                <select
                  value={svcForm.category}
                  onChange={(e) =>
                    setSvcForm((p) => ({ ...p, category: e.target.value }))
                  }
                >
                  {CATS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Photo URL (optional)</label>
                <input
                  value={svcForm.imageUrl}
                  onChange={(e) =>
                    setSvcForm((p) => ({ ...p, imageUrl: e.target.value }))
                  }
                  placeholder="https://... (leave blank for default category photo)"
                />
              </div>
              {(svcForm.imageUrl || CAT_IMAGES[svcForm.category]) && (
                <div style={{ marginBottom: "12px" }}>
                  <img
                    src={svcForm.imageUrl || CAT_IMAGES[svcForm.category]}
                    alt="preview"
                    style={{
                      width: "100%",
                      height: "120px",
                      objectFit: "cover",
                      borderRadius: "8px",
                    }}
                  />
                </div>
              )}

              {/* ── Sections editor ── */}
              <div className="svc-section-title">
                <List size={14} /> Program Sections
              </div>
              <p
                style={{
                  fontSize: "0.78rem",
                  color: "var(--grey)",
                  marginBottom: "12px",
                }}
              >
                Add headings (e.g. "What You'll Get", "Equipment Needed") and
                under each heading add items with a title and description.
              </p>

              {(svcForm.sections || []).map((sec, si) => (
                <div key={si} className="section-editor">
                  {/* Section heading row */}
                  <div className="section-heading-row">
                    <div className="form-group" style={{ flex: 1, margin: 0 }}>
                      <label>Section Heading</label>
                      <input
                        value={sec.heading}
                        onChange={(e) => {
                          const arr = [...(svcForm.sections || [])];
                          arr[si] = { ...arr[si], heading: e.target.value };
                          setSvcForm((p) => ({ ...p, sections: arr }));
                        }}
                        placeholder="e.g. What You'll Get, Equipment Needed..."
                      />
                    </div>
                    <button
                      type="button"
                      className="ex-remove-btn section-remove-btn"
                      onClick={() =>
                        setSvcForm((p) => ({
                          ...p,
                          sections: (p.sections || []).filter(
                            (_, j) => j !== si,
                          ),
                        }))
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Items under this section */}
                  {(sec.items || []).map((item, ii) => (
                    <div key={ii} className="section-item-editor">
                      <div className="section-item-header">
                        <span className="section-item-num">Item {ii + 1}</span>
                        <button
                          type="button"
                          className="ex-remove-btn"
                          onClick={() => {
                            const arr = [...(svcForm.sections || [])];
                            arr[si] = {
                              ...arr[si],
                              items: (arr[si].items || []).filter(
                                (_, j) => j !== ii,
                              ),
                            };
                            setSvcForm((p) => ({ ...p, sections: arr }));
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="form-group">
                        <label>Item Title</label>
                        <input
                          value={item.title}
                          onChange={(e) => {
                            const arr = [...(svcForm.sections || [])];
                            arr[si] = {
                              ...arr[si],
                              items: (arr[si].items || []).map((it, j) =>
                                j === ii
                                  ? { ...it, title: e.target.value }
                                  : it,
                              ),
                            };
                            setSvcForm((p) => ({ ...p, sections: arr }));
                          }}
                          placeholder="e.g. 3 sessions per week"
                        />
                      </div>
                      <div className="form-group">
                        <label>Item Description</label>
                        <textarea
                          rows={2}
                          value={item.description}
                          onChange={(e) => {
                            const arr = [...(svcForm.sections || [])];
                            arr[si] = {
                              ...arr[si],
                              items: (arr[si].items || []).map((it, j) =>
                                j === ii
                                  ? { ...it, description: e.target.value }
                                  : it,
                              ),
                            };
                            setSvcForm((p) => ({ ...p, sections: arr }));
                          }}
                          placeholder="Describe this item in more detail..."
                        />
                      </div>
                      <div className="form-group">
                        <label>Item Photo URL (optional)</label>
                        <input
                          value={item.imageUrl || ""}
                          onChange={(e) => {
                            const arr = [...(svcForm.sections || [])];
                            arr[si] = {
                              ...arr[si],
                              items: (arr[si].items || []).map((it, j) =>
                                j === ii
                                  ? { ...it, imageUrl: e.target.value }
                                  : it,
                              ),
                            };
                            setSvcForm((p) => ({ ...p, sections: arr }));
                          }}
                          placeholder="https://... (photo shown beside item)"
                        />
                        {item.imageUrl && (
                          <img
                            src={item.imageUrl}
                            alt="preview"
                            style={{
                              width: "80px",
                              height: "60px",
                              objectFit: "cover",
                              borderRadius: "6px",
                              marginTop: "6px",
                            }}
                          />
                        )}
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="add-item-btn"
                    onClick={() => {
                      const arr = [...(svcForm.sections || [])];
                      arr[si] = {
                        ...arr[si],
                        items: [...(arr[si].items || []), { ...EMPTY_ITEM }],
                      };
                      setSvcForm((p) => ({ ...p, sections: arr }));
                    }}
                  >
                    <Plus size={12} /> Add Item to this Section
                  </button>
                </div>
              ))}

              <button
                type="button"
                className="add-ex-btn"
                style={{ marginBottom: "14px" }}
                onClick={() =>
                  setSvcForm((p) => ({
                    ...p,
                    sections: [...(p.sections || []), { ...EMPTY_SECTION }],
                  }))
                }
              >
                <Plus size={13} /> Add Section
              </button>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setSvcModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={svcLoading}
                >
                  {svcLoading ? (
                    <div className="spinner spinner-sm" />
                  ) : editingSvc ? (
                    <>
                      <Save size={13} /> Save
                    </>
                  ) : (
                    <>
                      <Plus size={13} /> Add
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Bundle Modal ── */}
      {bundleModal && (
        <div className="modal-overlay" onClick={() => setBundleModal(false)}>
          <div
            className="modal-box service-modal fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-top-bar">
              <h3>{editingBundle ? "Edit" : "Add"} Bundle</h3>
              <button
                className="modal-close-btn"
                onClick={() => setBundleModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitBundle}>
              <div className="form-group">
                <label>Bundle Name *</label>
                <input
                  value={bundleForm.name}
                  onChange={(e) =>
                    setBundleForm((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="e.g. Monthly Pack 8 Sessions"
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <input
                  value={bundleForm.description}
                  onChange={(e) =>
                    setBundleForm((p) => ({
                      ...p,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Short description..."
                />
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label>Sessions (max) *</label>
                  <input
                    type="number"
                    min="1"
                    value={bundleForm.sessions}
                    onChange={(e) =>
                      setBundleForm((p) => ({ ...p, sessions: e.target.value }))
                    }
                    placeholder="8"
                  />
                </div>
                <div className="form-group">
                  <label>Flat Price ($) *</label>
                  <input
                    type="number"
                    min="1"
                    value={bundleForm.price}
                    onChange={(e) =>
                      setBundleForm((p) => ({ ...p, price: e.target.value }))
                    }
                    placeholder="350"
                  />
                </div>
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label>Validity (days)</label>
                  <input
                    type="number"
                    min="1"
                    value={bundleForm.validDays}
                    onChange={(e) =>
                      setBundleForm((p) => ({
                        ...p,
                        validDays: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Specific Service (optional)</label>
                  <select
                    value={bundleForm.serviceId}
                    onChange={(e) =>
                      setBundleForm((p) => ({
                        ...p,
                        serviceId: e.target.value,
                      }))
                    }
                  >
                    <option value="">-- All services --</option>
                    {services.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setBundleModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={bundleLoading}
                >
                  {bundleLoading ? (
                    <div className="spinner spinner-sm" />
                  ) : editingBundle ? (
                    <>
                      <Save size={13} /> Save
                    </>
                  ) : (
                    <>
                      <Plus size={13} /> Add
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Reset Password Modal ── */}
      {resetModal && (
        <div className="modal-overlay" onClick={() => setResetModal(null)}>
          <div
            className="modal-box fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-top-bar">
              <h3>
                <KeyRound size={16} /> Reset Password
              </h3>
              <button
                className="modal-close-btn"
                onClick={() => setResetModal(null)}
              >
                <X size={18} />
              </button>
            </div>
            <p>
              Set a new password for <strong>{resetModal.userName}</strong>.
            </p>
            <div style={{ margin: "12px 0" }}>
              <PwInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setResetModal(null)}
              >
                Cancel
              </button>
              <button
                className="btn-confirm-final"
                onClick={submitReset}
                disabled={resetLoading || newPassword.length < 8}
                style={{ opacity: newPassword.length < 8 ? 0.5 : 1 }}
              >
                {resetLoading ? (
                  <div className="spinner spinner-sm" />
                ) : (
                  <>
                    <KeyRound size={14} /> Reset
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
