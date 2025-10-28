import { useEffect, useState } from "react";
import API from "../api/axios";

export default function Results() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const res = await API.get("/assignments/mine"); // ✅ Get student’s assignments
        setAssignments(res.data);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load results.");
      }
      setLoading(false);
    };
    fetchResults();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-green-50">
        <p className="text-lg text-gray-700 animate-pulse">Loading your results...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-100 via-green-200 to-green-300 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl p-6">
        <h1 className="text-3xl font-bold text-green-700 mb-6">📊 Your Assignment Results</h1>

        {error && <p className="text-red-500 mb-4">{error}</p>}

        {assignments.length > 0 ? (
          <ul className="space-y-4">
            {assignments.map((a) => (
              <li
                key={a._id}
                className="p-4 border rounded-xl hover:bg-green-50 transition-all duration-300"
              >
                <h2 className="text-lg font-semibold text-gray-800">{a.title}</h2>
                <p className="text-sm text-gray-600">Subject: {a.subject || "N/A"}</p>
                <p className="text-sm text-gray-600">
                  Status:{" "}
                  <span
                    className={
                      a.status === "graded"
                        ? "text-green-600 font-semibold"
                        : "text-yellow-600 font-semibold"
                    }
                  >
                    {a.status}
                  </span>
                </p>
                {a.grade && (
                  <p className="text-sm text-gray-600">Grade: 🏆 {a.grade}</p>
                )}
                {a.feedback && (
                  <p className="text-sm italic text-gray-500">
                    Feedback: {a.feedback}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Submitted: {new Date(a.submittedAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-700 text-center">No results yet.</p>
        )}
      </div>
    </div>
  );
}
