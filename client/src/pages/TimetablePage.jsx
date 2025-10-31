import { useEffect, useState } from "react";
import API from "../api/axios";
import { useNavigate } from "react-router-dom";

export default function TimetablePage() {
  const navigate = useNavigate();
  const [timetable, setTimetable] = useState([]);
  const [newLesson, setNewLesson] = useState({
    day: "Monday",
    subject: "",
    startTime: "",
    endTime: "",
  });
  const [editingLesson, setEditingLesson] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 🔹 Fetch role from localStorage
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user"));
    setRole(user?.role || "student");
  }, []);

  // 🔹 Fetch timetable
  const fetchTimetable = async () => {
    try {
      const res = await API.get("/timetable");
      setTimetable(res.data);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimetable();
  }, []);

  // 🔹 Handle form input
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (editingLesson) {
      setEditingLesson({ ...editingLesson, [name]: value });
    } else {
      setNewLesson({ ...newLesson, [name]: value });
    }
  };

  // 🔹 Create a lesson
  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await API.post("/timetable/create", newLesson);
      setNewLesson({ day: "Monday", subject: "", startTime: "", endTime: "" });
      fetchTimetable();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create lesson");
    }
  };

  // 🔹 Update lesson
  const handleUpdate = async (e) => {
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
  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this lesson?")) return;
    try {
      await API.delete(`/timetable/${id}`);
      fetchTimetable();
    } catch (err) {
      console.error(err);
      alert("Failed to delete lesson");
    }
  };

  // 🔹 Logout
  const handleLogout = () => {
    localStorage.clear();
    navigate("/register");
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-blue-50">
        <p className="text-lg text-gray-700 animate-pulse">Loading timetable...</p>
      </div>
    );
  }

  // 📅 Group lessons by day
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday" ,"Saturday"];
  const grouped = days.map((day) => ({
    day,
    lessons: timetable.filter((t) => t.day === day),
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 p-3 sm:p-4 md:p-6">
      <div className="max-w-6xl mx-auto bg-white shadow-lg rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-blue-700">
            📅 {role === "student" ? "Class Timetable" : "Manage Timetable"}
          </h1>
          <button
            onClick={handleLogout}
            className="bg-red-500 text-white px-3 sm:px-4 py-2 rounded hover:bg-red-600 text-sm sm:text-base w-full sm:w-auto min-h-[44px]"
          >
            Logout
          </button>
        </div>

        {/* Create/Edit Form (Teacher/Admin Only) */}
        {(role === "teacher" || role === "admin") && (
          <div className="bg-blue-50 rounded-xl sm:rounded-2xl shadow p-4 sm:p-5 mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-semibold text-blue-600 mb-2 sm:mb-3">
              {editingLesson ? "✏️ Edit Lesson" : "📝 Add Lesson"}
            </h2>

            {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

            <form
              onSubmit={editingLesson ? handleUpdate : handleCreate}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
            >
              <select
                name="day"
                value={editingLesson ? editingLesson.day : newLesson.day}
                onChange={handleChange}
                className="p-2 sm:p-3 border rounded text-sm sm:text-base min-h-[44px]"
                required
              >
                {days.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              <input
                type="text"
                name="subject"
                placeholder="Subject"
                value={editingLesson ? editingLesson.subject : newLesson.subject}
                onChange={handleChange}
                className="p-2 sm:p-3 border rounded text-sm sm:text-base min-h-[44px]"
                required
              />

              <input
                type="time"
                name="startTime"
                value={editingLesson ? editingLesson.startTime : newLesson.startTime}
                onChange={handleChange}
                className="p-2 sm:p-3 border rounded text-sm sm:text-base min-h-[44px]"
                required
              />

              <input
                type="time"
                name="endTime"
                value={editingLesson ? editingLesson.endTime : newLesson.endTime}
                onChange={handleChange}
                className="p-2 sm:p-3 border rounded text-sm sm:text-base min-h-[44px]"
                required
              />

              <button
                type="submit"
                className="sm:col-span-2 lg:col-span-4 bg-blue-600 text-white py-2 sm:py-3 rounded hover:bg-blue-700 transition-all text-sm sm:text-base min-h-[44px]"
              >
                {editingLesson ? "💾 Save Changes" : "➕ Add Lesson"}
              </button>
            </form>
          </div>
        )}

        {/* Timetable Display */}
        <div className="overflow-x-auto -mx-2 sm:mx-0">
          {/* Mobile Card View */}
          <div className="block sm:hidden space-y-3">
            {grouped.map(({ day, lessons }) => (
              <div key={day} className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
                <div className="bg-blue-600 text-white p-3 font-semibold">
                  {day}
                </div>
                <div className="p-3">
                  {lessons.length > 0 ? (
                    <div className="space-y-3">
                      {lessons.map((lesson) => (
                        <div key={lesson._id} className="border-l-4 border-blue-500 pl-3 py-2 bg-blue-50 rounded">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h3 className="font-semibold text-gray-800 text-sm">{lesson.subject}</h3>
                              <p className="text-xs text-gray-600 mt-1">
                                🕒 {lesson.startTime} - {lesson.endTime}
                              </p>
                            </div>
                            {(role === "teacher" || role === "admin") && (
                              <div className="flex space-x-1 ml-2">
                                <button
                                  onClick={() => setEditingLesson(lesson)}
                                  className="bg-yellow-500 text-white p-1 rounded text-xs hover:bg-yellow-600 min-h-[32px] min-w-[32px] flex items-center justify-center"
                                  title="Edit"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => handleDelete(lesson._id)}
                                  className="bg-red-500 text-white p-1 rounded text-xs hover:bg-red-600 min-h-[32px] min-w-[32px] flex items-center justify-center"
                                  title="Delete"
                                >
                                  🗑️
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm italic py-2">No lessons scheduled</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <table className="hidden sm:table w-full border-collapse">
            <thead>
              <tr className="bg-blue-600 text-white">
                <th className="py-2 px-3 text-left text-sm sm:text-base">Day</th>
                <th className="py-2 px-3 text-left text-sm sm:text-base">Subject</th>
                <th className="py-2 px-3 text-left text-sm sm:text-base">Start Time</th>
                <th className="py-2 px-3 text-left text-sm sm:text-base">End Time</th>
                {(role === "teacher" || role === "admin") && (
                  <th className="py-2 px-3 text-sm sm:text-base">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ day, lessons }) =>
                lessons.length > 0 ? (
                  lessons.map((lesson, idx) => (
                    <tr
                      key={lesson._id}
                      className={`border-b hover:bg-blue-50 transition-all ${
                        idx % 2 === 0 ? "bg-gray-50" : "bg-white"
                      }`}
                    >
                      <td className="py-2 px-3 font-medium text-sm sm:text-base">{lesson.day}</td>
                      <td className="py-2 px-3 text-sm sm:text-base">{lesson.subject}</td>
                      <td className="py-2 px-3 text-sm sm:text-base">{lesson.startTime}</td>
                      <td className="py-2 px-3 text-sm sm:text-base">{lesson.endTime}</td>

                      {(role === "teacher" || role === "admin") && (
                        <td className="py-2 px-3 space-x-1 sm:space-x-2">
                          <button
                            onClick={() => setEditingLesson(lesson)}
                            className="bg-yellow-500 text-white px-2 sm:px-3 py-1 sm:py-2 rounded hover:bg-yellow-600 text-xs sm:text-sm min-h-[32px] sm:min-h-[36px]"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(lesson._id)}
                            className="bg-red-500 text-white px-2 sm:px-3 py-1 sm:py-2 rounded hover:bg-red-600 text-xs sm:text-sm min-h-[32px] sm:min-h-[36px]"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr key={day}>
                    <td className="py-2 px-3 text-sm sm:text-base">{day}</td>
                    <td className="py-2 px-3 italic text-gray-500 text-sm sm:text-base" colSpan="4">
                      No lessons scheduled
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}