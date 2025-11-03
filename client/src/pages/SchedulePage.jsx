import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api/axios";

export default function SchedulePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("upcoming");
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchClasses = async (type) => {
    try {
      setLoading(true);
      const res = await API.get(`/schedule/${type}`);
      setClasses(res.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching schedule:", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses(activeTab);
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-indigo-600">📅 My Schedule</h1>
        <button
          onClick={() => navigate(-1)}
          className="bg-indigo-500 text-white px-4 py-2 rounded hover:bg-indigo-600"
        >
          ⬅ Back
        </button>
      </div>

      {/* Tabs */}
      <div className="flex justify-center space-x-4 mb-6">
        {["upcoming", "ongoing", "past"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md font-semibold ${
              activeTab === tab
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)} Classes
          </button>
        ))}
      </div>

      {/* Class List */}
      <div className="bg-white shadow-md rounded-xl p-5">
        {loading ? (
          <p className="text-center text-gray-500">Loading classes...</p>
        ) : classes.length > 0 ? (
          <ul className="divide-y">
            {classes.map((cls) => (
              <li key={cls._id} className="py-3">
                <p className="font-semibold text-gray-800">{cls.title}</p>
                <p className="text-sm text-gray-500">
                  {new Date(cls.startTime).toLocaleString("en-GB", { timeZone: "UTC" })} →{" "}
                  {new Date(cls.endTime).toLocaleString("en-GB", { timeZone: "UTC" })}
                </p>
                <p className="text-gray-600">
                  {cls.teacher?.name ? `Teacher: ${cls.teacher.name}` : ""}
                </p>
                {cls.meetingLink && (
                  <a
                    href={cls.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-500 hover:underline mt-2 inline-block"
                  >
                    🔗 Join Class
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-center text-gray-500">No {activeTab} classes found.</p>
        )}
      </div>
    </div>
  );
}