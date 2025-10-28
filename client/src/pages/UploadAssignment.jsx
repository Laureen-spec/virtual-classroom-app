import { useState } from "react";
import API from "../api/axios";

export default function UploadAssignment({ classId, subject }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return setMsg("Choose a file first");
    if (!teacherName.trim()) return setMsg("Please enter teacher's name");

    setIsUploading(true);
    setMsg("");

    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    form.append("subject", subject);
    form.append("classId", classId);
    form.append("teacherName", teacherName.trim()); // Send teacher name instead of ID

    try {
      const res = await API.post("/assignments/submit", form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (ev) => {
          setProgress(Math.round((ev.loaded / ev.total) * 100));
        }
      });
      setMsg("✅ Assignment submitted successfully!");
      setFile(null);
      setTitle("");
      setTeacherName("");
      setProgress(0);
    } catch (err) {
      setMsg(err.response?.data?.message || "❌ Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-xl shadow-lg p-4 sm:p-6 md:p-8 border border-gray-100 w-full">
      {/* Header */}
      <div className="text-center mb-4 sm:mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-1 sm:mb-2">Submit Assignment</h2>
        <p className="text-gray-600 text-xs sm:text-sm">Upload your work for {subject}</p>
      </div>

      <form onSubmit={submit} className="space-y-4 sm:space-y-5">
        {/* Teacher Name Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 sm:mb-2">
            Teacher's Name *
          </label>
          <input 
            type="text" 
            value={teacherName}
            onChange={(e) => setTeacherName(e.target.value)}
            placeholder="Enter teacher's full name..."
            className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 outline-none"
            required
          />
        </div>

        {/* Title Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 sm:mb-2">
            Assignment Title (Optional)
          </label>
          <input 
            type="text" 
            value={title} 
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter assignment title..."
            className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 outline-none"
          />
        </div>

        {/* File Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 sm:mb-2">
            Choose File *
          </label>
          <div className="relative">
            <input 
              type="file" 
              onChange={(e) => setFile(e.target.files[0])}
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 outline-none file:mr-2 file:py-1 file:px-3 sm:file:py-2 sm:file:px-4 file:rounded-full file:border-0 file:text-xs sm:file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              required
            />
          </div>
          {file && (
            <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-green-600 flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              Selected: <span className="ml-1 truncate">{file.name}</span>
            </p>
          )}
        </div>

        {/* Progress Bar */}
        {progress > 0 && (
          <div className="space-y-1 sm:space-y-2">
            <div className="flex justify-between text-xs sm:text-sm text-gray-600">
              <span>Uploading...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 sm:h-2.5">
              <div 
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 sm:h-2.5 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button 
          type="submit" 
          disabled={isUploading}
          className={`w-full py-2 sm:py-3 px-4 rounded-lg font-semibold text-white transition-all duration-200 min-h-[44px] sm:min-h-[48px] ${
            isUploading 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg hover:shadow-xl active:scale-95'
          }`}
        >
          {isUploading ? (
            <div className="flex items-center justify-center text-sm sm:text-base">
              <div className="w-4 h-4 sm:w-5 sm:h-5 border-t-2 border-white border-solid rounded-full animate-spin mr-2"></div>
              Uploading...
            </div>
          ) : (
            <span className="text-sm sm:text-base">Submit Assignment</span>
          )}
        </button>

        {/* Message */}
        {msg && (
          <div className={`p-3 sm:p-4 rounded-lg text-center font-medium text-sm sm:text-base ${
            msg.includes("✅") || msg.includes("successfully")
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {msg}
          </div>
        )}
      </form>

      {/* Help Text */}
      <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-1 sm:mb-2">📝 Submission Guidelines</h3>
        <ul className="text-xs text-gray-600 space-y-0.5 sm:space-y-1">
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>Enter the full name of your teacher</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>Supported formats: PDF, DOC, DOCX, PPT, images</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>Maximum file size: 50MB</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>Make sure your file is clearly named</span>
          </li>
        </ul>
      </div>
    </div>
  );
}