import { useState, useEffect } from "react";
import API from "../api/axios";

export default function TeacherUploadMaterial() {
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [materials, setMaterials] = useState([]);

  const subjects = [
    "Mathematics", "English", "Kiswahili", "CRE", "Biology", "Chemistry", "Physics",
    "French", "German", "History", "Geography", "Business", "Agriculture", "Art and Craft", "Home Science"
  ];

  // 🧠 Fetch existing materials uploaded by teacher
  const fetchMaterials = async () => {
    try {
      const res = await API.get("/materials");
      setMaterials(res.data);
    } catch (err) {
      console.error("Error loading materials:", err);
    }
  };

  useEffect(() => {
    fetchMaterials();
  }, []);

  // 📤 Handle upload
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!file || !subject) return setMessage("⚠️ Please select a subject and file.");

    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    form.append("subject", subject);

    try {
      setLoading(true);
      const res = await API.post("/materials/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMessage("✅ Material uploaded successfully!");
      setFile(null);
      setTitle("");
      setSubject("");
      setLoading(false);
      fetchMaterials(); // Refresh list
    } catch (err) {
      console.error("Upload failed:", err);
      setMessage("❌ Upload failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-gradient-to-br from-purple-900 via-purple-700 to-indigo-700 text-white p-4 sm:p-6">
      {/* Upload Form */}
      <div className="bg-white/10 backdrop-blur-md p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg border border-white/20 mx-2">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4 sm:mb-6">📚 Upload Learning Material</h2>

        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          {/* Subject Select */}
          <div>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full p-2 sm:p-3 rounded-lg bg-white/20 text-white focus:ring-2 focus:ring-purple-400 outline-none text-sm sm:text-base min-h-[44px]"
              required
            >
              <option value="">-- Select Subject --</option>
              {subjects.map((s) => (
                <option key={s} value={s} className="text-black">
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Title Input */}
          <div>
            <input
              type="text"
              placeholder="Material Title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2 sm:p-3 rounded-lg bg-white/20 text-white placeholder-gray-300 focus:ring-2 focus:ring-purple-400 outline-none text-sm sm:text-base min-h-[44px]"
            />
          </div>

          {/* File Input */}
          <div>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files[0])}
              className="w-full p-2 bg-white/10 border border-white/30 rounded-md text-xs sm:text-sm file:mr-2 file:py-1 file:px-2 sm:file:py-2 sm:file:px-4 file:rounded file:border-0 file:text-xs sm:file:text-sm file:font-semibold file:bg-purple-500 file:text-white hover:file:bg-purple-600"
            />
            {file && (
              <p className="mt-2 text-xs sm:text-sm text-green-300 flex items-center">
                <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                Selected: <span className="ml-1 truncate">{file.name}</span>
              </p>
            )}
          </div>

          {/* Upload Button */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2 sm:py-3 rounded-lg font-semibold shadow-lg shadow-purple-400/30 transition-all duration-300 min-h-[44px] text-sm sm:text-base ${
              loading
                ? "bg-purple-400 text-gray-200 cursor-not-allowed"
                : "bg-purple-600 hover:bg-purple-700 text-white active:scale-95"
            }`}
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="w-4 h-4 sm:w-5 sm:h-5 border-t-2 border-white border-solid rounded-full animate-spin mr-2"></div>
                Uploading...
              </div>
            ) : (
              '📤 Upload Material'
            )}
          </button>
        </form>

        {message && (
          <div className={`text-center mt-3 sm:mt-4 text-sm p-2 sm:p-3 rounded-lg ${
            message.includes("✅") 
              ? "bg-green-500/20 text-green-300 border border-green-400/30" 
              : "bg-red-500/20 text-red-300 border border-red-400/30"
          }`}>
            {message}
          </div>
        )}
      </div>

      {/* Uploaded Materials Section */}
      <div className="mt-6 sm:mt-8 md:mt-10 bg-white/10 backdrop-blur-md p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-lg w-full max-w-3xl border border-white/20 mx-2">
        <h3 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4 text-center">📂 Uploaded Materials</h3>
        {materials.length === 0 ? (
          <p className="text-center text-gray-300 text-sm sm:text-base">No materials uploaded yet.</p>
        ) : (
          <ul className="space-y-3 sm:space-y-4">
            {materials.map((m) => (
              <li
                key={m._id}
                className="p-3 sm:p-4 bg-white/10 border border-white/20 rounded-xl hover:bg-white/20 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base sm:text-lg truncate">{m.title || "Untitled Material"}</p>
                    <p className="text-xs sm:text-sm text-gray-200">Subject: {m.subject}</p>
                  </div>
                  <a
                    href={m.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-blue-500 hover:bg-blue-600 px-3 sm:px-4 py-1 sm:py-2 rounded-md text-white text-xs sm:text-sm text-center min-h-[32px] sm:min-h-[36px] flex items-center justify-center transition-colors"
                  >
                    Download
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}