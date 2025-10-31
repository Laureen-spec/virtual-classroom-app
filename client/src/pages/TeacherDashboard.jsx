import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api/axios";
import axios from "axios"; // ADDED: Import axios for direct API calls
// import NotificationBell from "./components/NotificationBell"; // COMMENTED OUT: Fixing build error

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [timetable, setTimetable] = useState([]);
  const [newClass, setNewClass] = useState({
    title: "",
    description: "",
    startTime: "",
    endTime: "",
    meetingLink: "",
  });
  const [newLesson, setNewLesson] = useState({
    day: "Monday",
    subject: "",
    startTime: "",
    endTime: "",
  });
  const [editingClass, setEditingClass] = useState(null);
  const [editingLesson, setEditingLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timetableLoading, setTimetableLoading] = useState(true);
  const [error, setError] = useState("");
  const [timetableError, setTimetableError] = useState("");
  const [modal, setModal] = useState({ show: false, message: "", type: "" });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [activeTab, setActiveTab] = useState("classes");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // ADDED: Mobile menu state

  // 🔹 Get token from localStorage
  const token = localStorage.getItem("token");

  // 🔹 Start Live Class Function - ADDED
  const handleStartLive = async (classId) => {
    try {
      const res = await axios.post(
        "https://virtual-classroom-app-8wbh.onrender.com/api/live/start",
        { classId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      navigate(`/class/${res.data.sessionId}`); // Now navigate to the actual session
    } catch (error) {
      console.error("Failed to start class:", error.response?.data || error.message);
      alert(error.response?.data?.message || "Error starting class");
    }
  };

  // 🔹 Logout
  const handleLogout = () => {
    localStorage.clear();
    navigate("/register");
  };

  // 🔹 Go to schedule
  const goToSchedule = () => {
    navigate("/schedule");
    setIsMobileMenuOpen(false); // Close mobile menu on navigation
  };

  // 🔹 Go to Upload Material page
  const goToUploadMaterial = () => {
    navigate("/teacher/upload-material");
    setIsMobileMenuOpen(false);
  };

  // 🔹 Go to Review Submissions page
  const goToReviewSubmissions = () => {
    navigate("/teacher/review-submissions");
    setIsMobileMenuOpen(false);
  };

  // 🔹 Go to Notifications page
  const goToNotifications = () => {
    navigate("/notifications");
    setIsMobileMenuOpen(false);
  };

  // 🔹 Go to Change Password page
  const goToChangePassword = () => {
    navigate("/change-password");
    setIsMobileMenuOpen(false);
  };

  // 🔹 Fetch upcoming classes
  const fetchClasses = async () => {
    try {
      const res = await API.get("/schedule/upcoming");
      setClasses(res.data);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching classes:", err);
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
    fetchClasses();
    fetchTimetable();
  }, []);

  // 🔹 Handle class input
  const handleClassChange = (e) => {
    const { name, value } = e.target;
    if (editingClass) {
      setEditingClass({ ...editingClass, [name]: value });
    } else {
      setNewClass({ ...newClass, [name]: value });
    }
  };

  // 🔹 Handle timetable input
  const handleTimetableChange = (e) => {
    const { name, value } = e.target;
    if (editingLesson) {
      setEditingLesson({ ...editingLesson, [name]: value });
    } else {
      setNewLesson({ ...newLesson, [name]: value });
    }
  };

  // 🔹 Create a new class
  const handleCreateClass = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await API.post("/schedule/create", newClass);
      setModal({ show: true, message: "✅ Class created successfully!", type: "success" });
      setNewClass({
        title: "",
        description: "",
        startTime: "",
        endTime: "",
        meetingLink: "",
      });
      fetchClasses();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create class");
    }
  };

  // 🔹 Create a lesson
  const handleCreateLesson = async (e) => {
    e.preventDefault();
    setTimetableError("");
    try {
      await API.post("/timetable/create", newLesson);
      setModal({ show: true, message: "✅ Lesson added successfully!", type: "success" });
      setNewLesson({ day: "Monday", subject: "", startTime: "", endTime: "" });
      fetchTimetable();
    } catch (err) {
      setTimetableError(err.response?.data?.message || "Failed to create lesson");
    }
  };

  // 🔹 Delete class (after confirmation)
  const confirmDeleteClass = async () => {
    if (!confirmDelete) return;
    try {
      await API.delete(`/schedule/${confirmDelete}`);
      setModal({ show: true, message: "🗑️ Class deleted successfully!", type: "success" });
      setConfirmDelete(null);
      fetchClasses();
    } catch (err) {
      console.error("Delete failed:", err);
      setModal({ show: true, message: "❌ Failed to delete class.", type: "error" });
    }
  };

  // 🔹 Delete lesson
  const handleDeleteLesson = async (id) => {
    if (!window.confirm("Are you sure you want to delete this lesson?")) return;
    try {
      await API.delete(`/timetable/${id}`);
      setModal({ show: true, message: "🗑️ Lesson deleted successfully!", type: "success" });
      fetchTimetable();
    } catch (err) {
      console.error(err);
      setModal({ show: true, message: "❌ Failed to delete lesson.", type: "error" });
    }
  };

  // 🔹 Start editing a class
  const startEditing = (cls) => {
    setEditingClass({ ...cls });
  };

  // 🔹 Save edited class
  const handleUpdateClass = async (e) => {
    e.preventDefault();
    try {
      await API.put(`/schedule/${editingClass._id}`, editingClass);
      setModal({ show: true, message: "✅ Class updated successfully!", type: "success" });
      setEditingClass(null);
      fetchClasses();
    } catch (err) {
      console.error("Update failed:", err);
      setModal({ show: true, message: "❌ Failed to update class.", type: "error" });
    }
  };

  // 🔹 Update lesson
  const handleUpdateLesson = async (e) => {
    e.preventDefault();
    try {
      await API.put(`/timetable/${editingLesson._id}`, editingLesson);
      setModal({ show: true, message: "✅ Lesson updated successfully!", type: "success" });
      setEditingLesson(null);
      fetchTimetable();
    } catch (err) {
      console.error(err);
      setModal({ show: true, message: "❌ Failed to update lesson.", type: "error" });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-purple-100 animate-pulse">
        <p className="text-xl text-purple-700">Loading your dashboard...</p>
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
      className="min-h-screen bg-cover bg-center bg-no-repeat p-4 sm:p-6" // UPDATED: Responsive padding
      style={{
        backgroundImage:
          "url('https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1950&q=80')",
      }}
    >
      <div className="backdrop-blur-lg bg-white/20 border border-white/30 rounded-3xl shadow-2xl p-4 sm:p-6 max-w-7xl mx-auto text-white relative"> {/* UPDATED: Responsive padding */}
        
        {/* Header - UPDATED: Mobile responsive */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8"> {/* UPDATED: Flex column on mobile */}
          <div className="flex justify-between items-center w-full sm:w-auto"> {/* UPDATED: Full width on mobile */}
            <h1 className="text-2xl sm:text-4xl font-extrabold text-purple-300 drop-shadow-lg animate-pulse"> {/* UPDATED: Responsive text */}
              👩‍🏫 Teacher Dashboard
            </h1>
            {/* Mobile Menu Button - ADDED */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="sm:hidden bg-purple-500 text-white p-2 rounded-lg"
            >
              {isMobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>

          {/* Desktop Navigation - UPDATED: Hidden on mobile */}
          <div className="hidden sm:flex items-center space-x-2 lg:space-x-3"> {/* UPDATED: Responsive spacing */}
            {/* <NotificationBell /> COMMENTED OUT: Fixing build error */}
            <button
              onClick={goToNotifications}
              className="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-2 rounded-lg shadow-lg shadow-indigo-400/30 transition-all duration-300 flex items-center gap-2 text-sm lg:text-base" // UPDATED: Responsive text and padding
            >
              🔔 Notifications
            </button>
            <button
              onClick={goToChangePassword}
              className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-lg shadow-lg shadow-gray-400/30 transition-all duration-300 flex items-center gap-2 text-sm lg:text-base"
            >
              🔐 Change Password
            </button>
            <button
              onClick={goToUploadMaterial}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-2 rounded-lg shadow-lg shadow-emerald-400/30 transition-all duration-300 text-sm lg:text-base" // UPDATED: Responsive padding
            >
              📚 Materials
            </button>
            <button
              onClick={goToReviewSubmissions}
              className="bg-yellow-500 hover:bg-yellow-600 text-white px-2 py-2 rounded-lg shadow-lg shadow-yellow-400/30 transition-all duration-300 text-sm lg:text-base"
            >
              🧾 Review
            </button>
            <button
              onClick={goToSchedule}
              className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg shadow-lg shadow-blue-400/50 transition-all duration-300 text-sm lg:text-base"
            >
              📅 Schedule
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
              {/* <NotificationBell /> COMMENTED OUT: Fixing build error */}
              <button
                onClick={goToNotifications}
                className="bg-indigo-500 hover:bg-indigo-600 text-white p-2 rounded-lg transition-all duration-300 flex items-center justify-center gap-1 text-xs"
              >
                🔔 Notifications
              </button>
              <button
                onClick={goToChangePassword}
                className="bg-gray-600 hover:bg-gray-700 text-white p-2 rounded-lg transition-all duration-300 flex items-center justify-center gap-1 text-xs"
              >
                🔐 Password
              </button>
              <button
                onClick={goToUploadMaterial}
                className="bg-emerald-500 hover:bg-emerald-600 text-white p-2 rounded-lg transition-all duration-300 text-xs"
              >
                📚 Materials
              </button>
              <button
                onClick={goToReviewSubmissions}
                className="bg-yellow-500 hover:bg-yellow-600 text-white p-2 rounded-lg transition-all duration-300 text-xs"
              >
                🧾 Review
              </button>
              <button
                onClick={goToSchedule}
                className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-lg transition-all duration-300 text-xs"
              >
                📅 Schedule
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
        <div className="flex flex-col sm:flex-row mb-6 bg-white/10 rounded-xl p-1 border border-white/20"> {/* UPDATED: Flex column on mobile */}
          <button
            onClick={() => setActiveTab("classes")}
            className={`flex-1 py-2 sm:py-3 px-3 sm:px-4 rounded-lg font-semibold transition-all duration-300 text-sm sm:text-base ${
              activeTab === "classes" 
                ? "bg-purple-500 text-white shadow-lg" 
                : "text-purple-200 hover:bg-white/10"
            }`}
          >
            📚 Manage Classes
          </button>
          <button
            onClick={() => setActiveTab("timetable")}
            className={`flex-1 py-2 sm:py-3 px-3 sm:px-4 rounded-lg font-semibold transition-all duration-300 text-sm sm:text-base ${
              activeTab === "timetable" 
                ? "bg-blue-500 text-white shadow-lg" 
                : "text-blue-200 hover:bg-white/10"
            }`}
          >
            📅 Manage Timetable
          </button>
        </div>

        {/* Classes Tab Content - UPDATED: Mobile responsive */}
        {activeTab === "classes" && (
          <>
            {/* Create / Edit Class Form */}
            <div className="bg-white/10 rounded-2xl shadow-lg shadow-purple-500/30 p-4 sm:p-6 mb-6 sm:mb-8 border border-white/20"> {/* UPDATED: Responsive padding */}
              <h2 className="text-xl sm:text-2xl font-semibold text-purple-200 mb-4"> {/* UPDATED: Responsive text */}
                {editingClass ? "✏️ Edit Class" : "📝 Create a New Class"}
              </h2>
              {error && <p className="text-red-300 text-sm mb-2">{error}</p>}

              <form
                onSubmit={editingClass ? handleUpdateClass : handleCreateClass}
                className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4" // UPDATED: Responsive gap
              >
                <input
                  type="text"
                  name="title"
                  placeholder="Class Title"
                  value={editingClass ? editingClass.title : newClass.title}
                  onChange={handleClassChange}
                  className="w-full p-2 sm:p-3 rounded-lg bg-white/20 text-white placeholder-gray-200 focus:ring-2 focus:ring-purple-400 outline-none transition-all text-sm sm:text-base" // UPDATED: Responsive padding and text
                  required
                />
                <input
                  type="text"
                  name="meetingLink"
                  placeholder="Meeting Link (optional)"
                  value={editingClass ? editingClass.meetingLink : newClass.meetingLink}
                  onChange={handleClassChange}
                  className="w-full p-2 sm:p-3 rounded-lg bg-white/20 text-white placeholder-gray-200 focus:ring-2 focus:ring-purple-400 outline-none transition-all text-sm sm:text-base"
                />
                <textarea
                  name="description"
                  placeholder="Class Description"
                  value={editingClass ? editingClass.description : newClass.description}
                  onChange={handleClassChange}
                  className="w-full p-2 sm:p-3 rounded-lg bg-white/20 text-white placeholder-gray-200 focus:ring-2 focus:ring-purple-400 outline-none transition-all md:col-span-2 text-sm sm:text-base" // UPDATED: Responsive padding and text
                  rows="3"
                ></textarea>
                <input
                  type="datetime-local"
                  name="startTime"
                  value={editingClass ? editingClass.startTime : newClass.startTime}
                  onChange={handleClassChange}
                  className="w-full p-2 sm:p-3 rounded-lg bg-white/20 text-white focus:ring-2 focus:ring-purple-400 outline-none transition-all text-sm sm:text-base" // UPDATED: Responsive padding and text
                  required
                />
                <input
                  type="datetime-local"
                  name="endTime"
                  value={editingClass ? editingClass.endTime : newClass.endTime}
                  onChange={handleClassChange}
                  className="w-full p-2 sm:p-3 rounded-lg bg-white/20 text-white focus:ring-2 focus:ring-purple-400 outline-none transition-all text-sm sm:text-base"
                  required
                />
                <button
                  type="submit"
                  className="md:col-span-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white py-2 sm:py-3 rounded-lg shadow-lg shadow-purple-400/50 hover:scale-105 transition-all duration-300 font-semibold text-sm sm:text-base" // UPDATED: Responsive padding and text
                >
                  {editingClass ? "💾 Save Changes" : "✨ Create Class"}
                </button>
              </form>
            </div>

            {/* Upcoming Classes - UPDATED: Mobile responsive */}
            <div className="bg-white/10 rounded-2xl shadow-lg shadow-blue-500/30 p-4 sm:p-6 border border-white/20"> {/* UPDATED: Responsive padding */}
              <h2 className="text-xl sm:text-2xl font-semibold text-blue-200 mb-4"> {/* UPDATED: Responsive text */}
                📚 Upcoming Classes
              </h2>
              {classes.length > 0 ? (
                <ul className="space-y-3 sm:space-y-4"> {/* UPDATED: Responsive spacing */}
                  {classes.map((cls) => (
                    <li
                      key={cls._id}
                      className="p-3 sm:p-4 rounded-xl bg-white/20 border border-white/20 hover:bg-white/30 transition-all duration-300" // UPDATED: Responsive padding
                    >
                      <p className="text-base sm:text-lg font-semibold text-white">{cls.title}</p> {/* UPDATED: Responsive text */}
                      <p className="text-xs sm:text-sm text-gray-200 mt-1"> {/* UPDATED: Responsive text */}
                        {new Date(cls.startTime).toLocaleString("en-GB", { timeZone: "UTC" })} →{" "}
                        {new Date(cls.endTime).toLocaleString("en-GB", { timeZone: "UTC" })}
                      </p>
                      <p className="text-gray-300 text-xs sm:text-sm mt-1"> {/* UPDATED: Responsive text */}
                        Link:{" "}
                        <a
                          href={cls.meetingLink}
                          className="text-blue-300 underline hover:text-blue-400 break-all" // UPDATED: Break long links
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {cls.meetingLink || "N/A"}
                        </a>
                      </p>

                      <div className="flex flex-wrap gap-1 sm:gap-2 mt-2 sm:mt-3"> {/* UPDATED: Flex wrap and responsive gap */}
                        <button
                          onClick={() => startEditing(cls)}
                          className="bg-yellow-500 hover:bg-yellow-600 text-white px-2 py-1 sm:px-3 sm:py-1 rounded-lg shadow-md transition-all text-xs sm:text-sm" // UPDATED: Responsive padding and text
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => setConfirmDelete(cls._id)}
                          className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 sm:px-3 sm:py-1 rounded-lg shadow-md transition-all text-xs sm:text-sm"
                        >
                          🗑️ Delete
                        </button>
                        {/* UPDATED: Start Live Class Button */}
                        <button
                          onClick={() => handleStartLive(cls._id)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 sm:px-3 sm:py-1 rounded-lg shadow-md transition-all text-xs sm:text-sm"
                        >
                          🎥 Start Live
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-200 text-sm">No upcoming classes yet.</p>
              )}
            </div>
          </>
        )}

        {/* Timetable Tab Content - UPDATED: Mobile responsive */}
        {activeTab === "timetable" && (
          <>
            {/* Create/Edit Timetable Form */}
            <div className="bg-white/10 rounded-2xl shadow-lg shadow-blue-500/30 p-4 sm:p-6 mb-6 sm:mb-8 border border-white/20"> {/* UPDATED: Responsive padding */}
              <h2 className="text-xl sm:text-2xl font-semibold text-blue-200 mb-4"> {/* UPDATED: Responsive text */}
                {editingLesson ? "✏️ Edit Lesson" : "📝 Add Lesson to Timetable"}
              </h2>

              {timetableError && <p className="text-red-300 text-sm mb-2">{timetableError}</p>}

              <form
                onSubmit={editingLesson ? handleUpdateLesson : handleCreateLesson}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" // UPDATED: Responsive columns and gap
              >
                <select
                  name="day"
                  value={editingLesson ? editingLesson.day : newLesson.day}
                  onChange={handleTimetableChange}
                  className="w-full p-2 sm:p-3 rounded-lg bg-white/20 text-white focus:ring-2 focus:ring-blue-400 outline-none transition-all text-sm sm:text-base" // UPDATED: Responsive padding and text
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
                  className="w-full p-2 sm:p-3 rounded-lg bg-white/20 text-white placeholder-gray-200 focus:ring-2 focus:ring-blue-400 outline-none transition-all text-sm sm:text-base"
                  required
                />

                <input
                  type="time"
                  name="startTime"
                  value={editingLesson ? editingLesson.startTime : newLesson.startTime}
                  onChange={handleTimetableChange}
                  className="w-full p-2 sm:p-3 rounded-lg bg-white/20 text-white focus:ring-2 focus:ring-blue-400 outline-none transition-all text-sm sm:text-base"
                  required
                />

                <input
                  type="time"
                  name="endTime"
                  value={editingLesson ? editingLesson.endTime : newLesson.endTime}
                  onChange={handleTimetableChange}
                  className="w-full p-2 sm:p-3 rounded-lg bg-white/20 text-white focus:ring-2 focus:ring-blue-400 outline-none transition-all text-sm sm:text-base"
                  required
                />

                <button
                  type="submit"
                  className="md:col-span-2 lg:col-span-4 bg-gradient-to-r from-blue-500 to-indigo-500 text-white py-2 sm:py-3 rounded-lg shadow-lg shadow-blue-400/50 hover:scale-105 transition-all duration-300 font-semibold text-sm sm:text-base" // UPDATED: Responsive padding and text
                >
                  {editingLesson ? "💾 Save Changes" : "➕ Add Lesson"}
                </button>
              </form>
            </div>

            {/* Timetable Display - UPDATED: Mobile responsive */}
            <div className="bg-white/10 rounded-2xl shadow-lg shadow-indigo-500/30 p-4 sm:p-6 border border-white/20"> {/* UPDATED: Responsive padding */}
              <h2 className="text-xl sm:text-2xl font-semibold text-indigo-200 mb-4"> {/* UPDATED: Responsive text */}
                📅 Weekly Timetable
              </h2>
              
              {timetableLoading ? (
                <p className="text-gray-200 text-sm">Loading timetable...</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse min-w-[500px]"> {/* UPDATED: Minimum width for small screens */}
                    <thead>
                      <tr className="bg-indigo-600/50 text-white">
                        <th className="py-2 px-2 sm:py-3 sm:px-4 text-left text-xs sm:text-sm">Day</th> {/* UPDATED: Responsive padding and text */}
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
                              <td className="py-2 px-2 sm:py-3 sm:px-4 font-medium text-white text-xs sm:text-sm">{lesson.day}</td> {/* UPDATED: Responsive padding and text */}
                              <td className="py-2 px-2 sm:py-3 sm:px-4 text-white text-xs sm:text-sm">{lesson.subject}</td>
                              <td className="py-2 px-2 sm:py-3 sm:px-4 text-gray-200 text-xs sm:text-sm">{lesson.startTime}</td>
                              <td className="py-2 px-2 sm:py-3 sm:px-4 text-gray-200 text-xs sm:text-sm">{lesson.endTime}</td>
                              <td className="py-2 px-2 sm:py-3 sm:px-4 space-x-1 sm:space-x-2"> {/* UPDATED: Responsive spacing */}
                                <button
                                  onClick={() => setEditingLesson(lesson)}
                                  className="bg-yellow-500 hover:bg-yellow-600 text-white px-2 py-1 sm:px-3 sm:py-1 rounded-lg shadow-md transition-all text-xs sm:text-sm" // UPDATED: Responsive padding and text
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
                            <td className="py-2 px-2 sm:py-3 sm:px-4 text-white text-xs sm:text-sm">{day}</td> {/* UPDATED: Responsive padding and text */}
                            <td className="py-2 px-2 sm:py-3 sm:px-4 italic text-gray-300 text-xs sm:text-sm" colSpan="4"> {/* UPDATED: Responsive padding and text */}
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

        {/* ✅ Modal - UPDATED: Mobile responsive */}
        {modal.show && (
          <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-50 p-4"> {/* UPDATED: Added padding */}
            <div className="bg-white rounded-xl shadow-2xl p-4 sm:p-6 w-full max-w-xs sm:max-w-sm md:w-80 text-center"> {/* UPDATED: Responsive width and padding */}
              <p
                className={`text-base sm:text-lg font-semibold mb-4 ${
                  modal.type === "error" ? "text-red-600" : "text-green-600"
                }`}
              >
                {modal.message}
              </p>
              <button
                onClick={() => setModal({ show: false, message: "", type: "" })}
                className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-all w-full sm:w-auto"
              >
                OK
              </button>
            </div>
          </div>
        )}

        {/* ⚠️ Delete Confirmation Modal - UPDATED: Mobile responsive */}
        {confirmDelete && (
          <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl p-4 sm:p-6 w-full max-w-xs sm:max-w-sm md:w-80 text-center text-gray-800">
              <p className="text-base sm:text-lg font-semibold mb-4">
                ⚠️ Are you sure you want to delete this class?
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-2 sm:gap-3"> {/* UPDATED: Flex column on mobile */}
                <button
                  onClick={confirmDeleteClass}
                  className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-all w-full sm:w-auto"
                >
                  Yes, Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-lg transition-all w-full sm:w-auto"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}