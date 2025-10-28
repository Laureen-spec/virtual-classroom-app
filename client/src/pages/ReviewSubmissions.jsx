import { useEffect, useState } from "react";
import API from "../api/axios";

export default function ReviewSubmissions() {
  const [subs, setSubs] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [grading, setGrading] = useState({}); // Track which assignments are being graded
  const [gradeInputs, setGradeInputs] = useState({}); // Store grade inputs

  const fetchSubmissions = async () => {
    try {
      setLoading(true);
      setError("");
      console.log("Fetching submissions...");
      
      const res = await API.get("/assignments/submissions");
      console.log("Submissions response:", res.data);
      
      setSubs(res.data || []);
    } catch (err) {
      console.error("Error fetching submissions:", err);
      setError("Failed to load submissions");
      setSubs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const markReceived = async (id) => {
    try {
      await API.put(`/assignments/receive/${id}`);
      setMessage("📥 Marked as received!");
      fetchSubmissions();
    } catch (err) {
      console.error("Error marking as received:", err);
      setMessage("❌ Failed to mark as received");
    }
  };

  const gradeAssignment = async (id) => {
    try {
      setGrading(prev => ({ ...prev, [id]: true }));
      const { grade, feedback } = gradeInputs[id] || {};
      
      if (!grade) {
        setMessage("❌ Please enter a grade");
        return;
      }

      await API.put(`/assignments/grade/${id}`, { 
        grade, 
        feedback: feedback || "No feedback provided" 
      });
      setMessage("✅ Assignment graded!");
      
      // Clear the grade input for this assignment
      setGradeInputs(prev => {
        const newInputs = { ...prev };
        delete newInputs[id];
        return newInputs;
      });
      
      fetchSubmissions();
    } catch (err) {
      console.error("Error grading assignment:", err);
      setMessage("❌ Failed to grade assignment");
    } finally {
      setGrading(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleGradeInput = (id, field, value) => {
    setGradeInputs(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  // Add this loading and error state display
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-800 to-pink-700 p-6 text-white flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading submissions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-800 to-pink-700 p-6 text-white">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold mb-6 text-center">📝 Review Student Submissions</h2>

        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-200 p-4 rounded-lg mb-4 text-center">
            {error}
          </div>
        )}

        {message && (
          <div className={`p-4 rounded-lg mb-4 text-center ${
            message.includes("✅") || message.includes("📥") 
              ? "bg-green-500/20 border border-green-500 text-green-200" 
              : "bg-red-500/20 border border-red-500 text-red-200"
          }`}>
            {message}
          </div>
        )}

        <div className="space-y-4">
          {subs.length > 0 ? (
            subs.map((s) => (
              <div key={s._id} className="bg-white/10 p-5 rounded-xl shadow-md border border-white/20">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <h3 className="text-xl font-semibold mb-2">{s.title}</h3>
                    <p className="text-white/80">
                      <span className="font-medium">Student:</span> {s.student?.name || 'Unknown Student'}
                    </p>
                    <p className="text-white/80">
                      <span className="font-medium">Subject:</span> {s.subject}
                    </p>
                    <p className="text-white/80">
                      <span className="font-medium">Teacher:</span> {s.teacherName || 'Not specified'}
                    </p>
                    <p className="text-white/80">
                      <span className="font-medium">Status:</span> 
                      <span className={`ml-2 px-2 py-1 rounded-full text-xs ${
                        s.status === 'submitted' ? 'bg-yellow-500/50' :
                        s.status === 'received' ? 'bg-blue-500/50' :
                        s.status === 'graded' ? 'bg-green-500/50' :
                        'bg-purple-500/50'
                      }`}>
                        {s.status?.toUpperCase()}
                      </span>
                    </p>
                    {s.grade && (
                      <p className="text-white/80">
                        <span className="font-medium">Grade:</span> {s.grade}
                      </p>
                    )}
                  </div>
                  
                  <div>
                    {s.fileUrl && (
                      <a
                        href={s.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg transition-colors mb-3"
                      >
                        📂 Download Submission
                      </a>
                    )}
                    <p className="text-white/60 text-sm mt-2">
                      Submitted: {new Date(s.submittedAt).toLocaleDateString()}
                    </p>
                    {s.fileSize && (
                      <p className="text-white/60 text-sm">
                        File size: {(s.fileSize / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-white/20">
                  {s.status === "submitted" && (
                    <button
                      onClick={() => markReceived(s._id)}
                      className="bg-yellow-500 hover:bg-yellow-600 px-4 py-2 rounded-lg transition-colors"
                    >
                      📥 Mark as Received
                    </button>
                  )}
                  
                  {/* Grade Input Section */}
                  <div className="flex-1 min-w-[300px]">
                    <div className="flex gap-2 flex-wrap">
                      <input
                        type="text"
                        placeholder="Grade (A, B, C, 95%, etc)"
                        value={gradeInputs[s._id]?.grade || ""}
                        onChange={(e) => handleGradeInput(s._id, 'grade', e.target.value)}
                        className="px-3 py-2 rounded-lg bg-white/20 border border-white/30 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-green-500 flex-1 min-w-[120px]"
                      />
                      <input
                        type="text"
                        placeholder="Feedback (optional)"
                        value={gradeInputs[s._id]?.feedback || ""}
                        onChange={(e) => handleGradeInput(s._id, 'feedback', e.target.value)}
                        className="px-3 py-2 rounded-lg bg-white/20 border border-white/30 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-green-500 flex-1 min-w-[150px]"
                      />
                      <button
                        onClick={() => gradeAssignment(s._id)}
                        disabled={grading[s._id]}
                        className="bg-green-500 hover:bg-green-600 disabled:bg-gray-500 px-4 py-2 rounded-lg transition-colors"
                      >
                        {grading[s._id] ? "⏳..." : "✅ Grade"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Show existing feedback */}
                {s.feedback && (
                  <div className="mt-3 p-3 bg-white/10 rounded-lg">
                    <p className="text-sm text-white/80">
                      <span className="font-medium">Previous Feedback:</span> {s.feedback}
                    </p>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-12 bg-white/10 rounded-xl border border-white/20">
              <p className="text-xl text-white/70 mb-2">No submissions found</p>
              <p className="text-white/50">Student submissions will appear here when they submit assignments.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}