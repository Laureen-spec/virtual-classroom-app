import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api/axios";
import ActiveLiveClasses from "../components/ActiveLiveClasses";
import AdminPayments from "../components/AdminPayments";
// import NotificationBell from "./components/NotificationBell"; // COMMENTED OUT

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [upcomingClasses, setUpcomingClasses] = useState([]);
  const [ongoingClasses, setOngoingClasses] = useState([]);
  const [pastClasses, setPastClasses] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [timetable, setTimetable] = useState([]);
  const [newLesson, setNewLesson] = useState({
    day: "Monday",
    subject: "",
    startTime: "",
    endTime: "",
  });
  const [editingLesson, setEditingLesson] = useState(null);
  const [timetableError, setTimetableError] = useState("");
  const [loading, setLoading] = useState(true);
  const [timetableLoading, setTimetableLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // ADDED: Mobile menu state
  const [showPassword, setShowPassword] = useState(false); // ADDED: Password visibility toggle
  
  // NEW STATE FOR USER CREATION
  const [userForm, setUserForm] = useState({ 
    name: "", 
    email: "", 
    password: "", 
    role: "teacher" 
  });
  const [userMessage, setUserMessage] = useState("");

  // ADDED: Change Password Navigation
  const goToChangePassword = () => {
    navigate("/change-password");
    setIsMobileMenuOpen(false);
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate("/register");
  };

  const handleViewReports = () => {
    navigate("/admin/reports");
    setIsMobileMenuOpen(false);
  };

  const handleViewSchedule = () => {
    navigate("/schedule");
    setIsMobileMenuOpen(false);
  };

  const goToTimetable = () => {
    setActiveTab("timetable");
    setIsMobileMenuOpen(false);
  };

  const handleViewNotifications = () => {
    navigate("/notifications");
    setIsMobileMenuOpen(false);
  };

  // NEW FUNCTION: Handle user creation
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setUserMessage("");
    try {
      await API.post("/auth/create-user", userForm);
      setUserMessage(`✅ ${userForm.role} created successfully!`);
      setUserForm({ name: "", email: "", password: "", role: "teacher" });
      // Refresh users data
      fetchAdminData();
    } catch (err) {
      setUserMessage(err.response?.data?.message || "❌ Failed to create user");
    }
  };

  // NEW FUNCTION: Handle user form changes
  const handleUserFormChange = (e) => {
    const { name, value } = e.target;
    setUserForm(prev => ({ ...prev, [name]: value }));
  };

  // ✅ Fetch all data for admin
  const fetchAdminData = async () => {
    try {
      const [teacherRes, studentRes, upcomingRes, ongoingRes, pastRes, subRes] =
        await Promise.all([
          API.get("/admin/teachers"),
          API.get("/admin/students"),
          API.get("/schedule/upcoming"),
          API.get("/schedule/ongoing"),
          API.get("/schedule/past"),
          API.get("/subscriptions"),
        ]);

      setTeachers(teacherRes.data);
      setStudents(studentRes.data);
      setUpcomingClasses(upcomingRes.data);
      setOngoingClasses(ongoingRes.data);
      setPastClasses(pastRes.data);
      setSubscriptions(subRes.data);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching admin data:", err);
      setLoading(false);
    }
  };

  // 🔹 Fetch timetable
  const fetchTimetable = async () => {
    try {
      const res = await API.get("/timetable");
      setTimetable(res.data);
      setTimetableLoading(false);
    } catch (err) {
      console.error(err);
      setTimetableLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
    fetchTimetable();
  }, []);

  // 🔹 Handle timetable form input
  const handleTimetableChange = (e) => {
    const { name, value } = e.target;
    if (editingLesson) {
      setEditingLesson({ ...editingLesson, [name]: value });
    } else {
      setNewLesson({ ...newLesson, [name]: value });
    }
  };

  // 🔹 Create a lesson
  const handleCreateLesson = async (e) => {
    e.preventDefault();
    setTimetableError("");
    try {
      await API.post("/timetable/create", newLesson);
      setNewLesson({ day: "Monday", subject: "", startTime: "", endTime: "" });
      fetchTimetable();
    } catch (err) {
      setTimetableError(err.response?.data?.message || "Failed to create lesson");
    }
  };

  // 🔹 Update lesson
  const handleUpdateLesson = async (e) => {
    e.preventDefault();
    try {
      await API.put(`/timetable/${editingLesson._id}`, editingLesson);
      setEditingLesson(null);
      fetchTimetable();
    } catch (err) {
      console.error(err);
      alert("Failed to update lesson");
    }
  };

  // 🔹 Delete lesson
  const handleDeleteLesson = async (id) => {
    if (!window.confirm("Are you sure you want to delete this lesson?")) return;
    try {
      await API.delete(`/timetable/${id}`);
      fetchTimetable();
    } catch (err) {
      console.error(err);
      alert("Failed to delete lesson");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-blue-900 to-indigo-900 animate-pulse">
        <p className="text-xl sm:text-2xl text-white font-semibold">Loading Admin Dashboard...</p>
      </div>
    );
  }

  // 📅 Group lessons by day for timetable display
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday","Saturday"];
  const grouped = days.map((day) => ({
    day,
    lessons: timetable.filter((t) => t.day === day),
  }));

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat p-4 sm:p-6"
      style={{
        backgroundImage:
          "url('https://images.unsplash.com/photo-1556761175-4b46a572b786?auto=format&fit=crop&w=1950&q=80')",
      }}
    >
      <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto text-white">
        
        {/* Header - UPDATED: Mobile responsive */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8">
          <div className="flex justify-between items-center w-full sm:w-auto">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-indigo-300 drop-shadow-lg animate-pulse">
              🧑‍💼 Admin Dashboard
            </h1>
            {/* Mobile Menu Button - ADDED */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="sm:hidden bg-indigo-500 text-white p-2 rounded-lg"
            >
              {isMobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>

          {/* Desktop Navigation - UPDATED: Hidden on mobile */}
          <div className="hidden sm:flex items-center space-x-2 lg:space-x-3">
            {/* <NotificationBell /> COMMENTED OUT */}
            
            {/* ADDED: Change Password Button */}
            <button
              onClick={goToChangePassword}
              className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-lg shadow-lg shadow-gray-400/30 transition-all duration-300 flex items-center gap-2 text-sm lg:text-base"
            >
              🔐 Change Password
            </button>

            <button
              onClick={handleViewNotifications}
              className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-2 rounded-lg shadow-lg shadow-yellow-400/50 transition-all duration-300 flex items-center gap-2 text-sm lg:text-base"
            >
              🔔 Notifications
            </button>
            
            <button
              onClick={handleViewSchedule}
              className="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg shadow-lg shadow-green-400/50 transition-all duration-300 text-sm lg:text-base"
            >
              📅 Schedule
            </button>
            <button
              onClick={handleViewReports}
              className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg shadow-lg shadow-blue-400/50 transition-all duration-300 text-sm lg:text-base"
            >
              📊 Reports
            </button>
            <button
              onClick={goToTimetable}
              className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-2 rounded-lg shadow-md shadow-purple-400/50 transition-all duration-300 text-sm lg:text-base"
            >
              🕒 Timetable
            </button>
            <button
              onClick={handleLogout}
              className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg shadow-lg shadow-red-400/50 transition-all duration-300 text-sm lg:text-base"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Mobile Navigation Menu - ADDED */}
        {isMobileMenuOpen && (
          <div className="sm:hidden bg-white/10 rounded-xl p-4 mb-4 border border-white/20">
            <div className="grid grid-cols-2 gap-2">
              {/* <NotificationBell /> COMMENTED OUT */}
              <button
                onClick={goToChangePassword}
                className="bg-gray-600 hover:bg-gray-700 text-white p-2 rounded-lg transition-all duration-300 flex items-center justify-center gap-1 text-xs"
              >
                🔐 Password
              </button>
              <button
                onClick={handleViewNotifications}
                className="bg-yellow-500 hover:bg-yellow-600 text-white p-2 rounded-lg transition-all duration-300 flex items-center justify-center gap-1 text-xs"
              >
                🔔 Notifications
              </button>
              <button
                onClick={handleViewSchedule}
                className="bg-green-500 hover:bg-green-600 text-white p-2 rounded-lg transition-all duration-300 text-xs"
              >
                📅 Schedule
              </button>
              <button
                onClick={handleViewReports}
                className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-lg transition-all duration-300 text-xs"
              >
                📊 Reports
              </button>
              <button
                onClick={goToTimetable}
                className="bg-purple-500 hover:bg-purple-600 text-white p-2 rounded-lg transition-all duration-300 text-xs"
              >
                🕒 Timetable
              </button>
              <button
                onClick={handleLogout}
                className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-lg transition-all duration-300 text-xs"
              >
                Logout
              </button>
            </div>
          </div>
        )}

        {/* Tab Navigation - UPDATED: Mobile responsive */}
        <div className="flex flex-col sm:flex-row mb-6 bg-white/10 rounded-xl p-1 border border-white/20">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex-1 py-2 sm:py-3 px-3 sm:px-4 rounded-lg font-semibold transition-all duration-300 text-sm sm:text-base ${
              activeTab === "overview" 
                ? "bg-indigo-500 text-white shadow-lg" 
                : "text-indigo-200 hover:bg-white/10"
            }`}
          >
            📊 Overview
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`flex-1 py-2 sm:py-3 px-3 sm:px-4 rounded-lg font-semibold transition-all duration-300 text-sm sm:text-base ${
              activeTab === "users" 
                ? "bg-teal-500 text-white shadow-lg" 
                : "text-teal-200 hover:bg-white/10"
            }`}
          >
            👥 Manage Users
          </button>
          <button
            onClick={() => setActiveTab("timetable")}
            className={`flex-1 py-2 sm:py-3 px-3 sm:px-4 rounded-lg font-semibold transition-all duration-300 text-sm sm:text-base ${
              activeTab === "timetable" 
                ? "bg-purple-500 text-white shadow-lg" 
                : "text-purple-200 hover:bg-white/10"
            }`}
          >
            🕒 Timetable
          </button>
          <button
            onClick={() => setActiveTab("payments")}
            className={`flex-1 py-2 sm:py-3 px-3 sm:px-4 rounded-lg font-semibold transition-all duration-300 text-sm sm:text-base ${
              activeTab === "payments" 
                ? "bg-green-500 text-white shadow-lg" 
                : "text-green-200 hover:bg-white/10"
            }`}
          >
            💰 Payments
          </button>
        </div>

        {/* Overview Tab Content - UPDATED: Mobile responsive */}
        {activeTab === "overview" && (
          <>
            {/* Active Live Classes */}
            <div className="mb-6 sm:mb-8">
              <ActiveLiveClasses />
            </div>

            {/* Quick Stats - UPDATED: Mobile responsive grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
              {[
                { label: "Total Teachers", value: teachers.length, color: "from-indigo-500 to-purple-500" },
                { label: "Total Students", value: students.length, color: "from-green-500 to-emerald-500" },
                {
                  label: "Total Classes",
                  value: upcomingClasses.length + ongoingClasses.length + pastClasses.length,
                  color: "from-blue-500 to-cyan-500",
                },
                { label: "Subscriptions", value: subscriptions.length, color: "from-pink-500 to-red-500" },
              ].map((stat, i) => (
                <div
                  key={i}
                  className={`bg-gradient-to-br ${stat.color} p-3 sm:p-4 lg:p-5 rounded-2xl shadow-lg text-center transform hover:scale-105 transition-all duration-300`}
                >
                  <h2 className="text-white/90 text-xs sm:text-sm uppercase">{stat.label}</h2>
                  <p className="text-xl sm:text-2xl lg:text-3xl font-extrabold mt-1 sm:mt-2">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Teachers - UPDATED: Mobile responsive */}
            <div className="bg-white/10 rounded-2xl shadow-lg shadow-indigo-500/30 p-4 sm:p-5 mb-4 sm:mb-6 border border-white/20">
              <h2 className="text-xl sm:text-2xl font-semibold text-indigo-200 mb-3">👩‍🏫 Teachers</h2>
              {teachers.length > 0 ? (
                <ul className="space-y-2 max-h-40 sm:max-h-none overflow-y-auto">
                  {teachers.map((t) => (
                    <li
                      key={t._id}
                      className="border-b border-white/10 py-2 hover:bg-white/10 rounded transition-all"
                    >
                      <p className="font-semibold text-sm sm:text-base">{t.name}</p>
                      <p className="text-gray-200 text-xs sm:text-sm">{t.email}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-300">No teachers found.</p>
              )}
            </div>

            {/* Students - UPDATED: Mobile responsive */}
            <div className="bg-white/10 rounded-2xl shadow-lg shadow-blue-500/30 p-4 sm:p-5 mb-4 sm:mb-6 border border-white/20">
              <h2 className="text-xl sm:text-2xl font-semibold text-blue-200 mb-3">🎓 Students</h2>
              {students.length > 0 ? (
                <ul className="space-y-2 max-h-40 sm:max-h-none overflow-y-auto">
                  {students.map((s) => (
                    <li
                      key={s._id}
                      className="border-b border-white/10 py-2 hover:bg-white/10 rounded transition-all"
                    >
                      <p className="font-semibold text-sm sm:text-base">{s.name}</p>
                      <p className="text-gray-200 text-xs sm:text-sm">{s.email}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-300">No students found.</p>
              )}
            </div>

            {/* Classes Section - UPDATED: Mobile responsive */}
            <div className="bg-white/10 rounded-2xl shadow-lg shadow-purple-500/30 p-4 sm:p-5 border border-white/20">
              <h2 className="text-xl sm:text-2xl font-semibold text-purple-200 mb-4">📚 All Classes Overview</h2>

              <div className="space-y-4 sm:space-y-6">
                {/* Upcoming */}
                <div>
                  <h3 className="text-green-300 font-medium mb-2 text-sm sm:text-base">🟢 Upcoming Classes</h3>
                  {upcomingClasses.length > 0 ? (
                    <ul className="space-y-1">
                      {upcomingClasses.map((cls) => (
                        <li
                          key={cls._id}
                          className="border-b border-white/10 pb-1 text-gray-200 hover:text-white transition-all text-xs sm:text-sm"
                        >
                          {cls.title} — {new Date(cls.startTime).toLocaleString()}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-400 text-sm">No upcoming classes.</p>
                  )}
                </div>

                {/* Ongoing */}
                <div>
                  <h3 className="text-yellow-300 font-medium mb-2 text-sm sm:text-base">🟡 Ongoing Classes</h3>
                  {ongoingClasses.length > 0 ? (
                    <ul className="space-y-1">
                      {ongoingClasses.map((cls) => (
                        <li
                          key={cls._id}
                          className="border-b border-white/10 pb-1 text-gray-200 hover:text-white transition-all text-xs sm:text-sm"
                        >
                          {cls.title} — ends at {new Date(cls.endTime).toLocaleString()}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-400 text-sm">No ongoing classes.</p>
                  )}
                </div>

                {/* Past */}
                <div>
                  <h3 className="text-red-300 font-medium mb-2 text-sm sm:text-base">🔴 Past Classes</h3>
                  {pastClasses.length > 0 ? (
                    <ul className="space-y-1">
                      {pastClasses.map((cls) => (
                        <li
                          key={cls._id}
                          className="border-b border-white/10 pb-1 text-gray-200 hover:text-white transition-all text-xs sm:text-sm"
                        >
                          {cls.title} — ended at {new Date(cls.endTime).toLocaleString()}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-400 text-sm">No past classes.</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* UPDATED: Users Management Tab with Password Toggle */}
        {activeTab === "users" && (
          <div className="space-y-6">
            {/* User Creation Form - UPDATED: Mobile responsive with password toggle */}
            <div className="bg-white/10 rounded-2xl shadow-lg shadow-teal-500/30 p-4 sm:p-6 border border-white/20">
              <h2 className="text-xl sm:text-2xl font-semibold text-teal-200 mb-4">
                👥 Create New User
              </h2>
              
              {userMessage && (
                <div className={`mb-4 p-3 rounded-lg text-center text-sm sm:text-base ${
                  userMessage.includes("✅") 
                    ? "bg-green-500/20 text-green-300 border border-green-500/30" 
                    : "bg-red-500/20 text-red-300 border border-red-500/30"
                }`}>
                  {userMessage}
                </div>
              )}

              <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                <input
                  type="text"
                  name="name"
                  value={userForm.name}
                  onChange={handleUserFormChange}
                  placeholder="Full Name"
                  className="w-full p-2 sm:p-3 rounded-lg bg-white/20 text-white placeholder-gray-200 focus:ring-2 focus:ring-teal-400 outline-none transition-all text-sm sm:text-base"
                  required
                />
                <input
                  type="email"
                  name="email"
                  value={userForm.email}
                  onChange={handleUserFormChange}
                  placeholder="Email Address"
                  className="w-full p-2 sm:p-3 rounded-lg bg-white/20 text-white placeholder-gray-200 focus:ring-2 focus:ring-teal-400 outline-none transition-all text-sm sm:text-base"
                  required
                />
                
                {/* UPDATED: Password field with toggle */}
                <div className="relative md:col-span-2">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={userForm.password}
                    onChange={handleUserFormChange}
                    placeholder="Temporary Password"
                    className="w-full p-2 sm:p-3 rounded-lg bg-white/20 text-white placeholder-gray-200 focus:ring-2 focus:ring-teal-400 outline-none transition-all text-sm sm:text-base pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-300 hover:text-white transition-colors"
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>

                <select
                  name="role"
                  value={userForm.role}
                  onChange={handleUserFormChange}
                  className="w-full p-2 sm:p-3 rounded-lg bg-white/20 text-white focus:ring-2 focus:ring-teal-400 outline-none transition-all text-sm sm:text-base"
                >
                  <option value="teacher">Teacher</option>
                  <option value="student">Student</option>
                </select>
                <button
                  type="submit"
                  className="md:col-span-2 bg-gradient-to-r from-teal-500 to-blue-500 text-white py-2 sm:py-3 rounded-lg shadow-lg shadow-teal-400/50 hover:scale-105 transition-all duration-300 font-semibold text-sm sm:text-base"
                >
                  ➕ Create User
                </button>
              </form>
            </div>

            {/* Users Overview - UPDATED: Mobile responsive */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* Teachers List */}
              <div className="bg-white/10 rounded-2xl shadow-lg shadow-indigo-500/30 p-4 sm:p-5 border border-white/20">
                <h2 className="text-lg sm:text-xl font-semibold text-indigo-200 mb-3">👩‍🏫 Teachers ({teachers.length})</h2>
                {teachers.length > 0 ? (
                  <ul className="space-y-2 max-h-40 sm:max-h-60 overflow-y-auto">
                    {teachers.map((teacher) => (
                      <li
                        key={teacher._id}
                        className="border-b border-white/10 py-2 hover:bg-white/10 rounded transition-all"
                      >
                        <p className="font-semibold text-sm sm:text-base">{teacher.name}</p>
                        <p className="text-gray-200 text-xs sm:text-sm">{teacher.email}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-300">No teachers found.</p>
                )}
              </div>

              {/* Students List */}
              <div className="bg-white/10 rounded-2xl shadow-lg shadow-blue-500/30 p-4 sm:p-5 border border-white/20">
                <h2 className="text-lg sm:text-xl font-semibold text-blue-200 mb-3">🎓 Students ({students.length})</h2>
                {students.length > 0 ? (
                  <ul className="space-y-2 max-h-40 sm:max-h-60 overflow-y-auto">
                    {students.map((student) => (
                      <li
                        key={student._id}
                        className="border-b border-white/10 py-2 hover:bg-white/10 rounded transition-all"
                      >
                        <p className="font-semibold text-sm sm:text-base">{student.name}</p>
                        <p className="text-gray-200 text-xs sm:text-sm">{student.email}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-300">No students found.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Timetable Tab Content - UPDATED: Mobile responsive */}
        {activeTab === "timetable" && (
          <>
            {/* Create/Edit Timetable Form */}
            <div className="bg-white/10 rounded-2xl shadow-lg shadow-purple-500/30 p-4 sm:p-6 mb-6 sm:mb-8 border border-white/20">
              <h2 className="text-xl sm:text-2xl font-semibold text-purple-200 mb-4">
                {editingLesson ? "✏️ Edit Lesson" : "📝 Add Lesson to Timetable"}
              </h2>

              {timetableError && <p className="text-red-300 text-sm mb-2">{timetableError}</p>}

              <form
                onSubmit={editingLesson ? handleUpdateLesson : handleCreateLesson}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
              >
                <select
                  name="day"
                  value={editingLesson ? editingLesson.day : newLesson.day}
                  onChange={handleTimetableChange}
                  className="w-full p-2 sm:p-3 rounded-lg bg-white/20 text-white focus:ring-2 focus:ring-purple-400 outline-none transition-all text-sm sm:text-base"
                  required
                >
                  {days.map((d) => (
                    <option key={d} value={d} className="text-gray-800">
                      {d}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  name="subject"
                  placeholder="Subject"
                  value={editingLesson ? editingLesson.subject : newLesson.subject}
                  onChange={handleTimetableChange}
                  className="w-full p-2 sm:p-3 rounded-lg bg-white/20 text-white placeholder-gray-200 focus:ring-2 focus:ring-purple-400 outline-none transition-all text-sm sm:text-base"
                  required
                />

                <input
                  type="time"
                  name="startTime"
                  value={editingLesson ? editingLesson.startTime : newLesson.startTime}
                  onChange={handleTimetableChange}
                  className="w-full p-2 sm:p-3 rounded-lg bg-white/20 text-white focus:ring-2 focus:ring-purple-400 outline-none transition-all text-sm sm:text-base"
                  required
                />

                <input
                  type="time"
                  name="endTime"
                  value={editingLesson ? editingLesson.endTime : newLesson.endTime}
                  onChange={handleTimetableChange}
                  className="w-full p-2 sm:p-3 rounded-lg bg-white/20 text-white focus:ring-2 focus:ring-purple-400 outline-none transition-all text-sm sm:text-base"
                  required
                />

                <button
                  type="submit"
                  className="md:col-span-2 lg:col-span-4 bg-gradient-to-r from-purple-500 to-indigo-500 text-white py-2 sm:py-3 rounded-lg shadow-lg shadow-purple-400/50 hover:scale-105 transition-all duration-300 font-semibold text-sm sm:text-base"
                >
                  {editingLesson ? "💾 Save Changes" : "➕ Add Lesson"}
                </button>
              </form>
            </div>

            {/* Timetable Display */}
            <div className="bg-white/10 rounded-2xl shadow-lg shadow-indigo-500/30 p-4 sm:p-6 border border-white/20">
              <h2 className="text-xl sm:text-2xl font-semibold text-indigo-200 mb-4">
                📅 Weekly Timetable
              </h2>
              
              {timetableLoading ? (
                <p className="text-gray-200 text-sm">Loading timetable...</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse min-w-[500px]">
                    <thead>
                      <tr className="bg-indigo-600/50 text-white">
                        <th className="py-2 px-2 sm:py-3 sm:px-4 text-left text-xs sm:text-sm">Day</th>
                        <th className="py-2 px-2 sm:py-3 sm:px-4 text-left text-xs sm:text-sm">Subject</th>
                        <th className="py-2 px-2 sm:py-3 sm:px-4 text-left text-xs sm:text-sm">Start Time</th>
                        <th className="py-2 px-2 sm:py-3 sm:px-4 text-left text-xs sm:text-sm">End Time</th>
                        <th className="py-2 px-2 sm:py-3 sm:px-4 text-left text-xs sm:text-sm">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped.map(({ day, lessons }) =>
                        lessons.length > 0 ? (
                          lessons.map((lesson, idx) => (
                            <tr
                              key={lesson._id}
                              className={`border-b border-white/20 hover:bg-white/10 transition-all ${
                                idx % 2 === 0 ? "bg-white/5" : "bg-white/10"
                              }`}
                            >
                              <td className="py-2 px-2 sm:py-3 sm:px-4 font-medium text-white text-xs sm:text-sm">{lesson.day}</td>
                              <td className="py-2 px-2 sm:py-3 sm:px-4 text-white text-xs sm:text-sm">{lesson.subject}</td>
                              <td className="py-2 px-2 sm:py-3 sm:px-4 text-gray-200 text-xs sm:text-sm">{lesson.startTime}</td>
                              <td className="py-2 px-2 sm:py-3 sm:px-4 text-gray-200 text-xs sm:text-sm">{lesson.endTime}</td>
                              <td className="py-2 px-2 sm:py-3 sm:px-4 space-x-1 sm:space-x-2">
                                <button
                                  onClick={() => setEditingLesson(lesson)}
                                  className="bg-yellow-500 hover:bg-yellow-600 text-white px-2 py-1 sm:px-3 sm:py-1 rounded-lg shadow-md transition-all text-xs sm:text-sm"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteLesson(lesson._id)}
                                  className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 sm:px-3 sm:py-1 rounded-lg shadow-md transition-all text-xs sm:text-sm"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr key={day}>
                            <td className="py-2 px-2 sm:py-3 sm:px-4 text-white text-xs sm:text-sm">{day}</td>
                            <td className="py-2 px-2 sm:py-3 sm:px-4 italic text-gray-300 text-xs sm:text-sm" colSpan="4">
                              No lessons scheduled
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Payments Tab Content */}
        {activeTab === "payments" && (
          <AdminPayments />
        )}
      </div>
    </div>
  );
}